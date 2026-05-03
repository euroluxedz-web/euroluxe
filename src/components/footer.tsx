"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative border-t border-brand-gold/10 py-10 bg-brand-dark">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="/logo.png"
              alt="EUROLUXE"
              className="w-8 h-8 rounded-full ring-1 ring-brand-gold/30 object-cover logo-shadow"
            />
            <span className="font-bold text-brand-light font-heading tracking-wider">
              EUROLUXE
            </span>
          </Link>

          <p className="text-brand-light/40 text-sm text-center font-sans">
            © {new Date().getFullYear()} EUROLUXE — Votre intermédiaire de
            confiance pour les achats internationaux
          </p>

          <div className="flex items-center gap-4">
            <Link
              href="/calculateur"
              className="text-brand-gold/70 hover:text-brand-gold text-sm font-medium transition-colors font-display"
            >
              Calculateur
            </Link>
            <Link
              href="/contact"
              className="text-brand-gold/70 hover:text-brand-gold text-sm font-medium transition-colors font-display"
            >
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
