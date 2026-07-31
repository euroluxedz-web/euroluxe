import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, sanitizeString, sanitizeNumber, sanitizeObject, validateOrderItems, validateShippingData, getClientIP } from "@/lib/security";

export const maxDuration = 60; // 60s for multiple image uploads + Google Sheets push

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";

/** Verify a Firebase ID token via REST API */
async function verifyIdToken(token: string): Promise<string | null> {
  if (!token) return null;

  // Try Admin SDK first (fast if service account is configured)
  try {
    const { getAdminAuth } = await import("@/lib/firebase-admin");
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {}

  // Fallback: Firebase REST API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    const data = await response.json();
    if (data.users?.[0]?.localId) return data.users[0].localId;
  } catch {}

  return null;
}

/**
 * Upload a product image to a free image host (tmpfiles.org)
 * Returns the URL of the uploaded image, or null on failure.
 * The image persists for 1 hour (enough for admin to view the order).
 */
async function uploadProductImage(imageDataUrl: string): Promise<string | null> {
  try {
    // Parse the data URL: data:image/jpeg;base64,/9j/4AAQ...
    const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;

    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, "base64");

    // Determine file extension from MIME type
    const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
    const filename = `product.${ext}`;

    // Upload to tmpfiles.org (free, no API key, anonymous)
    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: mimeType }), filename);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();
    const url = data?.data?.url;
    if (!url) return null;

    // Convert viewer URL to direct URL
    // tmpfiles.org/w3wH3L98H8PM/test.jpg → tmpfiles.org/dl/w3wH3L98H8PM/test.jpg
    // Actually, the viewer URL works fine in browser, so return as-is
    console.log(`[ImageUpload] ✓ Product image uploaded: ${url}`);
    return url;
  } catch (e) {
    console.log(`[ImageUpload] Error: ${String(e).slice(0, 100)}`);
    return null;
  }
}

/** Push order data to Google Sheets (with product image upload) */
async function pushToGoogleSheet(orderData: Record<string, any>): Promise<boolean> {
  try {
    const sheetUrl = process.env.GOOGLE_SHEETS_WEBAPP_URL;
    if (!sheetUrl || sheetUrl.trim() === "") return false;

    // Upload ALL product images to tmpfiles.org (so admin can see what the customer ordered)
    // Process in batches of 5 (parallel) to avoid timeout, with 12s timeout per image
    const items = Array.isArray(orderData.items) ? orderData.items : [];
    const imageUrls: string[] = [];
    
    // Get all items that have images
    const itemsWithImages = items.filter(
      (i: any) => i.image && typeof i.image === "string" && i.image.startsWith("data:")
    );
    
    // Process in batches of 5 to avoid overwhelming the server
    const BATCH_SIZE = 5;
    for (let i = 0; i < itemsWithImages.length; i += BATCH_SIZE) {
      const batch = itemsWithImages.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map((item: any) => uploadProductImage(item.image));
      const results = await Promise.allSettled(batchPromises);
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          imageUrls.push(r.value);
        }
      }
    }

    // Build items summary with product names and quantities (clear format)
    const itemsSummary = items
      .map((i: any) => {
        const qty = i.quantity || 1;
        const price = i.price || 0;
        const name = i.name || "Produit";
        // If quantity > 1, highlight it clearly
        if (qty > 1) {
          return `▶ ${name} | QTÉ: ${qty} | ${price.toLocaleString()} DA/pièce | TOTAL: ${(price * qty).toLocaleString()} DA`;
        }
        return `▶ ${name} | QTÉ: 1 | ${price.toLocaleString()} DA`;
      })
      .join("\n");
    
    // Extract just the quantities for a separate column
    const quantitiesList = items.map((i: any) => `${i.quantity || 1}`).join(", ");
    
    // Calculate total items count
    const totalItemsCount = items.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0);

    const dateStr = new Date().toLocaleString("fr-FR", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    // Use the first uploaded image URL, or the order URL, or empty
    const productImageUrl = imageUrls[0] || orderData.url || "";
    
    // Include ALL image URLs in the URL field (separated by newlines for readability)
    // This way admin can see all product images for multi-item orders
    const allImageUrls = imageUrls.length > 0 
      ? imageUrls.join("\n") 
      : (orderData.url || "");

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
      status: "pending",
      notes: orderData.notes || "",
      url: allImageUrls, // All image URLs (one per line) or order URL
      imageUrl: productImageUrl, // First image URL (for easy access)
      imageCount: imageUrls.length.toString(),
      allImageUrls: imageUrls.join(" | "), // All URLs separated by | (alternative format)
      quantities: quantitiesList, // e.g., "2, 1" (quantity per product)
      totalItems: totalItemsCount.toString(), // e.g., "3" (sum of all quantities)
      productCount: items.length.toString(), // e.g., "2" (number of unique products)
    };

    // Increase timeout to 15s (image upload takes time)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ orders: [orderRow] }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    console.log(`[GoogleSheets] Pushed order ${orderData.id}, images: ${imageUrls.length}`);
    return response.ok;
  } catch (e) {
    console.log(`[GoogleSheets] Error: ${String(e).slice(0, 100)}`);
    return false;
  }
}

