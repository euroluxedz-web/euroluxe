import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/security";
import { verifyAdmin } from "@/lib/admin-auth";
import { getAllOrders, updateOrderStatus, getAllUsers, getUserOrders } from "@/lib/firebase";

/** Verify admin access via Firebase ID token (server-side only) */


export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 30, 60_000);
  if (rateLimitResponse) return rateLimitResponse;
  try {
    const isAdmin = await verifyAdmin(req as any);
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "users") {
      const users = await getAllUsers();
      return NextResponse.json({ users });
    }

    if (action === "user-orders") {
      const uid = url.searchParams.get("uid");
      if (!uid) {
        return NextResponse.json({ error: "uid required" }, { status: 400 });
      }
      const orders = await getUserOrders(uid);
      return NextResponse.json({ orders });
    }

    const orders = await getAllOrders();
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Admin orders GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 20, 60_000);
  if (rateLimitResponse) return rateLimitResponse;
  try {
    const isAdmin = await verifyAdmin(req as any);
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
