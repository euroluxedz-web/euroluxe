"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Globe, ExternalLink, Calculator, Sparkles, Shield } from "lucide-react";
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
  // HIDDEN: numbered image placeholders are disabled site-wide.
  // To re-enable, restore the JSX below.
  return null;
}

export default function BoutiquesPage() {
  const { t, isArabic } = useLanguage();

  const stores = [
    {
      name: "Temu",
      logo: (
        <svg viewBox="0 0 120 40" className="h-8 w-auto" fill="currentColor">
          <text x="0" y="32" fontFamily="Arial Black, sans-serif" fontSize="32" fontWeight="900" fill="#FF6B35">Temu</text>
        </svg>
      ),
      logoBg: "#FFF5F0",
      url: "https://temu.com",
      color: "#FF6B35",
      description: t("shops.temu.desc"),
      category: t("shops.temu.category"),
    },
    {
      name: "SHEIN",
      logo: (
        <svg viewBox="0 0 120 40" className="h-7 w-auto" fill="currentColor">
          <text x="0" y="30" fontFamily="Arial Black, sans-serif" fontSize="28" fontWeight="900" fill="#000000" fontStyle="italic">SHEIN</text>
        </svg>
      ),
      logoBg: "#FFFFFF",
      url: "https://shein.com",
      color: "#000000",
      description: t("shops.shein.desc"),
      category: t("shops.shein.category"),
    },
    {
      name: "ASOS",
      logo: (
        <svg viewBox="0 0 120 40" className="h-8 w-auto" fill="currentColor">
          <text x="0" y="32" fontFamily="Arial Black, sans-serif" fontSize="32" fontWeight="900" fill="#111111">ASOS</text>
        </svg>
      ),
      logoBg: "#F5F5F5",
      url: "https://asos.com",
      color: "#111111",
      description: t("shops.asos.desc"),
      category: t("shops.asos.category"),
    },
    {
      name: "AliExpress",
      logo: (
        <svg viewBox="0 0 140 40" className="h-7 w-auto" fill="currentColor">
          <text x="0" y="30" fontFamily="Arial Black, sans-serif" fontSize="26" fontWeight="900" fill="#FF4747">Ali</text>
          <text x="55" y="30" fontFamily="Arial Black, sans-serif" fontSize="26" fontWeight="900" fill="#FF8C00">Express</text>
        </svg>
      ),
      logoBg: "#FFF5F5",
      url: "https://aliexpress.com",
      color: "#FF4747",
      description: t("shops.aliexpress.desc"),
      category: t("shops.aliexpress.category"),
    },
  ];

  return (
    <div className="relative min-h-screen flex flex-col bg-transparent text-foreground overflow-x-hidden">
      <Navbar />
      <main className="flex-1 pt-16 sm:pt-20">
        <section className="relative py-20 sm:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-blue/20 via-brand-blue-light/15 to-white/60" />
          <div className="absolute top-20 right-[10%] w-64 h-64 bg-brand-pink/8 rounded-full blur-3xl" />
          <div className="absolute bottom-20 left-[15%] w-48 h-48 bg-brand-gold/8 rounded-full blur-3xl" />

          <div className="relative z-10 max-w-7xl mx-auto px-4">
            {/* Hero with flanking images */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16 relative"
            >
              <div className="flex items-center justify-center gap-6">
                {/* Left flanking image */}
                <div className="hidden md:block">
                  <ImgPlaceholder
                    number={24}
                    className="w-[180px] h-[220px] rounded-2xl rotate-[-5deg]"
                  />
                </div>

                <div>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-pink/10 border border-brand-pink/20 text-brand-pink text-sm font-medium mb-4 font-display">
                    <Globe className="w-4 h-4" />
                    {t("shops.badge")}
                  </div>
                  <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black mb-4 font-heading">
                    <span className="text-brand-dark">{t("shops.titleBuy")}</span>{" "}
                    <span className="bg-brand-gold/30 px-2 py-1 rounded-md text-brand-dark">
                      {t("shops.titleAnywhere")}
                    </span>
                  </h1>
                  <p className="text-brand-muted-text text-lg max-w-xl mx-auto font-sans">
                    {t("shops.subtitle")}
                  </p>
                </div>

                {/* Right flanking image */}
                <div className="hidden md:block">
                  <ImgPlaceholder
                    number={25}
                    className="w-[180px] h-[220px] rounded-2xl rotate-[5deg]"
                  />
                </div>
              </div>
            </motion.div>

            {/* Stores Grid - 4 boutiques */}
            <div className="grid grid-cols-1 sm:grid-cols-2 max-w-4xl mx-auto gap-6 mb-16">
              {stores.map((store, i) => (
                <motion.div
                  key={store.name}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  whileHover={{ y: -5 }}
                >
                  <div
                    className="bg-white rounded-3xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 group h-full flex flex-col"
                    style={{ borderTop: `4px solid ${store.color}` }}
                  >
                    {/* Logo header area */}
                    <div
                      className="h-32 flex items-center justify-center relative overflow-hidden"
                      style={{ backgroundColor: store.logoBg }}
                    >
                      <div
                        className="absolute inset-0 opacity-5"
                        style={{ backgroundColor: store.color }}
                      />
                      <div className="relative z-10 transform group-hover:scale-110 transition-transform duration-300" style={{ color: store.color }}>
                        {store.logo}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 text-center flex-1 flex flex-col">
                      {/* Category badge */}
                      <div className="flex justify-center mb-3">
                        <span
                          className="text-[10px] px-3 py-1 rounded-full font-medium font-display"
                          style={{
                            backgroundColor: `${store.color}15`,
                            color: store.color,
                          }}
                        >
                          {store.category}
                        </span>
                      </div>

                      <h3 className="font-bold text-brand-dark text-xl mb-2 group-hover:text-brand-pink transition-colors font-heading">
                        {store.name}
                      </h3>

                      <p className="text-brand-muted-text text-sm mb-4 font-sans flex-1">
                        {store.description}
                      </p>

                      <Link href="/calculateur" className="mt-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-brand-muted-text/70 hover:text-brand-pink group-hover:text-brand-pink hover:bg-brand-pink/5 transition-colors font-display"
                        >
                          <Calculator className={`w-4 h-4 ${isArabic ? "ml-1" : "mr-1"}`} />
                          {t("shops.calculate")}
                          <ExternalLink className={`w-3 h-3 ${isArabic ? "mr-1" : "ml-1"}`} />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Bottom section - 2x2 product grid with pink borders */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-12"
            >
              <h3 className="text-center text-xl font-bold font-heading text-brand-dark mb-6">
                {isArabic ? "منتجات مميزة" : "Produits populaires"}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
                <ImgPlaceholder number={28} className="w-full h-[160px] rounded-xl" pink />
                <ImgPlaceholder number={29} className="w-full h-[160px] rounded-xl" pink />
                <ImgPlaceholder number={30} className="w-full h-[160px] rounded-xl" pink />
                <ImgPlaceholder number={31} className="w-full h-[160px] rounded-xl" pink />
              </div>
            </motion.div>

            {/* Trust note card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="max-w-lg mx-auto"
            >
              <div className="bg-white rounded-2xl p-6 shadow-md border border-brand-pink/10 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-brand-pink/10 flex items-center justify-center shrink-0">
                  <Shield className="w-6 h-6 text-brand-pink" />
                </div>
                <div>
                  <p className="text-brand-dark font-bold font-heading mb-1">
                    {isArabic ? "ثقة وأمان" : "Confiance & Sécurité"}
                  </p>
                  <p className="text-brand-muted-text text-sm font-sans">
                    {t("shops.trustNote")}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="text-center mt-12"
            >
              <Link href="/calculateur">
                <Button
                  size="lg"
                  className="bg-brand-pink text-white hover:bg-brand-pink-light font-bold rounded-full px-8 shadow-xl shadow-brand-pink/25 hover:shadow-brand-pink/40 hover:scale-105 transition-all font-display"
                >
                  <Calculator className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`} />
                  {t("shops.calcNow")}
                </Button>
              </Link>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
