"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import Link from "next/link";
import {
  Calculator,
  Globe,
  ChevronDown,
  Sparkles,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { useLanguage } from "@/components/language-provider";

/* ── Placeholder Image Component ── */
function ImgPlaceholder({
  number,
  className = "",
  pink = false,
}: {
  number: number;
  className?: string;
  pink?: boolean;
}) {
  return (
    <div
      className={`bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl shadow-lg flex items-center justify-center overflow-hidden ${
        pink
          ? "border-2 border-brand-pink/40"
          : "border-2 border-dashed border-gray-300"
      } ${className}`}
    >
      <div className="text-center">
        <span className="text-5xl font-black text-gray-300">{number}</span>
        <p className="text-xs text-gray-400 mt-1">Image</p>
      </div>
    </div>
  );
}

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

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex justify-center overflow-hidden"
    >
      {/* Sky gradient background */}
      <motion.div
        style={{ y }}
        className="absolute inset-0 bg-gradient-to-b from-brand-blue via-brand-blue-light to-white"
      />

      {/* Decorative floating shapes */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ zIndex: 2 }}
      >
        <div className="absolute top-20 left-[10%] w-64 h-64 bg-brand-pink/15 rounded-full blur-3xl" />
        <div className="absolute top-40 right-[15%] w-48 h-48 bg-brand-gold/15 rounded-full blur-3xl" />
        <div className="absolute bottom-32 left-[20%] w-56 h-56 bg-brand-pink/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-[10%] w-72 h-72 bg-brand-gold/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        style={{ opacity, zIndex: 10 }}
        className="relative max-w-7xl mx-auto px-4 text-center pt-24 sm:pt-28 w-full"
      >
        {/* Image Collage - absolute positioned around the text */}
        <div className="absolute inset-0 pointer-events-none hidden lg:block">
          {/* Image #1: Top-left area */}
          <ImgPlaceholder
            number={1}
            className="absolute top-[8%] left-[3%] w-[200px] h-[250px] rotate-[-6deg] z-0"
          />
          {/* Image #2: Bottom-left area */}
          <ImgPlaceholder
            number={2}
            className="absolute bottom-[15%] left-[8%] w-[160px] h-[160px] rotate-[4deg] z-0"
          />
          {/* Image #3: Top-right area */}
          <ImgPlaceholder
            number={3}
            className="absolute top-[5%] right-[5%] w-[220px] h-[260px] rotate-[5deg] z-0"
          />
          {/* Image #4: Bottom-right area */}
          <ImgPlaceholder
            number={4}
            className="absolute bottom-[12%] right-[6%] w-[150px] h-[180px] rotate-[-3deg] z-0"
          />
          {/* Image #5: Center-left behind text */}
          <ImgPlaceholder
            number={5}
            className="absolute top-[35%] left-[18%] w-[180px] h-[220px] rotate-[3deg] z-0"
          />
          {/* Image #6: Far right */}
          <ImgPlaceholder
            number={6}
            className="absolute top-[30%] right-[2%] w-[200px] h-[240px] rotate-[-4deg] z-0"
          />
        </div>

        {/* Center text block */}
        <div className="relative z-10">
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
            <span className="bg-brand-gold px-3 py-1 rounded-lg text-brand-dark">
              LUXE
            </span>
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

          {/* CTA Buttons - Rounded Pills */}
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
                <Calculator
                  className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`}
                />
                {t("home.hero.ctaCalculator")}
              </Button>
            </Link>
            <Link href="/boutiques">
              <Button
                size="lg"
                variant="outline"
                className="border-brand-pink/30 text-brand-dark hover:bg-brand-pink hover:text-white font-bold text-lg rounded-full px-10 py-6 hover:scale-105 transition-all font-display"
              >
                <Globe
                  className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`}
                />
                {t("home.hero.ctaBoutiques")}
              </Button>
            </Link>
          </motion.div>
        </div>
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

