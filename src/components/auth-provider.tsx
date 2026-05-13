"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth, getUserData, getWallet } from "@/lib/firebase";

interface UserProfile {
  uid: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  wilaya: string | null;
  address: string | null;
  walletBalance: number;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshWallet: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshWallet: async () => {},
});

/**
 * Set or clear the auth cookie used by middleware.
 * This cookie simply signals "user is logged in" — it does NOT
 * replace server-side Bearer-token verification in API routes.
 */
function setAuthCookie(loggedIn: boolean) {
  if (typeof document === "undefined") return;
  if (loggedIn) {
    // Cookie expires in 14 days
    const expires = new Date(Date.now() + 14 * 86400000).toUTCString();
    document.cookie = `euroluxe_auth=1; path=/; expires=${expires}; SameSite=Lax`;
  } else {
    document.cookie = "euroluxe_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshWallet = async () => {
    if (!user) return;
    try {
      const balance = await getWallet(user.uid);
      setProfile((prev) => prev ? { ...prev, walletBalance: balance } : null);
    } catch (err) {
      console.error("Failed to refresh wallet:", err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      // Sync auth cookie for middleware
      setAuthCookie(!!firebaseUser);

      if (firebaseUser) {
        try {
          const [userData, walletBalance] = await Promise.all([
            getUserData(firebaseUser.uid),
            getWallet(firebaseUser.uid),
          ]);
          const balance = walletBalance || 0;
          if (userData) {
            setProfile({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              name: userData.name as string | null,
              phone: userData.phone as string | null,
              wilaya: userData.wilaya as string | null,
              address: userData.address as string | null,
              walletBalance: balance,
            });
          } else {
            setProfile({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              name: firebaseUser.displayName,
              phone: null,
              wilaya: null,
              address: null,
              walletBalance: balance,
            });
          }
        } catch (err) {
          console.error("Failed to load user profile:", err);
          setProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName,
            phone: null,
            wilaya: null,
            address: null,
            walletBalance: 0,
          });
        }
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshWallet }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
