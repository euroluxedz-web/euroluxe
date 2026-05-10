import { NextRequest, NextResponse } from "next/server";
import { getUserData, updateUserData } from "@/lib/firebase";

async function getAuthenticatedUid(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.split("Bearer ")[1];
    const { getAdminAuth } = await import("@/lib/firebase-admin");
    const decodedToken = await getAdminAuth().verifyIdToken(token);
    return decodedToken.uid;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const uid = await getAuthenticatedUid(req);
    if (!uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserData(uid);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Profile GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const uid = await getAuthenticatedUid(req);
    if (!uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, phone, wilaya, address } = body;

    await updateUserData(uid, { name, phone, wilaya, address });
    const updatedUser = await getUserData(uid);

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Profile PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
