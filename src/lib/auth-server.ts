/**
 * Server-side authentication utilities.
 *
 * SECURITY MODEL
 * ==============
 * 1. The browser sends a Firebase ID token in the Authorization header.
 * 2. This module verifies the token server-side (Admin SDK if configured,
 *    otherwise Firebase REST lookup).
 * 3. On success, the user is synced (upserted) into PostgreSQL.
 * 4. Wallet/points balances can ONLY be modified here, inside DB
 *    transactions triggered by legitimate flows. The client never talks
 *    to the database directly.
 */

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";

export interface VerifiedUser {
  uid: string;
  email: string | null;
  name?: string | null;
  emailVerified?: boolean;
}

/** Verify a Firebase ID token → returns the user claims or null. */
export async function verifyIdToken(token: string): Promise<VerifiedUser | null> {
  if (!token) return null;

  // Method 1: Firebase Admin SDK (preferred when a service account is set)
  try {
    const { getAdminAuth } = await import("@/lib/firebase-admin");
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
      emailVerified: decoded.email_verified ?? true,
    };
  } catch {}

  // Method 2: Firebase REST lookup (works without a service account)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
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
    if (!response.ok) return null;
    const data = await response.json();
    const u = data.users?.[0];
    if (!u?.localId) return null;
    return {
      uid: u.localId,
      email: u.email ?? null,
      name: u.displayName ?? null,
      emailVerified: !!u.emailVerified,
    };
  } catch {
    return null;
  }
}

/** Extract the Bearer token from a Request. */
export function getBearerToken(req: Request): string {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.substring(7).trim();
  // Also accept x-firebase-token (legacy clients)
  return req.headers.get("x-firebase-token")?.trim() || "";
}

/** Check whether an email belongs to an admin (env-configured). */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = [
    process.env.ADMIN_EMAIL,
    process.env.ADMIN_EMAIL_EXTRA, // used for live testing / secondary admins
  ]
    .filter(Boolean)
    .map((e) => String(e).trim().toLowerCase());
  return admins.includes(email.trim().toLowerCase());
}

/**
 * Verify the request token AND sync the user into PostgreSQL.
 * Every authenticated API call funnels through here, so the admin panel
 * sees every user who has ever used the site while logged in.
 */
export async function getSyncedUser(req: Request) {
  const token = getBearerToken(req);
  const verified = await verifyIdToken(token);
  if (!verified) return null;

  const { db } = await import("@/lib/db");
  const admin = isAdminEmail(verified.email);

  const user = await db.user.upsert({
    where: { uid: verified.uid },
    create: {
      uid: verified.uid,
      email: verified.email || `${verified.uid}@no-email.local`,
      isAdmin: admin,
      lastSeenAt: new Date(),
    },
    update: {
      lastSeenAt: new Date(),
      isAdmin: admin,
      // keep email fresh if the user changed it in Firebase
      ...(verified.email ? { email: verified.email } : {}),
    },
  });
  return { firebase: verified, dbUser: user };
}
