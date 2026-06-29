"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  Zap,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Pencil,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  Info,
  Check,
  X,
  MapPin,
  Phone,
  User,
  Truck,
  StickyNote,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { useLanguage } from "@/components/language-provider";
import { useCartStore, syncAddToServer } from "@/lib/cart-store";
import { useAuth } from "@/components/auth-provider";
import { createOrder, updateUserData } from "@/lib/firebase";
import { getCommunesForWilaya, getWilayaNames, type Commune } from "@/lib/algeria-communes";

/* ── Algerian Wilayas (from data file) ── */
const WILAYAS = getWilayaNames();

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

interface PriceBreakdown {
  basePriceUSD: number;
  basePriceDZD: number;
  shippingUSD: number;
  shippingDZD: number;
  customsDZD: number;
  marginDZD: number;
  totalDZD: number;
  exchangeRate: number;
}

interface PriceResult {
  usd: number;
  dzd: number;
  breakdown?: PriceBreakdown;
  productName?: string | null;
  originalPrice?: number | null;
  image?: string | null;
  estimated?: boolean;
  manual?: boolean;
  source?: string;
  itemId?: string;
}

interface DetectedProduct {
  name: string | null;
  description?: string | null;
  image: string | null;
  url: string | null;
  antiBotDetected?: boolean;
  message?: string;
}

interface ShippingInfo {
  fullName: string;
  phone: string;
  wilaya: string;
  commune: string;
  codePostal: string;
  address: string;
  notes: string;
}

