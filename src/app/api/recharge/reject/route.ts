import { NextRequest, NextResponse } from "next/server";
import { rejectRecharge } from "@/lib/firebase";

const ADMIN_KEY = "EuR0lux3@dm!n2024#Sec";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rechargeId, adminKey, note } = body;

    if (adminKey !== ADMIN_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!rechargeId) {
      return NextResponse.json({ error: "Missing rechargeId" }, { status: 400 });
    }

    await rejectRecharge(rechargeId, note);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Reject recharge error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