/* ─────────────────── SECTION 2: "Comment ça marche" Preview ─────────────────── */
function HowItWorksSection() {
  const { t, isArabic } = useLanguage();

  return (
    <section className="relative py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white to-brand-blue-light/20" />

      <div className="relative z-10 max-w-7xl mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
          {/* Left side - 2x2 Image Grid */}
          <motion.div
            initial={{ opacity: 0, x: isArabic ? 40 : -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="w-full lg:w-1/2"
          >
            <div className="grid grid-cols-2 gap-4">
              <ImgPlaceholder number={7} className="w-full h-[220px] rounded-xl" />
              <ImgPlaceholder number={8} className="w-full h-[220px] rounded-xl" />
              <ImgPlaceholder number={9} className="w-full h-[220px] rounded-xl" />
              <ImgPlaceholder number={10} className="w-full h-[220px] rounded-xl" />
            </div>
          </motion.div>

          {/* Right side - Text */}
          <motion.div
            initial={{ opacity: 0, x: isArabic ? -40 : 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="w-full lg:w-1/2"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-pink/10 border border-brand-pink/20 text-brand-pink text-sm font-medium mb-4 font-display">
              <Sparkles className="w-4 h-4" />
              {t("how.badge")}
            </div>

            <h2 className="text-3xl sm:text-5xl font-black mb-4 font-heading">
              <span className="text-brand-dark">{t("how.titleSteps")}</span>{" "}
              <span className="bg-brand-gold/30 px-2 py-1 rounded-md text-brand-dark">
                {t("how.titleOnly")}
              </span>
            </h2>

            <p className="text-brand-muted-text text-lg mb-6 font-sans leading-relaxed">
              {t("how.subtitle")}
            </p>

            {/* Note card with shadow */}
            <div className="bg-white rounded-2xl p-5 shadow-md border border-brand-pink/10 mb-6 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-gold/20 flex items-center justify-center shrink-0">
                <Lightbulb className="w-5 h-5 text-brand-gold" />
              </div>
              <div>
                <p className="text-brand-dark font-bold text-sm font-heading mb-1">
                  {isArabic ? "نصيحة" : "Astuce"}
                </p>
                <p className="text-brand-muted-text text-sm font-sans">
                  {isArabic
                    ? "الصق رمز منتج Temu للحصول على السعر تلقائياً"
                    : "Collez le code produit Temu pour obtenir le prix automatiquement"}
                </p>
              </div>
            </div>

            <Link href="/comment-ca-marche">
              <Button className="bg-brand-pink text-white hover:bg-brand-pink-light font-bold rounded-full px-8 py-3 shadow-xl shadow-brand-pink/25 hover:shadow-brand-pink/40 hover:scale-105 transition-all font-display">
                {isArabic ? "اكتشف الخطوات" : "Découvrir les étapes"}
                <ArrowRight
                  className={`w-4 h-4 ${isArabic ? "mr-2 rotate-180" : "ml-2"}`}
                />
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── SECTION 3: "Nos Boutiques" ─────────────────── */
function BoutiquesSection() {
  const { t, isArabic } = useLanguage();

  return (
    <section className="relative py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-brand-blue-light/20 via-brand-blue/10 to-white" />

      <div className="relative z-10 max-w-7xl mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-12">
          {/* Left side - Text */}
          <motion.div
            initial={{ opacity: 0, x: isArabic ? 40 : -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="w-full lg:w-1/3"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-pink/10 border border-brand-pink/20 text-brand-pink text-sm font-medium mb-4 font-display">
              <Globe className="w-4 h-4" />
              {t("shops.badge")}
            </div>

            <h2 className="text-3xl sm:text-4xl font-black mb-4 font-heading">
              <span className="text-brand-dark">{t("shops.titleBuy")}</span>{" "}
              <span className="bg-brand-gold/30 px-2 py-1 rounded-md text-brand-dark">
                {t("shops.titleAnywhere")}
              </span>
            </h2>

            <p className="text-brand-muted-text text-lg mb-6 font-sans leading-relaxed">
              {t("shops.subtitle")}
            </p>

            <Link href="/boutiques">
              <Button className="bg-brand-pink text-white hover:bg-brand-pink-light font-bold rounded-full px-8 py-3 shadow-xl shadow-brand-pink/25 hover:shadow-brand-pink/40 hover:scale-105 transition-all font-display">
                {t("home.hero.ctaBoutiques")}
                <ArrowRight
                  className={`w-4 h-4 ${isArabic ? "mr-2 rotate-180" : "ml-2"}`}
                />
              </Button>
            </Link>
          </motion.div>

          {/* Center - Large image on pink circular platform */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="w-full lg:w-1/3 flex justify-center"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-brand-pink/20 rounded-full blur-3xl scale-110" />
              <ImgPlaceholder
                number={11}
                className="relative w-[280px] h-[340px] rounded-3xl z-10"
              />
            </div>
          </motion.div>

          {/* Right side - 2x2 grid with pink borders */}
          <motion.div
            initial={{ opacity: 0, x: isArabic ? -40 : 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="w-full lg:w-1/3"
          >
            <div className="grid grid-cols-2 gap-4">
              <ImgPlaceholder number={12} className="w-full h-[160px] rounded-xl" pink />
              <ImgPlaceholder number={13} className="w-full h-[160px] rounded-xl" pink />
              <ImgPlaceholder number={14} className="w-full h-[160px] rounded-xl" pink />
              <ImgPlaceholder number={15} className="w-full h-[160px] rounded-xl" pink />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── SECTION 4: "Calculateur de prix" ─────────────────── */
function CalculatorSection() {
  const { t, isArabic } = useLanguage();

  return (
    <section className="relative py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white to-brand-blue-light/20" />

      <div className="relative z-10 max-w-7xl mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
          {/* Left side - Image collage */}
          <motion.div
            initial={{ opacity: 0, x: isArabic ? 40 : -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="w-full lg:w-1/2 relative min-h-[400px]"
          >
            <ImgPlaceholder
              number={16}
              className="absolute top-0 left-0 w-[240px] h-[300px] rounded-2xl rotate-[-3deg] z-10"
            />
            <ImgPlaceholder
              number={17}
              className="absolute top-8 right-0 w-[200px] h-[250px] rounded-2xl rotate-[4deg] z-20"
            />
            <ImgPlaceholder
              number={18}
              className="absolute bottom-0 left-[20%] w-[180px] h-[200px] rounded-2xl rotate-[-2deg] z-30"
            />
          </motion.div>

          {/* Right side - White card with shadow */}
          <motion.div
            initial={{ opacity: 0, x: isArabic ? -40 : 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="w-full lg:w-1/2"
          >
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-lg border border-brand-pink/10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-pink/10 border border-brand-pink/20 text-brand-pink text-sm font-medium mb-4 font-display">
                <Calculator className="w-4 h-4" />
                {t("calc.badge")}
              </div>

              <h2 className="text-3xl sm:text-4xl font-black mb-4 font-heading">
                <span className="text-brand-dark">{t("calc.titleCalc")}</span>{" "}
                <span className="bg-brand-gold/30 px-2 py-1 rounded-md text-brand-dark">
                  {t("calc.titleProduct")}
                </span>
              </h2>

              <p className="text-brand-muted-text text-base mb-6 font-sans leading-relaxed">
                {t("calc.subtitle")}
              </p>

              {/* Small note box */}
              <div className="bg-brand-card rounded-xl p-4 border border-brand-gold/20 mb-6 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-gold/20 flex items-center justify-center shrink-0">
                  <Lightbulb className="w-4 h-4 text-brand-gold" />
                </div>
                <p className="text-brand-muted-text text-sm font-sans">
                  {t("calc.hint")}
                </p>
              </div>

              <Link href="/calculateur">
                <Button className="bg-brand-pink text-white hover:bg-brand-pink-light font-bold rounded-full px-8 py-3 shadow-xl shadow-brand-pink/25 hover:shadow-brand-pink/40 hover:scale-105 transition-all font-display">
                  <Calculator
                    className={`w-4 h-4 ${isArabic ? "ml-2" : "mr-2"}`}
                  />
                  {t("nav.calculateur")}
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── SECTION 5: "Prêt à commencer?" ─────────────────── */
function CTASection() {
  const { t, isArabic } = useLanguage();

  return (
    <section className="relative py-20 sm:py-32 overflow-hidden">
      {/* Sky gradient with decorative circles */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-blue-light/30 via-white to-brand-blue/20">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-brand-pink/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-brand-gold/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
          {/* Left side - Text */}
          <motion.div
            initial={{ opacity: 0, x: isArabic ? 40 : -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="w-full lg:w-1/2"
          >
            <h2 className="text-3xl sm:text-5xl font-black mb-6 font-heading">
              <span className="text-brand-dark">{t("home.cta.titleReady")}</span>{" "}
              <span className="bg-brand-gold/30 px-2 py-1 rounded-md text-brand-dark">
                {t("home.cta.titleStart")}
              </span>
            </h2>
            <p className="text-brand-muted-text text-lg max-w-xl mb-8 font-sans leading-relaxed">
              {t("home.cta.subtitle")}
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/calculateur">
                <Button
                  size="lg"
                  className="bg-brand-pink text-white hover:bg-brand-pink-light font-bold text-lg rounded-full px-10 py-6 shadow-xl shadow-brand-pink/25 hover:shadow-brand-pink/40 hover:scale-105 transition-all font-display"
                >
                  <Calculator
                    className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`}
                  />
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

          {/* Right side - Image + note card */}
          <motion.div
            initial={{ opacity: 0, x: isArabic ? -40 : 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="w-full lg:w-1/2"
          >
            <div className="relative">
              <ImgPlaceholder number={19} className="w-full h-[400px] rounded-3xl" />
              {/* Small note card */}
              <div className="absolute -bottom-6 -right-4 sm:right-4 bg-white rounded-2xl p-4 shadow-lg border border-brand-pink/15 max-w-[200px] z-10">
                <p className="text-brand-pink font-bold text-sm font-heading mb-1">
                  {isArabic ? "سريع وموثوق" : "Rapide & Fiable"}
                </p>
                <p className="text-brand-muted-text text-xs font-sans">
                  {isArabic
                    ? "نتولى كل شيء من أجلك"
                    : "On s'occupe de tout pour vous"}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
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
        <HowItWorksSection />
        <BoutiquesSection />
        <CalculatorSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
