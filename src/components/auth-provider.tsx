"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

interface UserProfile {
  uid: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  wilaya: string | null;
  commune: string | null;
  codePostal: string | null;
  address: string | null;
  walletBalance: number;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshWallet: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshWallet: async () => {},
  refreshProfile: async () => {},
});

/**
 * Set or clear the auth cookie used by middleware.
 * This cookie simply signals "user is logged in" — it does NOT
 * replace server-side Bearer-token verification in API routes.
 */
function setAuthCookie(loggedIn: boolean) {
  if (typeof document === "undefined") return;
  if (loggedIn) {
    // Set cookie for 30 days (extended from 14)
    const expires = new Date(Date.now() + 30 * 86400000).toUTCString();
    document.cookie = `euroluxe_auth=1; path=/; expires=${expires}; SameSite=Lax; Secure`;
  } else {
    document.cookie = "euroluxe_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure";
  }
}

/** Race a promise against a timeout — returns null on timeout/error */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.then((v) => v).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  /** Load user profile data from the API (with timeout) */
  const loadProfile = useCallback(async (firebaseUser: FirebaseUser) => {
    try {
      const token = await withTimeout(firebaseUser.getIdToken(), 4000);
      if (!token) {
        // Token fetch timed out — show minimal profile from auth
        setProfile({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName,
          phone: null,
          wilaya: null,
          address: null,
          walletBalance: 0,
        });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch("/api/user/profile", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        setProfile({
          uid: firebaseUser.uid,
          email: data.email || firebaseUser.email,
          name: data.name || firebaseUser.displayName,
          phone: data.phone || null,
          wilaya: data.wilaya || null,
          commune: data.commune || null,
          codePostal: data.codePostal || null,
          address: data.address || null,
          walletBalance: data.walletBalance || 0,
        });
      } else {
        // API returned error — use auth data
        setProfile({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName,
          phone: null,
          wilaya: null,
          commune: null,
          codePostal: null,
          address: null,
          walletBalance: 0,
        });
      }
    } catch {
      // Network error or timeout — show minimal profile
      setProfile({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName,
        phone: null,
        wilaya: null,
        commune: null,
        codePostal: null,
        address: null,
        walletBalance: 0,
      });
    }
  }, []);

  const refreshWallet = useCallback(async () => {
    if (!user) return;
    try {
      const token = await withTimeout(user.getIdToken(), 4000);
      if (!token) return;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch("/api/user/profile", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        setProfile((prev) => prev ? { ...prev, walletBalance: data.walletBalance || 0 } : null);
      }
    } catch {
      // Silently fail
    }
  }, [user]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await loadProfile(user);
  }, [user, loadProfile]);

  useEffect(() => {
    // Safety: force loading to false after 15 seconds no matter what
    // (increased from 6s for slow connections in Algeria)
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 15000);

    // Check if user was previously logged in (localStorage backup)
    // This helps the UI show the correct state faster on refresh
    try {
      const wasLoggedIn = localStorage.getItem("euroluxe_logged_in") === "1";
      if (!wasLoggedIn) {
        // User was not logged in before, don't wait for Firebase
        // Still let Firebase check, but we can show logged-out UI immediately
      }
    } catch {}

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clear safety timer — we got the auth state
      clearTimeout(safetyTimer);

      setUser(firebaseUser);
      setAuthCookie(!!firebaseUser);

      // Update localStorage backup
      try {
        if (firebaseUser) {
          localStorage.setItem("euroluxe_logged_in", "1");
        } else {
          localStorage.removeItem("euroluxe_logged_in");
        }
      } catch {}

      if (firebaseUser) {
        // Load profile via API (with built-in timeout)
        await loadProfile(firebaseUser);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, [loadProfile]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshWallet, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
