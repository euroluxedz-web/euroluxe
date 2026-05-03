"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  Calculator,
  Globe,
  Shield,
  Truck,
  ChevronDown,
  Menu,
  X,
  Sparkles,
  Zap,
  ExternalLink,
  CheckCircle2,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ─────────────────── STAR SVG ─────────────────── */
function Y2KStar({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 0L14.59 8.41L23 12L14.59 15.59L12 24L9.41 15.59L1 12L9.41 8.41L12 0Z" />
    </svg>
  );
}

/* ─────────────────── FLOATING STARS BG ─────────────────── */
function FloatingStars() {
  const stars = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 16 + 8,
    delay: Math.random() * 5,
    duration: Math.random() * 3 + 4,
    color: i % 3 === 0 ? "#BAFF29" : i % 3 === 1 ? "#FF2ECD" : "#2D00F7",
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute"
          style={{ left: `${star.x}%`, top: `${star.y}%` }}
          animate={{
            y: [0, -20, 0],
            rotate: [0, 180, 360],
            opacity: [0.3, 0.7, 0.3],
          }}
          transition={{
            duration: star.duration,
            repeat: Infinity,
            delay: star.delay,
            ease: "easeInOut",
          }}
        >
          <Y2KStar size={star.size} className="" style={{ color: star.color }} />
        </motion.div>
      ))}
    </div>
  );
}

/* ─────────────────── NAVBAR ─────────────────── */
function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { label: "Accueil", href: "#hero" },
    { label: "Calculateur", href: "#calculator" },
    { label: "Boutiques", href: "#stores" },
    { label: "Comment ça marche", href: "#how-it-works" },
    { label: "Contact", href: "#contact" },
  ];

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
          <a href="#hero" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-acid-lime/30 rounded-full blur-md group-hover:bg-acid-lime/50 transition-all" />
              <img
                src="/logo.jpeg"
                alt="EUROLUXE"
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full relative z-10 ring-2 ring-acid-lime/50"
              />
            </div>
            <span className="text-xl sm:text-2xl font-bold chrome-text tracking-wider">
              EUROLUXE
            </span>
          </a>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="relative px-4 py-2 text-sm font-medium text-frosted-chrome hover:text-acid-lime transition-colors group"
              >
                {link.label}
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-acid-lime group-hover:w-3/4 transition-all duration-300" />
              </a>
            ))}
            <a href="#calculator">
              <Button className="ml-2 bg-acid-lime text-pure-black hover:bg-acid-lime/90 font-bold rounded-full px-6 shadow-lg shadow-acid-lime/30 hover:shadow-acid-lime/50 transition-all">
                <Calculator className="w-4 h-4 mr-2" />
                Calculateur
              </Button>
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-frosted-chrome hover:text-acid-lime transition-colors"
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
                <motion.a
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="block px-4 py-3 text-frosted-chrome hover:text-acid-lime hover:bg-indigo/20 rounded-lg transition-all"
                >
                  {link.label}
                </motion.a>
              ))}
              <a href="#calculator" onClick={() => setIsOpen(false)}>
                <Button className="w-full mt-2 bg-acid-lime text-pure-black hover:bg-acid-lime/90 font-bold rounded-full shadow-lg shadow-acid-lime/30">
                  <Calculator className="w-4 h-4 mr-2" />
                  Calculateur
                </Button>
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

