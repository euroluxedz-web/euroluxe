/**
 * Security Utilities
 * - Input sanitization (XSS prevention)
 * - Rate limiting (in-memory)
 * - Input validation
 */

// ─── INPUT SANITIZATION ───

/**
 * Sanitize a string input to prevent XSS attacks.
 * Strips HTML tags, script content, and dangerous characters.
 */
export function sanitizeString(input: string | null | undefined): string {
  if (input == null) return "";
  let str = String(input);
  // Remove HTML tags
  str = str.replace(/<[^>]*>/g, "");
  // Remove script/event handler patterns
  str = str.replace(/javascript:/gi, "");
  str = str.replace(/on\w+\s*=/gi, "");
  // Remove null bytes and control characters
  str = str.replace(/[\x00-\x1F\x7F]/g, "");
  // Limit length to prevent DoS
  return str.trim().slice(0, 10000);
}

/**
 * Sanitize an email address.
 */
export function sanitizeEmail(input: string | null | undefined): string {
  if (input == null) return "";
  const str = String(input).trim().toLowerCase().slice(0, 254);
  // Basic email validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(str)) return "";
  return str;
}

/**
 * Sanitize a phone number (Algerian format: 0X XX XX XX XX).
 */
export function sanitizePhone(input: string | null | undefined): string {
  if (input == null) return "";
  // Remove everything except digits and +
  let str = String(input).replace(/[^\d+]/g, "").slice(0, 20);
  return str;
}

/**
 * Sanitize a number input.
 */
export function sanitizeNumber(input: any, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const num = typeof input === "number" ? input : parseFloat(String(input));
  if (isNaN(num)) return 0;
  return Math.max(min, Math.min(max, num));
}

/**
 * Sanitize an integer input.
 */
export function sanitizeInt(input: any, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const num = typeof input === "number" ? input : parseInt(String(input), 10);
  if (isNaN(num)) return 0;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

/**
 * Sanitize a URL input (only allow http/https).
 */
export function sanitizeUrl(input: string | null | undefined): string {
  if (input == null) return "";
  let str = String(input).trim().slice(0, 2048);
  try {
    const url = new URL(str);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

/**
 * Sanitize an object recursively.
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const sanitizedKey = sanitizeString(key).slice(0, 100);
    if (!sanitizedKey) continue;
    if (typeof value === "string") {
      result[sanitizedKey] = sanitizeString(value);
    } else if (typeof value === "number") {
      result[sanitizedKey] = sanitizeNumber(value);
    } else if (typeof value === "boolean") {
      result[sanitizedKey] = value;
    } else if (Array.isArray(value)) {
      result[sanitizedKey] = value.slice(0, 100).map((v) =>
        typeof v === "string" ? sanitizeString(v) : typeof v === "object" && v ? sanitizeObject(v) : v
      );
    } else if (value && typeof value === "object") {
      result[sanitizedKey] = sanitizeObject(value);
    } else {
      result[sanitizedKey] = value;
    }
  }
  return result as T;
}

// ─── RATE LIMITING ───

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check rate limit for a given key (IP address or user ID).
 * Returns true if request is allowed, false if rate limited.
 * 
 * @param key - Identifier (IP, user ID, etc.)
 * @param maxRequests - Max requests per window
 * @param windowMs - Time window in milliseconds
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = 60,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    // First request or window expired
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);
  
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetTime };
  }

  return { allowed: true, remaining, resetAt: entry.resetTime };
}

/**
 * Get client IP from request headers.
 */
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIP = req.headers.get("x-real-ip");
  if (realIP) return realIP;
  return "unknown";
}

/**
 * Apply rate limiting to an API request.
 * Returns null if allowed, or a Response object if rate limited.
 */
export function applyRateLimit(
  req: Request,
  maxRequests: number = 60,
  windowMs: number = 60_000
): Response | null {
  const ip = getClientIP(req);
  // Include the endpoint path in the key so each route has its own budget.
  // (Previously all endpoints shared one per-IP counter, causing random 429s
  // for normal users browsing the site.)
  let path = "unknown";
  try {
    path = new URL(req.url).pathname;
  } catch {}
  const key = `${ip}:${path}`;
  const result = checkRateLimit(key, maxRequests, windowMs);
  
  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded", retryAfter }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(maxRequests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(result.resetAt),
        },
      }
    );
  }
  
  return null;
}

// ─── INPUT VALIDATION ───

/**
 * Validate order items array.
 */
export function validateOrderItems(items: any): boolean {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) return false;
  for (const item of items) {
    if (typeof item !== "object" || item === null) return false;
    if (typeof item.name !== "string" || item.name.length > 500) return false;
    if (typeof item.price !== "number" || item.price < 0 || item.price > 1000000) return false;
    if (typeof item.quantity !== "number" || item.quantity < 1 || item.quantity > 100) return false;
    if (item.url && typeof item.url !== "string") return false;
    if (item.image && typeof item.image !== "string") return false;
    // Check image is a data URL or http URL (not a script injection)
    if (item.image && !item.image.startsWith("data:image/") && !item.image.startsWith("http")) return false;
  }
  return true;
}

/**
 * Validate shipping data.
 */
export function validateShippingData(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.fullName || typeof data.fullName !== "string" || data.fullName.trim().length < 2 || data.fullName.length > 100) {
    errors.push("Invalid name");
  }
  if (!data.phone || !/^0[567]\d{8}$/.test(String(data.phone).replace(/\s/g, ""))) {
    errors.push("Invalid phone");
  }
  if (!data.wilaya || typeof data.wilaya !== "string" || data.wilaya.length > 100) {
    errors.push("Invalid wilaya");
  }
  if (!data.commune || typeof data.commune !== "string" || data.commune.length > 100) {
    errors.push("Invalid commune");
  }
  if (!data.address || typeof data.address !== "string" || data.address.trim().length < 3 || data.address.length > 500) {
    errors.push("Invalid address");
  }
  if (data.total && (typeof data.total !== "number" || data.total < 0 || data.total > 10000000)) {
    errors.push("Invalid total");
  }
  
  return { valid: errors.length === 0, errors };
}
