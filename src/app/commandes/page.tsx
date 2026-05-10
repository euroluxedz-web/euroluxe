"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ClipboardList, Package, Truck, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

interface OrderItem {
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

interface Order {
  id: string;
  items: string; // JSON string
  total: number;
  status: string;
  wilaya?: string;
  address?: string;
  phone?: string;
  createdAt: string;
}

const EXCHANGE_RATE = 300; // internal conversion rate

const statusConfig: Record<
  string,
  { color: string; bgColor: string; icon: any; labelKey: string }
> = {
  pending: {
    color: "text-yellow-700",
    bgColor: "bg-yellow-100 border-yellow-200",
    icon: ClipboardList,
    labelKey: "orders.statusPending",
  },
  confirmed: {
    color: "text-blue-700",
    bgColor: "bg-blue-100 border-blue-200",
    icon: Package,
    labelKey: "orders.statusConfirmed",
  },
  shipped: {
    color: "text-purple-700",
    bgColor: "bg-purple-100 border-purple-200",
    icon: Truck,
    labelKey: "orders.statusShipped",
  },
  delivered: {
    color: "text-green-700",
    bgColor: "bg-green-100 border-green-200",
    icon: CheckCircle,
    labelKey: "orders.statusDelivered",
  },
  cancelled: {
    color: "text-red-700",
    bgColor: "bg-red-100 border-red-200",
    icon: XCircle,
    labelKey: "orders.statusCancelled",
  },
};

/** Get Firebase ID token for API calls */
async function getAuthToken(): Promise<string | null> {
  try {
    const { auth } = await import("@/lib/firebase");
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export default function CommandesPage() {
  const { t, isArabic } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;

      const res = await fetch("/api/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }
    fetchOrders();
  }, [user, authLoading, router]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  if (authLoading || loading) {
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
      <div className="pt-24 sm:pt-28 pb-24 sm:pb-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl font-bold font-heading text-brand-dark flex items-center justify-center gap-3">
              <ClipboardList className="w-8 h-8 text-brand-pink" />
              {t("orders.title")}
            </h1>
            <p className="mt-2 text-brand-dark/60 font-display">
              {t("orders.subtitle")}
            </p>

            {/* Pull to refresh hint */}
            {orders.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.95, rotate: -180 }}
                onClick={handleRefresh}
                disabled={refreshing}
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand-dark/40 font-display hover:text-brand-pink transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
                {isArabic ? "اسحب للتحديث" : "Tirer pour actualiser"}
              </motion.button>
            )}
          </motion.div>

          <AnimatePresence mode="wait">
            {orders.length === 0 ? (
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
                  {t("orders.empty")}
                </p>
                <Link href="/calculateur">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    className="mt-6 bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 px-6 rounded-full shadow-lg shadow-brand-pink/30 font-display transition-all"
                  >
                    {t("orders.startShopping")}
                  </motion.button>
                </Link>
              </motion.div>
            ) : (
              <motion.div
                key="orders"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {orders.map((order, i) => {
                  const parsedItems: OrderItem[] = JSON.parse(
                    order.items || "[]"
                  );
                  const statusInfo = statusConfig[order.status] || statusConfig.pending;
                  const StatusIcon = statusInfo.icon;
                  const date = new Date(order.createdAt).toLocaleDateString(
                    isArabic ? "ar-DZ" : "fr-FR",
                    {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    }
                  );

                  return (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.08 }}
                      className="bg-white rounded-2xl shadow-md p-4 sm:p-6 border border-brand-muted-warm/20"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="min-w-0">
                          <p className="text-xs text-brand-dark/40 font-display">
                            {t("orders.orderNumber")} {order.id.slice(-8).toUpperCase()}
                          </p>
                          <p className="text-xs text-brand-dark/40 font-display">
                            {date}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold font-display flex items-center gap-1 border ${statusInfo.bgColor} ${statusInfo.color}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          <span className="hidden sm:inline">{t(statusInfo.labelKey)}</span>
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="flex items-center gap-1 mb-4">
                        {["pending", "confirmed", "shipped", "delivered"].map(
                          (s, idx) => {
                            const orderIndex = [
                              "pending",
                              "confirmed",
                              "shipped",
                              "delivered",
                            ].indexOf(order.status);
                            const isActive = idx <= orderIndex && orderIndex >= 0;
                            const isCurrentStep = idx === orderIndex;
                            return (
                              <div key={s} className="flex-1 flex items-center">
                                <motion.div
                                  initial={{ scaleX: 0 }}
                                  animate={{ scaleX: isActive ? 1 : 0 }}
                                  transition={{ duration: 0.5, delay: 0.2 + idx * 0.1 }}
                                  className={`h-2 sm:h-1.5 flex-1 rounded-full origin-left ${
                                    isActive
                                      ? isCurrentStep
                                        ? "bg-brand-pink"
                                        : "bg-brand-pink/60"
                                      : "bg-brand-muted-warm/30"
                                  }`}
                                  style={{ scaleX: isActive ? 1 : 1 }}
                                />
                              </div>
                            );
                          }
                        )}
                      </div>

                      {/* Items */}
                      <div className="space-y-2 mb-4">
                        {parsedItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {item.image && (
                                <img
                                  src={item.image}
                                  alt=""
                                  className="w-8 h-8 rounded-lg object-cover shrink-0"
                                />
                              )}
                              <span className="font-display text-brand-dark truncate">
                                {item.name} × {item.quantity}
                              </span>
                            </div>
                            <span className="font-display text-brand-dark/60 shrink-0 ml-2">
                              {(item.price * item.quantity * EXCHANGE_RATE).toLocaleString()}{" "}
                              DZD
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Total */}
                      <div className="flex justify-between items-center pt-3 border-t border-brand-muted-warm/20">
                        <span className="font-bold font-display text-brand-dark">
                          {t("orders.total")}
                        </span>
                        <span className="font-bold font-display text-brand-pink text-lg">
                          {(order.total * EXCHANGE_RATE).toLocaleString()} DZD
                        </span>
                      </div>

                      {/* Delivery Info */}
                      {(order.wilaya || order.phone) && (
                        <div className="mt-3 text-xs text-brand-dark/40 font-display">
                          {order.wilaya && (
                            <span>
                              📍 {order.wilaya}
                              {order.address ? ` - ${order.address}` : ""}
                            </span>
                          )}
                          {order.phone && <span className="ml-4">📞 {order.phone}</span>}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <Footer />
    </div>
  );
}
