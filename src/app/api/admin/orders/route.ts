import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, sanitizeString } from "@/lib/security";
import { verifyAdminDetailed, adminErrorResponse } from "@/lib/admin-auth";
import { db } from "@/lib/db";

const VALID_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

/** Editable order fields (server-side whitelisted — nothing else can be touched). */
const EDITABLE_FIELDS = [
  "fullName", "phone", "wilaya", "commune", "codePostal", "address", "notes", "url",
] as const;
const FIELD_LIMITS: Record<string, number> = {
  fullName: 120, phone: 20, wilaya: 80, commune: 80,
  codePostal: 10, address: 300, notes: 500, url: 500,
};

/**
 * GET /api/admin/orders — list orders (filters: status, q, uid, page).
 * PATCH /api/admin/orders — edit order: status, tracking code, shipping info, total.
 *   Marking an order "cancelled" auto-refunds any wallet/points paid.
 * DELETE /api/admin/orders — delete an order (typed confirmation required).
 *   Financial integrity is preserved: any wallet/points paid are refunded
 *   (unless the order was already cancelled = already refunded), and points
 *   earned from an approved review are reclaimed. Every movement is logged
 *   as a walletTransaction — an auditable trail that survives the deletion.
 */
export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 60, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const check = await verifyAdminDetailed(req as any);
    const gateErr = adminErrorResponse(check);
    if (gateErr) return gateErr;

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const uid = sanitizeString(url.searchParams.get("uid") || "").trim();
    const q = sanitizeString(url.searchParams.get("q") || "").trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(5, parseInt(url.searchParams.get("limit") || "20")));

    const where: any = {};
    if (status && VALID_STATUSES.includes(status)) where.status = status;
    // Per-user view ("see this user's orders" from the Users tab)
    if (uid) where.uid = uid;
    if (q) {
      where.OR = [
        { id: { contains: q, mode: "insensitive" as const } },
        { fullName: { contains: q, mode: "insensitive" as const } },
        { phone: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
        { user: { email: { contains: q, mode: "insensitive" as const } } },
      ];
    }

    const [total, orders] = await Promise.all([
      db.order.count({ where }),
      db.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { email: true, name: true, phone: true } },
          reviews: { select: { id: true, status: true, rating: true } },
        },
      }),
    ]);

    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        items: o.items,
        total: o.total,
        status: o.status,
        fullName: o.fullName,
        phone: o.phone,
        email: o.email,
        wilaya: o.wilaya,
        commune: o.commune,
        codePostal: o.codePostal,
        address: o.address,
        notes: o.notes,
        url: o.url,
        trackingCode: o.trackingCode,
        paidWithWallet: o.paidWithWallet,
        paidWithPoints: o.paidWithPoints,
        reviewSubmitted: o.reviewSubmitted,
        reviewStatus: o.reviews?.[0]?.status || null,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        uid: o.uid,
        userEmail: o.user?.email,
        userName: o.user?.name,
        userPhone: o.user?.phone,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("Admin orders GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 30, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const check = await verifyAdminDetailed(req as any);
    const gateErr = adminErrorResponse(check);
    if (gateErr) return gateErr;
    const adminEmail = check.email;

    const body = await req.json().catch(() => ({}));
    const orderId = sanitizeString(body.orderId).slice(0, 64);
    const status = body.status !== undefined ? String(body.status) : "";
    const trackingCode = body.trackingCode !== undefined ? sanitizeString(body.trackingCode).slice(0, 64) : undefined;

    if (!orderId) {
      return NextResponse.json({ error: "orderId required" }, { status: 400 });
    }
    // status is optional when only editing details — but if present it must be valid
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Whitelisted shipping/info fields (optional on every edit)
    const fieldUpdates: Record<string, string | null> = {};
    for (const f of EDITABLE_FIELDS) {
      if (body[f] !== undefined) {
        const v = sanitizeString(body[f]).slice(0, FIELD_LIMITS[f]);
        fieldUpdates[f] = v || null;
      }
    }

    // Total can be corrected by the admin (must stay a sane DZD amount)
    let totalUpdate: number | undefined;
    if (body.total !== undefined) {
      const t = Number(body.total);
      if (!Number.isFinite(t) || t <= 0 || t > 10_000_000) {
        return NextResponse.json({ error: "Invalid total" }, { status: 400 });
      }
      totalUpdate = Math.round(t * 100) / 100;
    }

    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Atomic status update + auto-refund when cancelling a paid order
    const updated = await db.$transaction(async (tx) => {
      // Refund wallet/points if order becomes cancelled (and wasn't already)
      if (status === "cancelled" && order.status !== "cancelled") {
        if (order.paidWithWallet > 0) {
          const u = await tx.user.findUnique({ where: { uid: order.uid }, select: { walletBalance: true } });
          if (u) {
            const newWallet = Math.round((u.walletBalance + order.paidWithWallet) * 100) / 100;
            await tx.user.update({ where: { uid: order.uid }, data: { walletBalance: newWallet } });
            await tx.walletTransaction.create({
              data: {
                uid: order.uid,
                type: "REFUND",
                balanceType: "wallet",
                amount: order.paidWithWallet,
                balanceAfter: newWallet,
                note: `Refund for cancelled order ${orderId}`,
                performedBy: adminEmail || "admin",
                refId: orderId,
              },
            });
          }
        }
        if (order.paidWithPoints > 0) {
          const u = await tx.user.findUnique({ where: { uid: order.uid }, select: { pointsBalance: true } });
          if (u) {
            const newPoints = Math.round((u.pointsBalance + order.paidWithPoints) * 100) / 100;
            await tx.user.update({ where: { uid: order.uid }, data: { pointsBalance: newPoints } });
            await tx.walletTransaction.create({
              data: {
                uid: order.uid,
                type: "REFUND",
                balanceType: "points",
                amount: order.paidWithPoints,
                balanceAfter: newPoints,
                note: `Refund for cancelled order ${orderId}`,
                performedBy: adminEmail || "admin",
                refId: orderId,
              },
            });
          }
        }
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          ...(status ? { status } : {}),
          ...(trackingCode !== undefined ? { trackingCode: trackingCode || null } : {}),
          ...fieldUpdates,
          ...(totalUpdate !== undefined ? { total: totalUpdate } : {}),
        },
      });
    });

    return NextResponse.json({ success: true, order: { id: updated.id, status: updated.status, trackingCode: updated.trackingCode } });
  } catch (error: any) {
    console.error("Admin orders PATCH error:", error?.message || error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/orders — delete an order.
 * Body: { orderId, confirm } — `confirm` MUST equal `orderId` (typed
 * confirmation from the admin UI; a second, server-side safety gate).
 *
 * Financial integrity ("no data loss" for the user's money):
 *  - If the order is NOT already cancelled, any wallet/points paid are
 *    REFUNDED to the user (a cancelled order was already refunded once —
 *    deleting it must never refund twice).
 *  - If an APPROVED review exists with pointsAwarded > 0, those earned
 *    points are reclaimed (clamped at ≥ 0).
 *  - All movements are logged as walletTransactions (REFUND / ADMIN_DEBIT)
 *    that survive the deletion as an audit trail.
 *  - Reviews cascade-delete with the order (FK onDelete: Cascade).
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
    const orderId = sanitizeString(body.orderId).slice(0, 64);
    const confirmId = sanitizeString(body.confirm).slice(0, 64);

    if (!orderId || confirmId !== orderId) {
      return NextResponse.json({ error: "Confirmation mismatch — type the order ID to confirm" }, { status: 400 });
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { reviews: { select: { status: true, pointsAwarded: true } } },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const refundWallet = order.status !== "cancelled" ? order.paidWithWallet : 0;
    const refundPoints = order.status !== "cancelled" ? order.paidWithPoints : 0;
    const approvedReview = order.reviews.find((r) => r.status === "approved" && r.pointsAwarded > 0);
    const reclaimPoints = approvedReview ? approvedReview.pointsAwarded : 0;

    await db.$transaction(async (tx) => {
      const u = await tx.user.findUnique({
        where: { uid: order.uid },
        select: { walletBalance: true, pointsBalance: true, totalPointsEarned: true },
      });
      if (!u) return; // user already gone (cascade would remove the order anyway)

      if (refundWallet > 0) {
        const newWallet = Math.round((u.walletBalance + refundWallet) * 100) / 100;
        await tx.user.update({ where: { uid: order.uid }, data: { walletBalance: newWallet } });
        await tx.walletTransaction.create({
          data: {
            uid: order.uid,
            type: "REFUND",
            balanceType: "wallet",
            amount: refundWallet,
            balanceAfter: newWallet,
            note: `Refund for deleted order ${orderId}`,
            performedBy: adminEmail || "admin",
            refId: orderId,
          },
        });
      }

      if (refundPoints > 0) {
        const newPoints = Math.round((u.pointsBalance + refundPoints) * 100) / 100;
        await tx.user.update({ where: { uid: order.uid }, data: { pointsBalance: newPoints } });
        await tx.walletTransaction.create({
          data: {
            uid: order.uid,
            type: "REFUND",
            balanceType: "points",
            amount: refundPoints,
            balanceAfter: newPoints,
            note: `Refund for deleted order ${orderId}`,
            performedBy: adminEmail || "admin",
            refId: orderId,
          },
        });
      }

      // Reclaim points the user EARNED from this order's approved review
      // (only up to the current balance — never drive it negative).
      if (reclaimPoints > 0) {
        const actualReclaim = Math.min(u.pointsBalance, reclaimPoints);
        if (actualReclaim > 0) {
          const newPoints = Math.round((u.pointsBalance - actualReclaim) * 100) / 100;
          const newEarned = Math.max(0, Math.round((u.totalPointsEarned - actualReclaim) * 100) / 100);
          await tx.user.update({
            where: { uid: order.uid },
            data: { pointsBalance: newPoints, totalPointsEarned: newEarned },
          });
          await tx.walletTransaction.create({
            data: {
              uid: order.uid,
              type: "ADMIN_DEBIT",
              balanceType: "points",
              amount: actualReclaim,
              balanceAfter: newPoints,
              note: `Review-points reclaim for deleted order ${orderId}`,
              performedBy: adminEmail || "admin",
              refId: orderId,
            },
          });
        }
      }

      // Reviews cascade-delete with the order (onDelete: Cascade).
      await tx.order.delete({ where: { id: orderId } });
    });

    return NextResponse.json({
      success: true,
      deleted: orderId,
      refundedWallet: refundWallet,
      refundedPoints: refundPoints,
      reclaimedReviewPoints: reclaimPoints,
    });
  } catch (error: any) {
    console.error("Admin orders DELETE error:", error?.message || error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
