import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, sanitizeString } from "@/lib/security";
import { verifyAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";

/**
 * GET /api/admin/transactions — the full financial ledger.
 *   ?type=RECHARGE|ADMIN_CREDIT|...&balanceType=wallet|points&q=<email>&page=1&limit=30
 */
export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 60, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const isAdmin = await verifyAdmin(req as any);
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const balanceType = url.searchParams.get("balanceType");
    const q = sanitizeString(url.searchParams.get("q") || "").trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(10, parseInt(url.searchParams.get("limit") || "30")));

    const where: any = {};
    if (type && type !== "all") where.type = type;
    if (balanceType && balanceType !== "all") where.balanceType = balanceType;
    if (q) {
      where.user = {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
        ],
      };
    }

    const [total, transactions, sumAgg] = await Promise.all([
      db.walletTransaction.count({ where }),
      db.walletTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { email: true, name: true } } },
      }),
      db.walletTransaction.aggregate({
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({
      transactions: transactions.map((t) => ({
        id: t.id,
        uid: t.uid,
        type: t.type,
        balanceType: t.balanceType,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        note: t.note,
        performedBy: t.performedBy,
        refId: t.refId,
        createdAt: t.createdAt,
        userEmail: t.user?.email,
        userName: t.user?.name,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      totalAmount: sumAgg._sum.amount || 0,
    });
  } catch (error) {
    console.error("Admin transactions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
