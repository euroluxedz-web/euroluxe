"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Calculator,
  Zap,
  CheckCircle2,
  Copy,
  AlertCircle,
  ExternalLink,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Y2KStar, FloatingStars } from "@/components/y2k-star";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

interface PriceResult {
  usd: number;
  dzd: number;
  productName?: string;
}

export default function CalculateurPage() {
  const [productUrl, setProductUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PriceResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleAnalyze = async () => {
    setError("");
    setResult(null);

    if (!productUrl.trim()) {
      setError("Veuillez coller le lien du produit");
      return;
    }

    // Basic URL validation
    try {
      new URL(productUrl);
    } catch {
      setError("Veuillez entrer un lien valide (ex: https://...)");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/scrape-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: productUrl }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setError(data.error || "Impossible d'extraire le prix. Veuillez réessayer.");
        return;
      }

      if (data.price && data.price > 0) {
        setResult({
          usd: data.price,
          dzd: data.price * 300,
          productName: data.productName,
        });
      } else {
        setError("Nous n'avons pas pu trouver le prix de ce produit. Veuillez vérifier le lien ou réessayer.");
      }
    } catch {
      setError("Une erreur est survenue. Veuillez vérifier votre connexion et réessayer.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyResult = () => {
    if (result) {
      const text = result.productName
        ? `${result.productName} — Prix: ${result.dzd.toLocaleString()} DA`
        : `Prix en Dinar: ${result.dzd.toLocaleString()} DA`;
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-pure-black text-foreground overflow-x-hidden">
      <FloatingStars />
      <Navbar />
      <main className="flex-1 pt-16 sm:pt-20">
        <section className="relative py-20 sm:py-32 overflow-hidden min-h-[80vh]">
          {/* Background Effects */}
          <div className="absolute inset-0 bg-gradient-to-b from-indigo/10 via-background to-background" />
          <div className="absolute top-0 left-0 w-72 h-72 bg-acid-lime/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-72 h-72 bg-cyber-pink/5 rounded-full blur-3xl" />
          <div className="scanline-animated absolute inset-0 pointer-events-none" />

          <div className="relative z-10 max-w-4xl mx-auto px-4">
            {/* Section Header */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-acid-lime/10 border border-acid-lime/20 text-acid-lime text-sm font-medium mb-4">
                <Zap className="w-4 h-4" />
                Calcul instantané
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black mb-4">
                <span className="chrome-text">Calculez le prix</span>{" "}
                <span className="text-acid-lime">de votre produit</span>
              </h1>
              <p className="text-frosted-chrome/60 text-lg max-w-xl mx-auto">
                Collez simplement le lien de votre produit et nous extrairons le prix automatiquement
              </p>
            </motion.div>

            {/* Calculator Card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="frosted-glass-heavy rounded-3xl p-6 sm:p-10 neon-border"
            >
              {/* URL Input */}
              <div className="mb-8">
                <label className="block text-frosted-chrome/80 text-sm font-medium mb-2">
                  <Link2 className="w-4 h-4 inline mr-1" />
                  Lien du produit
                </label>
                <div className="relative">
                  <Input
                    type="url"
                    placeholder="Collez le lien du produit depuis Temu, AliExpress, Amazon..."
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                    className="bg-pure-black/50 border-white/10 focus:border-acid-lime/50 focus:ring-acid-lime/20 text-frosted-chrome placeholder:text-frosted-chrome/30 rounded-xl h-14 text-base pr-12"
                    disabled={loading}
                  />
                  <Globe className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-frosted-chrome/30" />
                </div>
              </div>

              {/* Analyze Button */}
              <Button
                onClick={handleAnalyze}
                disabled={loading}
                className="w-full bg-acid-lime text-pure-black hover:bg-acid-lime/90 font-black text-lg rounded-xl h-14 shadow-xl shadow-acid-lime/30 hover:shadow-acid-lime/50 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
              >
                {loading ? (
                  <span className="flex items-center gap-3">
                    <span className="spinner-3d" />
                    Analyse en cours...
                  </span>
                ) : (
                  <>
                    <Calculator className="w-5 h-5 mr-2" />
                    Analyser le prix
                  </>
                )}
              </Button>

              {/* Loading State */}
              <AnimatePresence>
                {loading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-6 text-center"
                  >
                    <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-indigo/20 border border-indigo/30">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Y2KStar size={16} className="text-acid-lime" />
                      </motion.div>
                      <span className="text-frosted-chrome/70 text-sm">
                        Extraction du prix en cours... Cela peut prendre quelques secondes
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-6"
                  >
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-cyber-pink/10 border border-cyber-pink/30">
                      <AlertCircle className="w-5 h-5 text-cyber-pink shrink-0 mt-0.5" />
                      <div>
                        <p className="text-cyber-pink font-medium text-sm">{error}</p>
                        <p className="text-frosted-chrome/40 text-xs mt-1">
                          Astuce : Assurez-vous que le lien pointe vers une page produit valide
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

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

                      {/* Product name */}
                      {result.productName && (
                        <div className="mb-4 p-3 rounded-lg bg-indigo/10 border border-indigo/20">
                          <p className="text-frosted-chrome/70 text-xs mb-1">Produit</p>
                          <p className="text-frosted-chrome font-medium text-sm line-clamp-2">
                            {result.productName}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="text-center p-4 rounded-xl bg-indigo/20 border border-indigo/30">
                          <p className="text-frosted-chrome/50 text-sm mb-1">Prix en dollars</p>
                          <p className="text-2xl font-black text-frosted-chrome">
                            {result.usd.toFixed(2)}$
                          </p>
                        </div>
                        <div className="text-center p-4 rounded-xl bg-acid-lime/10 border border-acid-lime/30 relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-br from-acid-lime/5 to-transparent" />
                          <p className="text-acid-lime/70 text-sm mb-1 relative z-10">Prix en Dinar Algérien</p>
                          <p className="text-3xl font-black text-acid-lime relative z-10">
                            {result.dzd.toLocaleString()} DA
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 p-3 rounded-lg bg-acid-lime/5 border border-acid-lime/10 text-center">
                        <p className="text-acid-lime font-bold text-xl">
                          {result.dzd.toLocaleString()} Dinar Algérien
                        </p>
                      </div>

                      {/* CTA to contact */}
                      <div className="mt-4 text-center">
                        <a
                          href="/contact"
                          className="inline-flex items-center gap-2 text-cyber-pink hover:text-cyber-pink/80 text-sm font-medium transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Passer votre commande
                        </a>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Supported stores hint */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-8 text-center"
            >
              <p className="text-frosted-chrome/30 text-sm mb-3">Boutiques supportées</p>
              <div className="flex flex-wrap justify-center gap-2">
                {["Temu", "AliExpress", "Amazon", "Shein", "eBay", "Wish", "Banggood", "LightInTheBox"].map((store) => (
                  <span
                    key={store}
                    className="px-3 py-1 rounded-full text-xs bg-indigo/20 text-frosted-chrome/50 border border-indigo/20"
                  >
                    {store}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
