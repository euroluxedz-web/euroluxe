"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Globe, ExternalLink, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card3D } from "@/components/card-3d";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { useLanguage } from "@/components/language-provider";

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
    },
    {
      name: "AliExpress",
      logo: "🌐",
      url: "https://aliexpress.com",
      color: "#FF4747",
      description: t("shops.aliexpress.desc"),
      category: t("shops.aliexpress.category"),
    },
  ];

  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <main className="flex-1 pt-16 sm:pt-20">
        <section className="relative py-20 sm:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-brand-gold/3 to-background" />
          <div className="absolute inset-0 warm-dots opacity-15" />

          <div className="relative z-10 max-w-7xl mx-auto px-4">
            {/* Section Header */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-gold/10 border border-brand-gold/20 text-brand-gold text-sm font-medium mb-4 font-display">
                <Globe className="w-4 h-4" />
                {t("shops.badge")}
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black mb-4 font-heading">
                <span className="text-brand-dark">{t("shops.titleBuy")}</span>{" "}
                <span className="text-brand-gold">{t("shops.titleAnywhere")}</span>
              </h1>
              <p className="text-brand-muted-text text-lg max-w-xl mx-auto font-sans">
                {t("shops.subtitle")}
              </p>
            </motion.div>

            {/* Stores Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto gap-6">
              {stores.map((store, i) => (
                <motion.div
                  key={store.name}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                >
                  <Card3D className="rounded-2xl">
                    <div className="warm-glass rounded-2xl p-6 text-center hover:border-brand-gold/30 transition-all duration-300 cursor-pointer group depth-shadow h-full relative overflow-hidden">
                      {/* Glow effect on hover */}
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{
                          background: `radial-gradient(circle at center, ${store.color}10, transparent 70%)`,
                        }}
                      />

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
                        className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center text-4xl mb-4 relative z-10 group-hover:scale-110 transition-transform duration-300"
                        style={{ backgroundColor: `${store.color}10` }}
                      >
                        {store.logo}
                      </div>

                      {/* Store name */}
                      <h3 className="font-bold text-brand-dark text-xl mb-2 group-hover:text-brand-gold transition-colors relative z-10 font-heading">
                        {store.name}
                      </h3>

                      {/* Description */}
                      <p className="text-brand-muted-text text-sm mb-4 relative z-10 font-sans">
                        {store.description}
                      </p>

                      {/* Action link */}
                      <Link href="/calculateur">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-brand-muted-text/50 hover:text-brand-gold group-hover:text-brand-gold transition-colors relative z-10 font-display"
                        >
                          <Calculator className={`w-4 h-4 ${isArabic ? "ml-1" : "mr-1"}`} />
                          {t("shops.calculate")}
                          <ExternalLink className={`w-3 h-3 ${isArabic ? "mr-1" : "ml-1"}`} />
                        </Button>
                      </Link>
                    </div>
                  </Card3D>
                </motion.div>
              ))}
            </div>

            {/* Bottom note */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="text-center mt-12"
            >
              <p className="text-brand-muted-text/60 text-sm mb-6 font-sans">
                {t("shops.trustNote")}
              </p>

              <div className="mt-6">
                <Link href="/calculateur">
                  <Button
                    size="lg"
                    className="bg-brand-gold text-brand-dark hover:bg-brand-gold-light font-bold rounded-full px-8 shadow-xl shadow-brand-gold/25 hover:shadow-brand-gold/40 hover:scale-105 transition-all font-display"
                  >
                    <Calculator className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`} />
                    {t("shops.calcNow")}
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
