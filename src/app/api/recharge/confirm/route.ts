import { NextRequest, NextResponse } from "next/server";
import { confirmRecharge } from "@/lib/firebase";

const ADMIN_KEY = "EuR0lux3@dm!n2024#Sec";

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
