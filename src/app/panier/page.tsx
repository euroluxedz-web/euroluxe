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
  X,
  User,
  Phone,
  MapPin,
  Truck,
  Check,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { getWilayaNames, getCommunesForWilaya, type Commune } from "@/lib/algeria-communes";

const EXCHANGE_RATE = 300;

export default function PanierPage() {
  const { t, isArabic } = useLanguage();
  const { user, profile, refreshProfile, loading: authLoading } = useAuth();
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

  // Checkout state
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderProgress, setOrderProgress] = useState(0); // 0-100
  const [orderStage, setOrderStage] = useState(""); // current stage text
  const [shippingError, setShippingError] = useState("");
  const [availableCommunes, setAvailableCommunes] = useState<Commune[]>([]);
  // Load saved shipping info from localStorage (falls back to profile, then empty)
  const loadSavedShipping = () => {
    try {
      const saved = localStorage.getItem("euroluxe_shipping_info");
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  };
  
  const savedShipping = typeof window !== "undefined" ? loadSavedShipping() : null;
  
  const [shipping, setShipping] = useState({
    fullName: savedShipping?.fullName || profile?.name || "",
    phone: savedShipping?.phone || profile?.phone || "",
    wilaya: savedShipping?.wilaya || profile?.wilaya || "",
    commune: savedShipping?.commune || profile?.commune || "",
    codePostal: savedShipping?.codePostal || profile?.codePostal || "",
    address: savedShipping?.address || profile?.address || "",
    notes: savedShipping?.notes || "",
  });

  // Pre-fill shipping info from user profile (only fills empty fields)
  useEffect(() => {
    if (profile) {
      setShipping(prev => ({
        ...prev,
        // Only use profile values if localStorage doesn't have them
        fullName: prev.fullName || profile.name || "",
        phone: prev.phone || profile.phone || "",
        wilaya: prev.wilaya || profile.wilaya || "",
        commune: prev.commune || profile.commune || "",
        codePostal: prev.codePostal || profile.codePostal || "",
        address: prev.address || profile.address || "",
      }));
      if (profile.wilaya && !availableCommunes.length) {
        setAvailableCommunes(getCommunesForWilaya(profile.wilaya));
      }
    }
  }, [profile]);

  // Save shipping info to localStorage whenever it changes (so it persists for next order)
  useEffect(() => {
    try {
      localStorage.setItem("euroluxe_shipping_info", JSON.stringify({
        fullName: shipping.fullName,
        phone: shipping.phone,
        wilaya: shipping.wilaya,
        commune: shipping.commune,
        codePostal: shipping.codePostal,
        address: shipping.address,
        notes: shipping.notes,
      }));
    } catch {}
  }, [shipping]);

  // Load communes when wilaya changes (from saved shipping info)
  useEffect(() => {
    if (shipping.wilaya && availableCommunes.length === 0) {
      setAvailableCommunes(getCommunesForWilaya(shipping.wilaya));
    }
  }, [shipping.wilaya, availableCommunes.length]);

  const handleOpenCheckout = () => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    if (items.length === 0) return;
    setShowCheckout(true);
  };

  const handleWilayaChange = (wilaya: string) => {
    setShipping(prev => ({ ...prev, wilaya, commune: "" }));
    setAvailableCommunes(getCommunesForWilaya(wilaya));
  };

  const isValidPhone = (phone: string) => /^(05|06|07)\d{8}$/.test(phone.trim());

  const handleOrder = async () => {
    setShippingError("");

    // Validate
    if (!shipping.fullName.trim()) {
      setShippingError(isArabic ? "يرجى إدخال الاسم الكامل" : "Veuillez entrer votre nom complet");
      return;
    }
    if (!isValidPhone(shipping.phone)) {
      setShippingError(isArabic ? "رقم الهاتف غير صحيح (05/06/07 + 8 أرقام)" : "Numéro de téléphone invalide");
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
    setOrderProgress(10);
    setOrderStage(isArabic ? "جارٍ تحضير الطلب..." : "Préparation de la commande...");

    try {
      const { auth } = await import("@/lib/firebase");
      setOrderProgress(20);
      setOrderStage(isArabic ? "جارٍ التحقق من الهوية..." : "Vérification de l'identité...");
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      setOrderProgress(30);
      setOrderStage(isArabic ? "جارٍ رفع صور المنتجات..." : "Upload des images produits...");
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          items: items.map((i) => ({
            name: i.name,
            price: i.price * EXCHANGE_RATE,
            quantity: i.quantity,
            image: i.image,
            url: i.url || "",
          })),
          total: totalDZD,
          useWallet: useWallet ? walletBalance : 0,
          usePoints: usePoints ? pointsBalance : 0,
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

      setOrderProgress(70);
      setOrderStage(isArabic ? "جارٍ معالجة الطلب..." : "Traitement de la commande...");
      
      if (res.ok) {
        setOrderProgress(85);
        setOrderStage(isArabic ? "جارٍ حفظ المعلومات..." : "Sauvegarde des informations...");
        // Save shipping info to profile via API (more reliable than direct Firestore)
        if (user) {
          try {
            const { auth } = await import("@/lib/firebase");
            const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
            if (token) {
              await fetch("/api/user/profile", {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({
                  name: shipping.fullName,
                  phone: shipping.phone,
                  wilaya: shipping.wilaya,
                  commune: shipping.commune,
                  codePostal: shipping.codePostal,
                  address: shipping.address,
                }),
              });
              // Refresh profile in auth context so it's available everywhere
              await refreshProfile();
            }
          } catch (e) {
            console.error("Failed to save shipping info:", e);
          }
        }
        setOrderProgress(100);
        setOrderStage(isArabic ? "تم الطلب بنجاح!" : "Commande confirmée!");
        // Clear cart
        clearCart();
        syncClearOnServer();
        // Show success (don't redirect immediately)
        setOrderSuccess(true);
        setShowCheckout(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("Order API error:", res.status, errData);
        if (res.status === 401) {
          router.push("/auth/login");
        } else {
          setShippingError(isArabic ? "حدث خطأ، يرجى المحاولة مرة أخرى" : "Une erreur est survenue");
        }
      }
    } catch (err) {
      console.error("Order error:", err);
      setShippingError(isArabic ? "خطأ في الاتصال" : "Erreur de connexion");
    } finally {
      setSubmitting(false);
      // Reset progress after a delay (so user sees 100%)
      setTimeout(() => {
        setOrderProgress(0);
        setOrderStage("");
      }, 2000);
    }
  };

  const totalUSD = totalPrice();
  const totalDZD = totalUSD * EXCHANGE_RATE;

  // ── Wallet & points payment ──
  const walletBalance = profile?.walletBalance || 0;
  const pointsBalance = profile?.pointsBalance || 0;
  const [useWallet, setUseWallet] = useState(false);
  const [usePoints, setUsePoints] = useState(false);
  const walletPay = useWallet ? Math.min(walletBalance, totalDZD) : 0;
  const pointsPay = usePoints ? Math.min(pointsBalance, Math.max(0, totalDZD - walletPay)) : 0;
  const remainingCOD = Math.max(0, Math.round((totalDZD - walletPay - pointsPay) * 100) / 100);

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
        {/* Checkout Modal */}
      <AnimatePresence>
        {showCheckout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => !submitting && setShowCheckout(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 my-8 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-brand-dark font-display">
                  {isArabic ? "معلومات التوصيل" : "Informations de livraison"}
                </h3>
                <button
                  onClick={() => !submitting && setShowCheckout(false)}
                  className="text-brand-muted-text hover:text-brand-dark"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {shippingError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {shippingError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-brand-muted-text font-sans mb-1 block">
                    {isArabic ? "الاسم الكامل" : "Nom complet"} *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-text/40" />
                    <input
                      type="text"
                      value={shipping.fullName}
                      onChange={(e) => setShipping({ ...shipping, fullName: e.target.value })}
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-2 focus:ring-brand-pink/20 text-sm"
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-brand-muted-text font-sans mb-1 block">
                    {isArabic ? "رقم الهاتف" : "Téléphone"} *
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-text/40" />
                    <input
                      type="tel"
                      value={shipping.phone}
                      onChange={(e) => setShipping({ ...shipping, phone: e.target.value })}
                      placeholder="05/06/07XXXXXXXX"
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-2 focus:ring-brand-pink/20 text-sm"
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-brand-muted-text font-sans mb-1 block">
                      {isArabic ? "الولاية" : "Wilaya"} *
                    </label>
                    <select
                      value={shipping.wilaya}
                      onChange={(e) => handleWilayaChange(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-2 focus:ring-brand-pink/20 text-sm bg-white"
                      disabled={submitting}
                    >
                      <option value="">{isArabic ? "اختر..." : "Choisir..."}</option>
                      {getWilayaNames().map((w) => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-brand-muted-text font-sans mb-1 block">
                      {isArabic ? "البلدية" : "Commune"} *
                    </label>
                    <select
                      value={shipping.commune}
                      onChange={(e) => setShipping({ ...shipping, commune: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-2 focus:ring-brand-pink/20 text-sm bg-white"
                      disabled={submitting || !shipping.wilaya}
                    >
                      <option value="">{isArabic ? "اختر..." : "Choisir..."}</option>
                      {availableCommunes.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-brand-muted-text font-sans mb-1 block">
                    {isArabic ? "العنوان" : "Adresse"} *
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-brand-muted-text/40" />
                    <textarea
                      value={shipping.address}
                      onChange={(e) => setShipping({ ...shipping, address: e.target.value })}
                      rows={2}
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-2 focus:ring-brand-pink/20 text-sm resize-none"
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-brand-muted-text font-sans mb-1 block">
                    {isArabic ? "ملاحظات (اختياري)" : "Notes (optionnel)"}
                  </label>
                  <textarea
                    value={shipping.notes}
                    onChange={(e) => setShipping({ ...shipping, notes: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2.5 rounded-lg border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-2 focus:ring-brand-pink/20 text-sm resize-none"
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* Order summary */}
              <div className="mt-4 p-3 rounded-lg bg-brand-light/50 border border-brand-pink/15">
                <div className="flex justify-between text-sm">
                  <span className="text-brand-muted-text">{isArabic ? "المجموع" : "Total"}</span>
                  <span className="font-bold text-brand-pink text-lg">{totalDZD.toLocaleString()} DA</span>
                </div>
                <div className="flex items-center gap-1 mt-1 text-xs text-emerald-600">
                  <Truck className="w-3 h-3" />
                  {isArabic ? "توصيل مجاني" : "Livraison GRATUITE"}
                </div>
                {/* Wallet & points payment */}
                {(walletBalance > 0 || pointsBalance > 0) && (
                  <div className="mt-3 pt-3 border-t border-brand-pink/15 space-y-2">
                    {walletBalance > 0 && (
                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={useWallet}
                            onChange={(e) => setUseWallet(e.target.checked)}
                            disabled={submitting}
                            className="w-4 h-4 accent-emerald-600 rounded"
                          />
                          <span className="text-xs font-bold text-emerald-700 font-display">
                            {isArabic ? "المحفظة" : "Portefeuille"}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 font-mono" dir="ltr">
                          {Math.round(walletBalance).toLocaleString()} دج
                        </span>
                      </label>
                    )}
                    {pointsBalance > 0 && (
                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={usePoints}
                            onChange={(e) => setUsePoints(e.target.checked)}
                            disabled={submitting}
                            className="w-4 h-4 accent-violet-600 rounded"
                          />
                          <span className="text-xs font-bold text-violet-700 font-display">
                            {isArabic ? "النقاط" : "Points"}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-violet-700 font-mono" dir="ltr">
                          {Math.round(pointsBalance).toLocaleString()}
                        </span>
                      </label>
                    )}
                    {(useWallet || usePoints) && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 space-y-1">
                        {walletPay > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-emerald-700 font-display">{isArabic ? "من المحفظة" : "Portefeuille"}</span>
                            <span className="font-bold text-emerald-700 font-mono" dir="ltr">−{Math.round(walletPay).toLocaleString()} دج</span>
                          </div>
                        )}
                        {pointsPay > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-violet-700 font-display">{isArabic ? "من النقاط" : "Points"}</span>
                            <span className="font-bold text-violet-700 font-mono" dir="ltr">−{Math.round(pointsPay).toLocaleString()} دج</span>
                          </div>
                        )}
                        <div className="flex justify-between text-xs pt-1 border-t border-emerald-200">
                          <span className="text-brand-dark font-bold font-display">{isArabic ? "المتبقي عند التوصيل" : "Reste à la livraison"}</span>
                          <span className="font-bold text-brand-pink font-mono" dir="ltr">{remainingCOD.toLocaleString()} دج</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4">
                {/* Progress Bar (visible during submission) */}
                {submitting && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-brand-dark/70 font-display flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {orderStage}
                      </span>
                      <span className="text-xs font-bold text-brand-pink font-display">{orderProgress}%</span>
                    </div>
                    <div className="h-2 bg-brand-pink/10 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-brand-pink to-brand-pink-light rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${orderProgress}%` }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                )}
                <button
                  onClick={handleOrder}
                  disabled={submitting}
                  className="w-full bg-brand-pink text-white font-bold rounded-xl py-3 hover:bg-brand-pink/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {isArabic ? "جارٍ المعالجة..." : "Traitement..."}
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {isArabic ? "تأكيد الطلب" : "Confirmer la commande"}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {orderSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
                className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <Check className="w-8 h-8 text-white" />
              </motion.div>
              <h3 className="text-green-700 font-bold text-xl mb-2">
                {isArabic ? "تم الطلب بنجاح!" : "Commande confirmée!"}
              </h3>
              <p className="text-brand-muted-text text-sm mb-6">
                {isArabic ? "سيتم التواصل معك قريباً لتأكيد الطلب" : "Nous vous contacterons bientôt pour confirmer"}
              </p>
              <Link href="/commandes">
                <button className="w-full bg-green-600 text-white font-bold rounded-xl py-3 hover:bg-green-700 transition-all">
                  {isArabic ? "عرض طلباتي" : "Voir mes commandes"}
                </button>
              </Link>
              <button
                onClick={() => {
                  setOrderSuccess(false);
                  router.push("/calculateur");
                }}
                className="w-full mt-2 text-brand-muted-text font-bold rounded-xl py-3 hover:bg-brand-light transition-all"
              >
                {isArabic ? "طلب جديد" : "Nouvelle commande"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
      </div>
    );
  }

  /** Helper: format a USD price as DZD string */
  const fmtDZD = (usd: number) => (usd * EXCHANGE_RATE).toLocaleString();

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-blue to-white">
      <Navbar />
      <div className="pt-24 sm:pt-28 pb-44 sm:pb-16 px-4 sm:px-6">
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
            {items.length === 0 ? (
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
                key="cart"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
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
                      <div className="flex-shrink-0">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full sm:w-20 h-32 sm:h-20 object-cover rounded-xl border border-brand-muted-warm/30"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; const sib = (e.target as HTMLImageElement).nextElementSibling; if (sib) sib.style.display = 'flex'; }}
                          />
                        ) : null}
                        {!item.image && (
                          <div className="w-full sm:w-20 h-32 sm:h-20 rounded-xl bg-brand-light border border-brand-muted-warm/30 flex items-center justify-center">
                            <Package className="w-8 h-8 text-brand-dark/20" />
                          </div>
                        )}
                      </div>

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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Sticky Total Section on Mobile */}
      {items.length > 0 && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed bottom-0 left-0 right-0 z-[60] md:relative md:bottom-auto md:left-auto md:right-auto md:z-auto"
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
                onClick={handleOpenCheckout}
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

      {/* Checkout Modal */}
      <AnimatePresence>
        {showCheckout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => !submitting && setShowCheckout(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 my-8 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-brand-dark font-display">
                  {isArabic ? "معلومات التوصيل" : "Informations de livraison"}
                </h3>
                <button
                  onClick={() => !submitting && setShowCheckout(false)}
                  className="text-brand-muted-text hover:text-brand-dark"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {shippingError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {shippingError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-brand-muted-text font-sans mb-1 block">
                    {isArabic ? "الاسم الكامل" : "Nom complet"} *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-text/40" />
                    <input
                      type="text"
                      value={shipping.fullName}
                      onChange={(e) => setShipping({ ...shipping, fullName: e.target.value })}
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-2 focus:ring-brand-pink/20 text-sm"
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-brand-muted-text font-sans mb-1 block">
                    {isArabic ? "رقم الهاتف" : "Téléphone"} *
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-text/40" />
                    <input
                      type="tel"
                      value={shipping.phone}
                      onChange={(e) => setShipping({ ...shipping, phone: e.target.value })}
                      placeholder="05/06/07XXXXXXXX"
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-2 focus:ring-brand-pink/20 text-sm"
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-brand-muted-text font-sans mb-1 block">
                      {isArabic ? "الولاية" : "Wilaya"} *
                    </label>
                    <select
                      value={shipping.wilaya}
                      onChange={(e) => handleWilayaChange(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-2 focus:ring-brand-pink/20 text-sm bg-white"
                      disabled={submitting}
                    >
                      <option value="">{isArabic ? "اختر..." : "Choisir..."}</option>
                      {getWilayaNames().map((w) => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-brand-muted-text font-sans mb-1 block">
                      {isArabic ? "البلدية" : "Commune"} *
                    </label>
                    <select
                      value={shipping.commune}
                      onChange={(e) => setShipping({ ...shipping, commune: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-2 focus:ring-brand-pink/20 text-sm bg-white"
                      disabled={submitting || !shipping.wilaya}
                    >
                      <option value="">{isArabic ? "اختر..." : "Choisir..."}</option>
                      {availableCommunes.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-brand-muted-text font-sans mb-1 block">
                    {isArabic ? "العنوان" : "Adresse"} *
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-brand-muted-text/40" />
                    <textarea
                      value={shipping.address}
                      onChange={(e) => setShipping({ ...shipping, address: e.target.value })}
                      rows={2}
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-2 focus:ring-brand-pink/20 text-sm resize-none"
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-brand-muted-text font-sans mb-1 block">
                    {isArabic ? "ملاحظات (اختياري)" : "Notes (optionnel)"}
                  </label>
                  <textarea
                    value={shipping.notes}
                    onChange={(e) => setShipping({ ...shipping, notes: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2.5 rounded-lg border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-2 focus:ring-brand-pink/20 text-sm resize-none"
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* Order summary */}
              <div className="mt-4 p-3 rounded-lg bg-brand-light/50 border border-brand-pink/15">
                <div className="flex justify-between text-sm">
                  <span className="text-brand-muted-text">{isArabic ? "المجموع" : "Total"}</span>
                  <span className="font-bold text-brand-pink text-lg">{totalDZD.toLocaleString()} DA</span>
                </div>
                <div className="flex items-center gap-1 mt-1 text-xs text-emerald-600">
                  <Truck className="w-3 h-3" />
                  {isArabic ? "توصيل مجاني" : "Livraison GRATUITE"}
                </div>
                {/* Wallet & points payment */}
                {(walletBalance > 0 || pointsBalance > 0) && (
                  <div className="mt-3 pt-3 border-t border-brand-pink/15 space-y-2">
                    {walletBalance > 0 && (
                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={useWallet}
                            onChange={(e) => setUseWallet(e.target.checked)}
                            disabled={submitting}
                            className="w-4 h-4 accent-emerald-600 rounded"
                          />
                          <span className="text-xs font-bold text-emerald-700 font-display">
                            {isArabic ? "المحفظة" : "Portefeuille"}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 font-mono" dir="ltr">
                          {Math.round(walletBalance).toLocaleString()} دج
                        </span>
                      </label>
                    )}
                    {pointsBalance > 0 && (
                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={usePoints}
                            onChange={(e) => setUsePoints(e.target.checked)}
                            disabled={submitting}
                            className="w-4 h-4 accent-violet-600 rounded"
                          />
                          <span className="text-xs font-bold text-violet-700 font-display">
                            {isArabic ? "النقاط" : "Points"}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-violet-700 font-mono" dir="ltr">
                          {Math.round(pointsBalance).toLocaleString()}
                        </span>
                      </label>
                    )}
                    {(useWallet || usePoints) && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 space-y-1">
                        {walletPay > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-emerald-700 font-display">{isArabic ? "من المحفظة" : "Portefeuille"}</span>
                            <span className="font-bold text-emerald-700 font-mono" dir="ltr">−{Math.round(walletPay).toLocaleString()} دج</span>
                          </div>
                        )}
                        {pointsPay > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-violet-700 font-display">{isArabic ? "من النقاط" : "Points"}</span>
                            <span className="font-bold text-violet-700 font-mono" dir="ltr">−{Math.round(pointsPay).toLocaleString()} دج</span>
                          </div>
                        )}
                        <div className="flex justify-between text-xs pt-1 border-t border-emerald-200">
                          <span className="text-brand-dark font-bold font-display">{isArabic ? "المتبقي عند التوصيل" : "Reste à la livraison"}</span>
                          <span className="font-bold text-brand-pink font-mono" dir="ltr">{remainingCOD.toLocaleString()} دج</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4">
                {/* Progress Bar (visible during submission) */}
                {submitting && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-brand-dark/70 font-display flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {orderStage}
                      </span>
                      <span className="text-xs font-bold text-brand-pink font-display">{orderProgress}%</span>
                    </div>
                    <div className="h-2 bg-brand-pink/10 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-brand-pink to-brand-pink-light rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${orderProgress}%` }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                )}
                <button
                  onClick={handleOrder}
                  disabled={submitting}
                  className="w-full bg-brand-pink text-white font-bold rounded-xl py-3 hover:bg-brand-pink/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {isArabic ? "جارٍ المعالجة..." : "Traitement..."}
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {isArabic ? "تأكيد الطلب" : "Confirmer la commande"}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {orderSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
                className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <Check className="w-8 h-8 text-white" />
              </motion.div>
              <h3 className="text-green-700 font-bold text-xl mb-2">
                {isArabic ? "تم الطلب بنجاح!" : "Commande confirmée!"}
              </h3>
              <p className="text-brand-muted-text text-sm mb-6">
                {isArabic ? "سيتم التواصل معك قريباً لتأكيد الطلب" : "Nous vous contacterons bientôt pour confirmer"}
              </p>
              <Link href="/commandes">
                <button className="w-full bg-green-600 text-white font-bold rounded-xl py-3 hover:bg-green-700 transition-all">
                  {isArabic ? "عرض طلباتي" : "Voir mes commandes"}
                </button>
              </Link>
              <button
                onClick={() => {
                  setOrderSuccess(false);
                  router.push("/calculateur");
                }}
                className="w-full mt-2 text-brand-muted-text font-bold rounded-xl py-3 hover:bg-brand-light transition-all"
              >
                {isArabic ? "طلب جديد" : "Nouvelle commande"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
