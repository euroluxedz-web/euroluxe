import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";

/**
 * TEMPORARY one-time cleanup endpoint — removes integration-test data
 * from the production database. This route is deleted right after use.
 */
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verifyAdmin(req as any);
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete test users (email pattern used by the integration tests) —
    // cascades to orders, transactions, recharges, reviews.
    const deleted = await db.user.deleteMany({
      where: { email: { contains: "@test-audit.local" } },
    });

    return NextResponse.json({
      success: true,
      deletedUsers: deleted.count,
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
