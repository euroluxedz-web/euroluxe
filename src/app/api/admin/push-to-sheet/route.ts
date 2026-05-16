import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/admin/push-to-sheet
 *
 * Called automatically when a customer places an order.
 * Pushes the order data to Google Sheets via the Apps Script Web App URL
 * stored in the GOOGLE_SHEETS_WEBAPP_URL environment variable.
 *
 * This is "fire and forget" from the client's perspective — it never
 * blocks or fails the order, even if the Google Sheet push fails.
 */

export async function POST(req: NextRequest) {
  try {
    const sheetWebAppUrl = process.env.GOOGLE_SHEETS_WEBAPP_URL;

    // If no URL configured, silently skip (don't error)
    if (!sheetWebAppUrl || sheetWebAppUrl.trim() === "") {
      console.log("[push-to-sheet] No GOOGLE_SHEETS_WEBAPP_URL configured, skipping.");
      return NextResponse.json({ skipped: true, reason: "no_url" });
    }

    const body = await req.json();
    const { id, items, total, fullName, phone, email, wilaya, commune, codePostal, address, notes, url } = body;

    // Format items for readability
    const itemsSummary = Array.isArray(items)
      ? items.map((i: any) => `${i.name} x${i.quantity} (${i.price?.toLocaleString()} DA)`).join("; ")
      : "—";

    // Format current date/time in French locale
    const now = new Date();
    const dateStr = now.toLocaleString("fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Build the row data matching the Apps Script order
    const orderRow = {
      id: id || `ORD-${Date.now()}`,
      date: dateStr,
      name: fullName || "",
      phone: phone || "",
      email: email || "",
      wilaya: wilaya || "",
      commune: commune || "",
      codePostal: codePostal || "",
      address: address || "",
      items: itemsSummary,
      total: total?.toString() || "0",
      status: "pending",
      notes: notes || "",
      url: url || "",
    };

    // Send to Google Apps Script Web App with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(sheetWebAppUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: [orderRow] }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.error("[push-to-sheet] Google Sheets error:", response.status, text);
        return NextResponse.json({ sent: false, error: "sheet_error" }, { status: 200 }); // still return 200 so it doesn't block
      }

      const result = await response.json().catch(() => ({}));
      console.log("[push-to-sheet] Order pushed to Google Sheet:", orderRow.id);
      return NextResponse.json({ sent: true, result });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      console.error("[push-to-sheet] Fetch error:", fetchErr?.message);
      // Return 200 anyway — we don't want to block the order
      return NextResponse.json({ sent: false, error: "timeout_or_network" }, { status: 200 });
    }
  } catch (error: any) {
    console.error("[push-to-sheet] Error:", error?.message);
    return NextResponse.json({ sent: false, error: "internal" }, { status: 200 });
  }
}
