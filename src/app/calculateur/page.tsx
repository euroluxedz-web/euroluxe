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
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { useLanguage } from "@/components/language-provider";

interface PriceResult {
  usd: number;
  dzd: number;
  productName?: string;
  estimated?: boolean;
}

export default function CalculateurPage() {
  const [productUrl, setProductUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PriceResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const { t, isArabic } = useLanguage();

  const handleAnalyze = async () => {
    setError("");
    setResult(null);

    if (!productUrl.trim()) {
      setError(t("calc.error.empty"));
      return;
    }

    // Check if input is a Temu product ID (e.g., 5GM305X711)
    const isTemuProductId = /^[a-zA-Z0-9]{6,15}$/.test(productUrl.trim());
    let finalUrl = productUrl.trim();

    if (isTemuProductId) {
      finalUrl = `https://www.temu.com/${productUrl.trim()}.html`;
    } else {
      try {
        new URL(productUrl);
      } catch {
        setError(t("calc.error.invalidUrl"));
        return;
      }
    }

    setLoading(true);

    try {
      const response = await fetch("/api/scrape-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: finalUrl, productId: isTemuProductId ? productUrl.trim() : null }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setError(
          data.error || t("calc.error.generic")
        );
        return;
      }

      if (data.price && data.price > 0) {
        setResult({
          usd: data.price,
          dzd: data.dzd || data.price * 300,
          productName: data.productName,
          estimated: data.estimated || false,
        });
      } else {
        setError(t("calc.error.notFound"));
      }
    } catch {
      setError(t("calc.error.network"));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyResult = () => {
    if (result) {
      const text = result.productName
        ? `${result.productName} — ${t("calc.priceDzd")}: ${result.dzd.toLocaleString()} DA`
        : `${t("calc.priceDzd")}: ${result.dzd.toLocaleString()} DA`;
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <main className="flex-1 pt-16 sm:pt-20">
        <section className="relative py-20 sm:py-32 overflow-hidden min-h-[80vh]">
          {/* Background Effects */}
          <div className="absolute inset-0 bg-gradient-to-b from-brand-gold/5 via-background to-background" />
          <div className="absolute top-0 left-0 w-72 h-72 bg-brand-gold/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-72 h-72 bg-brand-gold-light/5 rounded-full blur-3xl" />

          <div className="relative z-10 max-w-4xl mx-auto px-4">
            {/* Section Header */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-gold/10 border border-brand-gold/20 text-brand-gold text-sm font-medium mb-4 font-display">
                <Zap className="w-4 h-4" />
                {t("calc.badge")}
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black mb-4 font-heading">
                <span className="text-brand-dark">{t("calc.titleCalc")}</span>{" "}
                <span className="text-brand-gold">{t("calc.titleProduct")}</span>
              </h1>
              <p className="text-brand-muted-text text-lg max-w-xl mx-auto font-sans">
                {t("calc.subtitle")}
              </p>
            </motion.div>

            {/* Calculator Card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="warm-glass-heavy rounded-3xl p-6 sm:p-10 gold-border"
            >
              {/* URL Input */}
              <div className="mb-8">
                <label className="block text-brand-dark/80 text-sm font-medium mb-2 font-sans">
                  <Link2 className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                  {t("calc.label")}
                </label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder={t("calc.placeholder")}
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                    className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-gold/50 focus:ring-brand-gold/20 text-brand-dark placeholder:text-brand-muted-text/50 rounded-xl h-14 text-base font-sans"
                    disabled={loading}
                  />
                  <Globe className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted-text/40 ${isArabic ? "left-4" : "right-4"}`} />
                </div>
                <p className="text-brand-muted-text/50 text-xs mt-2 font-sans">
                  {t("calc.hint")}
                </p>
              </div>

              {/* Analyze Button */}
              <Button
                onClick={handleAnalyze}
                disabled={loading}
                className="w-full bg-brand-gold text-brand-dark hover:bg-brand-gold-light font-bold text-lg rounded-xl h-14 shadow-xl shadow-brand-gold/25 hover:shadow-brand-gold/40 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 font-display"
              >
                {loading ? (
                  <span className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t("calc.analyzing")}
                  </span>
                ) : (
                  <>
                    <Calculator className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`} />
                    {t("calc.analyze")}
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
                    <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-brand-gold/5 border border-brand-gold/15">
                      <Loader2 className="w-4 h-4 text-brand-gold animate-spin" />
                      <span className="text-brand-muted-text text-sm font-sans">
                        {t("calc.extracting")}
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
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
                      <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-red-700 font-medium text-sm font-sans">
                          {error}
                        </p>
                        <p className="text-red-500/60 text-xs mt-1 font-sans">
                          {t("calc.error.tip")}
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
                    <div className="bg-brand-light/60 rounded-2xl p-6 border border-brand-gold/20 gold-border">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-brand-gold font-bold text-lg flex items-center gap-2 font-heading">
                          <CheckCircle2 className="w-5 h-5" />
                          {t("calc.result")}
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyResult}
                          className="text-brand-muted-text hover:text-brand-gold"
                        >
                          {copied ? (
                            <CheckCircle2 className={`w-4 h-4 ${isArabic ? "ml-1" : "mr-1"} text-brand-gold`} />
                          ) : (
                            <Copy className={`w-4 h-4 ${isArabic ? "ml-1" : "mr-1"}`} />
                          )}
                          {copied ? t("calc.copied") : t("calc.copy")}
                        </Button>
                      </div>

                      {/* Product name */}
                      {result.productName && (
                        <div className="mb-4 p-3 rounded-lg bg-brand-card border border-brand-muted-warm">
                          <p className="text-brand-muted-text text-xs mb-1 font-sans">
                            {t("calc.product")}
                          </p>
                          <p className="text-brand-dark font-medium text-sm line-clamp-2 font-sans">
                            {result.productName}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="text-center p-4 rounded-xl bg-brand-card border border-brand-muted-warm">
                          <p className="text-brand-muted-text text-sm mb-1 font-sans">
                            {t("calc.priceUsd")}
                          </p>
                          <p className="text-2xl font-black text-brand-dark font-heading">
                            {result.usd.toFixed(2)}$
                          </p>
                        </div>
                        <div className="text-center p-4 rounded-xl bg-brand-gold/10 border border-brand-gold/25 relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-br from-brand-gold/5 to-transparent" />
                          <p className="text-brand-gold/70 text-sm mb-1 relative z-10 font-sans">
                            {t("calc.priceDzd")}
                          </p>
                          <p className="text-3xl font-black text-brand-gold relative z-10 font-heading">
                            {result.dzd.toLocaleString()} DA
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 p-3 rounded-lg bg-brand-gold/5 border border-brand-gold/10 text-center">
                        <p className="text-brand-dark font-bold text-xl font-heading">
                          {result.dzd.toLocaleString()} {t("calc.dinarAlgerien")}
                        </p>
                        {result.estimated && (
                          <p className="text-brand-muted-text/60 text-xs mt-1 font-sans">
                            {t("calc.estimated")}
                          </p>
                        )}
                      </div>

                      {/* CTA to contact */}
                      <div className="mt-4 text-center">
                        <a
                          href="/contact"
                          className="inline-flex items-center gap-2 text-brand-gold hover:text-brand-gold-light text-sm font-medium transition-colors font-display"
                        >
                          <ExternalLink className="w-4 h-4" />
                          {t("calc.orderNow")}
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
              <p className="text-brand-muted-text/60 text-sm mb-3 font-sans">
                {t("calc.supportedStores")}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "Temu",
                  "AliExpress",
                ].map((store) => (
                  <span
                    key={store}
                    className="px-3 py-1 rounded-full text-xs bg-brand-card text-brand-muted-text border border-brand-muted-warm font-display"
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
