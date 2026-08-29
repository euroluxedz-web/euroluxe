import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, sanitizeString, sanitizePhone } from "@/lib/security";
import { getSyncedUser } from "@/lib/auth-server";
import { db } from "@/lib/db";

export const maxDuration = 30;

/**
 * GET /api/user/profile
 * Returns the user's profile + wallet & points balances (from PostgreSQL).
 * Also upserts the user into the DB — this is how the user list stays
 * in sync with Firebase Auth users.
 */
export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 60, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const synced = await getSyncedUser(req as any);
    if (!synced) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const u = synced.dbUser;

    return NextResponse.json({
      uid: u.uid,
      email: u.email,
      name: u.name,
      phone: u.phone,
      wilaya: u.wilaya,
      commune: u.commune,
      codePostal: u.codePostal,
      address: u.address,
      walletBalance: u.walletBalance,
      pointsBalance: u.pointsBalance,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt,
    });
  } catch (error) {
    console.error("Profile GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/user/profile
 * Update editable profile fields (never balances — those are server-only).
 */
export async function PATCH(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 30, 60_000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const synced = await getSyncedUser(req as any);
    if (!synced) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const updateData: Record<string, string | null> = {};

    const name = sanitizeString(body.name).slice(0, 120);
    if (body.name !== undefined) updateData.name = name || null;
    if (body.phone !== undefined) updateData.phone = sanitizePhone(body.phone) || null;
    if (body.wilaya !== undefined) updateData.wilaya = sanitizeString(body.wilaya).slice(0, 80) || null;
    if (body.commune !== undefined) updateData.commune = sanitizeString(body.commune).slice(0, 80) || null;
    if (body.codePostal !== undefined) updateData.codePostal = sanitizeString(body.codePostal).slice(0, 10) || null;
    if (body.address !== undefined) updateData.address = sanitizeString(body.address).slice(0, 300) || null;

    const updated = await db.user.update({
      where: { uid: synced.dbUser.uid },
      data: updateData,
    });

    return NextResponse.json({
      uid: updated.uid,
      email: updated.email,
      name: updated.name,
      phone: updated.phone,
      wilaya: updated.wilaya,
      commune: updated.commune,
      codePostal: updated.codePostal,
      address: updated.address,
      walletBalance: updated.walletBalance,
      pointsBalance: updated.pointsBalance,
    });
  } catch (error) {
    console.error("Profile PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
