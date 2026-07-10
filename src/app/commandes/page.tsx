"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ClipboardList, Package, Truck, CheckCircle, XCircle, RefreshCw, Clock, MapPin, Phone as PhoneIcon, PackageCheck } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

interface OrderItem {
  name: string;
  price: number;
  quantity: number;
  image?: string;
  url?: string;
}

interface Order {
  id: string;
  items: string; // JSON string
  total: number;
  status: string;
  fullName?: string;
  wilaya?: string;
  commune?: string;
  address?: string;
  phone?: string;
  createdAt: string;
  trackingCode?: string;
}

const statusConfig: Record<
  string,
  { color: string; bgColor: string; icon: any; labelKey: string }
> = {
  pending: {
    color: "text-amber-700",
    bgColor: "bg-amber-50 border-amber-200",
    icon: Clock,
    labelKey: "orders.statusPending",
  },
  confirmed: {
    color: "text-blue-700",
    bgColor: "bg-blue-50 border-blue-200",
    icon: Package,
    labelKey: "orders.statusConfirmed",
  },
  shipped: {
    color: "text-purple-700",
    bgColor: "bg-purple-50 border-purple-200",
    icon: Truck,
    labelKey: "orders.statusShipped",
  },
  delivered: {
    color: "text-green-700",
    bgColor: "bg-green-50 border-green-200",
    icon: CheckCircle,
    labelKey: "orders.statusDelivered",
  },
  cancelled: {
    color: "text-red-700",
    bgColor: "bg-red-50 border-red-200",
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

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch("/api/orders", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

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

            {orders.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.95, rotate: -180 }}
                onClick={handleRefresh}
                disabled={refreshing}
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand-dark/40 font-display hover:text-brand-pink transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
                {isArabic ? "تحديث" : "Actualiser"}
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
                  let parsedItems: OrderItem[] = [];
                  try {
                    parsedItems = JSON.parse(order.items || "[]");
                  } catch {}

                  const statusInfo = statusConfig[order.status] || statusConfig.pending;
                  const StatusIcon = statusInfo.icon;

                  // Handle createdAt — could be Timestamp object, ISO string, or number
                  let date = "";
                  try {
                    const raw = (order as any).createdAt;
                    if (raw && typeof raw === "object" && raw._seconds) {
                      // Firestore Timestamp format
                      date = new Date(raw._seconds * 1000).toLocaleDateString(
                        isArabic ? "ar-DZ" : "fr-FR",
                        { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
                      );
                    } else if (raw) {
                      date = new Date(raw).toLocaleDateString(
                        isArabic ? "ar-DZ" : "fr-FR",
                        { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
                      );
                    }
                  } catch {}

                  // Total is already in DZD (stored in DZD)
                  const totalDZD = typeof order.total === "number" ? order.total : 0;

                  return (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.08 }}
                      className="bg-white rounded-2xl shadow-md overflow-hidden border border-brand-muted-warm/20"
                    >
                      {/* Status Header Bar */}
                      <div className={`px-4 sm:px-6 py-3 border-b ${statusInfo.bgColor}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <StatusIcon className={`w-4 h-4 ${statusInfo.color}`} />
                            <span className={`text-sm font-bold font-display ${statusInfo.color}`}>
                              {t(statusInfo.labelKey)}
                            </span>
                          </div>
                          <span className="text-xs text-brand-dark/40 font-display">
                            #{order.id.slice(-8).toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="p-4 sm:p-6">
                        {/* Date */}
                        {date && (
                          <p className="text-xs text-brand-dark/40 font-display mb-3">
                            📅 {date}
                          </p>
                        )}

                        {/* Progress Bar */}
                        <div className="flex items-center gap-1 mb-4">
                          {["pending", "confirmed", "shipped", "delivered"].map((s, idx) => {
                            const statuses = ["pending", "confirmed", "shipped", "delivered"];
                            const orderIndex = statuses.indexOf(order.status);
                            const isActive = idx <= orderIndex && orderIndex >= 0;
                            const isCurrentStep = idx === orderIndex;

                            return (
                              <div key={s} className="flex-1 flex items-center">
                                <div
                                  className={`h-2 flex-1 rounded-full transition-all ${
                                    isActive
                                      ? isCurrentStep
                                        ? "bg-brand-pink"
                                        : "bg-brand-pink/50"
                                      : "bg-gray-100"
                                  }`}
                                />
                              </div>
                            );
                          })}
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
                                {typeof item.price === "number"
                                  ? item.price.toLocaleString()
                                  : item.price}{" "}
                                DA
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
                            {totalDZD.toLocaleString()} DA
                          </span>
                        </div>

                        {/* Delivery Info */}
                        {(order.wilaya || order.phone || order.address) && (
                          <div className="mt-3 p-3 rounded-xl bg-brand-blue/30 space-y-1">
                            {order.wilaya && (
                              <div className="flex items-center gap-2 text-xs text-brand-dark/50 font-display">
                                <MapPin className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  {order.wilaya}
                                  {order.commune ? ` - ${order.commune}` : ""}
                                  {order.address ? ` - ${order.address}` : ""}
                                </span>
                              </div>
                            )}
                            {order.phone && (
                              <div className="flex items-center gap-2 text-xs text-brand-dark/50 font-display">
                                <PhoneIcon className="w-3.5 h-3.5 shrink-0" />
                                <span>{order.phone}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Tracking Code */}
                        {order.trackingCode && (
                          <div className="mt-3 p-3 rounded-xl bg-purple-50 border border-purple-200">
                            <div className="flex items-center gap-2">
                              <PackageCheck className="w-4 h-4 text-purple-600 shrink-0" />
                              <div>
                                <p className="text-xs text-purple-600 font-bold font-display">
                                  {isArabic ? "كود التتبع" : "Code de suivi"}
                                </p>
                                <p className="text-sm text-purple-700 font-mono font-bold">{order.trackingCode}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
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
