"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { useAuth } from "@/components/auth-provider";
import {
  useCartStore,
  syncRemoveFromServer,
  syncUpdateOnServer,
  syncClearOnServer,
  loadCartFromServer,
  mergeGuestCartToServer,
  type CartItemType,
} from "@/lib/cart-store";
import {
  Trash2,
  Plus,
  Minus,
  ShoppingCart,
  Package,
  ArrowRight,
  MapPin,
  Phone,
  User,
  Truck,
  StickyNote,
  Check,
  X,
  CheckCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { getCommunesForWilaya, getWilayaNames, type Commune } from "@/lib/algeria-communes";

const EXCHANGE_RATE = 300;
const WILAYAS = getWilayaNames();

interface ShippingInfo {
  fullName: string;
  phone: string;
  wilaya: string;
  commune: string;
  codePostal: string;
  address: string;
  notes: string;
}

/** Validate Algerian phone number */
function isValidPhone(phone: string): boolean {
  return /^(0[5-7]\d{8}|\+213[5-7]\d{8})$/.test(phone.replace(/\s/g, ""));
}

export default function PanierPage() {
  const { t, isArabic } = useLanguage();
  const { user, profile, loading: authLoading } = useAuth();
  const isAuthenticated = !!user;
  const router = useRouter();
  const {
    items,
    removeItem,
    updateQuantity,
    clearCart,
    totalPrice,
    isHydrated,
  } = useCartStore();
  const [ordering, setOrdering] = useState(false);
  const [serverSynced, setServerSynced] = useState(false);
  const [forceReady, setForceReady] = useState(false);

  // Checkout state
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [shippingError, setShippingError] = useState("");
  const [availableCommunes, setAvailableCommunes] = useState<Commune[]>([]);
  const [saveInfo, setSaveInfo] = useState(true);

  const [shipping, setShipping] = useState<ShippingInfo>({
    fullName: "",
    phone: "",
    wilaya: "",
    commune: "",
    codePostal: "",
    address: "",
    notes: "",
  });

  // Pre-fill shipping info from user profile
  useEffect(() => {
    if (profile && isAuthenticated) {
      const hasSavedInfo = profile.phone || profile.wilaya || profile.address;
      if (hasSavedInfo) {
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

  // Safety: force-show the cart after 2 seconds even if hydration stalls
  useEffect(() => {
    const t = setTimeout(() => setForceReady(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // Load cart: show local items immediately, sync with server in background
  useEffect(() => {
    if (authLoading) return;

    if (isAuthenticated) {
      // Sync in background — don't block the UI
      const syncTimeout = setTimeout(() => setServerSynced(true), 5000);

      mergeGuestCartToServer()
        .then(() => {
          // Merge succeeded — safe to load fresh cart state from server.
          return loadCartFromServer();
        })
        .catch((err) => {
          // Merge failed (POST returned non-ok, or network error).
          // DO NOT call loadCartFromServer — that could wipe the local
          // cart if the server still has nothing for this user.
          console.warn("[panier] Cart merge skipped loadFromServer:", err?.message || err);
        })
        .finally(() => {
          clearTimeout(syncTimeout);
          setServerSynced(true);
        });
    } else {
      setServerSynced(true);
    }
  }, [authLoading, isAuthenticated]);

  const handleRemove = (id: string) => {
    removeItem(id);
    if (isAuthenticated) {
      syncRemoveFromServer(id);
    }
  };

  const handleQuantityChange = (id: string, qty: number) => {
    updateQuantity(id, qty);
    if (isAuthenticated) {
      syncUpdateOnServer(id, qty);
    }
  };

  // When user clicks "Commander" - show checkout form instead of directly creating order
  const handleCommander = () => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    if (items.length === 0) return;
    setShowCheckout(true);
    setShippingError("");
  };

  // Submit order with shipping info
  const handleSubmitOrder = async () => {
    // Validate shipping info
    if (!shipping.fullName.trim()) {
      setShippingError(isArabic ? "يرجى إدخال الاسم الكامل" : "Veuillez entrer votre nom complet");
      return;
    }
    if (!shipping.phone.trim() || !isValidPhone(shipping.phone)) {
      setShippingError(isArabic ? "يرجى إدخال رقم هاتف صحيح" : "Veuillez entrer un numéro de téléphone valide");
      return;
    }
    if (!shipping.wilaya) {
      setShippingError(isArabic ? "يرجى اختيار الولاية" : "Veuillez sélectionner une wilaya");
      return;
    }
    if (!shipping.commune) {
      setShippingError(isArabic ? "يرجى اختيار البلدية" : "Veuillez sélectionner une commune");
      return;
    }
    if (!shipping.address.trim()) {
      setShippingError(isArabic ? "يرجى إدخال العنوان" : "Veuillez entrer votre adresse");
      return;
    }

    setShippingError("");
    setOrdering(true);

    try {
      // Get Firebase auth token for API call
      const { auth } = await import("@/lib/firebase");
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          items: items.map((i) => ({
            name: i.name,
            price: i.price * EXCHANGE_RATE, // Convert USD → DZD for API
            quantity: i.quantity,
            image: i.image,
          })),
          total: totalDZD, // Send total in DZD
          fullName: shipping.fullName,
          phone: shipping.phone,
          email: user?.email || "",
          wilaya: shipping.wilaya,
          commune: shipping.commune,
          codePostal: shipping.codePostal,
          address: shipping.address,
          notes: shipping.notes,
        }),
      });

      if (res.ok) {
        // Save user info to profile if checkbox is checked
        if (saveInfo) {
          try {
            const { updateUserData } = await import("@/lib/firebase");
            const uid = auth.currentUser?.uid;
            if (uid) {
              await updateUserData(uid, {
                phone: shipping.phone,
                wilaya: shipping.wilaya,
                commune: shipping.commune,
                codePostal: shipping.codePostal,
                address: shipping.address,
              });
            }
          } catch (e) {
            console.warn("[panier] Could not save shipping info to profile:", e);
          }
        }

        // Clear local cart + server cart
        clearCart();
        syncClearOnServer();

        // Show success state instead of redirecting immediately
        setOrderSuccess(true);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("Order API error:", res.status, errData);
        // If unauthorized, redirect to login
        if (res.status === 401) {
          router.push("/auth/login");
        } else {
          setShippingError(
            isArabic ? "حدث خطأ أثناء تقديم الطلب. يرجى المحاولة مرة أخرى." 
                     : "Une erreur est survenue lors de la commande. Veuillez réessayer."
          );
        }
      }
    } catch (err) {
      console.error("Order error:", err);
      setShippingError(
        isArabic ? "حدث خطأ في الاتصال. يرجى التحقق من الإنترنت والمحاولة مرة أخرى." 
                 : "Erreur de connexion. Veuillez vérifier votre connexion et réessayer."
      );
    } finally {
      setOrdering(false);
    }
  };

  const totalUSD = totalPrice();
  const totalDZD = totalUSD * EXCHANGE_RATE;

  // Show a brief loading spinner only while Zustand hydrates from localStorage
  // (typically < 200ms). After that, always show the cart — even if server
  // sync is still in progress. Force-show after 2s as a safety fallback.
  if (!isHydrated && !forceReady) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-blue to-white">
        <Navbar />
        <div className="pt-28 pb-16 flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-pink" />
        </div>
        <Footer />
      </div>
    );
  }

  /** Helper: format a USD price as DZD string */
  const fmtDZD = (usd: number) => (usd * EXCHANGE_RATE).toLocaleString();

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-blue to-white">
      <Navbar />
      <div className="pt-24 sm:pt-28 pb-36 sm:pb-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl font-bold font-heading text-brand-dark flex items-center justify-center gap-3">
              <ShoppingCart className="w-8 h-8 text-brand-pink" />
              {t("cart.title")}
            </h1>
            <p className="mt-2 text-brand-dark/60 font-display">
              {t("cart.subtitle")}
            </p>
          </motion.div>

          <AnimatePresence mode="wait">
            {items.length === 0 && !orderSuccess ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-16"
              >
                <motion.div
                  animate={{ y: [0, -12, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Package className="w-16 h-16 text-brand-dark/20 mx-auto mb-4" />
                </motion.div>
                <p className="text-brand-dark/50 font-display text-lg">
                  {t("cart.empty")}
                </p>
                <Link href="/calculateur">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    className="mt-6 bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 px-6 rounded-full shadow-lg shadow-brand-pink/30 font-display transition-all"
                  >
                    {t("cart.startShopping")}
                  </motion.button>
                </Link>
              </motion.div>
            ) : (
              <motion.div
                key="cart-content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Cart Items */}
                {items.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: isArabic ? 100 : -100 }}
                    transition={{ duration: 0.3, delay: i * 0.08 }}
                    layout
                    className="bg-white rounded-2xl shadow-md p-4 sm:p-5 border border-brand-muted-warm/20"
                  >
                    {/* Mobile: Vertical layout, Desktop: Horizontal */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* Image */}
                      {item.image && (
                        <div className="flex-shrink-0">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full sm:w-16 h-32 sm:h-16 object-cover rounded-xl"
                          />
                        </div>
                      )}

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-brand-dark font-display truncate">
                          {item.name}
                        </h3>
                        <p className="text-brand-pink font-bold text-sm mt-1">
                          {fmtDZD(item.price)} DA
                        </p>
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-brand-dark/40 hover:text-brand-pink underline truncate block"
                          >
                            {t("cart.viewProduct")}
                          </a>
                        )}
                      </div>

                      {/* Controls row */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                        {/* Quantity controls */}
                        <div className="flex items-center gap-2">
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() =>
                              handleQuantityChange(item.id, item.quantity - 1)
                            }
                            className="w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-brand-blue flex items-center justify-center hover:bg-brand-pink/20 transition-colors"
                          >
                            <Minus className="w-3 h-3 text-brand-dark" />
                          </motion.button>
                          <span className="font-bold text-brand-dark w-8 text-center font-display text-lg sm:text-base">
                            {item.quantity}
                          </span>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() =>
                              handleQuantityChange(item.id, item.quantity + 1)
                            }
                            className="w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-brand-blue flex items-center justify-center hover:bg-brand-pink/20 transition-colors"
                          >
                            <Plus className="w-3 h-3 text-brand-dark" />
                          </motion.button>
                        </div>

                        {/* Price */}
                        <p className="font-bold text-brand-dark font-display text-sm sm:w-28 text-right">
                          {fmtDZD(item.price * item.quantity)} DA
                        </p>

                        {/* Delete */}
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleRemove(item.id)}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                      </div>
                    </div>

                    {/* Swipe-to-delete hint on mobile */}
                    <div className="sm:hidden mt-2 flex items-center justify-end gap-1 opacity-30">
                      <Trash2 className="w-3 h-3" />
                      <span className="text-[10px] font-display">
                        {isArabic ? "اسحب للحذف" : "Appuyez pour supprimer"}
                      </span>
                    </div>
                  </motion.div>
                ))}

                {/* ──── Checkout Form ──── */}
                <AnimatePresence>
                  {showCheckout && !orderSuccess && (
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
                            <p className="text-brand-dark/50 text-sm mt-1 font-display">
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
                          <p className="text-brand-dark/60 text-xs font-bold uppercase tracking-wide mb-3 font-display">
                            {isArabic ? "ملخص الطلب" : "Résumé de la commande"}
                          </p>
                          <div className="space-y-2">
                            {items.map((item, idx) => (
                              <div key={idx} className="flex items-center gap-3">
                                {item.image && (
                                  <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-brand-dark font-medium text-sm truncate font-display">
                                    {item.name}
                                  </p>
                                  <p className="text-brand-dark/50 text-xs font-display">
                                    {fmtDZD(item.price)} DA × {item.quantity}
                                  </p>
                                </div>
                                <span className="text-brand-pink font-bold text-sm font-display">
                                  {fmtDZD(item.price * item.quantity)} DA
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 pt-3 border-t border-brand-pink/10 flex justify-between items-center">
                            <span className="font-bold font-display text-brand-dark">
                              {t("cart.totalDZD")}
                            </span>
                            <span className="font-black font-display text-brand-pink text-lg">
                              {totalDZD.toLocaleString()} DZD
                            </span>
                          </div>
                        </div>

                        {/* Shipping Form */}
                        <div className="space-y-4">
                          {/* Full Name */}
                          <div>
                            <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-display">
                              <User className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                              {t("calc.checkout.fullName")}
                            </label>
                            <Input
                              value={shipping.fullName}
                              onChange={(e) => setShipping({ ...shipping, fullName: e.target.value })}
                              placeholder={t("calc.checkout.fullNamePlaceholder")}
                              className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-display"
                              dir={isArabic ? "rtl" : "ltr"}
                            />
                          </div>

                          {/* Phone */}
                          <div>
                            <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-display">
                              <Phone className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                              {t("calc.checkout.phone")}
                            </label>
                            <Input
                              value={shipping.phone}
                              onChange={(e) => setShipping({ ...shipping, phone: e.target.value })}
                              placeholder={t("calc.checkout.phonePlaceholder")}
                              className={`bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-display ${
                                shipping.phone && !isValidPhone(shipping.phone) ? "border-red-300 focus:border-red-400" : ""
                              }`}
                              dir="ltr"
                            />
                            {shipping.phone && !isValidPhone(shipping.phone) && (
                              <p className="text-red-500 text-xs mt-1 font-display">{t("calc.checkout.errorPhone")}</p>
                            )}
                          </div>

                          {/* Wilaya */}
                          <div>
                            <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-display">
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
                              className="w-full bg-brand-light/50 border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 px-4 text-brand-dark font-display appearance-none cursor-pointer"
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
                            <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-display">
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
                              className="w-full bg-brand-light/50 border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 px-4 text-brand-dark font-display appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                            <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-display">
                              <MapPin className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                              {t("calc.checkout.codePostal")}
                            </label>
                            <Input
                              value={shipping.codePostal}
                              onChange={(e) => setShipping({ ...shipping, codePostal: e.target.value })}
                              placeholder={t("calc.checkout.codePostalPlaceholder")}
                              className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-display"
                              dir="ltr"
                              maxLength={5}
                            />
                          </div>

                          {/* Address */}
                          <div>
                            <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-display">
                              <Truck className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                              {t("calc.checkout.address")}
                            </label>
                            <Input
                              value={shipping.address}
                              onChange={(e) => setShipping({ ...shipping, address: e.target.value })}
                              placeholder={t("calc.checkout.addressPlaceholder")}
                              className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-display"
                              dir={isArabic ? "rtl" : "ltr"}
                            />
                          </div>

                          {/* Notes */}
                          <div>
                            <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-display">
                              <StickyNote className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                              {t("calc.checkout.notes")}
                            </label>
                            <Input
                              value={shipping.notes}
                              onChange={(e) => setShipping({ ...shipping, notes: e.target.value })}
                              placeholder={t("calc.checkout.notesPlaceholder")}
                              className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-display"
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
                            <p className="text-red-600 text-sm font-display font-medium">{shippingError}</p>
                          </div>
                        )}

                        {/* Submit */}
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={handleSubmitOrder}
                          disabled={ordering}
                          className="w-full mt-6 bg-brand-pink text-white hover:bg-brand-pink-light font-black rounded-xl py-4 shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display text-base flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {ordering ? (
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
                          <CheckCircle className="w-8 h-8 text-white" />
                        </motion.div>
                        <h3 className="text-green-700 font-bold text-xl font-heading mb-2">
                          {t("calc.checkout.success")}
                        </h3>
                        <p className="text-green-600 text-sm font-display mb-6">
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
                          <Link href="/calculateur">
                            <motion.button
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                              className="bg-white text-green-700 font-bold rounded-xl px-6 py-3 shadow-md font-display text-sm border border-green-200 hover:bg-green-50 transition-all"
                            >
                              {t("cart.startShopping")}
                            </motion.button>
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Sticky Total Section on Mobile */}
      {items.length > 0 && !showCheckout && !orderSuccess && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed bottom-0 left-0 right-0 z-40 md:relative md:bottom-auto md:left-auto md:right-auto md:z-auto"
        >
          <div className="md:max-w-4xl md:mx-auto px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] md:pb-0 md:pt-6">
            <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 border border-brand-muted-warm/30">
              <div className="flex justify-between items-center mb-3 sm:mb-4">
                <span className="text-brand-dark font-bold font-display text-lg">
                  {t("cart.totalDZD")}
                </span>
                <span className="font-bold font-display text-lg text-brand-pink">
                  {totalDZD.toLocaleString()} DZD
                </span>
              </div>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleCommander}
                disabled={ordering || items.length === 0}
                className="w-full bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 h-12 rounded-xl shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {ordering ? t("cart.ordering") : t("cart.placeOrder")}
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}

      <Footer />
    </div>
  );
}
