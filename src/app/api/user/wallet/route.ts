import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/security";
import { getSyncedUser } from "@/lib/auth-server";
import { db } from "@/lib/db";

/**
 * GET /api/user/wallet
 * Returns the authenticated user's wallet + points balances and their
 * latest transactions (read-only ledger for the profile / history pages).
 */
export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 60, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const synced = await getSyncedUser(req as any);
    if (!synced) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const uid = synced.dbUser.uid;

    const [user, transactions] = await Promise.all([
      db.user.findUnique({
        where: { uid },
        select: { walletBalance: true, pointsBalance: true, totalPointsEarned: true, totalSpent: true },
      }),
      db.walletTransaction.findMany({
        where: { uid },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return NextResponse.json({
      walletBalance: user?.walletBalance ?? 0,
      pointsBalance: user?.pointsBalance ?? 0,
      totalPointsEarned: user?.totalPointsEarned ?? 0,
      totalSpent: user?.totalSpent ?? 0,
      transactions,
    });
  } catch (error) {
    console.error("Wallet GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
