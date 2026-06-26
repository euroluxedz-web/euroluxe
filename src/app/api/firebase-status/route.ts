import { NextResponse } from "next/server";

/**
 * Debug endpoint to check Firebase configuration status.
 * This helps diagnose auth/registration issues.
 */
export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? "✓ Set" : "✗ Missing",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? "✓ Set" : "✗ Missing",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? "✓ Set" : "✗ Missing",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? "✓ Set" : "✗ Missing",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ? "✓ Set" : "✗ Missing",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? "✓ Set" : "✗ Missing",
    serviceAccountKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? "✓ Set" : "✗ Missing",
  };

  // Test Firebase Admin initialization
  let adminStatus = "not_tested";
  try {
    const { getAdminAuth } = await import("@/lib/firebase-admin");
    const adminAuth = getAdminAuth();
    await adminAuth.listUsers(1);
    adminStatus = "✓ Working";
  } catch (err: any) {
    adminStatus = `✗ Error: ${err?.code || err?.message || "Unknown"}`;
  }

  return NextResponse.json({
    firebaseConfig: config,
    adminSdk: adminStatus,
    timestamp: new Date().toISOString(),
  });
}
