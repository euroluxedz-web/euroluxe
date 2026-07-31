/**
 * Admin authentication utility.
 * Verifies admin access via Firebase ID token.
 * Admin email is stored as env var (never hardcoded).
 */

const ADMIN_KEY_ENV = process.env.ADMIN_KEY || process.env.ADMIN_PASSWORD;

/**
 * Verify admin access via Firebase ID token.
 * Checks both legacy admin key and Firebase token.
 */
export async function verifyAdmin(req: Request): Promise<boolean> {
  // Check for legacy admin key (from env, not hardcoded)
  if (ADMIN_KEY_ENV) {
    const adminKey = req.headers.get("x-admin-key");
    if (adminKey === ADMIN_KEY_ENV) return true;
  }
  
  // Check Firebase token
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  
  const token = authHeader.substring(7);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    
    if (!response.ok) return false;
    const data = await response.json();
    const email = data.users?.[0]?.email;
    if (!email) return false;
    
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return false;
    
    return email === adminEmail;
  } catch {
    return false;
  }
}
