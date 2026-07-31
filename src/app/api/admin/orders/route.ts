import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/security";
import { verifyAdmin } from "@/lib/admin-auth";
import { getAllOrders, updateOrderStatus, getAllUsers, getUserOrders } from "@/lib/firebase";

/** Verify admin access via Firebase ID token (server-side only) */
async function verifyAdmin(req: NextRequest): Promise<boolean> {
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
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!response.ok) return false;
    const data = await response.json();
    const email = data.users?.[0]?.email;
    if (!email) return false;
    
    // Check against env var (not hardcoded in code)
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return false;
    
    return email === adminEmail;
  } catch {
    return false;
  }
}

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
