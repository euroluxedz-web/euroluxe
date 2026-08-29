import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/security";
import { getSyncedUser } from "@/lib/auth-server";
import { db } from "@/lib/db";

/**
 * GET /api/recharge/list
 * The authenticated user's own recharge history.
 */
export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 30, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const synced = await getSyncedUser(req as any);
    if (!synced) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const recharges = await db.rechargeRequest.findMany({
      where: { uid: synced.dbUser.uid },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        amount: true,
        status: true,
        adminNote: true,
        createdAt: true,
        processedAt: true,
      },
    });

    return NextResponse.json({ recharges });
  } catch (error) {
    console.error("Recharge list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
