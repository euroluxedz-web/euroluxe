import { NextRequest, NextResponse } from "next/server";
import { getAllWallets, adminCreditUser, findUserByEmail, updateWalletBalance } from "@/lib/firebase";

const ADMIN_KEY = "EuR0lux3@dm!n2024#Sec";

export async function GET(req: NextRequest) {
  try {
    const walletsRaw = await getAllWallets();

    // Enrich with email from users collection
    const wallets = await Promise.all(
      walletsRaw.map(async (w: any) => {
        try {
          const { getUserData } = await import("@/lib/firebase");
          const userData = await getUserData(w.uid);
          return { ...w, email: userData?.email || null };
        } catch {
          return w;
        }
      })
    );

    return NextResponse.json({ wallets });
  } catch (err: any) {
    console.error("Get wallets error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, amount, adminKey } = body;

    if (adminKey !== ADMIN_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!email || !amount || amount <= 0) {
      return NextResponse.json({ error: "Missing email or amount" }, { status: 400 });
    }

    // Find user by email
    const user = await findUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const uid = user.uid || (user as any).id;
    const newBalance = await updateWalletBalance(uid, amount);

    return NextResponse.json({ success: true, newBalance, uid });
  } catch (err: any) {
    console.error("Admin credit error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
