import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, sanitizeObject, sanitizeString } from "@/lib/security";
import { getSyncedUser } from "@/lib/auth-server";
import { createOrderWithPayment } from "@/lib/wallet";
import { db } from "@/lib/db";

export const maxDuration = 60; // image uploads + Google Sheets push

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";

/** Push order data to Google Sheets (existing fulfilment workflow). */
async function pushToGoogleSheet(orderData: Record<string, any>): Promise<boolean> {
  try {
    const sheetUrl = process.env.GOOGLE_SHEETS_WEBAPP_URL;
    if (!sheetUrl || sheetUrl.trim() === "") return false;

    const items = Array.isArray(orderData.items) ? orderData.items : [];
    const itemsSummary = items
      .map((i: any) => {
        const qty = i.quantity || 1;
        const price = i.price || 0;
        const name = i.name || "Produit";
        if (qty > 1) {
          return `▶ ${name} | QTÉ: ${qty} | ${price.toLocaleString()} DA/pièce | TOTAL: ${(price * qty).toLocaleString()} DA`;
        }
        return `▶ ${name} | QTÉ: 1 | ${price.toLocaleString()} DA`;
      })
      .join("\n");

    const totalItemsCount = items.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0);
    const dateStr = new Date().toLocaleString("fr-FR", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    const orderRow = {
      id: orderData.id,
      date: dateStr,
      name: orderData.fullName || "",
      phone: orderData.phone || "",
      email: orderData.email || "",
      wilaya: orderData.wilaya || "",
      commune: orderData.commune || "",
      codePostal: orderData.codePostal || "",
      address: orderData.address || "",
      items: itemsSummary,
      total: orderData.total?.toString() || "0",
      paidWallet: (orderData.paidWithWallet || 0).toString(),
      paidPoints: (orderData.paidWithPoints || 0).toString(),
      remainingCOD: Math.max(0, (orderData.total || 0) - (orderData.paidWithWallet || 0) - (orderData.paidWithPoints || 0)).toString(),
      status: "pending",
      notes: orderData.notes || "",
      url: orderData.url || "",
      quantities: items.map((i: any) => `${i.quantity || 1}`).join(", "),
      totalItems: totalItemsCount.toString(),
      productCount: items.length.toString(),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ orders: [orderRow] }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * GET /api/orders — the user's own orders (from PostgreSQL).
 */
export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 30, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const synced = await getSyncedUser(req as any);
    if (!synced) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orders = await db.order.findMany({
      where: { uid: synced.dbUser.uid },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Shape matches the old API so the existing UI keeps working
    return NextResponse.json(
      orders.map((o) => ({
        id: o.id,
        items: o.items,
        total: o.total,
        status: o.status,
        fullName: o.fullName,
        phone: o.phone,
        email: o.email,
        wilaya: o.wilaya,
        commune: o.commune,
        codePostal: o.codePostal,
        address: o.address,
        notes: o.notes,
        trackingCode: o.trackingCode,
        paidWithWallet: o.paidWithWallet,
        paidWithPoints: o.paidWithPoints,
        reviewSubmitted: o.reviewSubmitted,
        createdAt: o.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error("Orders GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/orders — create an order.
 * Body: {
 *   items: [{name, price(DZD), quantity, image?, url?}],
 *   total: number (DZD),
 *   ...shipping fields,
 *   useWallet?: number,   // DZD to pay from wallet
 *   usePoints?: number,   // points to spend (1pt = 1 DZD)
 * }
 *
 * The wallet/points payment + order creation happen in ONE atomic DB
 * transaction. Balances are validated server-side — the client cannot
 * spend more than it owns.
 */
export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 10, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const synced = await getSyncedUser(req as any);
    if (!synced) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const uid = synced.dbUser.uid;

    const body = await req.json().catch(() => ({}));
    const sanitized = sanitizeObject(body);

    const items = Array.isArray(body.items) ? body.items : [];
    const total = Number(body.total);

    if (!items.length || !Number.isFinite(total) || total <= 0) {
      return NextResponse.json({ error: "Items and total are required" }, { status: 400 });
    }
    if (items.length > 50) {
      return NextResponse.json({ error: "Too many items" }, { status: 400 });
    }
    // Reject absurd totals
    if (total > 10_000_000) {
      return NextResponse.json({ error: "Invalid total" }, { status: 400 });
    }

    const useWallet = Math.max(0, Number(body.useWallet) || 0);
    const usePoints = Math.max(0, Number(body.usePoints) || 0);

    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // 1) Atomic: create order + debit wallet/points (validated server-side)
    const result = await createOrderWithPayment({
      uid,
      orderId,
      itemsJson: JSON.stringify(items),
      total,
      shipping: {
        fullName: sanitizeString(body.fullName).slice(0, 120) || null,
        phone: sanitizeString(body.phone).slice(0, 20) || null,
        email: sanitizeString(body.email).slice(0, 254) || null,
        wilaya: sanitizeString(body.wilaya).slice(0, 80) || null,
        commune: sanitizeString(body.commune).slice(0, 80) || null,
        codePostal: sanitizeString(body.codePostal).slice(0, 10) || null,
        address: sanitizeString(body.address).slice(0, 300) || null,
        notes: sanitizeString(body.notes).slice(0, 500) || null,
        url: sanitizeString(body.url).slice(0, 500) || null,
      },
      useWallet,
      usePoints,
    });

    if (!result.ok) {
      const messages: Record<string, string> = {
        USER_NOT_FOUND: "Account error",
        INSUFFICIENT_FUNDS: "Insufficient balance",
        INVALID_AMOUNT: "Invalid payment amount",
        INVALID_TOTAL: "Invalid total",
      };
      return NextResponse.json(
        { error: messages[result.error] || "Order failed" },
        { status: 400 }
      );
    }

    // 2) Google Sheets push (non-blocking fulfilment workflow)
    pushToGoogleSheet({
      id: orderId,
      items,
      total,
      paidWithWallet: result.paidWallet,
      paidWithPoints: result.paidPoints,
      fullName: body.fullName,
      phone: body.phone,
      email: body.email,
      wilaya: body.wilaya,
      commune: body.commune,
      codePostal: body.codePostal,
      address: body.address,
      notes: body.notes,
      url: body.url,
    }).catch(() => {});

    return NextResponse.json(
      {
        id: orderId,
        items,
        total,
        status: "pending",
        paidWithWallet: result.paidWallet,
        paidWithPoints: result.paidPoints,
        remainingCOD: Math.round((total - result.paidWallet - result.paidPoints) * 100) / 100,
        walletBalance: result.walletBalance,
        pointsBalance: result.pointsBalance,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Order POST error:", error?.message || error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
