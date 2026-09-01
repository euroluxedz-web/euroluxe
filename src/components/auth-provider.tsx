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
  pointsBalance: number;
  isAdmin: boolean;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  /**
   * BALANCE INTEGRITY FLAG (fix for the "balance shows 0 then comes back" bug).
   * true = the wallet/points shown in `profile` could NOT be confirmed with
   * the server right now (network timeout / transient error). The values are
   * then the LAST KNOWN GOOD ones from the local cache — never a fabricated 0.
   * The provider keeps retrying in the background and clears the flag as soon
   * as the server answers. The UI should show "…" (not 0) while this is true
   * and no cached value exists.
   */
  balancesStale: boolean;
  refreshWallet: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  balancesStale: false,
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ─────────────────────────────────────────────────────────────────────────
 * LAST-KNOWN-GOOD BALANCE CACHE (localStorage, per-uid)
 * When the server is momentarily unreachable we show the last value the
 * server actually confirmed — NEVER a fabricated 0. This is what makes the
 * "my balance disappeared" class of bug impossible.
 * ───────────────────────────────────────────────────────────────────────── */
const BAL_CACHE_KEY = "euroluxe_balance_cache_v1";

function readBalCache(uid: string): { walletBalance: number; pointsBalance: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BAL_CACHE_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    const hit = all?.[uid];
    if (hit && typeof hit.walletBalance === "number" && typeof hit.pointsBalance === "number") {
      return { walletBalance: hit.walletBalance, pointsBalance: hit.pointsBalance };
    }
  } catch {}
  return null;
}

function writeBalCache(uid: string, walletBalance: number, pointsBalance: number) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(BAL_CACHE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[uid] = { walletBalance, pointsBalance, ts: Date.now() };
    window.localStorage.setItem(BAL_CACHE_KEY, JSON.stringify(all));
  } catch {}
}

/** Result of one profile fetch attempt. status 0 = network error / timeout. */
type ProfileFetch =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number };

