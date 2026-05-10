"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { useCartStore, type CartItemType } from "@/lib/cart-store";
import {
  Trash2,
  Plus,
  Minus,
  ShoppingCart,
  Package,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

const EXCHANGE_RATE = 300; // 1 USD = 300 DZD

export default function PanierPage() {
  const { t, isArabic } = useLanguage();
  const { data: session, status } = useSession();
  const router = useRouter();
  const {
    items,
    removeItem,
    updateQuantity,
    clearCart,
    setItems,
    totalPrice,
  } = useCartStore();
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);

  // Load cart from server if logged in
  useEffect(() => {
    if (status === "unauthenticated") {
      setLoading(false);
      return;
    }
    if (status === "authenticated") {
      fetch("/api/cart")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setItems(data);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [status, setItems]);

  const syncCartToServer = async (updatedItems: CartItemType[]) => {
    if (status !== "authenticated") return;
    try {
      // Sync all items: clear then re-add
      await fetch("/api/cart", { method: "DELETE" });
      for (const item of updatedItems) {
        await fetch("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
      }
    } catch (err) {
      console.error("Cart sync error:", err);
    }
  };

  const handleRemove = (id: string) => {
    const updated = items.filter((i) => i.id !== id);
    removeItem(id);
    if (status === "authenticated") {
      fetch(`/api/cart/${id}`, { method: "DELETE" }).catch(console.error);
    }
  };

  const handleQuantityChange = (id: string, qty: number) => {
    updateQuantity(id, qty);
    if (status === "authenticated") {
      fetch(`/api/cart/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: qty }),
      }).catch(console.error);
    }
  };

  const handleOrder = async () => {
    if (status !== "authenticated") {
      router.push("/auth/login");
      return;
    }

    if (items.length === 0) return;

    setOrdering(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  if (loading) {
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
      <div className="pt-28 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold font-heading text-brand-dark flex items-center justify-center gap-3">
              <ShoppingCart className="w-8 h-8 text-brand-pink" />
              {t("cart.title")}
            </h1>
            <p className="mt-2 text-brand-dark/60 font-display">
              {t("cart.subtitle")}
            </p>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-16 h-16 text-brand-dark/20 mx-auto mb-4" />
              <p className="text-brand-dark/50 font-display text-lg">
                {t("cart.empty")}
              </p>
              <Link href="/calculateur">
                <button className="mt-6 bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 px-6 rounded-full shadow-lg shadow-brand-pink/30 font-display transition-all">
                  {t("cart.startShopping")}
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl shadow-md p-5 flex items-center gap-4 border border-brand-muted-warm/20"
                >
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-16 h-16 object-cover rounded-xl"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-brand-dark font-display truncate">
                      {item.name}
                    </h3>
                    <p className="text-brand-pink font-bold text-sm mt-1">
                      {item.price.toFixed(2)} USD{" "}
                      <span className="text-brand-dark/40">
                        ({(item.price * EXCHANGE_RATE).toLocaleString()} DZD)
                      </span>
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        handleQuantityChange(item.id, item.quantity - 1)
                      }
                      className="w-8 h-8 rounded-full bg-brand-blue flex items-center justify-center hover:bg-brand-pink/20 transition-colors"
                    >
                      <Minus className="w-3 h-3 text-brand-dark" />
                    </button>
                    <span className="font-bold text-brand-dark w-8 text-center font-display">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() =>
                        handleQuantityChange(item.id, item.quantity + 1)
                      }
                      className="w-8 h-8 rounded-full bg-brand-blue flex items-center justify-center hover:bg-brand-pink/20 transition-colors"
                    >
                      <Plus className="w-3 h-3 text-brand-dark" />
                    </button>
                  </div>
                  <p className="font-bold text-brand-dark font-display w-28 text-right">
                    {(item.price * item.quantity * EXCHANGE_RATE).toLocaleString()}{" "}
                    DZD
                  </p>
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {/* Total */}
              <div className="bg-white rounded-2xl shadow-xl p-6 border border-brand-muted-warm/30 mt-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-brand-dark/60 font-display">
                    {t("cart.totalUSD")}
                  </span>
                  <span className="font-bold font-display">
                    {totalUSD.toFixed(2)} USD
                  </span>
                </div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-brand-dark font-bold font-display text-lg">
                    {t("cart.totalDZD")}
                  </span>
                  <span className="font-bold font-display text-lg text-brand-pink">
                    {totalDZD.toLocaleString()} DZD
                  </span>
                </div>
                <p className="text-xs text-brand-dark/40 font-display mb-4">
                  {t("cart.exchangeRate")}
                </p>
                <button
                  onClick={handleOrder}
                  disabled={ordering || items.length === 0}
                  className="w-full bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 rounded-xl shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {ordering ? t("cart.ordering") : t("cart.placeOrder")}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
