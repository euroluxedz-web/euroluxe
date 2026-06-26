import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Protected routes that require authentication
const protectedRoutes = ["/profile", "/commandes"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Check if the current route is protected
  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (isProtected) {
    // Check for our Firebase auth cookie set by AuthProvider
    const authCookie = req.cookies.get("euroluxe_auth")?.value;

    if (!authCookie) {
      // Redirect to login page with return URL
      const loginUrl = new URL("/auth/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/profile/:path*", "/commandes/:path*"],
};
