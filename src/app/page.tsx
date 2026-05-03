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
  const y = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  const storeLogos = [
    { name: "Temu", emoji: "🛍️", delay: 0 },
    { name: "AliExpress", emoji: "🌐", delay: 0.1 },
  ];

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex justify-center overflow-hidden"
    >
      {/* Video Background */}
      <motion.div style={{ y }} className="absolute inset-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src="/background.mp4" type="video/mp4" />
        </video>
      </motion.div>

      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-brand-dark/55" style={{ zIndex: 1 }} />

      {/* Subtle dot pattern on top of video */}
      <div className="absolute inset-0 warm-dots opacity-10" style={{ zIndex: 2 }} />

      <motion.div
        style={{ opacity, zIndex: 10 }}
        className="relative max-w-5xl mx-auto px-4 text-center pt-24 sm:pt-28"
      >
        {/* Brand heading */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-4"
        >
          <span className="font-heading text-brand-light/70 text-sm tracking-[0.3em] uppercase font-medium">
            Bienvenue chez
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-5xl sm:text-7xl lg:text-9xl font-black mb-6 leading-tight font-heading"
        >
          <span className="text-brand-light">EURO</span>
          <span className="gold-text">LUXE</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-lg sm:text-2xl text-brand-light/80 mb-4 font-sans font-light max-w-3xl mx-auto leading-relaxed"
        >
          Votre intermédiaire de confiance pour acheter depuis les plus grandes
          boutiques mondiales
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="text-base sm:text-lg text-brand-gold font-display font-medium mb-10"
        >
          Temu ✦ AliExpress
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <Link href="/calculateur">
            <Button
              size="lg"
              className="bg-brand-gold text-brand-dark hover:bg-brand-gold-light font-bold text-lg rounded-full px-10 py-6 shadow-xl shadow-brand-gold/25 hover:shadow-brand-gold/40 hover:scale-105 transition-all font-display"
            >
              <Calculator className="w-5 h-5 mr-2" />
              Calculez le prix de votre produit
            </Button>
          </Link>
          <Link href="/boutiques">
            <Button
              size="lg"
              variant="outline"
              className="border-brand-light/30 text-brand-light hover:bg-brand-light hover:text-brand-dark font-bold text-lg rounded-full px-10 py-6 hover:scale-105 transition-all font-display"
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
              whileHover={{ scale: 1.1, y: -5 }}
              className="warm-glass-dark rounded-xl px-5 py-3 flex items-center gap-3 cursor-default"
              style={{ transformStyle: "preserve-3d" }}
            >
              <span className="text-2xl">{store.emoji}</span>
              <span className="text-brand-light/90 text-sm font-medium font-display">
                {store.name}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        style={{ zIndex: 3 }}
      >
        <ChevronDown className="w-8 h-8 text-brand-light/50" />
      </motion.div>
    </section>
  );
}

/* ─────────────────── FEATURES SECTION ─────────────────── */
const features = [
  {
    icon: <Shield className="w-6 h-6" />,
    title: "Garantie de sécurité",
    description:
      "Vos produits sont assurés dès la commande jusqu'à la livraison. Nous prenons l'entière responsabilité.",
    color: "#b8945f",
  },
  {
    icon: <Truck className="w-6 h-6" />,
    title: "Livraison fiable",
    description:
      "Un vaste réseau de livraison qui garantit l'arrivée de votre produit en toute sécurité et dans les délais.",
    color: "#7a7068",
  },
  {
    icon: <Calculator className="w-6 h-6" />,
    title: "Prix transparents",
    description:
      "Pas de frais cachés. Le prix que vous calculez est le prix que vous payez. Clair et simple.",
    color: "#342d2d",
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: "Rapidité d'exécution",
    description:
      "Nous traitons votre commande dès sa réception. Pas besoin d'attendre longtemps pour recevoir vos achats.",
    color: "#d4b886",
  },
];

function FeaturesSection() {
  return (
    <section className="relative py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background to-brand-card/30" />
      {/* Subtle pattern */}
      <div className="absolute inset-0 warm-dots opacity-20" />

      <div className="relative z-10 max-w-6xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-gold/10 border border-brand-gold/20 text-brand-gold text-sm font-medium mb-4 font-display">
            <Sparkles className="w-4 h-4" />
            Pourquoi nous choisir
          </div>
          <h2 className="text-3xl sm:text-5xl font-black mb-4 font-heading">
            <span className="text-brand-gold">Pourquoi</span>{" "}
            <span className="text-brand-dark">EUROLUXE ?</span>
          </h2>
          <p className="text-brand-muted-text text-lg max-w-xl mx-auto font-sans">
            Plus qu&apos;un simple intermédiaire. Nous sommes votre partenaire
            de shopping international
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
                className="warm-glass rounded-2xl p-6 sm:p-8 flex gap-5 items-start hover:border-brand-gold/30 transition-all duration-300 group h-full depth-shadow"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"
                  style={{
                    backgroundColor: `${feature.color}15`,
                    color: feature.color,
                  }}
                >
                  {feature.icon}
                </div>
                <div>
                  <h3 className="font-bold text-brand-dark text-lg mb-2 group-hover:text-brand-gold transition-colors font-heading">
                    {feature.title}
                  </h3>
                  <p className="text-brand-muted-text text-sm leading-relaxed font-sans">
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
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-gold/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl sm:text-5xl font-black mb-6 font-heading">
            <span className="text-brand-dark">Prêt à</span>{" "}
            <span className="text-brand-gold">commencer ?</span>
          </h2>
          <p className="text-brand-muted-text text-lg max-w-xl mx-auto mb-10 font-sans">
            N&apos;hésitez plus ! Commencez dès maintenant et calculez le prix
            de votre produit préféré. Un processus simple, rapide et sécurisé.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/calculateur">
              <Button
                size="lg"
                className="bg-brand-gold text-brand-dark hover:bg-brand-gold-light font-bold text-lg rounded-full px-10 py-6 shadow-xl shadow-brand-gold/25 hover:shadow-brand-gold/40 hover:scale-105 transition-all font-display"
              >
                <Calculator className="w-5 h-5 mr-2" />
                Calculez le prix de votre produit
              </Button>
            </Link>
            <Link href="/contact">
              <Button
                size="lg"
                variant="outline"
                className="border-brand-dark/30 text-brand-dark hover:bg-brand-dark hover:text-brand-light font-bold text-lg rounded-full px-10 py-6 hover:scale-105 transition-all font-display"
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
    <div className="relative min-h-screen flex flex-col bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