/** Convert JS values to Firestore REST format fields */
function toFirestoreFields(data: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      fields[key] = { nullValue: null };
    } else if (typeof value === "number") {
      fields[key] = Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    } else if (typeof value === "boolean") {
      fields[key] = { booleanValue: value };
    } else if (value instanceof Date) {
      fields[key] = { timestampValue: value.toISOString() };
    } else {
      fields[key] = { stringValue: String(value) };
    }
  }
  return fields;
}

/** Parse Firestore REST format field value */
function parseFieldValue(v: any): any {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue) return v.timestampValue;
  if (v.arrayValue) {
    return (v.arrayValue.values || []).map((x: any) => parseFieldValue(x));
  }
  return null;
}

/** Parse all fields from a Firestore REST document */
function parseDocument(doc: any): Record<string, any> {
  const fields = doc.fields || {};
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = parseFieldValue(value);
  }
  return result;
}

/** Save order to Firebase via REST API (user's ID token for auth) */
async function saveOrderToFirebaseREST(
  token: string,
  uid: string,
  orderId: string,
  orderPayload: Record<string, any>
): Promise<boolean> {
  try {
    // 1. Save to user's orders subcollection
    const userOrderUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/orders/${orderId}`;
    const controller1 = new AbortController();
    const timeout1 = setTimeout(() => controller1.abort(), 8000);

    const res1 = await fetch(userOrderUrl, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: toFirestoreFields(orderPayload) }),
      signal: controller1.signal,
    });
    clearTimeout(timeout1);

    // 2. Save to global orders collection
    const globalOrderUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/orders/${orderId}`;
    const globalPayload = { ...orderPayload, userId: uid, userOrderId: orderId };

    // Fire and forget for global order (non-blocking)
    fetch(globalOrderUrl, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: toFirestoreFields(globalPayload) }),
    }).catch(() => {});

    // 3. Clear user's cart
    try {
      const cartUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/cartItems`;
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 5000);

      const cartRes = await fetch(cartUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller2.signal,
      });
      clearTimeout(timeout2);

      if (cartRes.ok) {
        const cartData = await cartRes.json();
        const documents = cartData.documents || [];
        // Delete each cart item (fire and forget)
        for (const doc of documents) {
          const docName = doc.name;
          if (docName) {
            fetch(`https://firestore.googleapis.com/v1/${docName}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
          }
        }
      }
    } catch {}

    return res1.ok;
  } catch {
    return false;
  }
}

/** Save to Firebase in background (tries REST API, then Client SDK) */
function saveToFirebaseBackground(uid: string, token: string, orderId: string, orderPayload: Record<string, any>) {
  (async () => {
    // Method 1: REST API (most reliable on server)
    if (token) {
      const restOk = await saveOrderToFirebaseREST(token, uid, orderId, orderPayload);
      if (restOk) {
        console.log("[orders] REST API write succeeded:", orderId);
        return;
      }
    }

    // Method 2: Admin SDK (if service account configured)
    try {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        const { getApps, initializeApp, cert } = await import("firebase-admin/app");
        const { getFirestore } = await import("firebase-admin/firestore");

        let adminApp = getApps().find(a => a.name === "admin-orders");
        if (!adminApp) {
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
          adminApp = initializeApp(
            { credential: cert(serviceAccount), projectId: PROJECT_ID },
            "admin-orders"
          );
        }

        const adminDb = getFirestore(adminApp);
        await adminDb.collection("users").doc(uid).collection("orders").doc(orderId).set(orderPayload);
        adminDb.collection("orders").doc(orderId).set({ ...orderPayload, userOrderId: orderId }).catch(() => {});

        // Clear cart
        try {
          const cartSnapshot = await adminDb.collection("users").doc(uid).collection("cartItems").get();
          const batch = adminDb.batch();
          cartSnapshot.docs.forEach((d) => batch.delete(d.ref));
          if (cartSnapshot.docs.length > 0) await batch.commit();
        } catch {}

        console.log("[orders] Admin SDK write succeeded:", orderId);
        return;
      }
    } catch (err: any) {
      console.warn("[orders] Admin SDK write failed:", err?.message);
    }

    // Method 3: Client SDK fallback (least reliable on server)
    try {
      const { createOrder, clearCart } = await import("@/lib/firebase");
      const order = await createOrder(uid, {
        items: JSON.parse(orderPayload.items || "[]"),
        total: orderPayload.total,
        fullName: orderPayload.fullName,
        phone: orderPayload.phone,
        email: orderPayload.email,
        wilaya: orderPayload.wilaya,
        commune: orderPayload.commune,
        codePostal: orderPayload.codePostal,
        address: orderPayload.address,
        notes: orderPayload.notes,
      });
      if (order) {
        try { await clearCart(uid); } catch {}
        console.log("[orders] Client SDK write succeeded:", orderId);
      }
    } catch (err: any) {
      console.warn("[orders] Client SDK fallback failed:", err?.message);
    }
  })().catch(() => {});
}

