"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  X,
  Calculator,
  Languages,
  ShoppingCart,
  User,
  LogOut,
  ClipboardList,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useCartStore } from "@/lib/cart-store";
import { useSession, signOut } from "next-auth/react";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const { lang, setLang, t, isArabic } = useLanguage();
  const { data: session, status } = useSession();
  const { items, totalItems } = useCartStore();

  const navLinks = [
    { label: t("nav.accueil"), href: "/" },
    { label: t("nav.commentCaMarche"), href: "/comment-ca-marche" },
    { label: t("nav.boutiques"), href: "/boutiques" },
    { label: t("nav.contact"), href: "/contact" },
  ];

  const isHome = pathname === "/";

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const closeMenu = () => setIsOpen(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const toggleLang = () => {
    setLang(lang === "fr" ? "ar" : "fr");
  };

  const showSolidBg = !isHome || scrolled;
  const itemCount = totalItems();

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        showSolidBg ? "shadow-lg shadow-brand-dark/5" : ""
      }`}
    >
      {/* Background - Glassmorphism on scroll */}
      <div
        className={`absolute inset-0 transition-all duration-500 ${
          showSolidBg
            ? "bg-white/80 backdrop-blur-xl border-b border-brand-muted-warm/30"
            : "bg-transparent"
        }`}
        style={{ zIndex: 1 }}
      />

      {/* Navbar content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-brand-pink/20 rounded-full blur-md group-hover:bg-brand-pink/40 transition-all" />
              <img
                src="/logo.png"
                alt="EUROLUXE"
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full relative z-10 ring-2 ring-brand-pink/30 logo-shadow object-cover"
              />
            </div>
            <span className="text-xl sm:text-2xl font-bold font-heading tracking-wider text-brand-dark">
              EUROLUXE
            </span>
          </Link>

          {/* Desktop Nav - Pill Buttons */}
          <div className="hidden md:flex items-center gap-2">
            {/* Navigation Pill Buttons */}
            <div className="flex items-center bg-brand-card/80 backdrop-blur-sm rounded-full p-1 gap-1 border border-brand-muted-warm/50">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-4 py-2 text-sm font-medium font-display rounded-full transition-all duration-300 ${
                    isActive(link.href)
                      ? "bg-brand-pink text-white shadow-md shadow-brand-pink/30"
                      : "text-brand-dark/70 hover:bg-brand-pink/10 hover:text-brand-pink"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Calculator Button - Separate Pink Pill */}
            <Link href="/calculateur">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="ml-2 bg-brand-pink text-white hover:bg-brand-pink-light font-bold rounded-full px-5 py-2 shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display flex items-center text-sm"
              >
                <Calculator className={`w-4 h-4 ${isArabic ? "ml-2" : "mr-2"}`} />
                {t("nav.calculateur")}
              </motion.button>
            </Link>

            {/* Cart Button */}
            <Link href="/panier">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="ml-2 relative bg-brand-gold/10 text-brand-dark hover:bg-brand-gold/20 font-bold rounded-full px-3 py-2 shadow-md transition-all font-display flex items-center text-sm border border-brand-gold/30"
              >
                <ShoppingCart className="w-4 h-4" />
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-brand-pink text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {itemCount}
                  </span>
                )}
              </motion.button>
            </Link>

            {/* User Menu */}
            {status === "authenticated" ? (
              <div className="relative ml-2">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="bg-brand-pink/10 hover:bg-brand-pink/20 text-brand-dark rounded-full px-3 py-2 font-display transition-all flex items-center text-sm border border-brand-pink/30"
                >
                  <User className="w-4 h-4" />
                </button>
                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-brand-muted-warm/30 py-2 min-w-[180px] overflow-hidden"
                    >
                      <Link
                        href="/profile"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm font-display text-brand-dark hover:bg-brand-pink/5 transition-colors"
                      >
                        <User className="w-4 h-4 text-brand-pink" />
                        {t("nav.profile")}
                      </Link>
                      <Link
                        href="/commandes"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm font-display text-brand-dark hover:bg-brand-pink/5 transition-colors"
                      >
                        <ClipboardList className="w-4 h-4 text-brand-pink" />
                        {t("nav.orders")}
                      </Link>
                      <hr className="my-1 border-brand-muted-warm/20" />
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          signOut({ callbackUrl: "/" });
                        }}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm font-display text-red-500 hover:bg-red-50 transition-colors w-full"
                      >
                        <LogOut className="w-4 h-4" />
                        {t("nav.logout")}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Link href="/auth/login">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="ml-2 text-brand-dark/70 hover:text-brand-pink hover:bg-brand-pink/10 rounded-full px-4 py-2 font-display transition-all text-sm font-bold border border-brand-muted-warm/50"
                >
                  <User className="w-4 h-4 inline mr-1" />
                  {t("nav.login")}
                </motion.button>
              </Link>
            )}

            {/* Language Switcher - Small Pill */}
            <button
              onClick={toggleLang}
              className="ml-2 text-brand-dark/70 hover:text-brand-pink hover:bg-brand-pink/10 rounded-full px-3 py-2 font-display transition-all text-xs font-bold border border-brand-muted-warm/50"
              aria-label={lang === "fr" ? "التبديل إلى العربية" : "Switch to French"}
            >
              <Languages className="w-3.5 h-3.5 inline mr-1" />
              {lang === "fr" ? "🇫🇷 FR" : "🇸🇦 عر"}
            </button>
          </div>

          {/* Mobile Menu Button + Language + Cart */}
          <div className="md:hidden flex items-center gap-2">
            <Link href="/panier" className="relative">
              <ShoppingCart className="w-5 h-5 text-brand-dark/70" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-brand-pink text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </Link>
            <button
              onClick={toggleLang}
              className="text-brand-dark/70 hover:text-brand-pink hover:bg-brand-pink/10 rounded-full px-2 py-1.5 font-display transition-all text-xs font-bold"
              aria-label={lang === "fr" ? "التبديل إلى العربية" : "Switch to French"}
            >
              <Languages className="w-4 h-4" />
              <span className="ml-1 text-xs font-bold">
                {lang === "fr" ? "🇫🇷" : "🇸🇦"}
              </span>
            </button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 text-brand-dark/70 hover:text-brand-pink transition-colors"
              aria-label={isOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white/95 backdrop-blur-xl border-t border-brand-muted-warm/30 overflow-hidden relative z-10"
          >
            <div className="px-4 py-4 space-y-2">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Link
                    href={link.href}
                    onClick={closeMenu}
                    className={`block px-4 py-3 rounded-full transition-all font-display text-center ${
                      isActive(link.href)
                        ? "text-white bg-brand-pink shadow-md shadow-brand-pink/30"
                        : "text-brand-dark/70 hover:text-brand-pink hover:bg-brand-pink/5"
                    }`}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <Link href="/calculateur" onClick={closeMenu}>
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="w-full mt-2 bg-brand-pink text-white hover:bg-brand-pink-light font-bold rounded-full py-3 shadow-lg shadow-brand-pink/30 font-display flex items-center justify-center text-sm"
                >
                  <Calculator className={`w-4 h-4 ${isArabic ? "ml-2" : "mr-2"}`} />
                  {t("nav.calculateur")}
                </motion.button>
              </Link>

              {/* Mobile Auth/Cart Links */}
              <div className="border-t border-brand-muted-warm/20 pt-2 mt-2 space-y-2">
                <Link
                  href="/panier"
                  onClick={closeMenu}
                  className="block px-4 py-3 rounded-full transition-all font-display text-center text-brand-dark/70 hover:text-brand-pink hover:bg-brand-pink/5"
                >
                  <ShoppingCart className="w-4 h-4 inline mr-2" />
                  {t("nav.cart")}
                  {itemCount > 0 && (
                    <span className="ml-2 bg-brand-pink text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                      {itemCount}
                    </span>
                  )}
                </Link>
                {status === "authenticated" ? (
                  <>
                    <Link
                      href="/profile"
                      onClick={closeMenu}
                      className="block px-4 py-3 rounded-full transition-all font-display text-center text-brand-dark/70 hover:text-brand-pink hover:bg-brand-pink/5"
                    >
                      <User className="w-4 h-4 inline mr-2" />
                      {t("nav.profile")}
                    </Link>
                    <Link
                      href="/commandes"
                      onClick={closeMenu}
                      className="block px-4 py-3 rounded-full transition-all font-display text-center text-brand-dark/70 hover:text-brand-pink hover:bg-brand-pink/5"
                    >
                      <ClipboardList className="w-4 h-4 inline mr-2" />
                      {t("nav.orders")}
                    </Link>
                    <button
                      onClick={() => {
                        closeMenu();
                        signOut({ callbackUrl: "/" });
                      }}
                      className="w-full px-4 py-3 rounded-full transition-all font-display text-center text-red-500 hover:bg-red-50"
                    >
                      <LogOut className="w-4 h-4 inline mr-2" />
                      {t("nav.logout")}
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/auth/login"
                      onClick={closeMenu}
                      className="block px-4 py-3 rounded-full transition-all font-display text-center text-brand-dark/70 hover:text-brand-pink hover:bg-brand-pink/5"
                    >
                      <User className="w-4 h-4 inline mr-2" />
                      {t("nav.login")}
                    </Link>
                    <Link
                      href="/auth/register"
                      onClick={closeMenu}
                      className="block w-full px-4 py-3 rounded-full bg-brand-pink text-white font-display text-center font-bold"
                    >
                      {t("nav.register")}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
