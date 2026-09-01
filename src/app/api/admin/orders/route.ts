import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, sanitizeString } from "@/lib/security";
import { verifyAdminDetailed, adminErrorResponse } from "@/lib/admin-auth";
import { db } from "@/lib/db";

const VALID_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

/**
 * GET /api/admin/orders — list orders (filters: status, q, page).
 * PATCH /api/admin/orders — update order status / tracking code.
 *   Marking an order "cancelled" auto-refunds any wallet/points paid.
 */
export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 60, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const check = await verifyAdminDetailed(req as any);
    const gateErr = adminErrorResponse(check);
    if (gateErr) return gateErr;

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const q = sanitizeString(url.searchParams.get("q") || "").trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(5, parseInt(url.searchParams.get("limit") || "20")));

    const where: any = {};
    if (status && VALID_STATUSES.includes(status)) where.status = status;
    if (q) {
      where.OR = [
        { id: { contains: q, mode: "insensitive" as const } },
        { fullName: { contains: q, mode: "insensitive" as const } },
        { phone: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
        { user: { email: { contains: q, mode: "insensitive" as const } } },
      ];
    }

    const [total, orders] = await Promise.all([
      db.order.count({ where }),
      db.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { email: true, name: true, phone: true } },
          reviews: { select: { id: true, status: true, rating: true } },
        },
      }),
    ]);

    return NextResponse.json({
      orders: orders.map((o) => ({
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
        url: o.url,
        trackingCode: o.trackingCode,
        paidWithWallet: o.paidWithWallet,
        paidWithPoints: o.paidWithPoints,
        reviewSubmitted: o.reviewSubmitted,
        reviewStatus: o.reviews?.[0]?.status || null,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        uid: o.uid,
        userEmail: o.user?.email,
        userName: o.user?.name,
        userPhone: o.user?.phone,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("Admin orders GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 30, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const check = await verifyAdminDetailed(req as any);
    const gateErr = adminErrorResponse(check);
    if (gateErr) return gateErr;
    const adminEmail = check.email;

    const body = await req.json().catch(() => ({}));
    const orderId = sanitizeString(body.orderId).slice(0, 64);
    const status = String(body.status || "");
    const trackingCode = body.trackingCode !== undefined ? sanitizeString(body.trackingCode).slice(0, 64) : undefined;

    if (!orderId || !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "orderId and valid status required" }, { status: 400 });
    }

    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Atomic status update + auto-refund when cancelling a paid order
    const updated = await db.$transaction(async (tx) => {
      // Refund wallet/points if order becomes cancelled (and wasn't already)
      if (status === "cancelled" && order.status !== "cancelled") {
        if (order.paidWithWallet > 0) {
          const u = await tx.user.findUnique({ where: { uid: order.uid }, select: { walletBalance: true } });
          if (u) {
            const newWallet = Math.round((u.walletBalance + order.paidWithWallet) * 100) / 100;
            await tx.user.update({ where: { uid: order.uid }, data: { walletBalance: newWallet } });
            await tx.walletTransaction.create({
              data: {
                uid: order.uid,
                type: "REFUND",
                balanceType: "wallet",
                amount: order.paidWithWallet,
                balanceAfter: newWallet,
                note: `Refund for cancelled order ${orderId}`,
                performedBy: adminEmail || "admin",
                refId: orderId,
              },
            });
          }
        }
        if (order.paidWithPoints > 0) {
          const u = await tx.user.findUnique({ where: { uid: order.uid }, select: { pointsBalance: true } });
          if (u) {
            const newPoints = Math.round((u.pointsBalance + order.paidWithPoints) * 100) / 100;
            await tx.user.update({ where: { uid: order.uid }, data: { pointsBalance: newPoints } });
            await tx.walletTransaction.create({
              data: {
                uid: order.uid,
                type: "REFUND",
                balanceType: "points",
                amount: order.paidWithPoints,
                balanceAfter: newPoints,
                note: `Refund for cancelled order ${orderId}`,
                performedBy: adminEmail || "admin",
                refId: orderId,
              },
            });
          }
        }
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          status,
          ...(trackingCode !== undefined ? { trackingCode: trackingCode || null } : {}),
        },
      });
    });

    return NextResponse.json({ success: true, order: { id: updated.id, status: updated.status, trackingCode: updated.trackingCode } });
  } catch (error: any) {
    console.error("Admin orders PATCH error:", error?.message || error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
