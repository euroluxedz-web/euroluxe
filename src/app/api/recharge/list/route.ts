import { NextRequest, NextResponse } from "next/server";
import { getAllRecharges } from "@/lib/firebase";

export async function GET(req: NextRequest) {
  try {
    const recharges = await getAllRecharges();
    return NextResponse.json({ recharges });
  } catch (err: any) {
    console.error("List recharges error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
