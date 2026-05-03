"use client";

import Link from "next/link";
import { Y2KStar } from "./y2k-star";

export function Footer() {
  return (
    <footer className="relative border-t border-white/5 py-10 bg-pure-black">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 group">
            <img src="/logo.jpeg" alt="EUROLUXE" className="w-8 h-8 rounded-full ring-1 ring-acid-lime/30 object-cover logo-glow" />
            <span className="font-bold chrome-text">EUROLUXE</span>
          </Link>

          <p className="text-frosted-chrome/30 text-sm text-center">
            © {new Date().getFullYear()} EUROLUXE — Votre intermédiaire de confiance pour les achats internationaux
          </p>

          <div className="flex items-center gap-1 text-frosted-chrome/20">
            <Y2KStar size={12} className="text-acid-lime/50" />
            <span className="text-xs">Y2K Vibes</span>
            <Y2KStar size={12} className="text-cyber-pink/50" />
          </div>
        </div>
      </div>
    </footer>
  );
}
