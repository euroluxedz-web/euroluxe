"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth, getUserData } from "@/lib/firebase";

interface UserProfile {
  uid: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  wilaya: string | null;
  address: string | null;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      // Sync auth cookie for middleware
      setAuthCookie(!!firebaseUser);

      if (firebaseUser) {
        try {
          const userData = await getUserData(firebaseUser.uid);
          if (userData) {
            setProfile({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              name: userData.name as string | null,
              phone: userData.phone as string | null,
              wilaya: userData.wilaya as string | null,
              address: userData.address as string | null,
            });
          } else {
            setProfile({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              name: firebaseUser.displayName,
              phone: null,
              wilaya: null,
              address: null,
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
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
