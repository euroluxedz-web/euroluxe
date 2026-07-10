"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, Truck, CheckCircle, Clock, XCircle, Search, Users, ShoppingBag,
  Archive, ChevronDown, ChevronUp, MapPin, Phone, Mail, PackageCheck,
  RefreshCw, ExternalLink, User,
} from "lucide-react";

// Admin email is verified server-side via API (not exposed in client code)

const STATUS_CONFIG = {
  pending: { label: "En attente", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Clock },
  confirmed: { label: "Confirmée", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: Package },
  shipped: { label: "Expédiée", color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: Truck },
  delivered: { label: "Livrée", color: "text-green-700", bg: "bg-green-50 border-green-200", icon: CheckCircle },
  cancelled: { label: "Annulée", color: "text-red-700", bg: "bg-red-50 border-red-200", icon: XCircle },
};

interface Order {
  id: string;
  items?: string;
  total: number;
  status: string;
  fullName?: string;
  phone?: string;
  email?: string;
  wilaya?: string;
  commune?: string;
  address?: string;
  notes?: string;
  url?: string;
  trackingCode?: string;
  userId?: string;
  userOrderId?: string;
  createdAt?: any;
}

interface UserProfile {
  uid: string;
  email?: string;
  name?: string;
  phone?: string;
  wilaya?: string;
  commune?: string;
  address?: string;
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [view, setView] = useState<"orders" | "users" | "archive">("orders");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [selectedUserOrders, setSelectedUserOrders] = useState<Order[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const getAuthToken = async () => {
    if (!user) return null;
    const { auth } = await import("@/lib/firebase");
    return auth.currentUser ? await auth.currentUser.getIdToken() : null;
  };

  const fetchOrders = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch("/api/admin/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.orders) setOrders(data.orders);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch("/api/admin/orders?action=users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUserOrders = async (uid: string) => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(`/api/admin/orders?action=user-orders&uid=${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.orders) setSelectedUserOrders(data.orders);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }
    // Verify admin access via API (server-side check)
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/admin/orders", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          router.push("/");
          return;
        }
        const data = await res.json();
        if (data.orders) setOrders(data.orders);
        setLoading(false);
      } catch {
        router.push("/");
      }
    })();
  }, [user, authLoading, router]);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId, status: newStatus }),
      });
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveTracking = async (orderId: string) => {
    const trackingCode = trackingInputs[orderId] || "";
    const token = await getAuthToken();
    if (!token) return;
    try {
      await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId, status: "shipped", trackingCode }),
      });
      setOrders(orders.map(o => o.id === orderId ? { ...o, trackingCode, status: "shipped" } : o));
    } catch (err) {
      console.error(err);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  // Filter orders
  const filteredOrders = orders.filter(o => {
    const matchesSearch = !searchQuery ||
      o.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.phone?.includes(searchQuery) ||
      o.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || o.status === statusFilter;
    const isArchived = o.status === "delivered" || o.status === "cancelled";
    if (view === "archive") return matchesSearch && isArchived;
    return matchesSearch && matchesStatus && !isArchived;
  });

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

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-blue to-white">
      <Navbar />
      <div className="pt-24 sm:pt-28 pb-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex items-center justify-between flex-wrap gap-4"
          >
            <div>
              <h1 className="text-3xl font-bold font-heading text-brand-dark flex items-center gap-3">
                <Package className="w-8 h-8 text-brand-pink" />
                Admin Dashboard
              </h1>
              <p className="mt-1 text-brand-dark/60 font-display">
                Gérez les commandes et les clients
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-brand-muted-warm/50 text-brand-dark hover:bg-brand-pink/5 transition-all font-display text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Actualiser
            </button>
          </motion.div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 p-1 bg-white/60 rounded-xl border border-brand-muted-warm/30">
            {[
              { id: "orders", label: "Commandes", icon: ShoppingBag, count: orders.filter(o => o.status !== "delivered" && o.status !== "cancelled").length },
              { id: "users", label: "Clients", icon: Users, count: users.length },
              { id: "archive", label: "Archives", icon: Archive, count: orders.filter(o => o.status === "delivered" || o.status === "cancelled").length },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setView(tab.id as any);
                  if (tab.id === "users" && users.length === 0) fetchUsers();
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg font-bold text-sm transition-all font-display ${
                  view === tab.id
                    ? "bg-brand-pink text-white shadow-md"
                    : "text-brand-dark/60 hover:text-brand-dark"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    view === tab.id ? "bg-white/20" : "bg-brand-pink/10 text-brand-pink"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search + Filter (for orders views) */}
          {view !== "users" && (
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/30" />
                <input
                  type="text"
                  placeholder="Rechercher par nom, téléphone, email, ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-muted-warm/50 bg-white text-sm font-display focus:outline-none focus:ring-2 focus:ring-brand-pink/30"
                />
              </div>
              {view === "orders" && (
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2.5 rounded-xl border border-brand-muted-warm/50 bg-white text-sm font-display focus:outline-none focus:ring-2 focus:ring-brand-pink/30"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="pending">En attente</option>
                  <option value="confirmed">Confirmée</option>
                  <option value="shipped">Expédiée</option>
                </select>
              )}
            </div>
          )}

          {/* Orders View */}
          {view !== "users" && (
            <div className="space-y-3">
              {filteredOrders.length === 0 ? (
                <div className="text-center py-16 bg-white/60 rounded-2xl border border-brand-muted-warm/20">
                  <Package className="w-12 h-12 text-brand-dark/20 mx-auto mb-3" />
                  <p className="text-brand-dark/50 font-display">
                    {view === "archive" ? "Aucune commande archivée" : "Aucune commande trouvée"}
                  </p>
                </div>
              ) : (
                filteredOrders.map((order, i) => {
                  const config = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
                  const StatusIcon = config.icon;
                  const isExpanded = expandedOrder === order.id;
                  const trackingCode = trackingInputs[order.id] !== undefined ? trackingInputs[order.id] : (order.trackingCode || "");

                  let parsedItems: any[] = [];
                  try { parsedItems = JSON.parse(order.items || "[]"); } catch {}

                  let date = "";
                  try {
                    const raw = order.createdAt;
                    if (raw && typeof raw === "object" && raw._seconds) {
                      date = new Date(raw._seconds * 1000).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                    } else if (raw) {
                      date = new Date(raw).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                    }
                  } catch {}

                  return (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="bg-white rounded-2xl shadow-sm overflow-hidden border border-brand-muted-warm/20"
                    >
                      {/* Status bar */}
                      <div className={`px-4 sm:px-6 py-3 border-b ${config.bg} flex items-center justify-between`}>
                        <div className="flex items-center gap-2">
                          <StatusIcon className={`w-4 h-4 ${config.color}`} />
                          <span className={`text-sm font-bold font-display ${config.color}`}>{config.label}</span>
                        </div>
                        <span className="text-xs text-brand-dark/40 font-mono">#{order.id.slice(-8).toUpperCase()}</span>
                      </div>

                      <div className="p-4 sm:p-6">
                        {/* Top: Customer + Date */}
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-bold font-display text-brand-dark">{order.fullName || "—"}</p>
                            {date && <p className="text-xs text-brand-dark/40 font-display">📅 {date}</p>}
                          </div>
                          <div className="text-right">
                            <p className="font-bold font-display text-brand-pink text-lg">{order.total?.toLocaleString() || 0} DA</p>
                            <p className="text-xs text-brand-dark/40 font-display">
                            {parsedItems.length} produit(s) • {parsedItems.reduce((s: number, i: any) => s + (i.quantity || 1), 0)} article(s)
                          </p>
                          </div>
                        </div>

                        {/* Quick info */}
                        <div className="flex flex-wrap gap-3 text-xs text-brand-dark/60 font-display mb-3">
                          {order.phone && (
                            <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {order.phone}</span>
                          )}
                          {order.email && (
                            <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {order.email}</span>
                          )}
                          {order.wilaya && (
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {order.wilaya}{order.commune ? ` - ${order.commune}` : ""}</span>
                          )}
                        </div>

                        {/* Tracking code (if exists) */}
                        {order.trackingCode && (
                          <div className="mb-3 p-2 rounded-lg bg-purple-50 border border-purple-200 flex items-center gap-2">
                            <PackageCheck className="w-4 h-4 text-purple-600 shrink-0" />
                            <span className="text-xs text-purple-700 font-display">
                              Code de suivi: <span className="font-bold">{order.trackingCode}</span>
                            </span>
                          </div>
                        )}

                        {/* Expand button */}
                        <button
                          onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                          className="text-xs text-brand-pink font-display hover:underline flex items-center gap-1"
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {isExpanded ? "Réduire" : "Voir détails + actions"}
                        </button>

                        {/* Expanded section */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="pt-4 mt-3 border-t border-brand-muted-warm/20 space-y-4">
                                {/* Items */}
                                <div>
                                  <p className="text-xs font-bold text-brand-dark/60 uppercase mb-2 font-display">Articles</p>
                                  <div className="space-y-2">
                                    {parsedItems.map((item, idx) => {
                                      const qty = item.quantity || 1;
                                      const isMulti = qty > 1;
                                      return (
                                        <div key={idx} className={`flex items-center gap-2 text-sm p-2 rounded-lg ${isMulti ? "bg-amber-50 border border-amber-200" : ""}`}>
                                          {item.image && <img src={item.image} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />}
                                          <div className="flex-1 min-w-0">
                                            <span className="font-display text-brand-dark truncate block">{item.name}</span>
                                            {isMulti && (
                                              <span className="text-xs font-bold text-amber-600 font-display">
                                                ⚠ Quantité: {qty} × {item.price?.toLocaleString()} DA = {(item.price * qty).toLocaleString()} DA
                                              </span>
                                            )}
                                          </div>
                                          {!isMulti && <span className="font-display text-brand-dark/60 shrink-0">{item.price?.toLocaleString()} DA</span>}
                                          {isMulti && <span className="font-display text-amber-700 font-bold shrink-0">{(item.price * qty).toLocaleString()} DA</span>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Product images */}
                                {order.url && (
                                  <div>
                                    <p className="text-xs font-bold text-brand-dark/60 uppercase mb-2 font-display">Image produit</p>
                                    <a href={order.url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-pink font-display hover:underline flex items-center gap-1">
                                      <ExternalLink className="w-3 h-3" /> Voir l'image du produit
                                    </a>
                                  </div>
                                )}

                                {/* Address */}
                                {order.address && (
                                  <div>
                                    <p className="text-xs font-bold text-brand-dark/60 uppercase mb-1 font-display">Adresse</p>
                                    <p className="text-sm text-brand-dark/70 font-display">{order.address}</p>
                                  </div>
                                )}

                                {/* Notes */}
                                {order.notes && (
                                  <div>
                                    <p className="text-xs font-bold text-brand-dark/60 uppercase mb-1 font-display">Notes</p>
                                    <p className="text-sm text-brand-dark/70 font-display">{order.notes}</p>
                                  </div>
                                )}

                                {/* Tracking code input */}
                                <div>
                                  <p className="text-xs font-bold text-brand-dark/60 uppercase mb-2 font-display">Code de suivi</p>
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      placeholder="Entrez le code de suivi..."
                                      value={trackingCode}
                                      onChange={(e) => setTrackingInputs({ ...trackingInputs, [order.id]: e.target.value })}
                                      className="flex-1 px-3 py-2 rounded-lg border border-brand-muted-warm/50 text-sm font-display focus:outline-none focus:ring-2 focus:ring-purple-300"
                                    />
                                    <button
                                      onClick={() => handleSaveTracking(order.id)}
                                      className="px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-bold font-display hover:bg-purple-600 transition-all"
                                    >
                                      Sauver + Expédier
                                    </button>
                                  </div>
                                </div>

                                {/* Status change */}
                                <div>
                                  <p className="text-xs font-bold text-brand-dark/60 uppercase mb-2 font-display">Changer le statut</p>
                                  <div className="flex flex-wrap gap-2">
                                    {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
                                      <button
                                        key={status}
                                        onClick={() => handleStatusChange(order.id, status)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold font-display border transition-all ${
                                          order.status === status
                                            ? `${cfg.bg} ${cfg.color} border-current`
                                            : "bg-white text-brand-dark/50 border-brand-muted-warm/30 hover:border-brand-pink/30"
                                        }`}
                                      >
                                        {cfg.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          )}

          {/* Users View */}
          {view === "users" && (
            <div className="space-y-3">
              {users.length === 0 ? (
                <div className="text-center py-16 bg-white/60 rounded-2xl border border-brand-muted-warm/20">
                  <Users className="w-12 h-12 text-brand-dark/20 mx-auto mb-3" />
                  <p className="text-brand-dark/50 font-display">Aucun client trouvé</p>
                </div>
              ) : (
                users.map((u, i) => (
                  <motion.div
                    key={u.uid}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white rounded-2xl shadow-sm border border-brand-muted-warm/20 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-pink/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-brand-pink" />
                        </div>
                        <div>
                          <p className="font-bold font-display text-brand-dark">{u.name || u.email || "—"}</p>
                          <div className="flex flex-wrap gap-2 text-xs text-brand-dark/50 font-display">
                            {u.email && <span>{u.email}</span>}
                            {u.phone && <span>• {u.phone}</span>}
                            {u.wilaya && <span>• {u.wilaya}</span>}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (selectedUser?.uid === u.uid) {
                            setSelectedUser(null);
                            setSelectedUserOrders([]);
                          } else {
                            setSelectedUser(u);
                            fetchUserOrders(u.uid);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-brand-pink/10 text-brand-pink text-xs font-bold font-display hover:bg-brand-pink/20 transition-all"
                      >
                        {selectedUser?.uid === u.uid ? "Masquer" : "Voir commandes"}
                      </button>
                    </div>

                    {/* User orders */}
                    <AnimatePresence>
                      {selectedUser?.uid === u.uid && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-4 mt-3 border-t border-brand-muted-warm/20">
                            {selectedUserOrders.length === 0 ? (
                              <p className="text-sm text-brand-dark/40 font-display text-center py-4">Aucune commande</p>
                            ) : (
                              <div className="space-y-2">
                                {selectedUserOrders.map(o => {
                                  const cfg = STATUS_CONFIG[o.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
                                  return (
                                    <div key={o.id} className="flex items-center justify-between p-2 rounded-lg bg-brand-blue/20">
                                      <div>
                                        <span className="text-xs font-mono text-brand-dark/50">#{o.id.slice(-8).toUpperCase()}</span>
                                        <p className="text-sm font-display text-brand-dark">{o.total?.toLocaleString()} DA</p>
                                      </div>
                                      <span className={`text-xs font-bold font-display ${cfg.color}`}>{cfg.label}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
