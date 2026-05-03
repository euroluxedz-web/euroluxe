"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Globe, ExternalLink, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card3D } from "@/components/card-3d";
import { Y2KStar, FloatingStars } from "@/components/y2k-star";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

const stores = [
  {
    name: "Temu",
    logo: "🛍️",
    url: "https://temu.com",
    color: "#FF6B35",
    description: "Des prix irrésistibles sur tout — mode, tech, maison et plus",
    category: "General",
  },
  {
    name: "AliExpress",
    logo: "🌐",
    url: "https://aliexpress.com",
    color: "#FF4747",
    description: "Le plus grand marché en ligne chinois avec des millions de produits",
    category: "General",
  },
  {
    name: "Amazon",
    logo: "📦",
    url: "https://amazon.com",
    color: "#FF9900",
    description: "La plus grande boutique en ligne au monde — tout est disponible",
    category: "General",
  },
  {
    name: "Shein",
    logo: "👗",
    url: "https://shein.com",
    color: "#E60023",
    description: "Les dernières tendances mode à petits prix — livraison mondiale",
    category: "Mode",
  },
  {
    name: "eBay",
    logo: "🏷️",
    url: "https://ebay.com",
    color: "#86B817",
    description: "Enchères et offres infinies — trouvez des pièces uniques",
    category: "Enchères",
  },
  {
    name: "Wish",
    logo: "⭐",
    url: "https://wish.com",
    color: "#2FB7EC",
    description: "Achetez au meilleur prix — offres quotidiennes et réductions",
    category: "Discount",
  },
  {
    name: "Banggood",
    logo: "🔧",
    url: "https://banggood.com",
    color: "#D61920",
    description: "Électronique et outils à prix compétitifs — qualité garantie",
    category: "Tech",
  },
  {
    name: "LightInTheBox",
    logo: "💡",
    url: "https://lightinthebox.com",
    color: "#1A8CCC",
    description: "Mode, électronique et décoration — expédition mondiale",
    category: "General",
  },
];

export default function BoutiquesPage() {
  return (
    <div className="relative min-h-screen flex flex-col bg-pure-black text-foreground overflow-x-hidden">
      <FloatingStars />
      <Navbar />
      <main className="flex-1 pt-16 sm:pt-20">
        <section className="relative py-20 sm:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-indigo/5 to-background" />
          <div className="scanline-animated absolute inset-0 pointer-events-none" />

          <div className="relative z-10 max-w-7xl mx-auto px-4">
            {/* Section Header */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyber-pink/10 border border-cyber-pink/20 text-cyber-pink text-sm font-medium mb-4">
                <Globe className="w-4 h-4" />
                Boutiques mondiales
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black mb-4">
                <span className="chrome-text">Achetez depuis</span>{" "}
                <span className="text-cyber-pink">n&apos;importe où</span>
              </h1>
              <p className="text-frosted-chrome/60 text-lg max-w-xl mx-auto">
                Nous pouvons acheter pour vous depuis plus de 100+ boutiques mondiales. Voici les plus populaires
              </p>
            </motion.div>

            {/* Stores Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {stores.map((store, i) => (
                <motion.div
                  key={store.name}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                >
                  <Card3D className="rounded-2xl">
                    <div className="frosted-glass rounded-2xl p-6 text-center hover:border-acid-lime/40 transition-all duration-300 cursor-pointer group depth-shadow h-full relative overflow-hidden">
                      {/* Glow effect on hover */}
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{
                          background: `radial-gradient(circle at center, ${store.color}15, transparent 70%)`,
                        }}
                      />

                      {/* Category badge */}
                      <div className="absolute top-3 right-3">
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: `${store.color}20`,
                            color: store.color,
                          }}
                        >
                          {store.category}
                        </span>
                      </div>

                      {/* Store logo */}
                      <div
                        className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center text-4xl mb-4 relative z-10 group-hover:scale-110 transition-transform duration-300"
                        style={{ backgroundColor: `${store.color}15` }}
                      >
                        {store.logo}
                      </div>

                      {/* Store name */}
                      <h3 className="font-bold text-frosted-chrome text-xl mb-2 group-hover:text-acid-lime transition-colors relative z-10">
                        {store.name}
                      </h3>

                      {/* Description */}
                      <p className="text-frosted-chrome/40 text-sm mb-4 relative z-10">
                        {store.description}
                      </p>

                      {/* Action link */}
                      <Link href="/calculateur">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-frosted-chrome/30 hover:text-acid-lime group-hover:text-acid-lime transition-colors relative z-10"
                        >
                          <Calculator className="w-4 h-4 mr-1" />
                          Calculer
                          <ExternalLink className="w-3 h-3 ml-1" />
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
              <p className="text-frosted-chrome/40 text-sm mb-6">
                ✦ Et bien d&apos;autres boutiques disponibles sur demande ✦
              </p>

              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                className="inline-block"
              >
                <Y2KStar size={24} className="text-acid-lime/30" />
              </motion.div>

              <div className="mt-6">
                <Link href="/calculateur">
                  <Button
                    size="lg"
                    className="bg-acid-lime text-pure-black hover:bg-acid-lime/90 font-bold rounded-full px-8 shadow-xl shadow-acid-lime/30 hover:shadow-acid-lime/50 hover:scale-105 transition-all"
                  >
                    <Calculator className="w-5 h-5 mr-2" />
                    Calculer le prix maintenant
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