/* ─────────────────── HERO SECTION ─────────────────── */
function HeroSection() {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20"
    >
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-indigo/30 rounded-full blur-3xl animate-glow-pulse" />
        <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-cyber-pink/20 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-acid-lime/10 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: "3s" }} />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "linear-gradient(rgba(186,255,41,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(186,255,41,0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-4 text-center">
        {/* Star decoration */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="inline-block mb-6"
        >
          <Y2KStar size={48} className="text-acid-lime drop-shadow-[0_0_15px_rgba(186,255,41,0.6)]" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-4xl sm:text-6xl lg:text-8xl font-black mb-6 leading-tight"
        >
          <span className="chrome-text">EURO</span>
          <span className="text-acid-lime drop-shadow-[0_0_30px_rgba(186,255,41,0.5)]">LUXE</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-lg sm:text-2xl text-frosted-chrome/80 mb-4 font-light max-w-3xl mx-auto"
        >
          Votre intermédiaire de confiance pour acheter depuis les plus grandes boutiques mondiales
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-base sm:text-lg text-cyber-pink font-medium mb-10"
        >
          Temu ✦ AliExpress ✦ Amazon ✦ Shein ✦ Et plus encore...
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <a href="#calculator">
            <Button
              size="lg"
              className="bg-acid-lime text-pure-black hover:bg-acid-lime/90 font-bold text-lg rounded-full px-10 py-6 shadow-xl shadow-acid-lime/30 hover:shadow-acid-lime/50 hover:scale-105 transition-all"
            >
              <Calculator className="w-5 h-5 mr-2" />
              Calculez le prix de votre produit
            </Button>
          </a>
          <a href="#stores">
            <Button
              size="lg"
              variant="outline"
              className="border-cyber-pink/50 text-cyber-pink hover:bg-cyber-pink/10 font-bold text-lg rounded-full px-10 py-6 shadow-xl shadow-cyber-pink/20 hover:scale-105 transition-all"
            >
              <Globe className="w-5 h-5 mr-2" />
              Parcourir les boutiques
            </Button>
          </a>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <ChevronDown className="w-8 h-8 text-frosted-chrome/40" />
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────── PRICE CALCULATOR ─────────────────── */
function PriceCalculator() {
  const [productUrl, setProductUrl] = useState("");
  const [priceUSD, setPriceUSD] = useState("");
  const [result, setResult] = useState<{
    usd: number;
    dzd: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const RATE = 300;

  const handleCalculate = () => {
    setError("");
    setResult(null);

    const price = parseFloat(priceUSD);
    if (!price || price <= 0) {
      setError("Veuillez entrer un prix valide en dollars");
      return;
    }

    setResult({
      usd: price,
      dzd: price * RATE,
    });
  };

  const handleCopyResult = () => {
    if (result) {
      const text = `Prix en USD: ${result.usd.toFixed(2)}$ | Prix en DZD: ${result.dzd.toLocaleString()} DA`;
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleUrlPaste = (url: string) => {
    setProductUrl(url);
  };

  return (
    <section id="calculator" className="relative py-20 sm:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-indigo/10 via-background to-background" />
      <div className="absolute top-0 left-0 w-72 h-72 bg-acid-lime/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-72 h-72 bg-cyber-pink/5 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-4xl mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-acid-lime/10 border border-acid-lime/20 text-acid-lime text-sm font-medium mb-4">
            <Zap className="w-4 h-4" />
            Calcul instantané
          </div>
          <h2 className="text-3xl sm:text-5xl font-black mb-4">
            <span className="chrome-text">Calculez le prix</span>{" "}
            <span className="text-acid-lime">de votre produit</span>
          </h2>
          <p className="text-frosted-chrome/60 text-lg max-w-xl mx-auto">
            Entrez le lien du produit et son prix en dollars, on s&apos;occupe du reste
          </p>
        </motion.div>

        {/* Calculator Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="frosted-glass rounded-3xl p-6 sm:p-10 neon-border"
        >
          {/* URL Input */}
          <div className="mb-6">
            <label className="block text-frosted-chrome/80 text-sm font-medium mb-2">
              <Globe className="w-4 h-4 inline mr-1" />
              Lien du produit (optionnel)
            </label>
            <Input
              type="url"
              placeholder="Collez le lien du produit depuis Temu, AliExpress..."
              value={productUrl}
              onChange={(e) => handleUrlPaste(e.target.value)}
              className="bg-pure-black/50 border-white/10 focus:border-acid-lime/50 focus:ring-acid-lime/20 text-frosted-chrome placeholder:text-frosted-chrome/30 rounded-xl h-12 text-base"
            />
          </div>

          {/* Price Input */}
          <div className="mb-8">
            <label className="block text-frosted-chrome/80 text-sm font-medium mb-2">
              <ShoppingCart className="w-4 h-4 inline mr-1" />
              Prix du produit en dollars (USD)
            </label>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={priceUSD}
                onChange={(e) => setPriceUSD(e.target.value)}
                className="bg-pure-black/50 border-white/10 focus:border-acid-lime/50 focus:ring-acid-lime/20 text-frosted-chrome placeholder:text-frosted-chrome/30 rounded-xl h-14 text-xl font-bold text-center"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-acid-lime font-bold text-xl">
                $
              </span>
            </div>
          </div>

          {/* Calculate Button */}
          <Button
            onClick={handleCalculate}
            className="w-full bg-acid-lime text-pure-black hover:bg-acid-lime/90 font-black text-lg rounded-xl h-14 shadow-xl shadow-acid-lime/30 hover:shadow-acid-lime/50 hover:scale-[1.02] transition-all"
          >
            <Calculator className="w-5 h-5 mr-2" />
            Calculer le prix en Dinar
          </Button>

          {/* Error */}
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-cyber-pink text-center mt-4 font-medium"
            >
              {error}
            </motion.p>
          )}

          {/* Result */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                className="mt-8"
              >
                <div className="bg-pure-black/60 rounded-2xl p-6 border border-acid-lime/30 neon-border">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-acid-lime font-bold text-lg flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      Résultat
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyResult}
                      className="text-frosted-chrome/50 hover:text-acid-lime"
                    >
                      {copied ? (
                        <CheckCircle2 className="w-4 h-4 mr-1 text-acid-lime" />
                      ) : (
                        <Copy className="w-4 h-4 mr-1" />
                      )}
                      {copied ? "Copié !" : "Copier"}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="text-center p-4 rounded-xl bg-indigo/20 border border-indigo/30">
                      <p className="text-frosted-chrome/50 text-sm mb-1">Prix en dollars</p>
                      <p className="text-2xl font-black text-frosted-chrome">
                        {result.usd.toFixed(2)}$
                      </p>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-cyber-pink/10 border border-cyber-pink/30">
                      <p className="text-cyber-pink/70 text-sm mb-1">Prix en Dinar</p>
                      <p className="text-3xl font-black text-cyber-pink">
                        {result.dzd.toLocaleString()} DA
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 p-3 rounded-lg bg-acid-lime/5 border border-acid-lime/10 text-center">
                    <p className="text-acid-lime font-bold text-xl">
                      {result.dzd.toLocaleString()} Dinar Algérien
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────── STORES SECTION ─────────────────── */
const stores = [
  {
    name: "Temu",
    logo: "🛍️",
    url: "https://temu.com",
    color: "#FF6B35",
    description: "Des prix irrésistibles sur tout",
  },
  {
    name: "AliExpress",
    logo: "🌐",
    url: "https://aliexpress.com",
    color: "#FF4747",
    description: "Le plus grand marché en ligne chinois",
  },
  {
    name: "Amazon",
    logo: "📦",
    url: "https://amazon.com",
    color: "#FF9900",
    description: "La plus grande boutique en ligne au monde",
  },
  {
    name: "Shein",
    logo: "👗",
    url: "https://shein.com",
    color: "#E60023",
    description: "Les dernières tendances mode à petits prix",
  },
  {
    name: "eBay",
    logo: "🏷️",
    url: "https://ebay.com",
    color: "#86B817",
    description: "Enchères et offres infinies",
  },
  {
    name: "Wish",
    logo: "⭐",
    url: "https://wish.com",
    color: "#2FB7EC",
    description: "Achetez au meilleur prix",
  },
  {
    name: "Banggood",
    logo: "🔧",
    url: "https://banggood.com",
    color: "#D61920",
    description: "Électronique et outils à prix compétitifs",
  },
  {
    name: "LightInTheBox",
    logo: "💡",
    url: "https://lightinthebox.com",
    color: "#1A8CCC",
    description: "Mode, électronique et décoration",
  },
];

function StoresSection() {
  return (
    <section id="stores" className="relative py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-indigo/5 to-background" />

      <div className="relative z-10 max-w-7xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyber-pink/10 border border-cyber-pink/20 text-cyber-pink text-sm font-medium mb-4">
            <Globe className="w-4 h-4" />
            Boutiques mondiales
          </div>
          <h2 className="text-3xl sm:text-5xl font-black mb-4">
            <span className="chrome-text">Achetez depuis</span>{" "}
            <span className="text-cyber-pink">n&apos;importe où</span>
          </h2>
          <p className="text-frosted-chrome/60 text-lg max-w-xl mx-auto">
            Nous pouvons acheter pour vous depuis plus de 100+ boutiques mondiales. Voici les plus populaires
          </p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {stores.map((store, i) => (
            <motion.a
              key={store.name}
              href="#calculator"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group frosted-glass rounded-2xl p-6 text-center hover:border-acid-lime/40 transition-all duration-300 cursor-pointer"
            >
              <div
                className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-3xl mb-4"
                style={{ backgroundColor: `${store.color}20` }}
              >
                {store.logo}
              </div>
              <h3 className="font-bold text-frosted-chrome text-lg mb-1 group-hover:text-acid-lime transition-colors">
                {store.name}
              </h3>
              <p className="text-frosted-chrome/40 text-sm">{store.description}</p>
              <ExternalLink className="w-4 h-4 mx-auto mt-3 text-frosted-chrome/20 group-hover:text-acid-lime transition-colors" />
            </motion.a>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mt-10"
        >
          <p className="text-frosted-chrome/40 text-sm">
            ✦ Et bien d&apos;autres boutiques disponibles sur demande ✦
          </p>
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────── HOW IT WORKS ─────────────────── */
const steps = [
  {
    step: "01",
    icon: <Globe className="w-7 h-7" />,
    title: "Choisissez votre produit",
    description:
      "Parcourez les boutiques mondiales comme Temu, AliExpress et Amazon, puis choisissez le produit qui vous plaît. Copiez le lien et le prix.",
    color: "#2D00F7",
  },
  {
    step: "02",
    icon: <Calculator className="w-7 h-7" />,
    title: "Calculez le prix",
    description:
      "Utilisez notre calculateur pour connaître le prix final en Dinar Algérien. Rapide, simple et transparent !",
    color: "#BAFF29",
  },
  {
    step: "03",
    icon: <ShoppingCart className="w-7 h-7" />,
    title: "Commandez chez nous",
    description:
      "Envoyez-nous le lien du produit et nous l&apos;achèterons pour vous. Nous nous occupons de tout, de la commande jusqu&apos;à la livraison.",
    color: "#FF2ECD",
  },
  {
    step: "04",
    icon: <Truck className="w-7 h-7" />,
    title: "Recevez votre produit",
    description:
      "Une fois le produit arrivé, nous vous le remettons en toute sécurité. Suivez votre commande en temps réel et soyez serein.",
    color: "#E0E0E0",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-cyber-pink/5 to-background" />

      <div className="relative z-10 max-w-6xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo/10 border border-indigo/20 text-sm font-medium mb-4" style={{ color: "#9D7FFF" }}>
            <Sparkles className="w-4 h-4" />
            Comment ça marche
          </div>
          <h2 className="text-3xl sm:text-5xl font-black mb-4">
            <span className="chrome-text">4 étapes</span>{" "}
            <span className="text-acid-lime">seulement</span>
          </h2>
          <p className="text-frosted-chrome/60 text-lg max-w-xl mx-auto">
            Du choix du produit à la livraison, le processus est simple et rapide
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="relative group"
            >
              {/* Connector line */}
              {i < 3 && (
                <div className="hidden lg:block absolute top-12 -right-3 w-6 h-0.5 bg-gradient-to-r from-frosted-chrome/20 to-transparent" />
              )}

              <div className="frosted-glass rounded-2xl p-6 h-full hover:border-acid-lime/30 transition-all duration-300">
                {/* Step number */}
                <div className="text-5xl font-black mb-4 opacity-10 absolute top-4 right-4">
                  {step.step}
                </div>

                {/* Icon */}
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${step.color}20`, color: step.color }}
                >
                  {step.icon}
                </div>

                <h3 className="text-xl font-bold text-frosted-chrome mb-3 group-hover:text-acid-lime transition-colors">
                  {step.title}
                </h3>
                <p className="text-frosted-chrome/50 text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── FEATURES SECTION ─────────────────── */
const features = [
  {
    icon: <Shield className="w-6 h-6" />,
    title: "Garantie de sécurité",
    description: "Vos produits sont assurés dès la commande jusqu'à la livraison. Nous prenons l'entière responsabilité.",
  },
  {
    icon: <Truck className="w-6 h-6" />,
    title: "Livraison fiable",
    description: "Un vaste réseau de livraison qui garantit l'arrivée de votre produit en toute sécurité et dans les délais.",
  },
  {
    icon: <Calculator className="w-6 h-6" />,
    title: "Prix transparents",
    description: "Pas de frais cachés. Le prix que vous calculez est le prix que vous payez. Clair et simple.",
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: "Rapidité d'exécution",
    description: "Nous traitons votre commande dès sa réception. Pas besoin d'attendre longtemps pour recevoir vos achats.",
  },
];

function FeaturesSection() {
  return (
    <section className="relative py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background to-indigo/5" />

      <div className="relative z-10 max-w-6xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-5xl font-black mb-4">
            <span className="text-cyber-pink">Pourquoi</span>{" "}
            <span className="chrome-text">EUROLUXE ?</span>
          </h2>
          <p className="text-frosted-chrome/60 text-lg max-w-xl mx-auto">
            Plus qu'un simple intermédiaire. Nous sommes votre partenaire de shopping international
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="frosted-glass rounded-2xl p-6 sm:p-8 flex gap-5 items-start hover:border-acid-lime/30 transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-xl bg-acid-lime/10 flex items-center justify-center text-acid-lime shrink-0 group-hover:bg-acid-lime/20 transition-colors">
                {feature.icon}
              </div>
              <div>
                <h3 className="font-bold text-frosted-chrome text-lg mb-2 group-hover:text-acid-lime transition-colors">
                  {feature.title}
                </h3>
                <p className="text-frosted-chrome/50 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── CTA SECTION ─────────────────── */
function CTASection() {
  return (
    <section className="relative py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-acid-lime/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Y2KStar size={40} className="text-acid-lime inline-block mb-6 drop-shadow-[0_0_15px_rgba(186,255,41,0.5)]" />

          <h2 className="text-3xl sm:text-5xl font-black mb-6">
            <span className="chrome-text">Prêt à</span>{" "}
            <span className="text-acid-lime">commencer ?</span>
          </h2>
          <p className="text-frosted-chrome/60 text-lg max-w-xl mx-auto mb-10">
            N&apos;hésitez plus ! Commencez dès maintenant et calculez le prix de votre produit préféré. Un processus simple, rapide et sécurisé.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#calculator">
              <Button
                size="lg"
                className="bg-acid-lime text-pure-black hover:bg-acid-lime/90 font-bold text-lg rounded-full px-10 py-6 shadow-xl shadow-acid-lime/30 hover:shadow-acid-lime/50 hover:scale-105 transition-all"
              >
                <Calculator className="w-5 h-5 mr-2" />
                Calculez le prix de votre produit
              </Button>
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────── CONTACT SECTION ─────────────────── */
function ContactSection() {
  return (
    <section id="contact" className="relative py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-indigo/5 to-background" />

      <div className="relative z-10 max-w-4xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-5xl font-black mb-4">
            <span className="chrome-text">Contactez</span>{" "}
            <span className="text-cyber-pink">-nous</span>
          </h2>
          <p className="text-frosted-chrome/60 text-lg max-w-xl mx-auto">
            Vous avez une question ou besoin d&apos;informations ? Contactez-nous sur nos réseaux
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            {
              platform: "WhatsApp",
              icon: "💬",
              handle: "@euroluxe_dz",
              color: "#25D366",
            },
            {
              platform: "Instagram",
              icon: "📸",
              handle: "@euroluxe_dz",
              color: "#E4405F",
            },
            {
              platform: "Facebook",
              icon: "👤",
              handle: "EUROLUXE DZ",
              color: "#1877F2",
            },
          ].map((social, i) => (
            <motion.div
              key={social.platform}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="frosted-glass rounded-2xl p-6 text-center hover:border-acid-lime/30 transition-all duration-300 cursor-pointer group"
            >
              <div className="text-4xl mb-3">{social.icon}</div>
              <h3
                className="font-bold text-lg mb-1"
                style={{ color: social.color }}
              >
                {social.platform}
              </h3>
              <p className="text-frosted-chrome/40 text-sm">{social.handle}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── FOOTER ─────────────────── */
function Footer() {
  return (
    <footer className="relative border-t border-white/5 py-10">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.jpeg" alt="EUROLUXE" className="w-8 h-8 rounded-full ring-1 ring-acid-lime/30" />
            <span className="font-bold chrome-text">EUROLUXE</span>
          </div>

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

/* ─────────────────── MAIN PAGE ─────────────────── */
export default function HomePage() {
  return (
    <main className="relative min-h-screen flex flex-col bg-pure-black text-foreground overflow-x-hidden">
      <FloatingStars />
      <Navbar />
      <HeroSection />
      <PriceCalculator />
      <StoresSection />
      <HowItWorks />
      <FeaturesSection />
      <CTASection />
      <ContactSection />
      <Footer />
    </main>
  );
}
