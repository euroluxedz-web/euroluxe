"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ClipboardList, Package, Truck, CheckCircle, XCircle, RefreshCw, Clock, MapPin, Phone as PhoneIcon, PackageCheck, Star, Camera, Coins, Loader2, X } from "lucide-react";
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
  paidWithWallet?: number;
  paidWithPoints?: number;
  reviewSubmitted?: boolean;
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
  const { user, loading: authLoading, refreshWallet } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);

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
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0">
                                <PackageCheck className="w-4 h-4 text-purple-600 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-xs text-purple-600 font-bold font-display">
                                    {isArabic ? "كود التتبع" : "Code de suivi"}
                                  </p>
                                  <p className="text-sm text-purple-700 font-mono font-bold truncate" dir="ltr">{order.trackingCode}</p>
                                </div>
                              </div>
                              <a
                                href={`https://t.17track.net/num/${encodeURIComponent(order.trackingCode)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold font-display transition-all shadow-md shadow-purple-600/20"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                {isArabic ? "تتبّع شحنتي" : "Suivre mon colis"}
                              </a>
                            </div>
                            <p className="text-[11px] text-purple-500 font-display mt-2 leading-relaxed">
                              {isArabic
                                ? "اضغط زر التتبع لمعرفة مكان شحنتك لحظة بلحظة لدى شركة التوصيل."
                                : "Cliquez sur le bouton pour suivre l'avancement de votre colis en temps réel."}
                            </p>
                          </div>
                        )}

                        {/* Payment summary */}
                        {(order.paidWithWallet || order.paidWithPoints) ? (
                          <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                            <p className="text-xs text-emerald-700 font-bold font-display mb-1">
                              {isArabic ? "مدفوع مسبقاً" : "Déjà payé"}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {!!order.paidWithWallet && (
                                <span className="text-xs text-emerald-700 font-display bg-emerald-100 px-2 py-0.5 rounded-lg">
                                  {isArabic ? "محفظة" : "Portefeuille"}: {Math.round(order.paidWithWallet).toLocaleString()} دج
                                </span>
                              )}
                              {!!order.paidWithPoints && (
                                <span className="text-xs text-violet-700 font-display bg-violet-100 px-2 py-0.5 rounded-lg">
                                  {isArabic ? "نقاط" : "Points"}: {Math.round(order.paidWithPoints).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : null}

                        {/* Review CTA for delivered orders */}
                        {order.status === "delivered" && !order.reviewSubmitted && (
                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setReviewOrder(order)}
                            className="mt-4 w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-bold py-3 rounded-xl font-display text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25"
                          >
                            <Camera className="w-4 h-4" />
                            {isArabic ? "صوّر ما استلمته واربح نقاط" : "Photographiez et gagnez des points"}
                            <span className="bg-white/20 px-2 py-0.5 rounded-lg text-xs font-mono">
                              +{Math.round(order.total * 0.1)} {isArabic ? "نقطة" : "pts"}
                            </span>
                          </motion.button>
                        )}
                        {order.status === "delivered" && order.reviewSubmitted && (
                          <div className="mt-3 flex items-center justify-center gap-2 text-violet-600 bg-violet-50 border border-violet-200 rounded-xl py-2.5 px-3">
                            <Star className="w-4 h-4 fill-violet-400 text-violet-400" />
                            <span className="text-xs font-bold font-display">
                              {isArabic ? "شكراً! مراجعتك قيد المراجعة أو تمت معالجتها" : "Merci ! Votre avis a été soumis"}
                            </span>
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

      {/* Review submission modal */}
      <AnimatePresence>
        {reviewOrder && (
          <ReviewModal
            order={reviewOrder}
            isArabic={isArabic}
            onClose={() => setReviewOrder(null)}
            onSubmitted={() => {
              setReviewOrder(null);
              fetchOrders();
              refreshWallet();
            }}
          />
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}

/* ─────────────────── Review Modal (photo + rating + comment → points) ─────────────────── */

function ReviewModal({
  order,
  isArabic,
  onClose,
  onSubmitted,
}: {
  order: Order;
  isArabic: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  const potentialPoints = Math.round(order.total * 0.1);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) {
      setError(isArabic ? "حجم الصورة يجب أن يكون أقل من 2.5MB" : "Image trop grande (max 2.5MB)");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError(isArabic ? "يرجى اختيار صورة" : "Veuillez choisir une image");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhoto(ev.target?.result as string);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!photo) {
      setError(isArabic ? "يرجى تصوير المنتج الذي استلمته" : "Veuillez photographier le produit reçu");
      return;
    }
    if (comment.trim().length < 5) {
      setError(isArabic ? "اكتب مراجعة قصيرة (5 أحرف على الأقل)" : "Écrivez un court avis (min. 5 caractères)");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("NO_TOKEN");
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId: order.id, rating, comment, photo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ERROR");
      onSubmitted();
    } catch (e: any) {
      setError(
        e?.message === "Review already submitted for this order"
          ? isArabic ? "تمت إضافة مراجعة لهذا الطلب مسبقاً" : "Avis déjà soumis pour cette commande"
          : isArabic ? "حدث خطأ، حاول مرة أخرى" : "Une erreur est survenue"
      );
    }
    setBusy(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xl font-bold font-heading text-brand-dark">
              {isArabic ? "مراجعة الطلب" : "Avis sur la commande"}
            </h3>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
              <X className="w-4 h-4 text-brand-dark" />
            </button>
          </div>
          <p className="text-brand-dark/50 text-xs font-display mb-1 font-mono">{order.id}</p>

          {/* Points teaser */}
          <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-200 rounded-xl p-3 mb-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5 text-violet-500" />
            </div>
            <p className="text-violet-700 text-xs font-display leading-relaxed">
              {isArabic
                ? `صوّر ما استلمته واكتب مراجعتك لتحصل على ${potentialPoints} نقطة (بعد موافقة الإدارة). 1 نقطة = 1 دج عند الشراء`
                : `Photographiez votre commande et laissez un avis pour gagner ${potentialPoints} points (après validation). 1 point = 1 DA`}
            </p>
          </div>

          {/* Rating */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-brand-dark mb-2 font-display">
              {isArabic ? "تقييمك" : "Votre note"}
            </label>
            <div className="flex gap-1.5" dir="ltr">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="transition-transform hover:scale-110"
                  type="button"
                >
                  <Star
                    className={`w-9 h-9 ${star <= rating ? "text-amber-400 fill-amber-400" : "text-gray-300"}`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Photo upload */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-brand-dark mb-2 font-display">
              {isArabic ? "صورة المنتج المستلم *" : "Photo du produit reçu *"}
            </label>
            {photo ? (
              <div className="relative">
                <img src={photo} alt="review" className="w-full h-44 object-cover rounded-xl border border-brand-muted-warm/30" />
                <button
                  onClick={() => setPhoto(null)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center"
                  type="button"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => photoInputRef.current?.click()}
                className="w-full h-44 rounded-xl border-2 border-dashed border-brand-muted-warm/50 hover:border-violet-400 transition-colors flex flex-col items-center justify-center gap-2 bg-violet-50/50"
                type="button"
              >
                <Camera className="w-9 h-9 text-violet-400" />
                <span className="text-violet-600 font-display text-sm font-bold">
                  {isArabic ? "اضغط لرفع الصورة" : "Cliquez pour ajouter la photo"}
                </span>
                <span className="text-brand-dark/40 font-display text-xs">
                  {isArabic ? "صوّر ما استلمته (إلزامي)" : "Photographiez ce que vous avez reçu (obligatoire)"}
                </span>
              </button>
            )}
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
          </div>

          {/* Comment */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-brand-dark mb-2 font-display">
              {isArabic ? "مراجعتك" : "Votre avis"}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400 font-display text-sm resize-none"
              placeholder={isArabic ? "كيف كانت تجربتك مع المنتج والتوصيل؟" : "Comment était le produit et la livraison ?"}
              dir="auto"
            />
          </div>

          {error && (
            <div className="mb-4 bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-200 font-display">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={busy}
            className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl font-display text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
            {isArabic ? `إرسال المراجعة (+${potentialPoints} نقطة)` : `Envoyer l'avis (+${potentialPoints} pts)`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
