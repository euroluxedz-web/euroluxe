import { NextRequest, NextResponse } from "next/server";
import { getAllOrders, updateOrderStatus, getAllUsers, getUserOrders } from "@/lib/firebase";

const ADMIN_EMAIL = "euroluxe.dz@gmail.com";

/** Verify admin access via Firebase ID token */
async function verifyAdmin(req: NextRequest): Promise<boolean> {
  // Check for admin key header (legacy)
  const adminKey = req.headers.get("x-admin-key");
  if (adminKey === "EuR0lux3@dm!n2024#Sec") return true;
  
  // Check Firebase token
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  
  const token = authHeader.substring(7);
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
    const email = data.users?.[0]?.email;
    return email === ADMIN_EMAIL;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const isAdmin = await verifyAdmin(req);
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Get all users
    if (action === "users") {
      const users = await getAllUsers();
      return NextResponse.json({ users });
    }

    // Get orders for a specific user
    if (action === "user-orders") {
      const uid = url.searchParams.get("uid");
      if (!uid) {
        return NextResponse.json({ error: "uid required" }, { status: 400 });
      }
      const orders = await getUserOrders(uid);
      return NextResponse.json({ orders });
    }

    // Default: get all orders
    const orders = await getAllOrders();
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Admin orders GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const isAdmin = await verifyAdmin(req);
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderId, status, trackingCode } = await req.json();
    if (!orderId || !status) {
      return NextResponse.json(
        { error: "orderId and status are required" },
        { status: 400 }
      );
    }

    const result = await updateOrderStatus(orderId, status, trackingCode);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Admin orders PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
