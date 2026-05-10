import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { quantity } = body;

    if (quantity !== undefined && quantity <= 0) {
      await db.cartItem.delete({ where: { id } });
      return NextResponse.json({ message: "Item removed" });
    }

    const updated = await db.cartItem.update({
      where: { id },
      data: { ...(quantity !== undefined && { quantity }) },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Cart item PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await db.cartItem.delete({ where: { id } });

    return NextResponse.json({ message: "Item removed" });
  } catch (error) {
    console.error("Cart item DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
