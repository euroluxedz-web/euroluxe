import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, sanitizeString } from "@/lib/security";
import { verifyAdminDetailed, adminErrorResponse } from "@/lib/admin-auth";
import { db } from "@/lib/db";

/**
 * GET /api/admin/users
 * List/search users with their balances & activity. Admin only.
 * Query params: ?q=<search>&page=1&limit=20&sort=createdAt|walletBalance|pointsBalance|orders
 *               ?uid=<uid> → full detail (profile + orders + transactions + recharges + reviews)
 *
 * PATCH /api/admin/users — edit a user's profile (name/phone/location).
 *   Email, balances and isAdmin are NOT editable here (identity/security
 *   invariants). Balances have their own audited route (/users/wallet).
 *
 * DELETE /api/admin/users — delete a user + ALL their data (typed
 *   confirmation required, admin account protected). The Firebase Auth
 *   account is deleted too so it cannot resurrect on next login.
 */
export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 60, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const check = await verifyAdminDetailed(req as any);
    const gateErr = adminErrorResponse(check);
    if (gateErr) return gateErr;

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

/** Editable profile fields (server-side whitelist). */
const EDITABLE_USER_FIELDS = ["name", "phone", "wilaya", "commune", "codePostal", "address"] as const;
const USER_FIELD_LIMITS: Record<string, number> = {
  name: 120, phone: 20, wilaya: 80, commune: 80,
  codePostal: 10, address: 300,
};

export async function PATCH(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 30, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const check = await verifyAdminDetailed(req as any);
    const gateErr = adminErrorResponse(check);
    if (gateErr) return gateErr;

    const body = await req.json().catch(() => ({}));
    const uid = sanitizeString(body.uid).slice(0, 64);
    if (!uid) {
      return NextResponse.json({ error: "uid required" }, { status: 400 });
    }

    // Whitelisted profile fields only — email (identity), balances (audited
    // wallet route) and isAdmin (security) can never be edited from here.
    const fieldUpdates: Record<string, string | null> = {};
    for (const f of EDITABLE_USER_FIELDS) {
      if (body[f] !== undefined) {
        const v = sanitizeString(body[f]).slice(0, USER_FIELD_LIMITS[f]);
        fieldUpdates[f] = v || null;
      }
    }
    if (!Object.keys(fieldUpdates).length) {
      return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { uid } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updated = await db.user.update({
      where: { uid },
      data: fieldUpdates,
    });

    return NextResponse.json({
      success: true,
      user: {
        uid: updated.uid,
        name: updated.name,
        phone: updated.phone,
        wilaya: updated.wilaya,
        commune: updated.commune,
        codePostal: updated.codePostal,
        address: updated.address,
      },
    });
  } catch (error: any) {
    console.error("Admin users PATCH error:", error?.message || error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users — permanently delete a user and ALL their data.
 * Body: { uid, confirm } — `confirm` MUST equal `uid` (typed confirmation,
 * a second server-side safety gate on top of the UI's).
 *
 * Safety rails:
 *  - The ADMIN account can never be deleted from here.
 *  - Deletion runs in ONE Prisma transaction; FK cascades remove orders,
 *    recharges, reviews and ledger rows atomically.
 *  - The Firebase Auth account is deleted FIRST (treated as success when
 *    already gone — makes retries idempotent). If the Auth deletion fails
 *    for a technical reason the DB cleanup still proceeds, and the response
 *    carries authDeleteWarning so the admin knows the login credentials
 *    remain and can remove them from Firebase Console.
 */
export async function DELETE(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 10, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const check = await verifyAdminDetailed(req as any);
    const gateErr = adminErrorResponse(check);
    if (gateErr) return gateErr;
    const adminEmail = check.email;

    const body = await req.json().catch(() => ({}));
    const uid = sanitizeString(body.uid).slice(0, 64);
    const confirmUid = sanitizeString(body.confirm).slice(0, 64);

    if (!uid || confirmUid !== uid) {
      return NextResponse.json({ error: "Confirmation mismatch — type the user UID to confirm" }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { uid },
      include: {
        _count: { select: { orders: true, recharges: true, reviews: true, transactions: true } },
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (user.isAdmin) {
      return NextResponse.json({ error: "The admin account cannot be deleted" }, { status: 403 });
    }

    // 1) Firebase Auth account first (idempotent — "user not found" is OK).
    let authDeleteWarning: string | null = null;
    try {
      const { getAdminAuth } = await import("@/lib/firebase-admin");
      await getAdminAuth().deleteUser(uid);
    } catch (e: any) {
      const code = String(e?.code || e?.errorInfo?.code || "");
      if (!code.includes("user-not-found")) {
        // Auth user still exists — the account could log in again (and would
        // be re-synced with fresh zero balances). Surface this to the admin.
        authDeleteWarning =
          "Firebase Auth account could not be deleted automatically — remove it from Firebase Console → Authentication → Users.";
        console.error("Admin user delete: auth deleteUser failed:", code || e?.message);
      }
    }

    // 2) One transaction removes the user row; FK cascades wipe their
    //    orders, recharges, reviews and wallet transactions atomically.
    await db.$transaction(async (tx) => {
      await tx.user.delete({ where: { uid } });
    });

    return NextResponse.json({
      success: true,
      deleted: uid,
      email: user.email,
      deletedOrders: user._count.orders,
      deletedRecharges: user._count.recharges,
      deletedReviews: user._count.reviews,
      deletedTransactions: user._count.transactions,
      walletBalanceAtDeletion: user.walletBalance,
      pointsBalanceAtDeletion: user.pointsBalance,
      authDeleteWarning,
      performedBy: adminEmail,
    });
  } catch (error: any) {
    console.error("Admin users DELETE error:", error?.message || error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
