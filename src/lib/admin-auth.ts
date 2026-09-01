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

/** Why an admin request was rejected (used to pick 401 vs 403). */
export type AdminRejectReason = "no-credentials" | "invalid-token" | "not-admin";

export interface AdminCheck {
  ok: boolean;
  /** null when ok ("admin-key" flows) — otherwise one of AdminRejectReason */
  reason: AdminRejectReason | null;
  /** admin identity for audit logs ("admin-key" for key auth) */
  email: string | null;
}

/**
 * Full admin verification with rejection REASON.
 *
 * The reason decides the HTTP status the route should return:
 *  - "no-credentials" / "invalid-token" → 401: the CLIENT TOKEN is the
 *    problem (missing, stale, unverifiable) — the client should refresh its
 *    Firebase token and retry. Never a final verdict on the account.
 *  - "not-admin" → 403: the token WAS validly verified by Firebase, but the
 *    signed-in email simply is not the admin. Refreshing the token cannot
 *    change this — it is a FINAL rejection the client must present as
 *    "غير مصرح لك" (with the account email + sign-out button), not as a
 *    transient error.
 *
 * This distinction is what makes the admin panel gate deterministic:
 * network/token problems can masquerade as 401, but ONLY a Firebase-verified
 * non-admin email can ever produce a 403.
 */
export async function verifyAdminDetailed(req: Request): Promise<AdminCheck> {
  // 1) Legacy admin key header (kept for server-to-server use)
  if (ADMIN_KEY_ENV) {
    const adminKey = req.headers.get("x-admin-key");
    if (adminKey && adminKey === ADMIN_KEY_ENV) {
      return { ok: true, reason: null, email: "admin-key" };
    }
  }

  // 2) Firebase ID token of an admin user
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, reason: "no-credentials", email: null };
  }

  const token = authHeader.substring(7);
  const { verifyIdToken, isAdminEmail } = await import("@/lib/auth-server");
  const verified = await verifyIdToken(token);
  if (!verified?.email) {
    return { ok: false, reason: "invalid-token", email: null };
  }

  if (!isAdminEmail(verified.email)) {
    return { ok: false, reason: "not-admin", email: verified.email };
  }
  return { ok: true, reason: null, email: verified.email };
}

/**
 * Standard error response for a failed admin check.
 * 401 = token problem (retryable client-side after token refresh)
 * 403 = verified non-admin account (final)
 * Returns null when the check passed (ok=true).
 */
export function adminErrorResponse(check: AdminCheck): Response | null {
  if (check.ok) return null;
  if (check.reason === "not-admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden", reason: "not-admin" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  return new Response(
    JSON.stringify({ error: "Unauthorized", reason: check.reason }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
}

/** Verify admin access from a Request. */
export async function verifyAdmin(req: Request): Promise<boolean> {
  return (await verifyAdminDetailed(req)).ok;
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
