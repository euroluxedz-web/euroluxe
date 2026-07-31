import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/security";
import { getAllRecharges } from "@/lib/firebase";

export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 30, 60_000);
  if (rateLimitResponse) return rateLimitResponse;
  try {
    const recharges = await getAllRecharges();
    return NextResponse.json({ recharges });
  } catch (err: any) {
    console.error("List recharges error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
