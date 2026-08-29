/**
 * Admin authentication utility — SERVER SIDE ONLY.
 *
 * Two accepted methods (both verified against environment secrets that are
 * never shipped to the browser):
 *   1. `x-admin-key` header  — must equal ADMIN_KEY (env, secret)
 *   2. `Authorization: Bearer <firebase-id-token>` — token is verified and
 *      the email must match ADMIN_EMAIL / ADMIN_EMAIL_EXTRA.
 *
 * No admin secret is ever present in client code, so nothing can leak
 * through F12 / the JS bundle.
 */

const ADMIN_KEY_ENV = process.env.ADMIN_KEY || process.env.ADMIN_PASSWORD;

/** Verify admin access from a Request. */
export async function verifyAdmin(req: Request): Promise<boolean> {
  // 1) Legacy admin key header (kept for server-to-server use)
  if (ADMIN_KEY_ENV) {
    const adminKey = req.headers.get("x-admin-key");
    if (adminKey && adminKey === ADMIN_KEY_ENV) return true;
  }

  // 2) Firebase ID token of an admin user
  const { verifyIdToken, isAdminEmail } = await import("@/lib/auth-server");
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.substring(7);
  const verified = await verifyIdToken(token);
  if (!verified?.email) return false;

  return isAdminEmail(verified.email);
}

/** Verify admin AND return the admin's email (for audit logging). */
export async function verifyAdminWithIdentity(req: Request): Promise<{ ok: boolean; email: string | null }> {
  if (ADMIN_KEY_ENV) {
    const adminKey = req.headers.get("x-admin-key");
    if (adminKey && adminKey === ADMIN_KEY_ENV) return { ok: true, email: "admin-key" };
  }
  const { verifyIdToken, isAdminEmail } = await import("@/lib/auth-server");
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, email: null };

  const token = authHeader.substring(7);
  const verified = await verifyIdToken(token);
  if (!verified?.email || !isAdminEmail(verified.email)) return { ok: false, email: null };
  return { ok: true, email: verified.email };
}