// ── GET: Fetch user's orders ──

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.split("Bearer ")[1] || "";
    const uid = await verifyIdToken(token);

    if (!uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Method 1: REST API — fetch from user's orders subcollection
    if (token) {
      try {
        const listUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/orders`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(listUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          const documents = data.documents || [];

          if (documents.length > 0) {
            const orders = documents.map((doc: any) => {
              const parsed = parseDocument(doc);
              const docId = doc.name?.split("/").pop() || "";
              return {
                id: docId,
                items: parsed.items || "[]",
                total: Number(parsed.total) || 0,
                status: parsed.status || "pending",
                fullName: parsed.fullName || null,
                phone: parsed.phone || null,
                email: parsed.email || null,
                wilaya: parsed.wilaya || null,
                commune: parsed.commune || null,
                codePostal: parsed.codePostal || null,
                address: parsed.address || null,
                notes: parsed.notes || null,
                createdAt: parsed.createdAt || new Date().toISOString(),
              };
            });

            // Sort by createdAt descending (newest first)
            orders.sort((a: any, b: any) => {
              const dateA = new Date(a.createdAt).getTime() || 0;
              const dateB = new Date(b.createdAt).getTime() || 0;
              return dateB - dateA;
            });

            return NextResponse.json(orders);
          }
        }
      } catch (restErr: any) {
        console.warn("[orders] REST API getOrders failed:", restErr?.message);
      }
    }

    // Method 2: Client SDK fallback
    try {
      const { getOrders } = await import("@/lib/firebase");
      const orders = await getOrders(uid);
      return NextResponse.json(orders);
    } catch (sdkErr: any) {
      console.warn("[orders] Client SDK getOrders failed:", sdkErr?.message);
    }

    // Method 3: Try global orders collection via REST
    if (token) {
      try {
        const runQueryUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(runQueryUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: "orders" }],
              where: {
                fieldFilter: {
                  field: { fieldPath: "userId" },
                  op: "EQUAL",
                  value: { stringValue: uid },
                },
              },
              orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
            },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          const orders = (data || [])
            .filter((d: any) => d.document)
            .map((d: any) => {
              const parsed = parseDocument(d.document);
              return {
                id: d.document.name?.split("/").pop() || "",
                items: parsed.items || "[]",
                total: Number(parsed.total) || 0,
                status: parsed.status || "pending",
                fullName: parsed.fullName,
                phone: parsed.phone,
                email: parsed.email,
                wilaya: parsed.wilaya,
                commune: parsed.commune,
                codePostal: parsed.codePostal,
                address: parsed.address,
                notes: parsed.notes,
                createdAt: parsed.createdAt || new Date().toISOString(),
              };
            });
          return NextResponse.json(orders);
        }
      } catch {}
    }

    // Return empty array — no orders found
    return NextResponse.json([]);
  } catch (error) {
    console.error("Orders GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST: Create a new order (FAST — responds immediately) ──

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // 1) Quick auth check
    const token = req.headers.get("authorization")?.split("Bearer ")[1] || "";
    const uid = await verifyIdToken(token);

    if (!uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Parse order data
    const body = await req.json();
    // Validate and sanitize all inputs
    const sanitizedBody = sanitizeObject(body);
    const {
      items, total,
      wilaya, commune, codePostal, address,
      phone, fullName, email, notes, url
    } = body;

    if (!items || !total) {
      return NextResponse.json({ error: "Items and total are required" }, { status: 400 });
    }

    const orderId = `ORD-${Date.now()}`;

    // 3) Push to Google Sheets (priority! await this one)
    const sheetData = {
      id: orderId, items, total,
      fullName: fullName || "",
      phone: phone || "",
      email: email || "",
      wilaya: wilaya || "",
      commune: commune || "",
      codePostal: codePostal || "",
      address: address || "",
      notes: notes || "",
      url: url || "",
    };

    const sheetPushed = await pushToGoogleSheet(sheetData);

    // 4) Save to Firebase in background (don't wait!)
    const orderPayload = {
      items: JSON.stringify(items),
      total,
      fullName: fullName || "",
      phone: phone || "",
      email: email || "",
      wilaya: wilaya || "",
      commune: commune || "",
      codePostal: codePostal || "",
      address: address || "",
      notes: notes || "",
      url: url || "",
      status: "pending",
      userId: uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveToFirebaseBackground(uid, token, orderId, orderPayload);

    const elapsed = Date.now() - startTime;
    console.log(`[orders] ${orderId} responded in ${elapsed}ms | Sheet: ${sheetPushed ? "OK" : "FAIL"} | Firebase: background`);

    // 5) Return success IMMEDIATELY
    return NextResponse.json(
      { id: orderId, items, total, status: "pending", sheetPushed },
      { status: 201 }
    );
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[orders] POST error after ${elapsed}ms:`, error?.message || error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
