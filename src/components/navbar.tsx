"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { label: "Accueil", href: "/" },
  { label: "Calculateur", href: "/calculateur" },
  { label: "Boutiques", href: "/boutiques" },
  { label: "Comment ça marche", href: "/comment-ca-marche" },
  { label: "Contact", href: "/contact" },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

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

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "frosted-glass-dark shadow-lg shadow-indigo/20" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-acid-lime/30 rounded-full blur-md group-hover:bg-acid-lime/50 transition-all" />
              <img
                src="/logo.jpeg"
                alt="EUROLUXE"
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full relative z-10 ring-2 ring-acid-lime/50 logo-glow object-cover"
              />
            </div>
            <span className="text-xl sm:text-2xl font-bold chrome-text tracking-wider">
              EUROLUXE
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-4 py-2 text-sm font-medium transition-colors group ${
                  isActive(link.href)
                    ? "text-acid-lime nav-link-active"
                    : "text-frosted-chrome hover:text-acid-lime"
                }`}
              >
                {link.label}
                <span
                  className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 bg-acid-lime transition-all duration-300 ${
                    isActive(link.href) ? "w-3/4 shadow-[0_0_8px_rgba(186,255,41,0.5)]" : "w-0 group-hover:w-3/4"
                  }`}
                />
              </Link>
            ))}
            <Link href="/calculateur">
              <Button className="ml-2 bg-acid-lime text-pure-black hover:bg-acid-lime/90 font-bold rounded-full px-6 shadow-lg shadow-acid-lime/30 hover:shadow-acid-lime/50 transition-all">
                <Calculator className="w-4 h-4 mr-2" />
                Calculateur
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-frosted-chrome hover:text-acid-lime transition-colors"
            aria-label={isOpen ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden frosted-glass-dark border-t border-white/10 overflow-hidden"
          >
            <div className="px-4 py-4 space-y-2">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Link
                    href={link.href}
                    onClick={closeMenu}
                    className={`block px-4 py-3 rounded-lg transition-all ${
                      isActive(link.href)
                        ? "text-acid-lime bg-acid-lime/10"
                        : "text-frosted-chrome hover:text-acid-lime hover:bg-indigo/20"
                    }`}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <Link href="/calculateur" onClick={closeMenu}>
                <Button className="w-full mt-2 bg-acid-lime text-pure-black hover:bg-acid-lime/90 font-bold rounded-full shadow-lg shadow-acid-lime/30">
                  <Calculator className="w-4 h-4 mr-2" />
                  Calculateur
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
