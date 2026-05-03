"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Calculator, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const { lang, setLang, t, isArabic } = useLanguage();

  const navLinks = [
    { label: t("nav.accueil"), href: "/" },
    { label: t("nav.calculateur"), href: "/calculateur" },
    { label: t("nav.boutiques"), href: "/boutiques" },
    { label: t("nav.commentCaMarche"), href: "/comment-ca-marche" },
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

  // On home: transparent bg, only dark on scroll
  // On other pages: always solid dark bg
  const showSolidBg = !isHome || scrolled;

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        showSolidBg ? "shadow-lg shadow-brand-dark/20" : ""
      }`}
    >
      {/* Background */}
      <div
        className={`absolute inset-0 transition-all duration-500 ${
          showSolidBg ? "bg-brand-dark" : "bg-transparent"
        }`}
        style={{ zIndex: 1 }}
      />

      {/* Navbar content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-brand-gold/20 rounded-full blur-md group-hover:bg-brand-gold/40 transition-all" />
              <img
                src="/logo.png"
                alt="EUROLUXE"
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full relative z-10 ring-2 ring-brand-gold/30 logo-shadow object-cover"
              />
            </div>
            <span className="text-xl sm:text-2xl font-bold font-heading tracking-wider text-brand-light">
              EUROLUXE
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-4 py-2 text-sm font-medium font-display transition-colors group ${
                  isActive(link.href)
                    ? "text-brand-gold nav-link-active"
                    : "text-brand-light/80 hover:text-brand-gold"
                }`}
              >
                {link.label}
                <span
                  className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 bg-brand-gold transition-all duration-300 ${
                    isActive(link.href)
                      ? "w-3/4 shadow-[0_0_8px_rgba(184,148,95,0.4)]"
                      : "w-0 group-hover:w-3/4"
                  }`}
                />
              </Link>
            ))}
            <Link href="/calculateur">
              <Button className="ml-2 bg-brand-gold text-brand-dark hover:bg-brand-gold-light font-bold rounded-full px-6 shadow-lg shadow-brand-gold/30 hover:shadow-brand-gold/50 transition-all font-display">
                <Calculator className={`w-4 h-4 ${isArabic ? "ml-2" : "mr-2"}`} />
                {t("nav.calculateur")}
              </Button>
            </Link>
            {/* Language Switcher */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLang}
              className="ml-2 text-brand-light/80 hover:text-brand-gold hover:bg-brand-light/10 rounded-full px-3 font-display transition-all"
              aria-label={lang === "fr" ? "التبديل إلى العربية" : "Switch to French"}
            >
              <Languages className="w-4 h-4" />
              <span className="ml-1 text-xs font-bold">
                {lang === "fr" ? "🇫🇷 FR" : "🇸🇦 عر"}
              </span>
            </Button>
          </div>

          {/* Mobile Menu Button + Language */}
          <div className="md:hidden flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLang}
              className="text-brand-light/80 hover:text-brand-gold hover:bg-brand-light/10 rounded-full px-2 font-display transition-all"
              aria-label={lang === "fr" ? "التبديل إلى العربية" : "Switch to French"}
            >
              <Languages className="w-4 h-4" />
              <span className="ml-1 text-xs font-bold">
                {lang === "fr" ? "🇫🇷" : "🇸🇦"}
              </span>
            </Button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 text-brand-light/80 hover:text-brand-gold transition-colors"
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
            className="md:hidden bg-brand-dark/95 border-t border-brand-gold/10 overflow-hidden relative z-10"
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
                    className={`block px-4 py-3 rounded-lg transition-all font-display ${
                      isActive(link.href)
                        ? "text-brand-gold bg-brand-gold/10"
                        : "text-brand-light/70 hover:text-brand-gold hover:bg-brand-gold/5"
                    }`}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <Link href="/calculateur" onClick={closeMenu}>
                <Button className="w-full mt-2 bg-brand-gold text-brand-dark hover:bg-brand-gold-light font-bold rounded-full shadow-lg shadow-brand-gold/30 font-display">
                  <Calculator className={`w-4 h-4 ${isArabic ? "ml-2" : "mr-2"}`} />
                  {t("nav.calculateur")}
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
