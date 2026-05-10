import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const orders = await db.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(orders);
  } catch (error) {
    console.error("Orders GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await req.json();
    const { items, total, wilaya, address, phone, notes } = body;

    if (!items || !total) {
      return NextResponse.json(
        { error: "Items and total are required" },
        { status: 400 }
      );
    }

    // Get user details if not provided
    const user = await db.user.findUnique({ where: { id: userId } });

    const order = await db.order.create({
      data: {
        userId,
        items: JSON.stringify(items),
        total,
        wilaya: wilaya || user?.wilaya || null,
        address: address || user?.address || null,
        phone: phone || user?.phone || null,
        notes: notes || null,
      },
    });

    // Clear the user's cart after order
    await db.cartItem.deleteMany({ where: { userId } });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("Orders POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
