import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/security";
import { createRechargeRequest } from "@/lib/firebase";

const ADMIN_KEY = process.env.ADMIN_KEY || "";

export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 10, 60_000);
  if (rateLimitResponse) return rateLimitResponse;
  try {
    const body = await req.json();
    const { uid, email, amount, adminKey } = body;

    // Verify admin key
    if (adminKey !== ADMIN_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!uid || !email || !amount || amount <= 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (amount < 1000 || amount > 100000) {
      return NextResponse.json({ error: "Amount must be between 1000 and 100000" }, { status: 400 });
    }

    // Create recharge request (no receipt for admin credits)
    const result = await createRechargeRequest(uid, email, amount, "ADMIN_CREDIT");

    return NextResponse.json({ success: true, id: result.id });
  } catch (err: any) {
    console.error("Recharge API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
