"use client";

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { type Language, t as translate } from "@/lib/i18n";

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
  dir: "ltr" | "rtl";
  isArabic: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);

const STORAGE_KEY = "euroluxe-lang";

// --- External store for language ---

let languageListeners: (() => void)[] = [];
let languageValue: Language | null = null; // null = not yet initialized on client

function emitLanguageChange() {
  languageListeners.forEach((l) => l());
}

function subscribeLanguage(callback: () => void) {
  languageListeners.push(callback);
  return () => {
    languageListeners = languageListeners.filter((l) => l !== callback);
  };
}

function getLanguageSnapshot(): Language {
  if (languageValue !== null) return languageValue;
  if (typeof window === "undefined") return "fr";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "ar" || stored === "fr") {
      languageValue = stored;
      return stored;
    }
  } catch {
    // ignore
  }
  languageValue = "fr";
  return "fr";
}

function getLanguageServerSnapshot(): Language {
  return "fr";
}

// --- External store for mounted state ---

let mountedListeners: (() => void)[] = [];
let mountedValue = false;

function emitMountedChange() {
  mountedListeners.forEach((l) => l());
}

function subscribeMounted(callback: () => void) {
  mountedListeners.push(callback);
  return () => {
    mountedListeners = mountedListeners.filter((l) => l !== callback);
  };
}

function getMountedSnapshot(): boolean {
  return mountedValue;
}

function getMountedServerSnapshot(): boolean {
  return false;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(
    subscribeLanguage,
    getLanguageSnapshot,
    getLanguageServerSnapshot
  );

  const mounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getMountedServerSnapshot
  );

  // On mount, initialize from localStorage
  useEffect(() => {
    // Read stored language
    const stored = getLanguageSnapshot();
    languageValue = stored;
    emitLanguageChange();

    // Mark as mounted
    mountedValue = true;
    emitMountedChange();
  }, []);

  // Sync <html> dir and lang attributes when language changes
  useEffect(() => {
    if (!mounted) return;
    const html = document.documentElement;
    const dir = lang === "ar" ? "rtl" : "ltr";
    html.setAttribute("dir", dir);
    html.setAttribute("lang", lang);

    if (lang === "ar") {
      document.body.classList.add("font-arabic");
    } else {
      document.body.classList.remove("font-arabic");
    }
  }, [lang, mounted]);

  const setLang = useCallback((newLang: Language) => {
    languageValue = newLang;
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch {
      // ignore
    }
    emitLanguageChange();
  }, []);

  const t = useCallback(
    (key: string) => translate(lang, key),
    [lang]
  );

  const dir = lang === "ar" ? "rtl" : "ltr";
  const isArabic = lang === "ar";

  // Avoid flash of wrong direction: render children only after mounting
  if (!mounted) {
    return null;
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, dir, isArabic }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
