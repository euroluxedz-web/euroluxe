import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/security";
import { confirmRecharge } from "@/lib/firebase";

const ADMIN_KEY = process.env.ADMIN_KEY || "";

export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 10, 60_000);
  if (rateLimitResponse) return rateLimitResponse;
  try {
    const body = await req.json();
    const { rechargeId, adminKey } = body;

    if (adminKey !== ADMIN_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!rechargeId) {
      return NextResponse.json({ error: "Missing rechargeId" }, { status: 400 });
    }

    const result = await confirmRecharge(rechargeId);
    return NextResponse.json({ success: true, newBalance: result.newBalance });
  } catch (err: any) {
    console.error("Confirm recharge error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
