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
import { useLanguage } from "@/components/language-provider";

/* ─────────────────── HERO SECTION ─────────────────── */
function HeroSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const { t, isArabic } = useLanguage();

  const storeLogos = [
    { name: "Temu", emoji: "🛍️", delay: 0 },
    { name: "AliExpress", emoji: "🌐", delay: 0.1 },
  ];

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex justify-center overflow-hidden"
    >
      {/* Sky gradient background */}
      <motion.div style={{ y }} className="absolute inset-0 bg-gradient-to-b from-brand-blue via-brand-blue-light to-white" />

      {/* Decorative floating shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 2 }}>
        <div className="absolute top-20 left-[10%] w-64 h-64 bg-brand-pink/15 rounded-full blur-3xl" />
        <div className="absolute top-40 right-[15%] w-48 h-48 bg-brand-gold/15 rounded-full blur-3xl" />
        <div className="absolute bottom-32 left-[20%] w-56 h-56 bg-brand-pink/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-[10%] w-72 h-72 bg-brand-gold/10 rounded-full blur-3xl" />
        <div className="absolute top-[30%] left-[50%] w-40 h-40 bg-brand-blue-mid/10 rounded-full blur-2xl" />
      </div>

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
          <span className="font-heading text-brand-muted-text text-sm tracking-[0.3em] uppercase font-medium">
            {t("home.hero.welcome")}
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-5xl sm:text-7xl lg:text-9xl font-black mb-6 leading-tight font-heading"
        >
          <span className="text-brand-dark">EURO</span>
          <span className="gold-text">LUXE</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-lg sm:text-2xl text-brand-muted-text mb-4 font-sans font-light max-w-3xl mx-auto leading-relaxed"
        >
          {t("home.hero.subtitle")}
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="text-base sm:text-lg text-brand-pink font-display font-medium mb-10"
        >
          {t("home.hero.stores")}
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
              className="bg-brand-pink text-white hover:bg-brand-pink-light font-bold text-lg rounded-full px-10 py-6 shadow-xl shadow-brand-pink/25 hover:shadow-brand-pink/40 hover:scale-105 transition-all font-display"
            >
              <Calculator className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`} />
              {t("home.hero.ctaCalculator")}
            </Button>
          </Link>
          <Link href="/boutiques">
            <Button
              size="lg"
              variant="outline"
              className="border-brand-pink/30 text-brand-dark hover:bg-brand-pink hover:text-white font-bold text-lg rounded-full px-10 py-6 hover:scale-105 transition-all font-display"
            >
              <Globe className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`} />
              {t("home.hero.ctaBoutiques")}
            </Button>
          </Link>
        </motion.div>

        {/* Floating store logos badges */}
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
              className="bg-white/80 backdrop-blur-md rounded-xl px-5 py-3 flex items-center gap-3 cursor-default border border-brand-pink/20 shadow-sm"
              style={{ transformStyle: "preserve-3d" }}
            >
              <span className="text-2xl">{store.emoji}</span>
              <span className="text-brand-dark/80 text-sm font-medium font-display">
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
        <ChevronDown className="w-8 h-8 text-brand-pink/50" />
      </motion.div>
    </section>
  );
}

/* ─────────────────── FEATURES SECTION ─────────────────── */
function FeaturesSection() {
  const { t, isArabic } = useLanguage();

  const features = [
    {
      icon: <Shield className="w-6 h-6" />,
      title: t("home.features.security.title"),
      description: t("home.features.security.desc"),
      color: "#FF69B4",
    },
    {
      icon: <Truck className="w-6 h-6" />,
      title: t("home.features.delivery.title"),
      description: t("home.features.delivery.desc"),
      color: "#E6F2FF",
    },
    {
      icon: <Calculator className="w-6 h-6" />,
      title: t("home.features.price.title"),
      description: t("home.features.price.desc"),
      color: "#2D3748",
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: t("home.features.speed.title"),
      description: t("home.features.speed.desc"),
      color: "#FFD700",
    },
  ];

  return (
    <section className="relative py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white to-brand-blue-light/20" />

      <div className="relative z-10 max-w-6xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-pink/10 border border-brand-pink/20 text-brand-pink text-sm font-medium mb-4 font-display">
            <Sparkles className="w-4 h-4" />
            {t("home.features.badge")}
          </div>
          <h2 className="text-3xl sm:text-5xl font-black mb-4 font-heading">
            <span className="text-brand-pink">{t("home.features.titleWhy")}</span>{" "}
            <span className="text-brand-dark">{t("home.features.titleEul")}</span>
          </h2>
          <p className="text-brand-muted-text text-lg max-w-xl mx-auto font-sans">
            {t("home.features.subtitle")}
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
                className="bg-white rounded-2xl p-6 sm:p-8 flex gap-5 items-start border border-brand-muted-warm/50 shadow-sm hover:shadow-md hover:border-brand-pink/30 transition-all duration-300 group h-full"
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
                  <h3 className="font-bold text-brand-dark text-lg mb-2 group-hover:text-brand-pink transition-colors font-heading">
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
  const { t, isArabic } = useLanguage();

  return (
    <section className="relative py-20 sm:py-32 overflow-hidden">
      {/* Sky gradient with decorative circles */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-blue-light/30 via-white to-brand-blue/20">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-brand-pink/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-brand-gold/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl sm:text-5xl font-black mb-6 font-heading">
            <span className="text-brand-dark">{t("home.cta.titleReady")}</span>{" "}
            <span className="text-brand-pink">{t("home.cta.titleStart")}</span>
          </h2>
          <p className="text-brand-muted-text text-lg max-w-xl mx-auto mb-10 font-sans">
            {t("home.cta.subtitle")}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/calculateur">
              <Button
                size="lg"
                className="bg-brand-pink text-white hover:bg-brand-pink-light font-bold text-lg rounded-full px-10 py-6 shadow-xl shadow-brand-pink/25 hover:shadow-brand-pink/40 hover:scale-105 transition-all font-display"
              >
                <Calculator className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`} />
                {t("home.cta.calculator")}
              </Button>
            </Link>
            <Link href="/contact">
              <Button
                size="lg"
                variant="outline"
                className="border-brand-dark/30 text-brand-dark hover:bg-brand-dark hover:text-white font-bold text-lg rounded-full px-10 py-6 hover:scale-105 transition-all font-display"
              >
                {t("home.cta.contact")}
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
