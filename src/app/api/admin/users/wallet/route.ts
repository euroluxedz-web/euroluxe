import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, sanitizeString } from "@/lib/security";
import { verifyAdminWithIdentity } from "@/lib/admin-auth";
import { creditBalance, debitBalance } from "@/lib/wallet";
import { db } from "@/lib/db";

/**
 * POST /api/admin/users/wallet — adjust a user's wallet or points balance.
 *
 * Body: {
 *   uid: string,
 *   action: "credit" | "debit" | "set",
 *   balanceType: "wallet" | "points",
 *   amount: number (>0),
 *   note?: string
 * }
 *
 * Every change is atomic and recorded in the WalletTransaction ledger with
 * the acting admin's email. "set" computes the delta and applies credit/debit.
 * Debit rejects insufficient funds — balances can never go negative.
 */
export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 60, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { ok, email: adminEmail } = await verifyAdminWithIdentity(req as any);
    if (!ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const uid = sanitizeString(body.uid).slice(0, 64);
    const action = String(body.action || "");
    const balanceType = body.balanceType === "points" ? "points" : "wallet";
    const amount = Number(body.amount);
    const note = sanitizeString(body.note).slice(0, 300) || null;

    if (!uid) {
      return NextResponse.json({ error: "uid is required" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
    }
    if (amount > 10_000_000) {
      return NextResponse.json({ error: "Amount too large" }, { status: 400 });
    }
    if (!["credit", "debit", "set"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { uid } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const current = balanceType === "wallet" ? user.walletBalance : user.pointsBalance;
    let result;

    if (action === "credit") {
      result = await creditBalance({
        uid,
        balanceType,
        amount,
        type: balanceType === "wallet" ? "ADMIN_CREDIT" : "POINTS_EARNED",
        note: note || `Admin credit (${adminEmail})`,
        performedBy: adminEmail || "admin",
        alsoIncrementPointsEarned: balanceType === "points",
      });
    } else if (action === "debit") {
      try {
        result = await debitBalance({
          uid,
          balanceType,
          amount,
          type: balanceType === "wallet" ? "ADMIN_DEBIT" : "POINTS_SPENT",
          note: note || `Admin debit (${adminEmail})`,
          performedBy: adminEmail || "admin",
        });
      } catch (e: any) {
        if (e?.message === "INSUFFICIENT_FUNDS") {
          return NextResponse.json(
            { error: `Insufficient ${balanceType} balance (current: ${current})` },
            { status: 400 }
          );
        }
        throw e;
      }
    } else {
      // "set" — compute delta from current balance
      const delta = Math.round((amount - current) * 100) / 100;
      if (delta === 0) {
        return NextResponse.json({
          success: true,
          balanceType,
          balance: current,
          message: "Balance already at target value",
        });
      }
      if (delta > 0) {
        result = await creditBalance({
          uid,
          balanceType,
          amount: delta,
          type: balanceType === "wallet" ? "ADMIN_CREDIT" : "POINTS_EARNED",
          note: note || `Admin set ${current} → ${amount}`,
          performedBy: adminEmail || "admin",
          alsoIncrementPointsEarned: balanceType === "points",
        });
      } else {
        try {
          result = await debitBalance({
            uid,
            balanceType,
            amount: -delta,
            type: balanceType === "wallet" ? "ADMIN_DEBIT" : "POINTS_SPENT",
            note: note || `Admin set ${current} → ${amount}`,
            performedBy: adminEmail || "admin",
          });
        } catch (e: any) {
          if (e?.message === "INSUFFICIENT_FUNDS") {
            return NextResponse.json({ error: "INSUFFICIENT_FUNDS" }, { status: 400 });
          }
          throw e;
        }
      }
    }

    return NextResponse.json({
      success: true,
      balanceType,
      action,
      amount,
      previousBalance: current,
      newBalance: result.balance,
      transactionId: result.transactionId,
    });
  } catch (error: any) {
    console.error("Admin wallet adjust error:", error?.message || error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
