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
    const cartItems = await db.cartItem.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(cartItems);
  } catch (error) {
    console.error("Cart GET error:", error);
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
    const { productId, name, image, price, quantity, url } = body;

    if (!name || price === undefined) {
      return NextResponse.json(
        { error: "Name and price are required" },
        { status: 400 }
      );
    }

    // Check if item already in cart
    const existing = await db.cartItem.findFirst({
      where: { userId, name },
    });

    if (existing) {
      const updated = await db.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + (quantity || 1) },
      });
      return NextResponse.json(updated);
    }

    const cartItem = await db.cartItem.create({
      data: {
        userId,
        productId: productId || null,
        name,
        image: image || null,
        price,
        quantity: quantity || 1,
        url: url || null,
      },
    });

    return NextResponse.json(cartItem, { status: 201 });
  } catch (error) {
    console.error("Cart POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    await db.cartItem.deleteMany({ where: { userId } });

    return NextResponse.json({ message: "Cart cleared" });
  } catch (error) {
    console.error("Cart DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
