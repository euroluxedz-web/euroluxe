import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/security";
import { verifyAdmin } from "@/lib/admin-auth";
import { getAllRecharges } from "@/lib/firebase";

export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 30, 60_000);
  if (rateLimitResponse) return rateLimitResponse;
  
  // Require admin access - this returns ALL recharges (sensitive data)
  const isAdmin = await verifyAdmin(req as any);
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const recharges = await getAllRecharges();
    return NextResponse.json({ recharges });
  } catch (err: any) {
    console.error("List recharges error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
