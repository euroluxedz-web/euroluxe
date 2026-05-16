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
  Home,
  MoreHorizontal,
  Wallet,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useCartStore } from "@/lib/cart-store";
import { useAuth } from "@/components/auth-provider";
import { logoutUser, getWallet } from "@/lib/firebase";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [bottomBarVisible, setBottomBarVisible] = useState(false);
  const pathname = usePathname();
  const { lang, setLang, t, isArabic } = useLanguage();
  const { user, profile, loading: authLoading } = useAuth();
  const { items, totalItems } = useCartStore();

  const isAuthenticated = !!user;
  const walletBalance = profile?.walletBalance || 0;

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

  // Animate bottom bar in on page load
  useEffect(() => {
    const timer = setTimeout(() => setBottomBarVisible(true), 300);
    return () => clearTimeout(timer);
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

  // Bottom nav items
  const bottomNavItems = [
    { icon: Home, label: t("nav.accueil"), href: "/" },
    { icon: ShoppingBag, label: t("nav.calculateur"), href: "/calculateur" },
    {
      icon: Wallet,
      label: isArabic ? "المحفظة" : "Portefeuille",
      href: "/recharge",
      badge: isAuthenticated && walletBalance > 0 ? walletBalance : undefined,
      isWallet: true,
    },
    {
      icon: ShoppingCart,
      label: t("nav.cart"),
      href: "/panier",
      badge: itemCount,
    },
    {
      icon: User,
      label: isAuthenticated ? t("nav.profile") : t("nav.login"),
      href: isAuthenticated ? "/profile" : "/auth/login",
    },
  ];

  const isBottomNavActive = (href: string) => {
    if (href === "#more") return isOpen;
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <>
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
              ? "bg-white/80 md:backdrop-blur-xl backdrop-blur-md border-b border-brand-muted-warm/30"
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

              {/* Calculator / Commander Button - Separate Pink Pill */}
              <Link href="/calculateur">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="ml-2 bg-brand-pink text-white hover:bg-brand-pink-light font-bold rounded-full px-5 py-2 shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display flex items-center text-sm gap-1.5"
                >
                  <ShoppingBag className="w-4 h-4" />
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
                    <motion.span
                      key={itemCount}
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                      className="absolute -top-1 -right-1 bg-brand-pink text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center"
                    >
                      {itemCount}
                    </motion.span>
                  )}
                </motion.button>
              </Link>

              {/* Wallet / Recharge Button - VISIBLE */}
              {isAuthenticated && (
                <Link href="/recharge">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="ml-2 relative bg-brand-pink/10 text-brand-dark hover:bg-brand-pink/20 font-bold rounded-full px-3 py-2 shadow-md transition-all font-display flex items-center gap-1.5 text-sm border border-brand-pink/30"
                  >
                    <Wallet className="w-4 h-4 text-brand-pink" />
                    <span className="text-xs font-bold">
                      {walletBalance.toLocaleString()} دج
                    </span>
                  </motion.button>
                </Link>
              )}

              {/* User Menu */}
              {isAuthenticated ? (
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
                        <Link
                          href="/recharge"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-display text-brand-dark hover:bg-brand-pink/5 transition-colors"
                        >
                          <Wallet className="w-4 h-4 text-brand-pink" />
                          {t("nav.recharge")}
                        </Link>
                        <hr className="my-1 border-brand-muted-warm/20" />
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            logoutUser();
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

            {/* Mobile: Simplified top bar - Logo + Language switcher only */}
            <div className="md:hidden flex items-center gap-2">
              <button
                onClick={toggleLang}
                className="text-brand-dark/70 hover:text-brand-pink hover:bg-brand-pink/10 rounded-full px-2.5 py-1.5 font-display transition-all text-xs font-bold"
                aria-label={lang === "fr" ? "التبديل إلى العربية" : "Switch to French"}
              >
                <Languages className="w-4 h-4" />
                <span className="ml-1 text-xs font-bold">
                  {lang === "fr" ? "🇫🇷" : "🇸🇦"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile "More" Menu (triggered by bottom nav) */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-white/95 backdrop-blur-md border-t border-brand-muted-warm/30 overflow-hidden relative z-10"
            >
              <div className="px-4 py-4 space-y-2">
                {navLinks.map((link, i) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
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

                {/* Mobile Auth Links */}
                <div className="border-t border-brand-muted-warm/20 pt-2 mt-2 space-y-2">
                  {isAuthenticated ? (
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
                      <Link
                        href="/recharge"
                        onClick={closeMenu}
                        className="block px-4 py-3 rounded-full transition-all font-display text-center text-brand-dark/70 hover:text-brand-pink hover:bg-brand-pink/5"
                      >
                        <Wallet className="w-4 h-4 inline mr-2" />
                        {t("nav.recharge")}
                      </Link>
                      <button
                        onClick={() => {
                          closeMenu();
                          logoutUser();
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

      {/* Mobile Bottom Navigation Bar */}
      <AnimatePresence>
        {bottomBarVisible && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="md:hidden fixed bottom-0 left-0 right-0 z-50"
          >
            {/* Subtle top border gradient */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-pink/30 to-transparent" />
            <div className="bg-white/95 backdrop-blur-md border-t border-brand-muted-warm/20 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
              <div className="flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-2">
                {bottomNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = isBottomNavActive(item.href);
                  const isWallet = (item as any).isWallet;

                  // Cart item with badge
                  const isCart = item.badge !== undefined && item.badge > 0 && !isWallet;

                  return (
                    <Link key={item.href} href={item.href}>
                      <motion.div
                        whileTap={{ scale: 0.9 }}
                        className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-colors relative ${
                          active
                            ? isWallet ? "text-brand-gold" : "text-brand-pink"
                            : isWallet && isAuthenticated ? "text-brand-gold/70 hover:text-brand-gold" : "text-brand-dark/40 hover:text-brand-dark/60"
                        }`}
                      >
                        <div className="relative">
                          <Icon className="w-5 h-5" />
                          {isCart && (
                            <motion.span
                              key={item.badge}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{
                                type: "spring",
                                stiffness: 500,
                                damping: 15,
                              }}
                              className="absolute -top-1.5 -right-2 bg-brand-pink text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm shadow-brand-pink/30"
                            >
                              {item.badge}
                            </motion.span>
                          )}
                        </div>
                        <span className="text-[10px] mt-0.5 font-display font-medium">
                          {isWallet && isAuthenticated && walletBalance > 0
                            ? `${walletBalance.toLocaleString()} دج`
                            : item.label
                          }
                        </span>
                        {active && (
                          <motion.div
                            layoutId="bottomNavIndicator"
                            className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-brand-pink rounded-full"
                            transition={{
                              type: "spring",
                              stiffness: 400,
                              damping: 25,
                            }}
                          />
                        )}
                      </motion.div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
