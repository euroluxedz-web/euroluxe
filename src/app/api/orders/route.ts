import { NextRequest, NextResponse } from "next/server";
import { getOrders, createOrder, clearCart, getUserData } from "@/lib/firebase";

async function getAuthenticatedUid(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.split("Bearer ")[1];
    const { getAdminAuth } = await import("@/lib/firebase-admin");
    const decodedToken = await getAdminAuth().verifyIdToken(token);
    return decodedToken.uid;
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

    const order = await createOrder(uid, {
      items,
      total,
      wilaya: wilaya || user?.wilaya || null,
      commune: commune || user?.commune || null,
      codePostal: codePostal || user?.codePostal || null,
      address: address || user?.address || null,
      phone: phone || user?.phone || null,
      fullName: fullName || user?.name || null,
      email: (user as any)?.email || null,
      notes: notes || null,
    });

    // Clear the user's cart after order
    await clearCart(uid);

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("Orders POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
