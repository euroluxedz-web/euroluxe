import { NextRequest, NextResponse } from "next/server";

const ADMIN_KEY = "EuR0lux3@dm!n2024#Sec";

interface OrderExport {
  id: string;
  date: string;
  name: string;
  phone: string;
  email: string;
  wilaya: string;
  commune: string;
  codePostal: string;
  address: string;
  items: string;
  total: string;
  status: string;
  notes: string;
}

export async function POST(req: NextRequest) {
  try {
    const adminKey = req.headers.get("x-admin-key");
    if (adminKey !== ADMIN_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sheetUrl, orders } = await req.json();

    if (!sheetUrl || !orders) {
      return NextResponse.json(
        { error: "sheetUrl and orders are required" },
        { status: 400 }
      );
    }

    // Format orders for Google Sheets
    const formatDate = (timestamp: any): string => {
      if (!timestamp) return "—";
      try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString("fr-FR", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return "—";
      }
    };

    const parseItems = (itemsStr: string | undefined): string => {
      if (!itemsStr) return "—";
      try {
        const items = JSON.parse(itemsStr);
        return items
          .map((i: any) => `${i.name} x${i.quantity} (${i.price?.toLocaleString()} DA)`)
          .join("; ");
      } catch {
        return "—";
      }
    };

    const exportOrders: OrderExport[] = orders.map((o: any) => ({
      id: o.id?.substring(0, 12) || "",
      date: formatDate(o.createdAt),
      name: o.fullName || "",
      phone: o.phone || "",
      email: o.email || "",
      wilaya: o.wilaya || "",
      commune: o.commune || "",
      codePostal: o.codePostal || "",
      address: o.address || "",
      items: parseItems(o.items),
      total: o.total?.toString() || "0",
      status: o.status || "pending",
      notes: o.notes || "",
    }));

    // Send to Google Apps Script Web App
    const response = await fetch(sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders: exportOrders }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Google Sheets error:", text);
      return NextResponse.json(
        { error: "Failed to sync to Google Sheet. Make sure the Web App URL is correct." },
        { status: 500 }
      );
    }

    const result = await response.json();
    return NextResponse.json({ success: true, synced: exportOrders.length, result });
  } catch (error: any) {
    console.error("Export sheet error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