export default function CalculateurPage() {
  const [productUrl, setProductUrl] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PriceResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [temuLink, setTemuLink] = useState<string | null>(null);
  const [detectedProduct, setDetectedProduct] = useState<DetectedProduct | null>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const { t, isArabic } = useLanguage();
  const { user, profile } = useAuth();
  const router = useRouter();
  const addItemToStore = useCartStore((s) => s.addItem);

  // Checkout state
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveInfo, setSaveInfo] = useState(true);
  const [useSaved, setUseSaved] = useState(false);
  const [shippingError, setShippingError] = useState("");

  const [shipping, setShipping] = useState<ShippingInfo>({
    fullName: "",
    phone: "",
    wilaya: "",
    commune: "",
    codePostal: "",
    address: "",
    notes: "",
  });

  // Available communes based on selected wilaya
  const [availableCommunes, setAvailableCommunes] = useState<Commune[]>([]);

  const isAuthenticated = !!user;

  // Pre-fill shipping info from user profile
  useEffect(() => {
    if (profile && isAuthenticated) {
      const hasSavedInfo = profile.phone || profile.wilaya || profile.address;
      if (hasSavedInfo) {
        setUseSaved(true);
        const communes = getCommunesForWilaya(profile.wilaya || "");
        setAvailableCommunes(communes);
        setShipping({
          fullName: profile.name || "",
          phone: profile.phone || "",
          wilaya: profile.wilaya || "",
          commune: profile.commune || "",
          codePostal: profile.codePostal || "",
          address: profile.address || "",
          notes: "",
        });
      } else {
        setShipping((prev) => ({
          ...prev,
          fullName: profile.name || "",
          phone: profile.phone || "",
        }));
      }
    }
  }, [profile, isAuthenticated]);

  // Detect Temu product code / Item ID in real-time
  useEffect(() => {
    const input = productUrl.trim();
    const isTemuCode = /^[a-zA-Z0-9]{6,30}$/.test(input);
    if (isTemuCode) {
      setDetectedCode(input);
      // Item IDs (like TV10922608) don't work in -g- URL format, use search instead
      if (/^[A-Z]{2}\d+/i.test(input)) {
        setTemuLink(`https://www.temu.com/search_result.html?search_key=${input}`);
      } else {
        setTemuLink(`https://www.temu.com/-g-${input}.html`);
      }
    } else if (input.includes("temu.com")) {
      setDetectedCode(null);
      setTemuLink(input.startsWith("http") ? input : `https://${input}`);
    } else {
      setDetectedCode(null);
      setTemuLink(null);
    }
  }, [productUrl]);

  // Extract product name from URL
  const extractProductName = (url: string): string | null => {
    try {
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      const segments = parsed.pathname.split("/").filter(Boolean);
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
    } catch { /* skip */ }
    return null;
  };

  // AUTO-EXTRACT
  const handleAutoExtract = async () => {
    setError("");
    setResult(null);
    setShowCheckout(false);
    setOrderSuccess(false);
    setDetectedProduct(null);

    if (!productUrl.trim()) {
      setError(t("calc.error.empty"));
      return;
    }

    const isTemuProductId = /^[a-zA-Z0-9]{6,30}$/.test(productUrl.trim());
    let finalUrl = productUrl.trim();

    if (isTemuProductId) {
      // Item ID format (e.g. TV10922608) — pass as-is, the API will use web search
      // Numeric goods_id — construct -g- URL
      if (/^[A-Z]{2}\d+/i.test(productUrl.trim())) {
        finalUrl = productUrl.trim(); // Pass Item ID directly
      } else {
        finalUrl = `https://www.temu.com/-g-${productUrl.trim()}.html`;
      }
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

      // Case 1: Auto-extracted price found
      if (data.success && data.price && data.price > 0) {
        setTemuLink(finalUrl);
        setResult({
          usd: data.price,
          dzd: data.dzd || data.price * 270,
          breakdown: data.breakdown,
          productName: data.productName,
          originalPrice: data.originalPrice || null,
          image: data.productImage || data.image || null,
          estimated: data.estimated || false,
          manual: data.manual || false,
          source: data.source || "auto",
          itemId: data.itemId || undefined,
        });
      }
      // Case 2: Product detected but price not auto-extracted — show manual price entry
      else if (data.success === false && data.productUrl && data.itemId) {
        setTemuLink(data.productUrl || finalUrl);
        setDetectedProduct({
          name: data.productName || "Produit Temu",
          description: null,
          image: data.productImage || null,
          url: data.productUrl || finalUrl,
          antiBotDetected: true,
          message: isArabic
            ? "تم العثور على المنتج! يرجى إدخال السعر المعروض على Temu في الحقل أدناه."
            : "Produit trouvé ! Veuillez saisir le prix affiché sur Temu dans le champ ci-dessous.",
        });
        setError(
          isArabic
            ? "تعذّر استخراج السعر تلقائياً. افتح المنتج على Temu وأدخل السعر يدوياً."
            : "Extraction automatique indisponible. Ouvrez le produit sur Temu et saisissez le prix manuellement."
        );
        setTimeout(() => priceInputRef.current?.focus(), 300);
      }
      // Case 3: Complete failure — show error
      else {
        setTemuLink(finalUrl);
        setError(
          data.error ||
            (isArabic
              ? "تعذّر استخراج السعر تلقائياً. حاول مرة أخرى."
              : "Extraction automatique indisponible. Veuillez réessayer.")
        );
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

  // Manual price calculation - uses API for proper breakdown
  const handleManualCalculate = async () => {
    setError("");
    setResult(null);
    setShowCheckout(false);
    setOrderSuccess(false);

    const normalized = manualPrice.trim().replace(/,/g, ".");
    const priceStr = normalized.replace(/[^\d.]/g, "");
    const parts = priceStr.split(".");
    const cleaned = parts.length > 1
      ? parts[0] + "." + parts.slice(1).join("")
      : priceStr;
    const price = parseFloat(cleaned);

    if (!price || price <= 0) {
      setError(isArabic ? "يرجى إدخال سعر صالح" : "Veuillez entrer un prix valide");
      return;
    }

    setLoading(true);
    try {
      // Pass the detected product info + URL so the API can use it
      const payload: Record<string, string> = { manualPrice: manualPrice.trim() };
      if (detectedProduct?.name) payload.productName = detectedProduct.name;
      if (detectedProduct?.image) payload.productImage = detectedProduct.image;
      if (productUrl.trim()) payload.url = productUrl.trim();

      const response = await fetch("/api/scrape-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (data.success && data.price) {
        const productName = detectedProduct?.name
          || (productUrl.trim() ? extractProductName(productUrl) : null)
          || data.productName;
        setResult({
          usd: data.price,
          dzd: data.dzd,
          breakdown: data.breakdown,
          productName,
          image: detectedProduct?.image || null,
          estimated: false,
          manual: true,
          source: "manual",
        });
      } else {
        setError(isArabic ? "يرجى إدخال سعر صالح" : "Veuillez entrer un prix valide");
      }
    } catch {
      setError(isArabic ? "حدث خطأ، حاول مرة أخرى" : "Une erreur est survenue, réessayez");
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

  const handleAddToCart = () => {
    if (!result) return;
    const cartItem = {
      id: `calc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId: detectedCode || undefined,
      name: result.productName || (isArabic ? "منتج" : "Produit"),
      image: result.image || undefined,
      price: result.usd,
      quantity: 1,
      url: productUrl.trim() || undefined,
    };
    addItemToStore(cartItem);
    syncAddToServer(cartItem);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  // Validate phone
  const isValidPhone = (phone: string) => /^(05|06|07)\d{8}$/.test(phone.trim());

  // Handle checkout submission
  const handleSubmitOrder = async () => {
    setShippingError("");

    // Validate
    if (!shipping.fullName.trim()) {
      setShippingError(isArabic ? "يرجى إدخال الاسم الكامل" : "Veuillez entrer votre nom complet");
      return;
    }
    if (!isValidPhone(shipping.phone)) {
      setShippingError(t("calc.checkout.errorPhone"));
      return;
    }
    if (!shipping.wilaya) {
      setShippingError(isArabic ? "يرجى اختيار الولاية" : "Veuillez sélectionner votre wilaya");
      return;
    }
    if (!shipping.commune) {
      setShippingError(isArabic ? "يرجى اختيار البلدية" : "Veuillez sélectionner votre commune");
      return;
    }
    if (!shipping.address.trim()) {
      setShippingError(isArabic ? "يرجى إدخال العنوان" : "Veuillez entrer votre adresse");
      return;
    }

    setSubmitting(true);

    try {
      // Save shipping info to user profile if requested
      if (isAuthenticated && saveInfo && user) {
        try {
          await updateUserData(user.uid, {
            name: shipping.fullName,
            phone: shipping.phone,
            wilaya: shipping.wilaya,
            commune: shipping.commune,
            codePostal: shipping.codePostal,
            address: shipping.address,
          });
        } catch (e) {
          console.error("Failed to save shipping info:", e);
        }
      }

      // Create the order
      if (isAuthenticated && user) {
        const orderItems = [{
          name: result?.productName || (isArabic ? "منتج" : "Produit"),
          price: result?.dzd || 0,
          quantity: 1,
          image: result?.image || undefined,
          url: productUrl.trim() || undefined,
          productId: detectedCode || undefined,
        }];

        const { auth } = await import("@/lib/firebase");
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

        const res = await fetch("/api/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            items: orderItems,
            total: result?.dzd || 0,
            wilaya: shipping.wilaya,
            commune: shipping.commune,
            codePostal: shipping.codePostal,
            address: shipping.address,
            phone: shipping.phone,
            notes: shipping.notes,
          }),
        });

        if (res.ok) {
          setOrderSuccess(true);
        } else {
          setShippingError(isArabic ? "حدث خطأ، يرجى المحاولة مرة أخرى" : "Une erreur est survenue, veuillez réessayer");
        }
      }
    } catch (err) {
      console.error("Order error:", err);
      setShippingError(isArabic ? "حدث خطأ في الاتصال" : "Erreur de connexion");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-transparent text-foreground overflow-x-hidden">
      <Navbar />
      <main className="flex-1 pt-16 sm:pt-20">
        <section className="relative py-20 sm:py-32 overflow-hidden min-h-[80vh]">
          {/* Background Effects */}
          <div className="absolute inset-0 bg-gradient-to-b from-brand-blue/20 via-brand-blue-light/15 to-white/60" />
          <div className="absolute top-0 left-0 w-72 h-72 bg-brand-pink/8 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-72 h-72 bg-brand-blue/8 rounded-full blur-3xl" />

          <div className="relative z-10 max-w-4xl mx-auto px-4">
            {/* Section Header */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12 relative"
            >
              <div className="hidden lg:block">
                <ImgPlaceholder number={32} className="absolute -left-16 top-4 w-[120px] h-[150px] rounded-xl rotate-[-8deg]" />
                <ImgPlaceholder number={33} className="absolute -right-16 top-4 w-[120px] h-[150px] rounded-xl rotate-[8deg]" />
              </div>

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-pink/10 border border-brand-pink/20 text-brand-pink text-sm font-medium mb-4 font-display">
                <Zap className="w-4 h-4" />
                {t("calc.badge")}
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black mb-4 font-heading">
                <span className="text-brand-dark">{t("calc.titleCalc")}</span>{" "}
                <span className="bg-brand-gold/30 px-2 py-1 rounded-md text-brand-dark">
                  {t("calc.titleProduct")}
                </span>
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
              className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 sm:p-10 border border-brand-pink/15 shadow-lg"
            >
              {/* ──── Product URL / Code Input ──── */}
              <div className="mb-6">
                <label className="block text-brand-dark/80 text-sm font-medium mb-2 font-sans">
                  <Link2 className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                  {t("calc.label")}
                </label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Input
                      type="text"
                      placeholder={t("calc.placeholder")}
                      value={productUrl}
                      onChange={(e) => {
                        setProductUrl(e.target.value);
                        setResult(null);
                        setError("");
                        setShowCheckout(false);
                        setDetectedProduct(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleAutoExtract()}
                      className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 text-brand-dark placeholder:text-brand-muted-text/50 rounded-xl h-14 text-base font-sans"
                      disabled={loading}
                    />
                    <ShoppingBag
                      className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted-text/40 ${
                        isArabic ? "left-4" : "right-4"
                      }`}
                    />
                  </div>
                  <Button
                    onClick={handleAutoExtract}
                    disabled={loading || !productUrl.trim()}
                    className="bg-brand-pink text-white hover:bg-brand-pink-light font-bold rounded-xl h-14 px-6 shadow-xl shadow-brand-pink/25 hover:shadow-brand-pink/40 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 font-display"
                  >
                    {loading ? (
                      <Loader2 className={`w-5 h-5 animate-spin ${isArabic ? "ml-2" : "mr-2"}`} />
                    ) : (
                      <Sparkles className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`} />
                    )}
                    {loading ? t("calc.analyzing") : isArabic ? "استخراج السعر" : "Analyser"}
                  </Button>
                </div>

                {/* Temu Code / Item ID Detected Banner */}
                <AnimatePresence>
                  {detectedCode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 p-4 rounded-xl bg-brand-pink/10 border border-brand-pink/20">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-brand-pink/20 flex items-center justify-center shrink-0">
                            <ShoppingBag className="w-4 h-4 text-brand-pink" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-brand-dark font-semibold text-sm font-heading">
                              {/^[A-Z]{1,3}\d{5,}$/i.test(detectedCode)
                                ? (isArabic ? `Item ID من Temu: ${detectedCode}` : `Item ID Temu : ${detectedCode}`)
                                : (isArabic ? `كود منتج Temu: ${detectedCode}` : `Code produit Temu : ${detectedCode}`)
                              }
                            </p>
                            <p className="text-brand-muted-text text-xs mt-1 font-sans">
                              {isArabic
                                ? "اضغط \"استخراج السعر\" للحصول على السعر والصورة تلقائياً"
                                : "Cliquez \"Analyser\" pour obtenir le prix et l'image automatiquement"}
                            </p>
                            <a
                              href={temuLink || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-2 text-brand-pink hover:text-brand-pink-light text-sm font-medium transition-colors font-display"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              {isArabic ? "فتح على Temu" : "Ouvrir sur Temu"}
                              <ArrowRight className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className="text-brand-muted-text/50 text-xs mt-2 font-sans">
                  {t("calc.hint")}
                </p>
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
                    <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-brand-pink/5 border border-brand-pink/15">
                      <Loader2 className="w-4 h-4 text-brand-pink animate-spin" />
                      <span className="text-brand-muted-text text-sm font-sans">{t("calc.extracting")}</span>
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
                      <p className="text-amber-700 font-medium text-sm font-sans">{error}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ──── Detected Product Card (when price needs manual entry) ──── */}
              <AnimatePresence>
                {detectedProduct && !result && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.98 }}
                    className="mt-5 bg-gradient-to-br from-brand-pink/10 to-brand-pink/5 border border-brand-pink/30 rounded-2xl p-4"
                  >
                    <div className="flex items-start gap-3">
                      {detectedProduct.image ? (
                        <img
                          src={detectedProduct.image}
                          alt={detectedProduct.name || "Product"}
                          className="w-16 h-16 rounded-xl object-cover shrink-0 border border-brand-pink/20"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-brand-pink/10 flex items-center justify-center shrink-0 border border-brand-pink/20">
                          <Package className="w-7 h-7 text-brand-pink/60" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-sans font-bold">
                            {isArabic ? "تم العثور على المنتج ✓" : "Produit trouvé ✓"}
                          </span>
                          {detectedProduct.antiBotDetected && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-sans">
                              {isArabic ? "الحظر التلقائي" : "Anti-bot"}
                            </span>
                          )}
                        </div>
                        <p className="text-brand-dark font-bold text-sm line-clamp-2 font-sans">
                          {detectedProduct.name}
                        </p>
                        {detectedProduct.description && (
                          <p className="text-brand-muted-text/70 text-xs mt-1 line-clamp-2 font-sans">
                            {detectedProduct.description}
                          </p>
                        )}
                        {detectedProduct.url && (
                          <a
                            href={detectedProduct.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-brand-pink hover:text-brand-pink/80 mt-2 font-bold font-sans"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {isArabic ? "افتح المنتج على Temu لرؤية السعر" : "Ouvrir sur Temu pour voir le prix"}
                          </a>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ──── Manual Price Entry (fallback when auto-extraction fails) ──── */}
              {detectedProduct && !result && (
              <div className="border-t border-brand-muted-warm/50 pt-5 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Pencil className="w-4 h-4 text-brand-muted-text/60" />
                  <span className="text-brand-muted-text/60 text-xs font-sans">
                    {detectedProduct
                      ? (isArabic ? "أدخل السعر المعروض على Temu" : "Saisissez le prix affiché sur Temu")
                      : (isArabic ? "أو أدخل السعر يدوياً" : "Ou entrez le prix manuellement")}
                  </span>
                </div>
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
                        setShowCheckout(false);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleManualCalculate()}
                      className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 text-brand-dark placeholder:text-brand-muted-text/50 rounded-xl h-12 text-base font-sans"
                      disabled={loading}
                    />
                    <span className={`absolute top-1/2 -translate-y-1/2 text-brand-muted-text/40 font-bold ${isArabic ? "left-3" : "right-3"}`}>$</span>
                  </div>
                  <Button
                    onClick={handleManualCalculate}
                    disabled={loading}
                    className="bg-brand-pink/80 text-white hover:bg-brand-pink font-bold rounded-xl h-12 px-6 transition-all disabled:opacity-50 font-display"
                  >
                    <Calculator className={`w-4 h-4 ${isArabic ? "ml-1" : "mr-1"}`} />
                    {t("calc.manual.calculate")}
                  </Button>
                </div>
              </div>
              )}

              {/* ──── Result ──── */}
              <AnimatePresence>
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    className="mt-6"
                  >
                    <div className="bg-brand-light/60 rounded-2xl p-6 border border-brand-pink/15">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-brand-pink font-bold text-lg flex items-center gap-2 font-heading">
                          <CheckCircle2 className="w-5 h-5" />
                          {t("calc.result")}
                          {result.source && result.source !== "manual" && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-sans">
                              {isArabic ? "تلقائي" : "Auto"}
                            </span>
                          )}
                          {result.manual && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-sans">
                              {isArabic ? "يدوي" : "Manuel"}
                            </span>
                          )}
                        </h3>
                        <Button variant="ghost" size="sm" onClick={handleCopyResult} className="text-brand-muted-text hover:text-brand-pink">
                          {copied ? (
                            <CheckCircle2 className={`w-4 h-4 ${isArabic ? "ml-1" : "mr-1"} text-brand-pink`} />
                          ) : (
                            <Copy className={`w-4 h-4 ${isArabic ? "ml-1" : "mr-1"}`} />
                          )}
                          {copied ? t("calc.copied") : t("calc.copy")}
                        </Button>
                      </div>

                      {/* Product name + image */}
                      {result.productName && (
                        <div className="mb-4 p-3 rounded-lg bg-white border border-brand-muted-warm flex items-center gap-3">
                          {result.image ? (
                            <img src={result.image} alt={result.productName} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                          ) : (
                            <ImgPlaceholder number={34} className="w-12 h-12 rounded-lg shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-brand-muted-text text-xs mb-0.5 font-sans">{t("calc.product")}</p>
                            <p className="text-brand-dark font-medium text-sm line-clamp-2 font-sans">{result.productName}</p>
                            {result.itemId && (
                              <p className="text-brand-muted-text/60 text-xs mt-0.5 font-mono font-sans">
                                Item ID: {result.itemId}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Price breakdown */}
                      {result.breakdown ? (
                        <div className="space-y-2 mb-4">
                          <p className="text-brand-dark/60 text-xs font-bold uppercase tracking-wide font-sans mb-2">
                            {t("calc.breakdown.title")}
                          </p>
                          {/* Base price */}
                          <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-white border border-brand-muted-warm/50">
                            <span className="text-brand-muted-text text-sm font-sans">{t("calc.breakdown.base")}</span>
                            <span className="text-brand-dark font-bold text-sm font-heading">
                              {result.breakdown.basePriceUSD.toFixed(2)}$ · {result.breakdown.basePriceDZD.toLocaleString()} DA
                            </span>
                          </div>
                          {/* Free shipping badge */}
                          <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-emerald-50 border border-emerald-200">
                            <span className="text-brand-muted-text text-sm font-sans">{t("calc.breakdown.shipping")}</span>
                            <span className="text-emerald-700 font-bold text-sm font-heading">
                              {t("calc.breakdown.freeShipping")}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                          <div className="text-center p-4 rounded-xl bg-white border border-brand-muted-warm">
                            <p className="text-brand-muted-text text-sm mb-1 font-sans">{t("calc.priceUsd")}</p>
                            {result.originalPrice && result.originalPrice > result.usd && (
                              <p className="text-brand-muted-text/40 text-xs line-through font-sans">{result.originalPrice.toFixed(2)}$</p>
                            )}
                            <p className="text-2xl font-black text-brand-dark font-heading">{result.usd.toFixed(2)}$</p>
                          </div>
                          <div className="text-center p-4 rounded-xl bg-brand-pink/10 border border-brand-pink/25 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-brand-pink/5 to-transparent" />
                            <p className="text-brand-pink/70 text-sm mb-1 relative z-10 font-sans">{t("calc.priceDzd")}</p>
                            <p className="text-3xl font-black text-brand-pink relative z-10 font-heading">{result.dzd.toLocaleString()} DA</p>
                          </div>
                        </div>
                      )}

                      {/* Total price highlight */}
                      <div className="p-4 rounded-xl bg-gradient-to-r from-brand-pink/15 to-brand-pink/5 border-2 border-brand-pink/25 text-center">
                        <p className="text-brand-muted-text text-sm mb-1 font-sans">{t("calc.breakdown.total")}</p>
                        <p className="text-4xl font-black text-brand-pink font-heading">
                          {result.dzd.toLocaleString()} <span className="text-2xl">DA</span>
                        </p>
                        {result.estimated && (
                          <p className="text-brand-muted-text/60 text-xs mt-2 font-sans">{t("calc.estimated")}</p>
                        )}
                      </div>

                      {/* Action Buttons: COMMANDER + Add to Cart */}
                      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                        {/* COMMANDER - Primary CTA */}
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            if (!isAuthenticated) {
                              router.push("/auth/login");
                              return;
                            }
                            setShowCheckout(true);
                          }}
                          className="w-full sm:w-auto flex items-center justify-center gap-2 font-black rounded-xl px-8 py-3.5 shadow-lg transition-all font-display text-sm bg-brand-pink text-white hover:bg-brand-pink-light shadow-brand-pink/30 hover:shadow-brand-pink/50"
                        >
                          <ShoppingBag className="w-5 h-5" />
                          {t("calc.commander")}
                          <ArrowRight className="w-4 h-4" />
                        </motion.button>

                        {/* Add to Cart - Secondary */}
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={handleAddToCart}
                          disabled={addedToCart}
                          className={`w-full sm:w-auto flex items-center justify-center gap-2 font-bold rounded-xl px-6 py-3 shadow-md transition-all font-display text-sm ${
                            addedToCart
                              ? "bg-green-500 text-white shadow-green-500/30"
                              : "bg-white text-brand-pink border-2 border-brand-pink/30 hover:bg-brand-pink/5"
                          }`}
                        >
                          {addedToCart ? (
                            <>
                              <Check className="w-4 h-4" />
                              {t("calc.addedToCart")}
                            </>
                          ) : (
                            <>
                              <ShoppingBag className="w-4 h-4" />
                              {t("calc.addToCart")}
                            </>
                          )}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ──── Checkout Form ──── */}
              <AnimatePresence>
                {showCheckout && result && !orderSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -30 }}
                    className="mt-6"
                  >
                    <div className="bg-white rounded-2xl p-6 sm:p-8 border-2 border-brand-pink/20 shadow-xl">
                      {/* Checkout Header */}
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-brand-dark font-bold text-xl flex items-center gap-2 font-heading">
                            <Truck className="w-5 h-5 text-brand-pink" />
                            {t("calc.checkout.title")}
                          </h3>
                          <p className="text-brand-muted-text text-sm mt-1 font-sans">
                            {t("calc.checkout.subtitle")}
                          </p>
                        </div>
                        <button
                          onClick={() => setShowCheckout(false)}
                          className="p-2 hover:bg-brand-pink/10 rounded-full transition-colors"
                        >
                          <X className="w-5 h-5 text-brand-dark/50" />
                        </button>
                      </div>

                      {/* Order Summary */}
                      <div className="mb-6 p-4 rounded-xl bg-brand-pink/5 border border-brand-pink/10">
                        <div className="flex items-center gap-3">
                          {result.image && (
                            <img src={result.image} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-brand-dark font-bold text-sm truncate font-display">
                              {result.productName || (isArabic ? "منتج" : "Produit")}
                            </p>
                            <p className="text-brand-pink font-black text-lg font-heading">
                              {result.dzd.toLocaleString()} DA
                            </p>
                          </div>
                          <span className="text-xs bg-brand-pink/10 text-brand-pink px-3 py-1 rounded-full font-display font-bold">
                            x1
                          </span>
                        </div>
                      </div>

                      {/* Use Saved Info Toggle */}
                      {profile && (profile.phone || profile.wilaya || profile.address) && (
                        <div className="mb-4">
                          <button
                            onClick={() => {
                              const newVal = !useSaved;
                              setUseSaved(newVal);
                              if (newVal) {
                                const communes = getCommunesForWilaya(profile.wilaya || "");
                                setAvailableCommunes(communes);
                                setShipping({
                                  fullName: profile.name || shipping.fullName,
                                  phone: profile.phone || shipping.phone,
                                  wilaya: profile.wilaya || shipping.wilaya,
                                  commune: profile.commune || shipping.commune,
                                  codePostal: profile.codePostal || shipping.codePostal,
                                  address: profile.address || shipping.address,
                                  notes: shipping.notes,
                                });
                              }
                            }}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all w-full text-left ${
                              useSaved
                                ? "bg-brand-pink/10 border-brand-pink/30 text-brand-pink"
                                : "bg-white border-brand-muted-warm/30 text-brand-dark/60 hover:border-brand-pink/20"
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                              useSaved ? "bg-brand-pink border-brand-pink" : "border-brand-muted-warm"
                            }`}>
                              {useSaved && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className="font-display font-medium text-sm">
                              {t("calc.checkout.useSaved")}
                            </span>
                          </button>
                        </div>
                      )}

                      {/* Shipping Form */}
                      <div className="space-y-4">
                        {/* Full Name */}
                        <div>
                          <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-sans">
                            <User className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                            {t("calc.checkout.fullName")}
                          </label>
                          <Input
                            value={shipping.fullName}
                            onChange={(e) => setShipping({ ...shipping, fullName: e.target.value })}
                            placeholder={t("calc.checkout.fullNamePlaceholder")}
                            className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-sans"
                            dir={isArabic ? "rtl" : "ltr"}
                          />
                        </div>

                        {/* Phone */}
                        <div>
                          <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-sans">
                            <Phone className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                            {t("calc.checkout.phone")}
                          </label>
                          <Input
                            value={shipping.phone}
                            onChange={(e) => setShipping({ ...shipping, phone: e.target.value })}
                            placeholder={t("calc.checkout.phonePlaceholder")}
                            className={`bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-sans ${
                              shipping.phone && !isValidPhone(shipping.phone) ? "border-red-300 focus:border-red-400" : ""
                            }`}
                            dir="ltr"
                          />
                          {shipping.phone && !isValidPhone(shipping.phone) && (
                            <p className="text-red-500 text-xs mt-1 font-sans">{t("calc.checkout.errorPhone")}</p>
                          )}
                        </div>

                        {/* Wilaya */}
                        <div>
                          <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-sans">
                            <MapPin className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                            {t("calc.checkout.wilaya")}
                          </label>
                          <select
                            value={shipping.wilaya}
                            onChange={(e) => {
                              const newWilaya = e.target.value;
                              const communes = getCommunesForWilaya(newWilaya);
                              setAvailableCommunes(communes);
                              setShipping({ ...shipping, wilaya: newWilaya, commune: "", codePostal: "" });
                            }}
                            className="w-full bg-brand-light/50 border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 px-4 text-brand-dark font-sans appearance-none cursor-pointer"
                            dir={isArabic ? "rtl" : "ltr"}
                          >
                            <option value="">{t("calc.checkout.wilayaPlaceholder")}</option>
                            {WILAYAS.map((w) => (
                              <option key={w} value={w}>{w}</option>
                            ))}
                          </select>
                        </div>

                        {/* Commune */}
                        <div>
                          <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-sans">
                            <MapPin className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                            {t("calc.checkout.commune")}
                          </label>
                          <select
                            value={shipping.commune}
                            onChange={(e) => {
                              const selectedCommune = availableCommunes.find(c => c.name === e.target.value);
                              setShipping({ 
                                ...shipping, 
                                commune: e.target.value, 
                                codePostal: selectedCommune?.postalCode || shipping.codePostal,
                              });
                            }}
                            disabled={!shipping.wilaya}
                            className="w-full bg-brand-light/50 border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 px-4 text-brand-dark font-sans appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            dir={isArabic ? "rtl" : "ltr"}
                          >
                            <option value="">{t("calc.checkout.communePlaceholder")}</option>
                            {availableCommunes.map((c) => (
                              <option key={c.name} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Code Postal */}
                        <div>
                          <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-sans">
                            <MapPin className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                            {t("calc.checkout.codePostal")}
                          </label>
                          <Input
                            value={shipping.codePostal}
                            onChange={(e) => setShipping({ ...shipping, codePostal: e.target.value })}
                            placeholder={t("calc.checkout.codePostalPlaceholder")}
                            className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-sans"
                            dir="ltr"
                            maxLength={5}
                          />
                        </div>

                        {/* Address */}
                        <div>
                          <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-sans">
                            <Truck className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                            {t("calc.checkout.address")}
                          </label>
                          <Input
                            value={shipping.address}
                            onChange={(e) => setShipping({ ...shipping, address: e.target.value })}
                            placeholder={t("calc.checkout.addressPlaceholder")}
                            className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-sans"
                            dir={isArabic ? "rtl" : "ltr"}
                          />
                        </div>

                        {/* Notes */}
                        <div>
                          <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-sans">
                            <StickyNote className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                            {t("calc.checkout.notes")}
                          </label>
                          <Input
                            value={shipping.notes}
                            onChange={(e) => setShipping({ ...shipping, notes: e.target.value })}
                            placeholder={t("calc.checkout.notesPlaceholder")}
                            className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-sans"
                            dir={isArabic ? "rtl" : "ltr"}
                          />
                        </div>

                        {/* Save Info Checkbox */}
                        <div>
                          <button
                            onClick={() => setSaveInfo(!saveInfo)}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all w-full text-left ${
                              saveInfo
                                ? "bg-brand-pink/5 border-brand-pink/20 text-brand-pink"
                                : "bg-white border-brand-muted-warm/30 text-brand-dark/60 hover:border-brand-pink/20"
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                              saveInfo ? "bg-brand-pink border-brand-pink" : "border-brand-muted-warm"
                            }`}>
                              {saveInfo && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className="font-display font-medium text-sm">
                              {t("calc.checkout.saveInfo")}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Error */}
                      {shippingError && (
                        <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200">
                          <p className="text-red-600 text-sm font-sans font-medium">{shippingError}</p>
                        </div>
                      )}

                      {/* Submit */}
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={handleSubmitOrder}
                        disabled={submitting}
                        className="w-full mt-6 bg-brand-pink text-white hover:bg-brand-pink-light font-black rounded-xl py-4 shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display text-base flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            {t("calc.checkout.submitting")}
                          </>
                        ) : (
                          <>
                            <Check className="w-5 h-5" />
                            {t("calc.checkout.submit")}
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ──── Order Success ──── */}
              <AnimatePresence>
                {orderSuccess && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="mt-6"
                  >
                    <div className="bg-green-50 rounded-2xl p-8 border border-green-200 text-center">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                        className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4"
                      >
                        <Check className="w-8 h-8 text-white" />
                      </motion.div>
                      <h3 className="text-green-700 font-bold text-xl font-heading mb-2">
                        {t("calc.checkout.success")}
                      </h3>
                      <p className="text-green-600 text-sm font-sans mb-6">
                        {t("calc.checkout.successMsg")}
                      </p>
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href="/commandes">
                          <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            className="bg-green-600 text-white font-bold rounded-xl px-6 py-3 shadow-lg font-display text-sm hover:bg-green-700 transition-all"
                          >
                            {t("calc.checkout.viewOrders")}
                          </motion.button>
                        </Link>
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            setOrderSuccess(false);
                            setShowCheckout(false);
                            setResult(null);
                            setProductUrl("");
                            setManualPrice("");
                          }}
                          className="bg-white text-green-700 font-bold rounded-xl px-6 py-3 shadow-md font-display text-sm border border-green-200 hover:bg-green-50 transition-all"
                        >
                          {t("calc.checkout.newOrder")}
                        </motion.button>
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
              <p className="text-brand-muted-text/60 text-sm mb-3 font-sans">{t("calc.supportedStores")}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {["Temu", "AliExpress"].map((store) => (
                  <span key={store} className="px-3 py-1 rounded-full text-xs bg-white text-brand-muted-text border border-brand-muted-warm font-display">
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
