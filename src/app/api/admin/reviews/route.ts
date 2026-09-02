import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, sanitizeString } from "@/lib/security";
import { verifyAdminDetailed, adminErrorResponse } from "@/lib/admin-auth";
import { db } from "@/lib/db";

/** Points rule: order total × 0.1 (1000 DZD → 100 points). */
const POINTS_RATE = 0.1;

/**
 * GET /api/admin/reviews — moderation queue.
 *   ?status=pending|approved|rejected|all&page=1&limit=20
 *
 * POST /api/admin/reviews — approve or reject a review.
 *   Body: { id, action: "approve"|"reject", note?, overridePoints? }
 *
 * APPROVE is atomic: marks the review approved + credits points
 * (order.total × 0.1, or admin override) + ledger row — in ONE transaction.
 * Points can be credited only once (idempotent).
 */
export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 60, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const check = await verifyAdminDetailed(req as any);
    const gateErr = adminErrorResponse(check);
    if (gateErr) return gateErr;

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "pending";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(5, parseInt(url.searchParams.get("limit") || "20")));

    const where = status === "all" ? {} : { status };
    const [total, reviews] = await Promise.all([
      db.review.count({ where }),
      db.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { email: true, name: true, pointsBalance: true } },
          order: { select: { id: true, total: true, status: true } },
        },
      }),
    ]);

    return NextResponse.json({
      reviews: reviews.map((r) => ({
        id: r.id,
        uid: r.uid,
        orderId: r.orderId,
        rating: r.rating,
        comment: r.comment,
        photo: r.photo,
        status: r.status,
        pointsAwarded: r.pointsAwarded,
        adminNote: r.adminNote,
        processedBy: r.processedBy,
        processedAt: r.processedAt,
        createdAt: r.createdAt,
        userEmail: r.user?.email,
        userName: r.user?.name,
        userPoints: r.user?.pointsBalance,
        orderTotal: r.order?.total,
        orderStatus: r.order?.status,
        potentialPoints: r.order ? Math.round(r.order.total * POINTS_RATE * 10) / 10 : 0,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("Admin reviews GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 30, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const check = await verifyAdminDetailed(req as any);
    const gateErr = adminErrorResponse(check);
    if (gateErr) return gateErr;
    const adminEmail = check.email;

    const body = await req.json().catch(() => ({}));
    const id = sanitizeString(body.id).slice(0, 64);
    const action = String(body.action || "");
    const note = sanitizeString(body.note).slice(0, 300) || null;
    const overridePoints = Number(body.overridePoints);

    if (!id || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "id and action (approve|reject) required" }, { status: 400 });
    }

    const review = await db.review.findUnique({ where: { id }, include: { order: true } });
    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    if (review.status !== "pending") {
      return NextResponse.json({ error: `Already ${review.status}` }, { status: 409 });
    }

    if (action === "reject") {
      const updated = await db.review.update({
        where: { id },
        data: {
          status: "rejected",
          adminNote: note,
          processedBy: adminEmail,
          processedAt: new Date(),
        },
      });
      return NextResponse.json({ success: true, status: updated.status });
    }

    // APPROVE — atomic: approve + credit points + ledger
    const points = Number.isFinite(overridePoints) && overridePoints > 0
      ? Math.round(overridePoints * 10) / 10
      : Math.round(review.order.total * POINTS_RATE * 10) / 10;

    const result = await db.$transaction(async (tx) => {
      const fresh = await tx.review.findUnique({ where: { id } });
      if (!fresh || fresh.status !== "pending") throw new Error("ALREADY_PROCESSED");

      await tx.review.update({
        where: { id },
        data: {
          status: "approved",
          pointsAwarded: points,
          adminNote: note,
          processedBy: adminEmail,
          processedAt: new Date(),
        },
      });

      const user = await tx.user.findUnique({ where: { uid: fresh.uid }, select: { pointsBalance: true, totalPointsEarned: true } });
      if (!user) throw new Error("USER_NOT_FOUND");

      const newPoints = Math.round((user.pointsBalance + points) * 100) / 10 / 10;
      const newPointsRounded = Math.round((user.pointsBalance + points) * 10) / 10;
      await tx.user.update({
        where: { uid: fresh.uid },
        data: {
          pointsBalance: newPointsRounded,
          totalPointsEarned: Math.round((user.totalPointsEarned + points) * 10) / 10,
        },
      });
      await tx.walletTransaction.create({
        data: {
          uid: fresh.uid,
          type: "POINTS_EARNED",
          balanceType: "points",
          amount: points,
          balanceAfter: newPointsRounded,
          note: note || `Review approved for order ${fresh.orderId} (${adminEmail})`,
          performedBy: adminEmail || "admin",
          refId: fresh.id,
        },
      });

      return { newPoints: newPointsRounded, points };
    });

    return NextResponse.json({
      success: true,
      status: "approved",
      pointsCredited: result.points,
      newPointsBalance: result.newPoints,
    });
  } catch (error: any) {
    if (error?.message === "ALREADY_PROCESSED") {
      return NextResponse.json({ error: "Already processed" }, { status: 409 });
    }
    console.error("Admin review action error:", error?.message || error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/reviews — permanently remove a review (typed
 * confirmation required). The order's reviewSubmitted flag is reset so
 * the user can submit a new review for that order if they wish.
 *
 * Financial integrity:
 *  - If the review was APPROVED with pointsAwarded > 0, those points are
 *    reclaimed from the user (clamped at >= 0) inside the SAME transaction,
 *    with an ADMIN_DEBIT ledger entry — the audit trail survives.
 *  - pending/rejected reviews are inert — deleting them is always safe.
 */
export async function DELETE(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 20, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const check = await verifyAdminDetailed(req as any);
    const gateErr = adminErrorResponse(check);
    if (gateErr) return gateErr;
    const adminEmail = check.email;

    const body = await req.json().catch(() => ({}));
    const id = sanitizeString(body.id).slice(0, 64);
    const confirmId = sanitizeString(body.confirm).slice(0, 64);

    if (!id || confirmId !== id) {
      return NextResponse.json({ error: "Confirmation mismatch — type the review ID to confirm" }, { status: 400 });
    }

    const review = await db.review.findUnique({ where: { id } });
    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    const reclaimPoints = review.status === "approved" ? review.pointsAwarded : 0;

    await db.$transaction(async (tx) => {
      if (reclaimPoints > 0) {
        const u = await tx.user.findUnique({
          where: { uid: review.uid },
          select: { pointsBalance: true, totalPointsEarned: true },
        });
        if (u) {
          // Clamp at >= 0 — never drive a balance negative.
          const actualReclaim = Math.min(u.pointsBalance, reclaimPoints);
          if (actualReclaim > 0) {
            const newPoints = Math.round((u.pointsBalance - actualReclaim) * 100) / 100;
            const newEarned = Math.max(0, Math.round((u.totalPointsEarned - actualReclaim) * 100) / 100);
            await tx.user.update({
              where: { uid: review.uid },
              data: { pointsBalance: newPoints, totalPointsEarned: newEarned },
            });
            await tx.walletTransaction.create({
              data: {
                uid: review.uid,
                type: "ADMIN_DEBIT",
                balanceType: "points",
                amount: actualReclaim,
                balanceAfter: newPoints,
                note: `Review-points reclaim for deleted review ${id}`,
                performedBy: adminEmail || "admin",
                refId: id,
              },
            });
          }
        }
      }

      // Reset the order's flag so the user can review again if they want.
      await tx.order.update({
        where: { id: review.orderId },
        data: { reviewSubmitted: false },
      });

      await tx.review.delete({ where: { id } });
    });

    return NextResponse.json({
      success: true,
      deleted: id,
      orderId: review.orderId,
      wasApproved: review.status === "approved",
      reclaimedPoints: reclaimPoints,
      performedBy: adminEmail,
    });
  } catch (error: any) {
    console.error("Admin reviews DELETE error:", error?.message || error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
