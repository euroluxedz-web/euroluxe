/**
 * Wallet & points engine — atomic, server-side-only financial operations.
 *
 * RULES
 * =====
 * - Every balance change happens inside a Prisma interactive transaction.
 * - Balances are re-read INSIDE the transaction (no TOCTOU / race abuse).
 * - Negative balances are rejected.
 * - Every movement writes a WalletTransaction ledger row (audit trail).
 * - Points: earned via approved reviews (order total × 0.1), spent 1pt = 1 DZD.
 */

export type BalanceType = "wallet" | "points";

export type TxType =
  | "ADMIN_CREDIT"
  | "ADMIN_DEBIT"
  | "RECHARGE"
  | "ORDER_PAYMENT"
  | "REFUND"
  | "POINTS_EARNED"
  | "POINTS_SPENT"
  | "SIGNUP_BONUS";

export interface AdjustResult {
  balance: number;
  transactionId: string;
}

/**
 * Credit a user's balance (wallet or points) atomically.
 * Returns the new balance. Throws on missing user / invalid amount.
 */
export async function creditBalance(params: {
  uid: string;
  balanceType: BalanceType;
  amount: number;
  type: TxType;
  note?: string;
  performedBy?: string;
  refId?: string;
  alsoIncrementPointsEarned?: boolean;
}): Promise<AdjustResult> {
  const { uid, balanceType, amount, type, note, performedBy, refId, alsoIncrementPointsEarned } = params;
  if (!(amount > 0)) throw new Error("INVALID_AMOUNT");

  const { db } = await import("@/lib/db");
  const field = balanceType === "wallet" ? "walletBalance" : "pointsBalance";

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { uid }, select: { [field]: true } as any });
    if (!user) throw new Error("USER_NOT_FOUND");

    const current = (user as any)[field] as number;
    const next = Math.round((current + amount) * 100) / 100;

    await tx.user.update({
      where: { uid },
      data: {
        [field]: next,
        ...(alsoIncrementPointsEarned ? { totalPointsEarned: { increment: amount } } : {}),
      } as any,
    });

    const ledger = await tx.walletTransaction.create({
      data: {
        uid,
        type,
        balanceType,
        amount,
        balanceAfter: next,
        note: note ?? null,
        performedBy: performedBy ?? "system",
        refId: refId ?? null,
      },
    });

    return { balance: next, transactionId: ledger.id };
  });
}

/**
 * Debit a user's balance atomically. Rejects insufficient funds.
 */
export async function debitBalance(params: {
  uid: string;
  balanceType: BalanceType;
  amount: number;
  type: TxType;
  note?: string;
  performedBy?: string;
  refId?: string;
  alsoIncrementSpent?: boolean;
}): Promise<AdjustResult> {
  const { uid, balanceType, amount, type, note, performedBy, refId, alsoIncrementSpent } = params;
  if (!(amount > 0)) throw new Error("INVALID_AMOUNT");

  const { db } = await import("@/lib/db");
  const field = balanceType === "wallet" ? "walletBalance" : "pointsBalance";

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { uid }, select: { [field]: true } as any });
    if (!user) throw new Error("USER_NOT_FOUND");

    const current = (user as any)[field] as number;
    if (current < amount) throw new Error("INSUFFICIENT_FUNDS");
    const next = Math.round((current - amount) * 100) / 100;

    await tx.user.update({
      where: { uid },
      data: {
        [field]: next,
        ...(alsoIncrementSpent ? { totalSpent: { increment: amount } } : {}),
      } as any,
    });

    const ledger = await tx.walletTransaction.create({
      data: {
        uid,
        type,
        balanceType,
        amount,
        balanceAfter: next,
        note: note ?? null,
        performedBy: performedBy ?? "system",
        refId: refId ?? null,
      },
    });

    return { balance: next, transactionId: ledger.id };
  });
}

/**
 * Pay for an order using wallet + points in a single atomic transaction.
 * Reads balances inside the transaction, validates coverage, debits both
 * (if used), writes ledger rows, and creates the order row — all-or-nothing.
 */
export async function createOrderWithPayment(params: {
  uid: string;
  orderId: string;
  itemsJson: string;
  total: number;
  shipping: {
    fullName?: string; phone?: string; email?: string;
    wilaya?: string; commune?: string; codePostal?: string;
    address?: string; notes?: string; url?: string;
  };
  useWallet: number; // DZD requested from wallet
  usePoints: number; // points requested (1pt = 1 DZD)
}): Promise<{ ok: true; paidWallet: number; paidPoints: number; walletBalance: number; pointsBalance: number } | { ok: false; error: string }> {
  const { uid, orderId, itemsJson, total, shipping, useWallet, usePoints } = params;

  const { db } = await import("@/lib/db");

  if (total <= 0) return { ok: false, error: "INVALID_TOTAL" };
  if (useWallet < 0 || usePoints < 0) return { ok: false, error: "INVALID_AMOUNT" };

  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { uid },
        select: { walletBalance: true, pointsBalance: true },
      });
      if (!user) throw new Error("USER_NOT_FOUND");

      // Clamp requested amounts to available balances and remaining total
      let payWallet = Math.min(useWallet, user.walletBalance, total);
      let remaining = Math.round((total - payWallet) * 100) / 100;
      let payPoints = Math.min(usePoints, user.pointsBalance, remaining);

      payWallet = Math.round(payWallet * 100) / 100;
      payPoints = Math.round(payPoints * 100) / 100;

      const newWallet = Math.round((user.walletBalance - payWallet) * 100) / 100;
      const newPoints = Math.round((user.pointsBalance - payPoints) * 100) / 100;

      // Create the order FIRST (so ledger rows can reference it)
      await tx.order.create({
        data: {
          id: orderId,
          uid,
          items: itemsJson,
          total,
          ...shipping,
          paidWithWallet: payWallet,
          paidWithPoints: payPoints,
          status: "pending",
        },
      });

      if (payWallet > 0) {
        await tx.user.update({ where: { uid }, data: { walletBalance: newWallet } });
        await tx.walletTransaction.create({
          data: {
            uid, type: "ORDER_PAYMENT", balanceType: "wallet", amount: payWallet,
            balanceAfter: newWallet, note: `Order ${orderId}`, performedBy: "user", refId: orderId,
          },
        });
      }
      if (payPoints > 0) {
        await tx.user.update({ where: { uid }, data: { pointsBalance: newPoints, totalSpent: { increment: payPoints } } });
        await tx.walletTransaction.create({
          data: {
            uid, type: "POINTS_SPENT", balanceType: "points", amount: payPoints,
            balanceAfter: newPoints, note: `Order ${orderId}`, performedBy: "user", refId: orderId,
          },
        });
      }

      return { ok: true as const, paidWallet: payWallet, paidPoints: payPoints, walletBalance: newWallet, pointsBalance: newPoints };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || "ORDER_FAILED" };
  }
}
