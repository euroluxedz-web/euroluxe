import { NextRequest, NextResponse } from "next/server";
import { getDoc, doc, setDoc, getFirestore, getApps, initializeApp } from "firebase/firestore";
import { getApps as getAdminApps, initializeApp as initAdminApp, cert } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

/**
 * POST /api/admin/push-to-sheet
 *
 * Called automatically when a customer places an order.
 * Pushes the order data to Google Sheets via the Apps Script Web App URL
 * stored in Firebase Firestore (config/googleSheetsUrl).
 *
 * This is "fire and forget" from the client's perspective — it never
 * blocks or fails the order, even if the Google Sheet push fails.
 */

async function getSheetUrl(): Promise<string | null> {
  try {
    // Try Admin SDK first (bypasses Firestore rules)
    let adminApp = getAdminApps().find(a => a.name === "admin-sheet-push");
    if (!adminApp) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
        : undefined;

      if (serviceAccount) {
        adminApp = initAdminApp(
          { credential: cert(serviceAccount), projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID },
          "admin-sheet-push"
        );
      } else {
        adminApp = initAdminApp(
          { projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID },
          "admin-sheet-push"
        );
      }
    }

    const adminDb = getAdminFirestore(adminApp);
    const configDoc = await adminDb.collection("config").doc("googleSheetsUrl").get();
    if (configDoc.exists) {
      return configDoc.data()?.url || null;
    }
  } catch (adminErr) {
    console.warn("[push-to-sheet] Admin SDK read failed, trying env var fallback:", (adminErr as any)?.message);
  }

  // Fallback to environment variable
  const envUrl = process.env.GOOGLE_SHEETS_WEBAPP_URL;
  if (envUrl && envUrl.trim() !== "") {
    return envUrl.trim();
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const sheetWebAppUrl = await getSheetUrl();

    // If no URL configured, silently skip (don't error)
    if (!sheetWebAppUrl) {
      console.log("[push-to-sheet] No Google Sheets URL configured yet, skipping.");
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
        return NextResponse.json({ sent: false, error: "sheet_error" }, { status: 200 });
      }

      const result = await response.json().catch(() => ({}));
      console.log("[push-to-sheet] Order pushed to Google Sheet:", orderRow.id);
      return NextResponse.json({ sent: true, result });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      console.error("[push-to-sheet] Fetch error:", fetchErr?.message);
      return NextResponse.json({ sent: false, error: "timeout_or_network" }, { status: 200 });
    }
  } catch (error: any) {
    console.error("[push-to-sheet] Error:", error?.message);
    return NextResponse.json({ sent: false, error: "internal" }, { status: 200 });
  }
}

/**
 * PUT /api/admin/push-to-sheet
 * Save the Google Sheets Web App URL to Firebase
 */
export async function PUT(req: NextRequest) {
  try {
    const adminKey = req.headers.get("x-admin-key");
    if (adminKey !== "EuR0lux3@dm!n2024#Sec") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { url } = await req.json();
    if (!url || url.trim() === "") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Save to Firebase using Admin SDK
    let adminApp = getAdminApps().find(a => a.name === "admin-sheet-save");
    if (!adminApp) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
        : undefined;

      if (serviceAccount) {
        adminApp = initAdminApp(
          { credential: cert(serviceAccount), projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID },
          "admin-sheet-save"
        );
      } else {
        adminApp = initAdminApp(
          { projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID },
          "admin-sheet-save"
        );
      }
    }

    const adminDb = getAdminFirestore(adminApp);
    await adminDb.collection("config").doc("googleSheetsUrl").set({
      url: url.trim(),
      updatedAt: new Date(),
    });

    console.log("[push-to-sheet] Google Sheets URL saved:", url.trim());
    return NextResponse.json({ success: true, url: url.trim() });
  } catch (error: any) {
    console.error("[push-to-sheet] Save URL error:", error?.message);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/admin/push-to-sheet
 * Get the current Google Sheets Web App URL from Firebase
 */
export async function GET(req: NextRequest) {
  try {
    const adminKey = req.headers.get("x-admin-key");
    if (adminKey !== "EuR0lux3@dm!n2024#Sec") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = await getSheetUrl();
    return NextResponse.json({ url: url || "" });
  } catch (error: any) {
    console.error("[push-to-sheet] Get URL error:", error?.message);
    return NextResponse.json({ url: "", error: error?.message }, { status: 200 });
  }
}
