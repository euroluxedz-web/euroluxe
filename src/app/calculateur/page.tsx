"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  Zap,
  CheckCircle2,
  Copy,
  AlertCircle,
  ExternalLink,
  Link2,
  Loader2,
  Pencil,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { useLanguage } from "@/components/language-provider";

interface PriceResult {
  usd: number;
  dzd: number;
  productName?: string | null;
  estimated?: boolean;
  manual?: boolean;
}

export default function CalculateurPage() {
  const [productUrl, setProductUrl] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PriceResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [temuLink, setTemuLink] = useState<string | null>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const { t, isArabic } = useLanguage();

  // Detect Temu product code in real-time
  useEffect(() => {
    const input = productUrl.trim();
    const isTemuCode = /^[a-zA-Z0-9]{6,15}$/.test(input);
    if (isTemuCode) {
      setDetectedCode(input);
      setTemuLink(`https://www.temu.com/-g-${input}.html`);
    } else if (input.includes("temu.com")) {
      setDetectedCode(null);
      setTemuLink(input.startsWith("http") ? input : `https://${input}`);
    } else {
      setDetectedCode(null);
      setTemuLink(null);
    }
  }, [productUrl]);

  // Extract product name from URL slug
  const extractProductName = (url: string): string | null => {
    try {
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      const segments = parsed.pathname.split("/").filter(Boolean);
      // For Temu URLs like /product-name-g-CODE.html
      const slug =
        segments.find((s) => s.includes("-g-") && s.length > 10) ||
        segments.find((s) => s.includes("-") && s.length > 10) ||
        segments[segments.length - 1] ||
        "";
      const name = slug
        .replace(/-g-[a-zA-Z0-9]+\.html?$/i, "")
        .replace(/\.html?$/i, "")
        .replace(/-/g, " ")
        .trim();
      if (name && name.length > 3) {
        return name.replace(/\b\w/g, (l) => l.toUpperCase());
      }
    } catch {
      // Not a valid URL
    }
    return null;
  };

  // Manual price calculation (PRIMARY - always works perfectly)
  const handleManualCalculate = () => {
    setError("");
    setResult(null);

    const priceStr = manualPrice.trim().replace(/[^\d.]/g, "");
    const price = parseFloat(priceStr);

    if (!price || price <= 0) {
      setError(isArabic ? "يرجى إدخال سعر صالح" : "Veuillez entrer un prix valide");
      return;
    }

    const isDZD = /DA|dzd|DZD|دينار/i.test(manualPrice);
    let priceUSD = price;
    if (isDZD) {
      priceUSD = price / 300;
    }

    // Try to extract product name from URL
    let productName: string | null = null;
    if (productUrl.trim()) {
      productName = extractProductName(productUrl);
    }

    setResult({
      usd: Math.round(priceUSD * 100) / 100,
      dzd: Math.round(priceUSD * 300 * 100) / 100,
      productName,
      estimated: false,
      manual: true,
    });
  };

  // Auto-extract price (tries server-side extraction for AliExpress, etc.)
  const handleAutoExtract = async () => {
    setError("");
    setResult(null);

    if (!productUrl.trim()) {
      setError(t("calc.error.empty"));
      return;
    }

    const isTemuProductId = /^[a-zA-Z0-9]{6,15}$/.test(productUrl.trim());
    let finalUrl = productUrl.trim();

    if (isTemuProductId) {
      finalUrl = `https://www.temu.com/-g-${productUrl.trim()}.html`;
    } else {
      try {
        new URL(finalUrl);
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
        body: JSON.stringify({ url: finalUrl }),
      });

      const data = await response.json();

      if (data.price && data.price > 0) {
        setResult({
          usd: data.price,
          dzd: data.dzd || data.price * 300,
          productName: data.productName,
          estimated: data.estimated || false,
          manual: data.manual || false,
        });
      } else {
        setError(
          data.error ||
            (isArabic
              ? "لم نتمكن من استخراج السعر تلقائياً. يرجى إدخاله في الحقل أدناه."
              : "Extraction automatique indisponible. Veuillez entrer le prix dans le champ ci-dessous.")
        );
        // Focus on the price input for easy manual entry
        setTimeout(() => priceInputRef.current?.focus(), 300);
      }
    } catch {
      setError(
        isArabic
          ? "يرجى إدخال السعر يدوياً في الحقل أدناه."
          : "Veuillez entrer le prix manuellement dans le champ ci-dessous."
      );
      setTimeout(() => priceInputRef.current?.focus(), 300);
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
              {/* ──── STEP 1: Paste URL or Temu Code ──── */}
              <div className="mb-6">
                <label className="block text-brand-dark/80 text-sm font-medium mb-2 font-sans">
                  <Link2 className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                  {t("calc.label")}
                </label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder={t("calc.placeholder")}
                    value={productUrl}
                    onChange={(e) => {
                      setProductUrl(e.target.value);
                      setResult(null);
                      setError("");
                    }}
                    className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-gold/50 focus:ring-brand-gold/20 text-brand-dark placeholder:text-brand-muted-text/50 rounded-xl h-14 text-base font-sans"
                    disabled={loading}
                  />
                  <ShoppingBag
                    className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted-text/40 ${
                      isArabic ? "left-4" : "right-4"
                    }`}
                  />
                </div>

                {/* ── Temu Code Detected Banner ── */}
                <AnimatePresence>
                  {detectedCode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 p-4 rounded-xl bg-gradient-to-r from-brand-gold/10 to-brand-gold/5 border border-brand-gold/20">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-brand-gold/20 flex items-center justify-center shrink-0">
                            <ShoppingBag className="w-4 h-4 text-brand-gold" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-brand-dark font-semibold text-sm font-heading">
                              {isArabic
                                ? `تم اكتشاف كود منتج Temu: ${detectedCode}`
                                : `Code produit Temu détecté : ${detectedCode}`}
                            </p>
                            <p className="text-brand-muted-text text-xs mt-1 font-sans">
                              {isArabic
                                ? "اضغط على الرابط لفتح المنتج على Temu، ثم أدخل السعر الذي تراه في الحقل أدناه"
                                : "Cliquez sur le lien pour ouvrir le produit sur Temu, puis entrez le prix affiché dans le champ ci-dessous"}
                            </p>
                            <a
                              href={temuLink || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-2 text-brand-gold hover:text-brand-gold-light text-sm font-medium transition-colors font-display"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              {isArabic
                                ? "فتح المنتج على Temu"
                                : "Ouvrir le produit sur Temu"}
                              <ArrowRight className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── AliExpress URL Detected ── */}
                <AnimatePresence>
                  {productUrl.includes("aliexpress") && !detectedCode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-3">
                        <Sparkles className="w-4 h-4 text-green-600 shrink-0" />
                        <p className="text-green-700 text-xs font-sans">
                          {isArabic
                            ? "رابط AliExpress — يمكننا محاولة استخراج السعر تلقائياً"
                            : "Lien AliExpress — L'extraction automatique du prix est disponible"}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center justify-between mt-2">
                  <p className="text-brand-muted-text/50 text-xs font-sans">
                    {t("calc.hint")}
                  </p>
                  {!detectedCode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleAutoExtract}
                      disabled={loading || !productUrl.trim()}
                      className="text-brand-gold/70 hover:text-brand-gold text-xs h-7 px-2 font-sans"
                    >
                      {loading ? (
                        <Loader2 className={`w-3 h-3 animate-spin ${isArabic ? "ml-1" : "mr-1"}`} />
                      ) : (
                        <Sparkles className={`w-3 h-3 ${isArabic ? "ml-1" : "mr-1"}`} />
                      )}
                      {isArabic ? "استخراج تلقائي" : "Extraction auto"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Loading State */}
              <AnimatePresence>
                {loading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mb-6 text-center"
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

              {/* Error/Info */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mb-6"
                  >
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                      <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-amber-700 font-medium text-sm font-sans">
                          {error}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ──── STEP 2: Enter Price (always visible, primary method) ──── */}
              <div className="p-5 rounded-xl bg-brand-gold/5 border border-brand-gold/15">
                <label className="block text-brand-dark/80 text-sm font-medium mb-2 font-sans">
                  <Pencil className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                  {t("calc.manual.label")}
                </label>
                {detectedCode && (
                  <p className="text-brand-gold text-xs mb-2 font-sans flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    {isArabic
                      ? "افتح المنتج على Temu وأدخل السعر الظاهر هنا"
                      : "Ouvrez le produit sur Temu et entrez le prix affiché ici"}
                  </p>
                )}
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Input
                      ref={priceInputRef}
                      type="text"
                      placeholder={t("calc.manual.placeholder")}
                      value={manualPrice}
                      onChange={(e) => {
                        setManualPrice(e.target.value);
                        setResult(null);
                        setError("");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleManualCalculate()}
                      className="bg-brand-light/80 border-brand-gold/20 focus:border-brand-gold/50 focus:ring-brand-gold/20 text-brand-dark placeholder:text-brand-muted-text/50 rounded-xl h-14 text-lg font-sans"
                      disabled={loading}
                    />
                    <span
                      className={`absolute top-1/2 -translate-y-1/2 text-brand-muted-text/40 font-bold text-lg ${
                        isArabic ? "left-4" : "right-4"
                      }`}
                    >
                      $
                    </span>
                  </div>
                  <Button
                    onClick={handleManualCalculate}
                    disabled={loading}
                    className="bg-brand-gold text-brand-dark hover:bg-brand-gold-light font-bold text-lg rounded-xl h-14 px-8 shadow-xl shadow-brand-gold/25 hover:shadow-brand-gold/40 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 font-display"
                  >
                    <Calculator className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`} />
                    {t("calc.manual.calculate")}
                  </Button>
                </div>
                <p className="text-brand-muted-text/50 text-xs mt-2 font-sans">
                  {t("calc.manual.hint")}
                </p>
              </div>

              {/* Result */}
              <AnimatePresence>
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    className="mt-6"
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
                        {result.manual && (
                          <p className="text-brand-muted-text/60 text-xs mt-1 font-sans">
                            {isArabic ? "* سعر تم إدخاله يدوياً" : "* Prix entré manuellement"}
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
                {["Temu", "AliExpress"].map((store) => (
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
