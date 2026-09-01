import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/security";
import { verifyAdminDetailed, adminErrorResponse } from "@/lib/admin-auth";
import { db } from "@/lib/db";

/**
 * GET /api/admin/stats — dashboard aggregates for the admin panel.
 * Also the GATE PROBE for the /admin client: 401 = token problem (retryable),
 * 403 = Firebase-verified account that is not the admin (final).
 */
export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 60, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const check = await verifyAdminDetailed(req as any);
    const gateErr = adminErrorResponse(check);
    if (gateErr) return gateErr;

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      newUsersDay,
      newUsersWeek,
      totalOrders,
      ordersByStatus,
      pendingRecharges,
      pendingReviews,
      monthRevenueAgg,
      walletTotals,
      pointsTotals,
      recentOrders,
      recentTransactions,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { createdAt: { gte: dayAgo } } }),
      db.user.count({ where: { createdAt: { gte: weekAgo } } }),
      db.order.count(),
      db.order.groupBy({ by: ["status"], _count: { _all: true } }),
      db.rechargeRequest.count({ where: { status: "pending" } }),
      db.review.count({ where: { status: "pending" } }),
      db.order.aggregate({
        where: { createdAt: { gte: monthStart }, status: { not: "cancelled" } },
        _sum: { total: true, paidWithWallet: true, paidWithPoints: true },
      }),
      db.user.aggregate({ _sum: { walletBalance: true } }),
      db.user.aggregate({ _sum: { pointsBalance: true, totalPointsEarned: true } }),
      db.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true, total: true, status: true, createdAt: true,
          paidWithWallet: true, paidWithPoints: true,
          user: { select: { email: true, name: true } },
        },
      }),
      db.walletTransaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true, type: true, balanceType: true, amount: true,
          balanceAfter: true, createdAt: true, note: true, performedBy: true,
          user: { select: { email: true } },
        },
      }),
    ]);

    const statusCounts: Record<string, number> = {
      pending: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0,
    };
    for (const g of ordersByStatus) {
      statusCounts[g.status] = g._count._all;
    }

    return NextResponse.json({
      users: { total: totalUsers, newDay: newUsersDay, newWeek: newUsersWeek },
      orders: {
        total: totalOrders,
        byStatus: statusCounts,
        revenueMonth: monthRevenueAgg._sum.total || 0,
        paidWalletMonth: monthRevenueAgg._sum.paidWithWallet || 0,
        paidPointsMonth: monthRevenueAgg._sum.paidWithPoints || 0,
      },
      pending: { recharges: pendingRecharges, reviews: pendingReviews },
      balances: {
        totalWalletOutstanding: walletTotals._sum.walletBalance || 0,
        totalPointsOutstanding: pointsTotals._sum.pointsBalance || 0,
        totalPointsEarned: pointsTotals._sum.totalPointsEarned || 0,
      },
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        total: o.total,
        status: o.status,
        createdAt: o.createdAt,
        paidWithWallet: o.paidWithWallet,
        paidWithPoints: o.paidWithPoints,
        userEmail: o.user?.email,
        userName: o.user?.name,
      })),
      recentTransactions,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
