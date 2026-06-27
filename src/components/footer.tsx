"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Instagram, Facebook, Send, Mail, ArrowRight } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

/* ── TikTok icon (lucide-react in this version has no TikTok icon) ── */
function TikTokIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.1z" />
    </svg>
  );
}

export function Footer() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setEmail("");
      setTimeout(() => setSubscribed(false), 3000);
    }
  };

  const socialLinks = [
    {
      platform: "WhatsApp",
      icon: <MessageCircle className="w-5 h-5" />,
      href: "https://wa.me/213XXXXXXXXX",
      color: "hover:text-green-400",
    },
    {
      platform: "Instagram",
      icon: <Instagram className="w-5 h-5" />,
      href: "https://www.instagram.com/euroluxe.dz/",
      color: "hover:text-pink-400",
    },
    {
      platform: "Facebook",
      icon: <Facebook className="w-5 h-5" />,
      href: "https://www.facebook.com/profile.php?id=100094318311777",
      color: "hover:text-blue-400",
    },
    {
      platform: "TikTok",
      icon: <TikTokIcon className="w-5 h-5" />,
      href: "https://www.tiktok.com/@euroluxe.dz",
      color: "hover:text-gray-300",
    },
  ];

  return (
    <footer className="relative border-t border-brand-pink/10 bg-brand-dark">
      <div className="max-w-7xl mx-auto px-4 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">
          {/* Left Column - Brand + Description + Social */}
          <div>
            <Link href="/" className="flex items-center gap-3 group mb-4">
              <img
                src="/logo.png"
                alt="EUROLUXE"
                className="w-10 h-10 rounded-full ring-2 ring-brand-pink/30 object-cover logo-shadow"
              />
              <span className="font-bold text-white font-heading tracking-wider text-xl">
                EUROLUXE
              </span>
            </Link>

            <p className="text-brand-muted-text text-sm mb-6 max-w-sm leading-relaxed">
              {t("footer.copyright")}
            </p>

            {/* Social Media Icons */}
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.platform}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/60 transition-all duration-300 hover:bg-brand-pink hover:text-white hover:shadow-lg hover:shadow-brand-pink/30 ${social.color}`}
                  aria-label={social.platform}
                >
                  {social.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Right Column - Links + Newsletter */}
          <div>
            <h3 className="text-white font-bold font-heading mb-4 text-sm uppercase tracking-wider">
              {t("nav.accueil")}
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-6">
              <Link
                href="/calculateur"
                className="text-brand-muted-text/70 hover:text-brand-pink text-sm font-display transition-colors"
              >
                {t("nav.calculateur")}
              </Link>
              <Link
                href="/boutiques"
                className="text-brand-muted-text/70 hover:text-brand-pink text-sm font-display transition-colors"
              >
                {t("nav.boutiques")}
              </Link>
              <Link
                href="/comment-ca-marche"
                className="text-brand-muted-text/70 hover:text-brand-pink text-sm font-display transition-colors"
              >
                {t("nav.commentCaMarche")}
              </Link>
              <Link
                href="/contact"
                className="text-brand-muted-text/70 hover:text-brand-pink text-sm font-display transition-colors"
              >
                {t("nav.contact")}
              </Link>
            </div>

            {/* Newsletter */}
            <h3 className="text-white font-bold font-heading mb-3 text-sm uppercase tracking-wider flex items-center gap-2">
              <Mail className="w-4 h-4 text-brand-pink" />
              Newsletter
            </h3>
            <form onSubmit={handleSubscribe} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-2.5 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-brand-pink/50 focus:ring-1 focus:ring-brand-pink/30 transition-all"
                required
              />
              <button
                type="submit"
                className="bg-brand-pink hover:bg-brand-pink-light text-white font-bold rounded-full px-5 py-2.5 text-sm shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all flex items-center gap-1 font-display"
              >
                {subscribed ? "✓" : <><Send className="w-4 h-4" /> OK</>}
              </button>
            </form>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/30 text-xs text-center font-sans">
            © {new Date().getFullYear()} EUROLUXE — {t("footer.copyright")}
          </p>
          <div className="flex items-center gap-1 text-white/30 text-xs">
            <span>Made with</span>
            <span className="text-brand-pink">♥</span>
            <span>in Algeria</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
