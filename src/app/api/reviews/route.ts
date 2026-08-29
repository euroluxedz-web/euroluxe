import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, sanitizeString } from "@/lib/security";
import { getSyncedUser } from "@/lib/auth-server";
import { db } from "@/lib/db";

export const maxDuration = 30;

/** Points rule: 1 DZD spent → 0.1 point (1000 DZD → 100 points). */
export const POINTS_RATE = 0.1;

/**
 * POST /api/reviews — submit a review for a DELIVERED order.
 * Body: { orderId, rating (1-5), comment, photo (data:image/...;base64) }
 *
 * Points are NOT credited here — an admin must approve the review first.
 * Points credited = order.total × 0.1 (rounded to 1 decimal).
 */
export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 10, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const synced = await getSyncedUser(req as any);
    if (!synced) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const uid = synced.dbUser.uid;

    const body = await req.json().catch(() => ({}));
    const orderId = sanitizeString(body.orderId).slice(0, 64);
    const rating = Math.round(Number(body.rating));
    const comment = sanitizeString(body.comment).slice(0, 1000);
    const photo = typeof body.photo === "string" ? body.photo : "";

    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }
    if (!(rating >= 1 && rating <= 5)) {
      return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
    }
    if (comment.trim().length < 5) {
      return NextResponse.json({ error: "Comment too short" }, { status: 400 });
    }
    // The photo of the received product is REQUIRED to earn points
    if (!photo.startsWith("data:image/") || !photo.includes("base64,")) {
      return NextResponse.json({ error: "Photo of the received product is required" }, { status: 400 });
    }
    if (photo.length > 4_000_000) {
      return NextResponse.json({ error: "Photo too large (max ~2.5MB)" }, { status: 400 });
    }

    // Order must exist, belong to the user, be delivered, and not reviewed yet
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order || order.uid !== uid) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.status !== "delivered") {
      return NextResponse.json(
        { error: "You can review only after the order is delivered" },
        { status: 400 }
      );
    }
    if (order.reviewSubmitted) {
      return NextResponse.json({ error: "Review already submitted for this order" }, { status: 409 });
    }

    const pointsToEarn = Math.round(order.total * POINTS_RATE * 10) / 10;

    const review = await db.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          uid,
          orderId,
          rating,
          comment,
          photo,
          status: "pending",
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { reviewSubmitted: true },
      });
      return created;
    });

    return NextResponse.json(
      {
        success: true,
        id: review.id,
        status: "pending",
        potentialPoints: pointsToEarn,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Review POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/reviews — the user's own reviews (+ their points status).
 * Optional: ?public=1 returns APPROVED reviews only (safe for display).
 */
export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 30, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const url = new URL(req.url);
    const isPublic = url.searchParams.get("public") === "1";

    if (isPublic) {
      const approved = await db.review.findMany({
        where: { status: "approved" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          pointsAwarded: true,
          user: { select: { name: true } },
        },
      });
      return NextResponse.json({
        reviews: approved.map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt,
          authorName: r.user?.name ? r.user.name.split(" ")[0] + (r.user.name.split(" ")[1] ? " " + r.user.name.split(" ")[1][0] + "." : "") : "Client",
        })),
      });
    }

    const synced = await getSyncedUser(req as any);
    if (!synced) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const reviews = await db.review.findMany({
      where: { uid: synced.dbUser.uid },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        orderId: true,
        rating: true,
        comment: true,
        status: true,
        pointsAwarded: true,
        adminNote: true,
        createdAt: true,
        processedAt: true,
      },
    });

    return NextResponse.json({ reviews });
  } catch (error) {
    console.error("Review GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
