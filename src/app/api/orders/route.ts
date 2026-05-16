import { NextRequest, NextResponse } from "next/server";
import { getOrders, getUserData } from "@/lib/firebase";

// Use Firebase Admin SDK for server-side Firestore writes (bypasses security rules)
async function getAdminFirestore() {
  const { getApps, initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");

  let adminApp = getApps().find(a => a.name === "admin-orders");
  if (!adminApp) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      : undefined;

    if (serviceAccount) {
      adminApp = initializeApp(
        { credential: cert(serviceAccount), projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID },
        "admin-orders"
      );
    } else {
      // Fallback: use projectId only (works for some operations in same-project context)
      adminApp = initializeApp(
        { projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID },
        "admin-orders"
      );
    }
  }
  return getFirestore(adminApp);
}

async function getAuthenticatedUid(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.split("Bearer ")[1];

    // Try to verify with Firebase Admin SDK
    try {
      const { getAdminAuth } = await import("@/lib/firebase-admin");
      const decodedToken = await getAdminAuth().verifyIdToken(token);
      return decodedToken.uid;
    } catch (adminErr) {
      console.warn("Admin token verification failed, using fallback:", (adminErr as any)?.message);

      // Fallback: Try to verify using Firebase REST API
      try {
        const response = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: token }),
          }
        );
        const data = await response.json();
        if (data.users && data.users[0] && data.users[0].localId) {
          return data.users[0].localId;
        }
      } catch (restErr) {
        console.warn("REST API verification also failed:", (restErr as any)?.message);
      }

      return null;
    }
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const uid = await getAuthenticatedUid(req);
    if (!uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orders = await getOrders(uid);
    return NextResponse.json(orders);
  } catch (error) {
    console.error("Orders GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getAuthenticatedUid(req);
    if (!uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { items, total, wilaya, commune, codePostal, address, phone, fullName, notes } = body;

    if (!items || !total) {
      return NextResponse.json(
        { error: "Items and total are required" },
        { status: 400 }
      );
    }

    // Get user details if not provided
    const user = await getUserData(uid);

    const orderItems = items;
    const orderFullName = fullName || user?.name || null;
    const orderPhone = phone || user?.phone || null;
    const orderWilaya = wilaya || user?.wilaya || null;
    const orderCommune = commune || user?.commune || null;
    const orderCodePostal = codePostal || user?.codePostal || null;
    const orderAddress = address || user?.address || null;
    const orderNotes = notes || null;

    // Try Admin SDK first (bypasses Firestore security rules)
    try {
      const adminDb = await getAdminFirestore();

      // Create order in user's subcollection
      const userOrderRef = adminDb.collection("users").doc(uid).collection("orders").doc();
      const orderPayload = {
        items: JSON.stringify(orderItems),
        total,
        wilaya: orderWilaya,
        commune: orderCommune,
        codePostal: orderCodePostal,
        address: orderAddress,
        phone: orderPhone,
        fullName: orderFullName,
        notes: orderNotes,
        status: "pending",
        userId: uid,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await userOrderRef.set(orderPayload);

      // Also save to global orders collection for admin access
      try {
        const globalOrderRef = adminDb.collection("orders").doc();
        await globalOrderRef.set({
          ...orderPayload,
          userId: uid,
          userOrderId: userOrderRef.id,
        });
      } catch (globalErr) {
        console.warn("Global order write failed (non-critical):", (globalErr as any)?.code || (globalErr as any)?.message);
      }

      // Clear user's cart
      try {
        const cartSnapshot = await adminDb.collection("users").doc(uid).collection("cart").get();
        const batch = adminDb.batch();
        cartSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
        if (cartSnapshot.docs.length > 0) await batch.commit();
      } catch (cartErr) {
        console.warn("Cart clear failed (non-critical):", (cartErr as any)?.message);
      }

      return NextResponse.json(
        { id: userOrderRef.id, items: orderItems, total, status: "pending" },
        { status: 201 }
      );
    } catch (adminWriteErr) {
      console.error("Admin SDK write failed, falling back to client SDK:", (adminWriteErr as any)?.message);

      // Fallback: use client SDK (may fail if Firestore rules are strict)
      const { createOrder, clearCart } = await import("@/lib/firebase");
      const order = await createOrder(uid, {
        items: orderItems,
        total,
        wilaya: orderWilaya,
        commune: orderCommune,
        codePostal: orderCodePostal,
        address: orderAddress,
        phone: orderPhone,
        fullName: orderFullName,
        email: (user as any)?.email || null,
        notes: orderNotes,
      });

      // Clear the user's cart after order
      try { await clearCart(uid); } catch {}

      return NextResponse.json(order, { status: 201 });
    }
  } catch (error) {
    console.error("Orders POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
