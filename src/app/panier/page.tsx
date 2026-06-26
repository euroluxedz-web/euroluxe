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
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

const EXCHANGE_RATE = 300;

export default function PanierPage() {
  const { t, isArabic } = useLanguage();
  const { user, loading: authLoading } = useAuth();
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
        .then(() => loadCartFromServer())
        .catch((err) => console.error("Cart sync error:", err))
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

  const handleOrder = async () => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }

    if (items.length === 0) return;

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
            price: i.price,
            quantity: i.quantity,
            image: i.image,
          })),
          total: totalPrice(),
        }),
      });

      if (res.ok) {
        clearCart();
        syncClearOnServer();
        router.push("/commandes");
      }
    } catch (err) {
      console.error("Order error:", err);
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
                          {item.price.toFixed(2)} USD
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
                          {(item.price * item.quantity).toFixed(2)} USD
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
                onClick={handleOrder}
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
