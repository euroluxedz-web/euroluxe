import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, sanitizeString, sanitizeObject } from "@/lib/security";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";

/** Verify Firebase ID token via REST API (fast, no Admin SDK needed) */
async function verifyIdToken(token: string): Promise<string | null> {
  if (!token) return null;

  try {
    // Try Admin SDK first (fast if service account is configured)
    try {
      const { getAdminAuth } = await import("@/lib/firebase-admin");
      const decoded = await getAdminAuth().verifyIdToken(token);
      return decoded.uid;
    } catch {}

    // Fallback: Firebase REST API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    const data = await response.json();
    if (data.users?.[0]?.localId) return data.users[0].localId;
  } catch {}

  return null;
}

/** Read a Firestore document via REST API (bypasses Client SDK issues) */
async function readViaREST(token: string, path: string): Promise<Record<string, any> | null> {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    const fields = data.fields || {};

    // Parse Firestore REST format
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      const v = value as any;
      if (v.stringValue !== undefined) result[key] = v.stringValue;
      else if (v.integerValue !== undefined) result[key] = Number(v.integerValue);
      else if (v.doubleValue !== undefined) result[key] = v.doubleValue;
      else if (v.booleanValue !== undefined) result[key] = v.booleanValue;
      else if (v.nullValue !== undefined) result[key] = null;
      else if (v.timestampValue) result[key] = v.timestampValue;
      else if (v.arrayValue) result[key] = (v.arrayValue.values || []).map((x: any) => x.stringValue || x.integerValue || x.doubleValue || x.booleanValue || null);
      else if (v.mapValue) {
        const mapResult: Record<string, any> = {};
        for (const [mk, mv] of Object.entries(v.mapValue.fields || {})) {
          const mvv = mv as any;
          if (mvv.stringValue !== undefined) mapResult[mk] = mvv.stringValue;
          else if (mvv.integerValue !== undefined) mapResult[mk] = Number(mvv.integerValue);
          else if (mvv.doubleValue !== undefined) mapResult[mk] = mvv.doubleValue;
          else if (mvv.booleanValue !== undefined) mapResult[mk] = mvv.booleanValue;
          else mapResult[mk] = null;
        }
        result[key] = mapResult;
      }
    }
    return result;
  } catch {
    return null;
  }
}

/** Write user data to Firestore via REST API (bypasses Client SDK issues) */
async function updateViaREST(
  token: string,
  uid: string,
  fields: Record<string, any>
): Promise<boolean> {
  try {
    const firestoreFields: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value === null || value === undefined) {
        firestoreFields[key] = { nullValue: null };
      } else if (typeof value === "number") {
        firestoreFields[key] = Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
      } else if (typeof value === "boolean") {
        firestoreFields[key] = { booleanValue: value };
      } else {
        firestoreFields[key] = { stringValue: String(value) };
      }
    }

    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=${Object.keys(fields).join("&updateMask.fieldPaths=")}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: firestoreFields }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return res.ok;
  } catch {
    return false;
  }
}

/** Create a Firestore document via REST API (for new users) */
async function createViaREST(
  token: string,
  uid: string,
  fields: Record<string, any>
): Promise<boolean> {
  try {
    const firestoreFields: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value === null || value === undefined) {
        firestoreFields[key] = { nullValue: null };
      } else if (typeof value === "number") {
        firestoreFields[key] = Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
      } else if (typeof value === "boolean") {
        firestoreFields[key] = { booleanValue: value };
      } else {
        firestoreFields[key] = { stringValue: String(value) };
      }
    }

    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      method: "PATCH", // PATCH creates if doesn't exist (with updateMask)
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: firestoreFields }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return res.ok;
  } catch {
    return false;
  }
}

// ── GET: Fetch user profile ──

export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 30, 60_000);
  if (rateLimitResponse) return rateLimitResponse;
  try {
    const token = req.headers.get("authorization")?.split("Bearer ")[1] || "";
    const uid = await verifyIdToken(token);

    if (!uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try REST API first (most reliable on server)
    const userData = await readViaREST(token, `users/${uid}`);

    if (userData) {
      // Also try to get wallet balance
      let walletBalance = 0;
      try {
        const walletData = await readViaREST(token, `wallets/${uid}`);
        if (walletData && walletData.balance !== undefined) {
          walletBalance = Number(walletData.balance) || 0;
        }
      } catch {}

      return NextResponse.json({
        ...userData,
        uid,
        walletBalance,
      });
    }

    // If REST API fails, try Client SDK as fallback
    try {
      const { getUserData, getWallet } = await import("@/lib/firebase");
      const [user, walletBalance] = await Promise.all([
        getUserData(uid),
        getWallet(uid),
      ]);

      if (user) {
        return NextResponse.json({
          ...user,
          walletBalance: walletBalance || 0,
        });
      }
    } catch {}

    // Return minimal profile from token
    return NextResponse.json({
      uid,
      email: null,
      name: null,
      phone: null,
      wilaya: null,
      commune: null,
      codePostal: null,
      address: null,
      walletBalance: 0,
    });
  } catch (error) {
    console.error("Profile GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH: Update user profile ──

export async function PATCH(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 20, 60_000);
  if (rateLimitResponse) return rateLimitResponse;
  try {
    const token = req.headers.get("authorization")?.split("Bearer ")[1] || "";
    const uid = await verifyIdToken(token);

    if (!uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, phone, wilaya, commune, codePostal, address } = body;

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (wilaya !== undefined) updateData.wilaya = wilaya;
    if (commune !== undefined) updateData.commune = commune;
    if (codePostal !== undefined) updateData.codePostal = codePostal;
    if (address !== undefined) updateData.address = address;
    updateData.updatedAt = new Date().toISOString();

    // Try REST API first (most reliable on server)
    let saved = await updateViaREST(token, uid, updateData);

    // If REST API fails, try creating the document (might not exist yet)
    if (!saved) {
      saved = await createViaREST(token, uid, updateData);
    }

    // If REST API fails, try Client SDK as fallback
    if (!saved) {
      try {
        const { updateUserData } = await import("@/lib/firebase");
        await updateUserData(uid, updateData);
        saved = true;
      } catch (err: any) {
        console.warn("[profile] Client SDK update failed:", err?.message);
      }
    }

    if (saved) {
      // Return the updated profile
      const userData = await readViaREST(token, `users/${uid}`);
      let walletBalance = 0;
      try {
        const walletData = await readViaREST(token, `wallets/${uid}`);
        if (walletData && walletData.balance !== undefined) {
          walletBalance = Number(walletData.balance) || 0;
        }
      } catch {}

      return NextResponse.json({
        ...(userData || {}),
        uid,
        ...updateData,
        walletBalance,
      });
    } else {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
  } catch (error) {
    console.error("Profile PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
