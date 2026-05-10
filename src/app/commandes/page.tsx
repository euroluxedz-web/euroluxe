"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ClipboardList, Package, Truck, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";

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

const EXCHANGE_RATE = 300;

const statusConfig: Record<
  string,
  { color: string; icon: any; labelKey: string }
> = {
  pending: {
    color: "bg-yellow-100 text-yellow-700 border-yellow-200",
    icon: ClipboardList,
    labelKey: "orders.statusPending",
  },
  confirmed: {
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: Package,
    labelKey: "orders.statusConfirmed",
  },
  shipped: {
    color: "bg-purple-100 text-purple-700 border-purple-200",
    icon: Truck,
    labelKey: "orders.statusShipped",
  },
  delivered: {
    color: "bg-green-100 text-green-700 border-green-200",
    icon: CheckCircle,
    labelKey: "orders.statusDelivered",
  },
  cancelled: {
    color: "bg-red-100 text-red-700 border-red-200",
    icon: XCircle,
    labelKey: "orders.statusCancelled",
  },
};

export default function CommandesPage() {
  const { t } = useLanguage();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetch("/api/orders")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setOrders(data);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [status, router]);

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
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold font-heading text-brand-dark flex items-center justify-center gap-3">
              <ClipboardList className="w-8 h-8 text-brand-pink" />
              {t("orders.title")}
            </h1>
            <p className="mt-2 text-brand-dark/60 font-display">
              {t("orders.subtitle")}
            </p>
          </div>

          {orders.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-16 h-16 text-brand-dark/20 mx-auto mb-4" />
              <p className="text-brand-dark/50 font-display text-lg">
                {t("orders.empty")}
              </p>
              <Link href="/calculateur">
                <button className="mt-6 bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 px-6 rounded-full shadow-lg shadow-brand-pink/30 font-display transition-all">
                  {t("orders.startShopping")}
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => {
                const parsedItems: OrderItem[] = JSON.parse(
                  order.items || "[]"
                );
                const statusInfo = statusConfig[order.status] || statusConfig.pending;
                const StatusIcon = statusInfo.icon;
                const date = new Date(order.createdAt).toLocaleDateString(
                  "fr-FR",
                  {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }
                );

                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl shadow-md p-6 border border-brand-muted-warm/20"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs text-brand-dark/40 font-display">
                          {t("orders.orderNumber")} {order.id.slice(-8).toUpperCase()}
                        </p>
                        <p className="text-xs text-brand-dark/40 font-display">
                          {date}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold font-display flex items-center gap-1 border ${statusInfo.color}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {t(statusInfo.labelKey)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="flex items-center gap-1 mb-4">
                      {["pending", "confirmed", "shipped", "delivered"].map(
                        (s, i) => {
                          const orderIndex = [
                            "pending",
                            "confirmed",
                            "shipped",
                            "delivered",
                          ].indexOf(order.status);
                          const isActive = i <= orderIndex;
                          return (
                            <div key={s} className="flex-1 flex items-center">
                              <div
                                className={`h-1.5 flex-1 rounded-full ${
                                  isActive ? "bg-brand-pink" : "bg-brand-muted-warm/30"
                                }`}
                              />
                            </div>
                          );
                        }
                      )}
                    </div>

                    {/* Items */}
                    <div className="space-y-2 mb-4">
                      {parsedItems.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-sm"
                        >
                          <div className="flex items-center gap-2">
                            {item.image && (
                              <img
                                src={item.image}
                                alt=""
                                className="w-8 h-8 rounded-lg object-cover"
                              />
                            )}
                            <span className="font-display text-brand-dark">
                              {item.name} × {item.quantity}
                            </span>
                          </div>
                          <span className="font-display text-brand-dark/60">
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
