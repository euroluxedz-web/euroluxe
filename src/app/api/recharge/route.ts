import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/security";
import { getSyncedUser } from "@/lib/auth-server";
import { db } from "@/lib/db";

export const maxDuration = 30;

/**
 * POST /api/recharge
 * User submits a wallet recharge request (amount + receipt image as data URL).
 * Creates a PENDING RechargeRequest in PostgreSQL — crediting happens ONLY
 * when an admin confirms it. There is no path for the user to credit their
 * own wallet.
 *
 * Body: { amount: number, receiptImage: string (data:image/...;base64,...) }
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
    const email = synced.dbUser.email;

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    const receiptImage = typeof body.receiptImage === "string" ? body.receiptImage : "";

    if (!Number.isFinite(amount) || amount < 1000 || amount > 100000) {
      return NextResponse.json(
        { error: "Amount must be between 1000 and 100000 DZD" },
        { status: 400 }
      );
    }

    // Receipt must be a base64 image (max ~3.5MB base64 ≈ 2.5MB image)
    if (!receiptImage.startsWith("data:image/") || !receiptImage.includes("base64,")) {
      return NextResponse.json({ error: "Invalid receipt image" }, { status: 400 });
    }
    if (receiptImage.length > 4_000_000) {
      return NextResponse.json({ error: "Receipt image too large (max ~2.5MB)" }, { status: 400 });
    }

    // Throttle: max 5 pending requests at once
    const pendingCount = await db.rechargeRequest.count({
      where: { uid, status: "pending" },
    });
    if (pendingCount >= 5) {
      return NextResponse.json(
        { error: "You already have 5 pending requests. Please wait for review." },
        { status: 429 }
      );
    }

    const recharge = await db.rechargeRequest.create({
      data: {
        uid,
        email,
        amount: Math.round(amount),
        receiptImage,
        status: "pending",
      },
    });

    return NextResponse.json(
      { success: true, id: recharge.id, status: "pending" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Recharge POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
