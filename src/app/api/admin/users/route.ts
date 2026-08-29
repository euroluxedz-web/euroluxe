import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, sanitizeString } from "@/lib/security";
import { verifyAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";

/**
 * GET /api/admin/users
 * List/search users with their balances & activity. Admin only.
 * Query params: ?q=<search>&page=1&limit=20&sort=createdAt|walletBalance|pointsBalance|orders
 *               ?uid=<uid> → full detail (profile + orders + transactions + recharges + reviews)
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
    const uid = url.searchParams.get("uid");

    // ── Single user detail ──
    if (uid) {
      const user = await db.user.findUnique({
        where: { uid },
        include: {
          orders: { orderBy: { createdAt: "desc" }, take: 50 },
          transactions: { orderBy: { createdAt: "desc" }, take: 50 },
          recharges: {
            orderBy: { createdAt: "desc" }, take: 20,
            select: { id: true, amount: true, status: true, createdAt: true, adminNote: true },
          },
          reviews: {
            orderBy: { createdAt: "desc" }, take: 20,
            select: { id: true, orderId: true, rating: true, comment: true, status: true, pointsAwarded: true, createdAt: true },
          },
        },
      });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json({ user });
    }

    // ── List with search / pagination ──
    const q = sanitizeString(url.searchParams.get("q") || "").trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(5, parseInt(url.searchParams.get("limit") || "20")));
    const sort = url.searchParams.get("sort") || "createdAt";

    const where = q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } },
            { uid: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};

    const orderByMap: Record<string, any> = {
      createdAt: { createdAt: "desc" },
      walletBalance: { walletBalance: "desc" },
      pointsBalance: { pointsBalance: "desc" },
      totalSpent: { totalSpent: "desc" },
      email: { email: "asc" },
    };

    const [total, users] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        orderBy: orderByMap[sort] || orderByMap.createdAt,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          uid: true,
          email: true,
          name: true,
          phone: true,
          wilaya: true,
          commune: true,
          address: true,
          walletBalance: true,
          pointsBalance: true,
          totalPointsEarned: true,
          totalSpent: true,
          isAdmin: true,
          createdAt: true,
          lastSeenAt: true,
          _count: {
            select: { orders: true, recharges: true, reviews: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      users: users.map((u) => ({
        uid: u.uid,
        email: u.email,
        name: u.name,
        phone: u.phone,
        wilaya: u.wilaya,
        commune: u.commune,
        address: u.address,
        walletBalance: u.walletBalance,
        pointsBalance: u.pointsBalance,
        totalPointsEarned: u.totalPointsEarned,
        totalSpent: u.totalSpent,
        isAdmin: u.isAdmin,
        createdAt: u.createdAt,
        lastSeenAt: u.lastSeenAt,
        ordersCount: u._count.orders,
        rechargesCount: u._count.recharges,
        reviewsCount: u._count.reviews,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("Admin users error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
