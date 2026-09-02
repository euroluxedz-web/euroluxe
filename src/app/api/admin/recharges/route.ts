import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, sanitizeString } from "@/lib/security";
import { verifyAdminDetailed, adminErrorResponse } from "@/lib/admin-auth";
import { creditBalance } from "@/lib/wallet";
import { db } from "@/lib/db";

/**
 * GET /api/admin/recharges — list recharge requests.
 *   ?status=pending|confirmed|rejected|all&page=1&limit=20
 *
 * POST /api/admin/recharges — confirm or reject a request.
 *   Body: { id, action: "confirm"|"reject", note? }
 *
 * CONFIRM is atomic: marks the request confirmed + credits the wallet +
 * writes the ledger row — all in one DB transaction. A request can be
 * confirmed only once (idempotent, prevents double-credit).
 *
 * DELETE /api/admin/recharges — permanently remove a request (typed
 *   confirmation required). Useful to clean test/spam entries. Deleting a
 *   CONFIRMED request does NOT touch the wallet credit: the money stays
 *   with the user and the ledger row (RECHARGE, refId = this id) remains
 *   as the permanent audit trail.
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
    const [total, recharges] = await Promise.all([
      db.rechargeRequest.count({ where }),
      db.rechargeRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { email: true, name: true, walletBalance: true } } },
      }),
    ]);

    return NextResponse.json({
      recharges: recharges.map((r) => ({
        id: r.id,
        uid: r.uid,
        email: r.email,
        amount: r.amount,
        status: r.status,
        receiptImage: r.receiptImage,
        adminNote: r.adminNote,
        processedBy: r.processedBy,
        processedAt: r.processedAt,
        createdAt: r.createdAt,
        userEmail: r.user?.email,
        userName: r.user?.name,
        userWallet: r.user?.walletBalance,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("Admin recharges GET error:", error);
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

    if (!id || !["confirm", "reject"].includes(action)) {
      return NextResponse.json({ error: "id and action (confirm|reject) required" }, { status: 400 });
    }

    const recharge = await db.rechargeRequest.findUnique({ where: { id } });
    if (!recharge) {
      return NextResponse.json({ error: "Recharge not found" }, { status: 404 });
    }
    if (recharge.status !== "pending") {
      return NextResponse.json(
        { error: `Already ${recharge.status}` },
        { status: 409 }
      );
    }

    if (action === "reject") {
      const updated = await db.rechargeRequest.update({
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

    // CONFIRM — atomic: mark confirmed + credit wallet + ledger row
    const result = await db.$transaction(async (tx) => {
      // Lock the row semantics: only update if still pending
      const fresh = await tx.rechargeRequest.findUnique({ where: { id } });
      if (!fresh || fresh.status !== "pending") throw new Error("ALREADY_PROCESSED");

      await tx.rechargeRequest.update({
        where: { id },
        data: {
          status: "confirmed",
          adminNote: note,
          processedBy: adminEmail,
          processedAt: new Date(),
        },
      });

      const user = await tx.user.findUnique({ where: { uid: fresh.uid }, select: { walletBalance: true } });
      if (!user) throw new Error("USER_NOT_FOUND");

      const newBalance = Math.round((user.walletBalance + fresh.amount) * 100) / 100;
      await tx.user.update({
        where: { uid: fresh.uid },
        data: { walletBalance: newBalance },
      });
      await tx.walletTransaction.create({
        data: {
          uid: fresh.uid,
          type: "RECHARGE",
          balanceType: "wallet",
          amount: fresh.amount,
          balanceAfter: newBalance,
          note: note || `Recharge confirmed (${adminEmail})`,
          performedBy: adminEmail || "admin",
          refId: fresh.id,
        },
      });

      return { newBalance };
    });

    return NextResponse.json({ success: true, status: "confirmed", newBalance: result.newBalance });
  } catch (error: any) {
    if (error?.message === "ALREADY_PROCESSED") {
      return NextResponse.json({ error: "Already processed" }, { status: 409 });
    }
    console.error("Admin recharge action error:", error?.message || error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/recharges — permanently remove a recharge request.
 * Body: { id, confirm } — `confirm` MUST equal `id`.
 *
 * Financial safety:
 *  - pending/rejected requests are inert — deleting them is always safe.
 *  - a CONFIRMED request deletion keeps the user's credited money in place;
 *    the walletTransactions ledger row (refId = this id) survives as the
 *    audit trail, so the financial history is never lost.
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
      return NextResponse.json({ error: "Confirmation mismatch — type the recharge ID to confirm" }, { status: 400 });
    }

    const recharge = await db.rechargeRequest.findUnique({ where: { id } });
    if (!recharge) {
      return NextResponse.json({ error: "Recharge not found" }, { status: 404 });
    }

    // The RECHARGE ledger row (refId = id) is NOT deleted — it keeps the
    // financial audit trail alive for confirmed requests.
    await db.rechargeRequest.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      deleted: id,
      status: recharge.status,
      amount: recharge.amount,
      email: recharge.email,
      wasConfirmed: recharge.status === "confirmed",
      ledgerPreserved: recharge.status === "confirmed",
      performedBy: adminEmail,
    });
  } catch (error: any) {
    console.error("Admin recharges DELETE error:", error?.message || error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
