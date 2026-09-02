import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, sanitizeString, sanitizeEmail, sanitizePhone, isAllowedEmailDomain } from "@/lib/security";
import { registerUser } from "@/lib/firebase";

export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 5, 60_000);
  if (rateLimitResponse) return rateLimitResponse;
  try {
    const body = await req.json();
    const { email, password, name, phone, wilaya, address } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Anti fake-account policy: only established providers are accepted.
    // Login is NOT affected — this gate applies to account CREATION only.
    if (!isAllowedEmailDomain(String(email))) {
      return NextResponse.json(
        { error: "Only Gmail, Hotmail or Yahoo email addresses are accepted" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const result = await registerUser(email, password, {
      name,
      phone,
      wilaya,
      address,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("Registration error:", error);

    // Firebase auth errors
    if (error?.code === "auth/email-already-in-use") {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }
    if (error?.code === "auth/weak-password") {
      return NextResponse.json(
        { error: "Password is too weak" },
        { status: 400 }
      );
    }
    if (error?.code === "auth/invalid-email") {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
