import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Protected routes that require authentication
const protectedRoutes = ["/profile", "/commandes", "/admin"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Add security headers to ALL responses
  const response = NextResponse.next();
  
  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Content Security Policy - prevent XSS, data injection
  // NOTE: cdn.jsdelivr.net / unpkg.com / tessdata.projectnaptha.com are required by
  // tesseract.js (the local in-browser OCR engine used as a fallback when OCR.space
  // is unavailable). worker-src 'self' blob: allows its blob-based Web Worker.
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://cdn.jsdelivr.net https://unpkg.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https: blob:; " +
    "font-src 'self' data:; " +
    "worker-src 'self' blob:; " +
    "connect-src 'self' https://api.ocr.space https://identitytoolkit.googleapis.com https://firestore.googleapis.com https://internal-api.z.ai https://api.z.ai https://cdn.jsdelivr.net https://unpkg.com https://tessdata.projectnaptha.com blob:; " +
    "frame-ancestors 'none';"
  );
  
  // Check if route is protected
  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (isProtected) {
    const authCookie = req.cookies.get("euroluxe_auth")?.value;

    if (!authCookie) {
      const loginUrl = new URL("/auth/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  // Apply security headers to ALL routes, auth check only on protected routes
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|background.mp4|grain.gif|robots.txt).*)",
  ],
};