async function fetchProfileOnce(token: string, timeoutMs: number): Promise<ProfileFetch> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/user/profile", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (res.ok) return { ok: true, data: await res.json() };
    return { ok: false, status: res.status };
  } catch {
    clearTimeout(timeout);
    return { ok: false, status: 0 };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [balancesStale, setBalancesStale] = useState(false);

  /** Build the fallback profile shown while the server is unreachable. */
  const applyFallbackProfile = useCallback((firebaseUser: FirebaseUser) => {
    const cached = readBalCache(firebaseUser.uid);
    setProfile((prev) => {
      // Preserve an already-loaded profile (name/phone/…) — only refresh the
      // balances from the last-known-good cache so nothing visually "resets".
      if (prev && prev.uid === firebaseUser.uid) {
        return {
          ...prev,
          walletBalance: cached?.walletBalance ?? prev.walletBalance,
          pointsBalance: cached?.pointsBalance ?? prev.pointsBalance,
        };
      }
      return {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName,
        phone: null,
        wilaya: null,
        commune: null,
        codePostal: null,
        address: null,
        // Last value the server actually confirmed — null-safe when no cache yet
        walletBalance: cached?.walletBalance ?? 0,
        pointsBalance: cached?.pointsBalance ?? 0,
        isAdmin: false,
      };
    });
    setBalancesStale(true);
  }, []);

  /** Apply a successful server response (fresh, authoritative). */
  const applyServerProfile = useCallback((firebaseUser: FirebaseUser, data: Record<string, unknown>) => {
    const walletBalance = Number(data.walletBalance) || 0;
    const pointsBalance = Number(data.pointsBalance) || 0;
    writeBalCache(firebaseUser.uid, walletBalance, pointsBalance);
    setProfile({
      uid: firebaseUser.uid,
      email: (data.email as string) || firebaseUser.email,
      name: (data.name as string) || firebaseUser.displayName,
      phone: (data.phone as string) || null,
      wilaya: (data.wilaya as string) || null,
      commune: (data.commune as string) || null,
      codePostal: (data.codePostal as string) || null,
      address: (data.address as string) || null,
      walletBalance,
      pointsBalance,
      isAdmin: !!data.isAdmin,
    });
    setBalancesStale(false);
  }, []);

  /**
   * Load the profile from the server with RETRIES.
   * Retries cover: slow Algerian connections (long timeout), transient 5xx,
   * and a stale cached Firebase token (forced refresh once on 401).
   * Returns true when the server answered (balances confirmed).
   */
  const loadProfile = useCallback(async (firebaseUser: FirebaseUser): Promise<boolean> => {
    try {
      // Firebase caches the ID token locally — normally instant. When the
      // cached token is expired the SDK refreshes it against Google, which
      // can legitimately take 10s+ on slow networks — hence the generous budget.
      let token = await withTimeout(firebaseUser.getIdToken(), 25000);
      if (!token) return false;

      const MAX_ATTEMPTS = 3;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const r = await fetchProfileOnce(token, 12000);

        if (r.ok) {
          applyServerProfile(firebaseUser, r.data);
          return true;
        }

        // Token genuinely rejected → force-refresh the token once and retry
        if (r.status === 401 && attempt === 0) {
          const fresh = await withTimeout(firebaseUser.getIdToken(true), 25000);
          if (fresh) {
            token = fresh;
            continue;
          }
          break; // cannot mint a token — fall back
        }

        // 400/403 = definitive rejection (tampered token) — stop retrying
        if (r.status === 400 || r.status === 403) break;

        // 0 (timeout/network) or 5xx/429 → retry with backoff
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(attempt === 0 ? 800 : 2500);
        }
      }
      return false;
    } catch {
      return false;
    }
  }, [applyServerProfile]);

  const refreshWallet = useCallback(async () => {
    if (!user) return;
    try {
      const token = await withTimeout(user.getIdToken(), 25000);
      if (!token) return;
      const r = await fetchProfileOnce(token, 12000);
      if (r.ok) {
        const walletBalance = Number(r.data.walletBalance) || 0;
        const pointsBalance = Number(r.data.pointsBalance) || 0;
        writeBalCache(user.uid, walletBalance, pointsBalance);
        // Update balances only — keep the rest of the profile intact so a
        // heal pass never wipes the user's form data mid-edit.
        setProfile((prev) =>
          prev
            ? { ...prev, walletBalance, pointsBalance }
            : {
                uid: user.uid,
                email: user.email,
                name: user.displayName,
                phone: null, wilaya: null, commune: null, codePostal: null, address: null,
                walletBalance, pointsBalance,
                isAdmin: false,
              }
        );
        setBalancesStale(false);
      }
    } catch {
      // Silently fail — the stale flag keeps the retry loop alive
    }
  }, [user]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const okFromServer = await loadProfile(user);
    if (!okFromServer) applyFallbackProfile(user);
  }, [user, loadProfile, applyFallbackProfile]);

  useEffect(() => {
    // Safety: force loading to false after 15 seconds no matter what
    // (increased from 6s for slow connections in Algeria)
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 15000);

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
        const okFromServer = await loadProfile(firebaseUser);
        if (!okFromServer) applyFallbackProfile(firebaseUser);
      } else {
        setProfile(null);
        setBalancesStale(false);
      }

      setLoading(false);
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, [loadProfile, applyFallbackProfile]);

  /* ─────────────────────────────────────────────────────────────────────
   * SELF-HEALING: while balances are stale, keep retrying in the
   * background (every 45s) and immediately when the user refocuses the
   * tab or the network comes back online. This is what makes a temporary
   * network glitch invisible to the user instead of a persistent "0".
   * ───────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!user || !balancesStale) return;

    const heal = () => { refreshWallet(); };
    const interval = setInterval(heal, 45000);
    const onFocus = () => heal();
    const onVisibility = () => {
      if (document.visibilityState === "visible") heal();
    };
    const onOnline = () => heal();

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [user, balancesStale, refreshWallet]);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, balancesStale, refreshWallet, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
