"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Globe, ExternalLink, Calculator, Sparkles, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { useLanguage } from "@/components/language-provider";

/* ── Image Component with Y2K Style Images ── */
const imageMap: Record<number, string> = {
  24: "/images/boutiques-hero-1.png",
  25: "/images/boutiques-hero-2.png",
  26: "/images/temu-store.png",
  27: "/images/aliexpress-store.png",
  28: "/images/product-1.png",
  29: "/images/product-2.png",
  30: "/images/product-3.png",
  31: "/images/product-4.png",
};

function ImgPlaceholder({
  number,
  className = "",
  pink = false,
}: {
  number: number;
  className?: string;
  pink?: boolean;
}) {
  const src = imageMap[number];
  return (
    <div
      className={`rounded-2xl shadow-lg overflow-hidden ${
        pink
          ? "border-2 border-brand-pink/40"
          : ""
      } ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={`EUROLUXE ${number}`}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          <span className="text-5xl font-black text-gray-300">{number}</span>
        </div>
      )}
    </div>
  );
}

export default function BoutiquesPage() {
  const { t, isArabic } = useLanguage();

  const stores = [
    {
      name: "Temu",
      logo: "🛍️",
      url: "https://temu.com",
      color: "#FF6B35",
      description: t("shops.temu.desc"),
      category: t("shops.temu.category"),
      imageNumber: 26,
    },
    {
      name: "AliExpress",
      logo: "🌐",
      url: "https://aliexpress.com",
      color: "#FF4747",
      description: t("shops.aliexpress.desc"),
      category: t("shops.aliexpress.category"),
      imageNumber: 27,
    },
  ];

  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <main className="flex-1 pt-16 sm:pt-20">
        <section className="relative py-20 sm:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-blue/30 via-brand-blue-light/20 to-white" />
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

            {/* Stores Grid - with image placeholders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 max-w-3xl mx-auto gap-8 mb-16">
              {stores.map((store, i) => (
                <motion.div
                  key={store.name}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.15, duration: 0.5 }}
                >
                  <div className="bg-white rounded-3xl overflow-hidden shadow-md border border-brand-muted-warm/50 hover:border-brand-pink/30 hover:shadow-lg transition-all duration-300 group">
                    {/* Image placeholder area */}
                    <ImgPlaceholder
                      number={store.imageNumber}
                      className="w-full h-[200px] rounded-none rounded-t-3xl"
                    />

                    {/* Content */}
                    <div className="p-6 text-center relative">
                      {/* Category badge */}
                      <div className={`absolute top-3 ${isArabic ? "left-3" : "right-3"}`}>
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium font-display"
                          style={{
                            backgroundColor: `${store.color}15`,
                            color: store.color,
                          }}
                        >
                          {store.category}
                        </span>
                      </div>

                      {/* Store logo */}
                      <div
                        className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-3xl mb-3 group-hover:scale-110 transition-transform duration-300 -mt-12 relative z-10 shadow-lg"
                        style={{ backgroundColor: `${store.color}10` }}
                      >
                        {store.logo}
                      </div>

                      <h3 className="font-bold text-brand-dark text-xl mb-2 group-hover:text-brand-pink transition-colors font-heading">
                        {store.name}
                      </h3>

                      <p className="text-brand-muted-text text-sm mb-4 font-sans">
                        {store.description}
                      </p>

                      <Link href="/calculateur">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-brand-muted-text/50 hover:text-brand-pink group-hover:text-brand-pink transition-colors font-display"
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
