"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import Link from "next/link";
import {
  Calculator,
  Globe,
  Shield,
  Truck,
  ChevronDown,
  Zap,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Y2KStar, FloatingStars } from "@/components/y2k-star";
import { Card3D } from "@/components/card-3d";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

/* ─────────────────── HERO SECTION ─────────────────── */
function HeroSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  const storeLogos = [
    { name: "Temu", emoji: "🛍️", delay: 0 },
    { name: "AliExpress", emoji: "🌐", delay: 0.1 },
    { name: "Amazon", emoji: "📦", delay: 0.2 },
    { name: "Shein", emoji: "👗", delay: 0.3 },
    { name: "eBay", emoji: "🏷️", delay: 0.4 },
    { name: "Wish", emoji: "⭐", delay: 0.5 },
  ];

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Parallax Background Effects */}
      <motion.div style={{ y }} className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-indigo/30 rounded-full blur-3xl animate-glow-pulse" />
        <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-cyber-pink/20 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-acid-lime/10 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: "3s" }} />
      </motion.div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "linear-gradient(rgba(186,255,41,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(186,255,41,0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Scanline effect */}
      <div className="scanline-animated absolute inset-0 pointer-events-none" />

      <motion.div style={{ opacity }} className="relative z-10 max-w-5xl mx-auto px-4 text-center">
        {/* 3D Rotating Star */}
        <motion.div
          animate={{ rotateY: 360, rotateZ: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          style={{ transformStyle: "preserve-3d", perspective: "800px" }}
          className="inline-block mb-6"
        >
          <Y2KStar size={56} className="text-acid-lime star-glow" />
        </motion.div>

        {/* Main heading with chrome text */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-4xl sm:text-6xl lg:text-8xl font-black mb-6 leading-tight"
        >
          <span className="chrome-text-enhanced">EURO</span>
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

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <Link href="/calculateur">
            <Button
              size="lg"
              className="bg-acid-lime text-pure-black hover:bg-acid-lime/90 font-black text-lg rounded-full px-10 py-6 shadow-xl shadow-acid-lime/30 hover:shadow-acid-lime/50 hover:scale-105 transition-all"
            >
              <Calculator className="w-5 h-5 mr-2" />
              Calculez le prix de votre produit
            </Button>
          </Link>
          <Link href="/boutiques">
            <Button
              size="lg"
              variant="outline"
              className="border-cyber-pink/50 text-cyber-pink hover:bg-cyber-pink/10 font-bold text-lg rounded-full px-10 py-6 shadow-xl shadow-cyber-pink/20 hover:scale-105 transition-all"
            >
              <Globe className="w-5 h-5 mr-2" />
              Parcourir les boutiques
            </Button>
          </Link>
        </motion.div>

        {/* Floating store logos in 3D space */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="mt-16 flex flex-wrap justify-center gap-4 sm:gap-6"
        >
          {storeLogos.map((store, i) => (
            <motion.div
              key={store.name}
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 1.2 + store.delay, duration: 0.5 }}
              whileHover={{ scale: 1.2, y: -5 }}
              className="frosted-glass-chrome rounded-xl px-4 py-2 flex items-center gap-2 cursor-default"
              style={{ transformStyle: "preserve-3d" }}
            >
              <span className="text-xl">{store.emoji}</span>
              <span className="text-frosted-chrome/60 text-sm font-medium">{store.name}</span>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <ChevronDown className="w-8 h-8 text-frosted-chrome/40" />
      </motion.div>
    </section>
  );
}

/* ─────────────────── FEATURES SECTION ─────────────────── */
const features = [
  {
    icon: <Shield className="w-6 h-6" />,
    title: "Garantie de sécurité",
    description: "Vos produits sont assurés dès la commande jusqu'à la livraison. Nous prenons l'entière responsabilité.",
    color: "#2D00F7",
  },
  {
    icon: <Truck className="w-6 h-6" />,
    title: "Livraison fiable",
    description: "Un vaste réseau de livraison qui garantit l'arrivée de votre produit en toute sécurité et dans les délais.",
    color: "#BAFF29",
  },
  {
    icon: <Calculator className="w-6 h-6" />,
    title: "Prix transparents",
    description: "Pas de frais cachés. Le prix que vous calculez est le prix que vous payez. Clair et simple.",
    color: "#FF2ECD",
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: "Rapidité d'exécution",
    description: "Nous traitons votre commande dès sa réception. Pas besoin d'attendre longtemps pour recevoir vos achats.",
    color: "#E0E0E0",
  },
];

function FeaturesSection() {
  return (
    <section className="relative py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background to-indigo/5" />
      {/* Spiral bg decoration */}
      <div className="absolute inset-0 spiral-bg" />

      <div className="relative z-10 max-w-6xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyber-pink/10 border border-cyber-pink/20 text-cyber-pink text-sm font-medium mb-4">
            <Sparkles className="w-4 h-4" />
            Pourquoi nous choisir
          </div>
          <h2 className="text-3xl sm:text-5xl font-black mb-4">
            <span className="text-cyber-pink">Pourquoi</span>{" "}
            <span className="chrome-text">EUROLUXE ?</span>
          </h2>
          <p className="text-frosted-chrome/60 text-lg max-w-xl mx-auto">
            Plus qu&apos;un simple intermédiaire. Nous sommes votre partenaire de shopping international
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {features.map((feature, i) => (
            <Card3D key={feature.title} className="rounded-2xl">
              <motion.div
                initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="frosted-glass rounded-2xl p-6 sm:p-8 flex gap-5 items-start hover:border-acid-lime/30 transition-all duration-300 group h-full depth-shadow"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: `${feature.color}20`, color: feature.color }}
                >
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
            </Card3D>
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
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-acid-lime/5 rounded-full blur-3xl animate-morph-blob" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="inline-block mb-6"
          >
            <Y2KStar size={40} className="text-acid-lime star-glow" />
          </motion.div>

          <h2 className="text-3xl sm:text-5xl font-black mb-6">
            <span className="chrome-text">Prêt à</span>{" "}
            <span className="text-acid-lime">commencer ?</span>
          </h2>
          <p className="text-frosted-chrome/60 text-lg max-w-xl mx-auto mb-10">
            N&apos;hésitez plus ! Commencez dès maintenant et calculez le prix de votre produit préféré. Un processus simple, rapide et sécurisé.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/calculateur">
              <Button
                size="lg"
                className="bg-acid-lime text-pure-black hover:bg-acid-lime/90 font-bold text-lg rounded-full px-10 py-6 shadow-xl shadow-acid-lime/30 hover:shadow-acid-lime/50 hover:scale-105 transition-all"
              >
                <Calculator className="w-5 h-5 mr-2" />
                Calculez le prix de votre produit
              </Button>
            </Link>
            <Link href="/contact">
              <Button
                size="lg"
                variant="outline"
                className="border-cyber-pink/50 text-cyber-pink hover:bg-cyber-pink/10 font-bold text-lg rounded-full px-10 py-6 shadow-xl hover:scale-105 transition-all"
              >
                Contactez-nous
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────── MAIN PAGE ─────────────────── */
export default function HomePage() {
  return (
    <div className="relative min-h-screen flex flex-col bg-pure-black text-foreground overflow-x-hidden">
      <FloatingStars />
      <Navbar />
      <main className="flex-1 pt-16 sm:pt-20">
        <HeroSection />
        <FeaturesSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
