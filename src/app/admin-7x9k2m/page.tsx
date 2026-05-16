"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle,
  XCircle,
  Search,
  Wallet,
  CreditCard,
  Shield,
  Eye,
  X,
  RefreshCw,
  Clock,
  TrendingUp,
  Users,
  AlertTriangle,
  LogOut,
  ShoppingBag,
  Phone,
  MapPin,
  ChevronDown,
  Package,
  Download,
  FileSpreadsheet,
  Link2,
  Copy,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ═══════════════════════════════════════════════════════
// ⚠️  ADMIN PANEL — HIGH SECURITY
// This page is completely hidden from the public site.
// No navigation link. Access requires a secret password.
// ═══════════════════════════════════════════════════════

const ADMIN_PASSWORD = "EuR0lux3@dm!n2024#Sec";

const APPS_SCRIPT_CODE = `function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Order ID", "Date", "Name", "Phone", "Email", "Wilaya", "Commune", "Code Postal", "Address", "Items", "Total (DA)", "Status", "Notes"]);
  }
  
  data.orders.forEach(function(o) {
    sheet.appendRow([
      o.id, o.date, o.name, o.phone, o.email,
      o.wilaya, o.commune, o.codePostal, o.address,
      o.items, o.total, o.status, o.notes
    ]);
  });
  
  return ContentService.createTextOutput(
    JSON.stringify({success: true})
  ).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput("EUROLUXE Orders Sync - Active");
}`;

type Tab = "orders" | "recharges" | "wallets" | "credit";

interface Recharge {
  id: string;
  uid: string;
  email: string;
  amount: number;
  status: string;
  receiptData?: string;
  createdAt: any;
  confirmedAt: any;
  adminNote?: string | null;
}

interface WalletInfo {
  uid: string;
  balance: number;
  email?: string;
}

interface Order {
  id: string;
  userId?: string;
  userOrderId?: string;
  items?: string;
  total?: number;
  wilaya?: string;
  commune?: string;
  codePostal?: string;
  address?: string;
  phone?: string;
  fullName?: string;
  email?: string;
  notes?: string;
  status?: string;
  createdAt?: any;
}

export default function AdminPanel() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("recharges");
  const [recharges, setRecharges] = useState<Recharge[]>([]);
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchEmail, setSearchEmail] = useState("");
  const [creditEmail, setCreditEmail] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [viewReceipt, setViewReceipt] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchOrder, setSearchOrder] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [googleSheetUrl, setGoogleSheetUrl] = useState("");
  const [showSheetSetup, setShowSheetSetup] = useState(false);
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [copiedSheet, setCopiedSheet] = useState(false);

  // Lock out after 5 failed attempts for 5 minutes
  const handleLogin = () => {
    if (lockedUntil && Date.now() < lockedUntil) {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      setPasswordError(`Account locked. Try again in ${remaining}s`);
      return;
    }

    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true);
      setPasswordError("");
      setLoginAttempts(0);
      // Store session with expiry (1 hour)
      sessionStorage.setItem("euroluxe_admin", Date.now().toString());
    } else {
      const newAttempts = loginAttempts + 1;
      setLoginAttempts(newAttempts);
      if (newAttempts >= 5) {
        setLockedUntil(Date.now() + 5 * 60 * 1000);
        setPasswordError("Too many attempts. Locked for 5 minutes.");
      } else {
        setPasswordError(`Incorrect password. ${5 - newAttempts} attempts remaining.`);
      }
    }
  };

  // Check existing session
  useEffect(() => {
    const session = sessionStorage.getItem("euroluxe_admin");
    if (session) {
      const loginTime = parseInt(session);
      if (Date.now() - loginTime < 60 * 60 * 1000) {
        setAuthenticated(true);
      } else {
        sessionStorage.removeItem("euroluxe_admin");
      }
    }
  }, []);

  const handleLogout = () => {
    setAuthenticated(false);
    sessionStorage.removeItem("euroluxe_admin");
    setPassword("");
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "recharges" || activeTab === "credit") {
        const res = await fetch("/api/recharge/list");
        if (res.ok) {
          const data = await res.json();
          setRecharges(data.recharges || []);
        }
      }
      if (activeTab === "wallets" || activeTab === "credit") {
        const res = await fetch("/api/admin/wallet");
        if (res.ok) {
          const data = await res.json();
          setWallets(data.wallets || []);
        }
      }
      if (activeTab === "orders") {
        const res = await fetch("/api/admin/orders", {
          headers: { "x-admin-key": ADMIN_PASSWORD },
        });
        if (res.ok) {
          const data = await res.json();
          setOrders(data.orders || []);
        }
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (authenticated) fetchData();
  }, [authenticated, fetchData]);

  const handleConfirm = async (rechargeId: string) => {
    setActionLoading(rechargeId);
    try {
      const res = await fetch("/api/recharge/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rechargeId, adminKey: ADMIN_PASSWORD }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: `Recharge confirmed! New balance: ${data.newBalance} DA` });
        fetchData();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to confirm" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (rechargeId: string) => {
    setActionLoading(rechargeId);
    try {
      const res = await fetch("/api/recharge/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rechargeId, adminKey: ADMIN_PASSWORD, note: rejectNote }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Recharge rejected" });
        setRejectId(null);
        setRejectNote("");
        fetchData();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to reject" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreditUser = async () => {
    if (!creditEmail || !creditAmount) return;
    setActionLoading("credit");
    try {
      const res = await fetch("/api/admin/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: creditEmail,
          amount: parseInt(creditAmount),
          adminKey: ADMIN_PASSWORD,
          note: creditNote,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: `Credited ${creditEmail} with ${creditAmount} DA. New balance: ${data.newBalance} DA` });
        setCreditEmail("");
        setCreditAmount("");
        setCreditNote("");
        fetchData();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to credit user" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "—";
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString("fr-FR", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  const pendingRecharges = recharges.filter((r) => r.status === "pending");
  const filteredRecharges = recharges.filter(
    (r) => !searchEmail || r.email?.toLowerCase().includes(searchEmail.toLowerCase())
  );
  const totalBalance = wallets.reduce((acc, w) => acc + (w.balance || 0), 0);

  const pendingOrders = orders.filter((o) => o.status === "pending");
  const filteredOrders = orders.filter(
    (o) =>
      !searchOrder ||
      o.fullName?.toLowerCase().includes(searchOrder.toLowerCase()) ||
      o.phone?.includes(searchOrder) ||
      o.email?.toLowerCase().includes(searchOrder.toLowerCase()) ||
      o.wilaya?.toLowerCase().includes(searchOrder.toLowerCase())
  );
  const totalOrdersRevenue = orders.reduce((acc, o) => acc + (o.total || 0), 0);

  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    setActionLoading(orderId);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_PASSWORD },
        body: JSON.stringify({ orderId, status }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: `Order ${status === "confirmed" ? "confirmed" : status === "shipped" ? "shipped" : "delivered"}!` });
        fetchData();
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Failed to update order" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setActionLoading(null);
    }
  };

  const parseItems = (itemsStr: string | undefined): Array<{name: string; price: number; quantity: number; url?: string}> => {
    if (!itemsStr) return [];
    try {
      return JSON.parse(itemsStr);
    } catch {
      return [];
    }
  };

  // ── Export Orders to CSV ──
  const handleExportCSV = () => {
    if (filteredOrders.length === 0) return;
    const headers = ["Order ID", "Date", "Customer Name", "Phone", "Email", "Wilaya", "Commune", "Code Postal", "Address", "Items", "Total (DA)", "Status", "Notes"];
    const rows = filteredOrders.map((o) => {
      const items = parseItems(o.items as string);
      const itemsStr = items.map((i) => `${i.name} x${i.quantity} (${i.price?.toLocaleString()} DA)`).join("; ");
      return [
        o.id?.substring(0, 12) || "",
        formatDate(o.createdAt),
        o.fullName || "",
        o.phone || "",
        o.email || "",
        o.wilaya || "",
        o.commune || "",
        o.codePostal || "",
        o.address || "",
        `"${itemsStr}"`,
        o.total?.toString() || "0",
        o.status || "pending",
        o.notes || "",
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `euroluxe-orders-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ type: "success", text: `Exported ${filteredOrders.length} orders to CSV!` });
  };

  // ── Sync Orders to Google Sheets ──
  const handleSyncToSheet = async () => {
    if (!googleSheetUrl.trim()) {
      setMessage({ type: "error", text: "Please enter the Google Apps Script Web App URL first." });
      return;
    }
    setSheetSyncing(true);
    try {
      const res = await fetch("/api/admin/export-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_PASSWORD },
        body: JSON.stringify({ sheetUrl: googleSheetUrl, orders: filteredOrders }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: `Synced ${filteredOrders.length} orders to Google Sheet!` });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to sync" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to connect to Google Sheets." });
    } finally {
      setSheetSyncing(false);
    }
  };

  // ── Login Screen ──
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm w-full"
        >
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <Shield className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-white font-heading">Admin Panel</h1>
            <p className="text-gray-400 font-display text-sm mt-1">Restricted Access</p>
          </div>

          <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
            <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-3 mb-4">
              <div className="flex items-center gap-2 text-red-400 text-xs font-display">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Unauthorized access is prohibited and monitored.
              </div>
            </div>

            {passwordError && (
              <div className="bg-red-900/50 text-red-300 text-sm p-3 rounded-xl mb-4 border border-red-700/50">
                {passwordError}
              </div>
            )}

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-600 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 mb-4"
              placeholder="Enter admin password"
              dir="ltr"
            />

            <button
              onClick={handleLogin}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl font-display transition-all"
            >
              Authenticate
            </button>

            {loginAttempts > 0 && loginAttempts < 5 && (
              <p className="text-gray-500 text-xs text-center mt-3 font-display">
                {5 - loginAttempts} attempts remaining
              </p>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Admin Dashboard ──
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-red-500" />
            <span className="font-bold font-heading text-lg">EUROLUXE Admin</span>
            <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">
              SECRET
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-red-400 font-display text-sm flex items-center gap-1 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="flex items-center gap-2 text-pink-400 mb-1">
              <ShoppingBag className="w-4 h-4" />
              <span className="text-xs font-display">New Orders</span>
            </div>
            <div className="text-2xl font-bold font-heading">{pendingOrders.length}</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-display">Pending Recharges</span>
            </div>
            <div className="text-2xl font-bold font-heading">{pendingRecharges.length}</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="flex items-center gap-2 text-green-400 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-display">Orders Revenue</span>
            </div>
            <div className="text-2xl font-bold font-heading">{totalOrdersRevenue.toLocaleString()} DA</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="flex items-center gap-2 text-blue-400 mb-1">
              <Wallet className="w-4 h-4" />
              <span className="text-xs font-display">Total Balance</span>
            </div>
            <div className="text-2xl font-bold font-heading">{totalBalance.toLocaleString()} DA</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="flex items-center gap-2 text-purple-400 mb-1">
              <Users className="w-4 h-4" />
              <span className="text-xs font-display">Wallets</span>
            </div>
            <div className="text-2xl font-bold font-heading">{wallets.length}</div>
          </div>
        </div>

        {/* Message */}
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`mb-4 p-3 rounded-xl text-sm font-display flex items-center gap-2 ${
                message.type === "success"
                  ? "bg-green-900/50 text-green-300 border border-green-700/50"
                  : "bg-red-900/50 text-red-300 border border-red-700/50"
              }`}
            >
              {message.type === "success" ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {message.text}
              <button onClick={() => setMessage(null)} className="ml-auto text-white/40 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {[
            { id: "orders" as Tab, label: "Orders", icon: ShoppingBag },
            { id: "recharges" as Tab, label: "Recharges", icon: CreditCard },
            { id: "wallets" as Tab, label: "Wallets", icon: Wallet },
            { id: "credit" as Tab, label: "Credit User", icon: Users },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl font-display text-sm font-bold flex items-center gap-2 transition-all ${
                activeTab === tab.id
                  ? "bg-red-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.id === "orders" && pendingOrders.length > 0 && (
                <span className="bg-pink-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {pendingOrders.length}
                </span>
              )}
              {tab.id === "recharges" && pendingRecharges.length > 0 && (
                <span className="bg-amber-500 text-black text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {pendingRecharges.length}
                </span>
              )}
            </button>
          ))}

          <button
            onClick={fetchData}
            className="ml-auto bg-gray-800 hover:bg-gray-700 text-gray-400 px-3 py-2 rounded-xl transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Orders Tab */}
        {activeTab === "orders" && (
          <div>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <input
                type="text"
                value={searchOrder}
                onChange={(e) => setSearchOrder(e.target.value)}
                placeholder="Search by name, phone, email, wilaya..."
                className="flex-1 px-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm font-display focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                dir="ltr"
              />
              {/* Export CSV Button */}
              <button
                onClick={handleExportCSV}
                disabled={filteredOrders.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-all disabled:opacity-40 disabled:hover:bg-green-600"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              {/* Google Sheets Button */}
              <button
                onClick={() => setShowSheetSetup(!showSheetSetup)}
                className={`text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-all ${
                  showSheetSetup
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-blue-400 hover:bg-gray-700 border border-blue-500/30"
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Google Sheet
              </button>
            </div>

            {/* Google Sheets Setup Panel */}
            <AnimatePresence>
              {showSheetSetup && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 overflow-hidden"
                >
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
                    <h4 className="text-blue-400 font-bold text-sm mb-3 flex items-center gap-2 font-display">
                      <FileSpreadsheet className="w-4 h-4" />
                      Google Sheets Integration
                    </h4>
                    <div className="text-gray-300 text-xs mb-3 font-display">
                      <p className="mb-2">To sync orders to Google Sheets, follow these steps:</p>
                      <ol className="list-decimal list-inside space-y-1 text-gray-400">
                        <li>Create a new Google Sheet</li>
                        <li>Go to Extensions &gt; Apps Script</li>
                        <li>Paste the script below and deploy as Web App</li>
                        <li>Paste the Web App URL below</li>
                      </ol>
                    </div>
                    {/* Apps Script Code */}
                    <div className="relative bg-gray-900 rounded-lg p-3 mb-3">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(APPS_SCRIPT_CODE);
                          setCopiedSheet(true);
                          setTimeout(() => setCopiedSheet(false), 2000);
                        }}
                        className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1 transition-all"
                      >
                        {copiedSheet ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                        {copiedSheet ? "Copied!" : "Copy"}
                      </button>
                      <pre className="text-green-400 text-xs overflow-x-auto font-mono whitespace-pre-wrap">
{`function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Order ID", "Date", "Name", "Phone", "Email", "Wilaya", "Commune", "Code Postal", "Address", "Items", "Total (DA)", "Status", "Notes"]);
  }
  
  data.orders.forEach(function(o) {
    sheet.appendRow([
      o.id, o.date, o.name, o.phone, o.email,
      o.wilaya, o.commune, o.codePostal, o.address,
      o.items, o.total, o.status, o.notes
    ]);
  });
  
  return ContentService.createTextOutput(
    JSON.stringify({success: true})
  ).setMimeType(ContentService.MimeType.JSON);
}`}
                      </pre>
                    </div>
                    {/* Web App URL Input */}
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={googleSheetUrl}
                        onChange={(e) => setGoogleSheetUrl(e.target.value)}
                        placeholder="Paste Google Apps Script Web App URL here..."
                        className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm font-display focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        dir="ltr"
                      />
                      <button
                        onClick={handleSyncToSheet}
                        disabled={sheetSyncing || !googleSheetUrl.trim() || filteredOrders.length === 0}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-all disabled:opacity-50"
                      >
                        {sheetSyncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                        Sync Now
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {loading ? (
              <div className="text-center py-12 text-gray-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading orders...
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-gray-500 font-display">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                No orders found
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((order) => {
                  const orderItems = parseItems(order.items as string);
                  const isExpanded = expandedOrder === order.id;
                  return (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`bg-gray-900 rounded-xl border transition-all ${
                        order.status === "pending"
                          ? "border-pink-500/50"
                          : order.status === "confirmed"
                          ? "border-blue-500/50"
                          : order.status === "shipped"
                          ? "border-amber-500/50"
                          : order.status === "delivered"
                          ? "border-green-500/50"
                          : "border-gray-800"
                      }`}
                    >
                      {/* Order Row */}
                      <div
                        className="p-4 cursor-pointer"
                        onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
                              <ShoppingBag className="w-5 h-5 text-pink-400" />
                            </div>
                            <div>
                              <div className="font-bold text-lg font-heading">
                                {order.total?.toLocaleString()} DA
                              </div>
                              <div className="text-gray-400 text-xs font-display">
                                {order.fullName || "—"} • {order.phone || "—"}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              {order.status === "pending" && (
                                <span className="bg-pink-500/20 text-pink-400 text-xs font-bold px-2 py-1 rounded-full">
                                  NEW
                                </span>
                              )}
                              {order.status === "confirmed" && (
                                <span className="bg-blue-500/20 text-blue-400 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" /> CONFIRMED
                                </span>
                              )}
                              {order.status === "shipped" && (
                                <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2 py-1 rounded-full">
                                  SHIPPED
                                </span>
                              )}
                              {order.status === "delivered" && (
                                <span className="bg-green-500/20 text-green-400 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" /> DELIVERED
                                </span>
                              )}
                              {order.status === "cancelled" && (
                                <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                  <XCircle className="w-3 h-3" /> CANCELLED
                                </span>
                              )}
                            </div>
                            <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500 font-display">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {order.wilaya}{order.commune ? `, ${order.commune}` : ""}</span>
                          <span>{formatDate(order.createdAt)}</span>
                          <span className="text-gray-600">ID: {order.id.substring(0, 8)}...</span>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 border-t border-gray-800 pt-4">
                              {/* Sheet-style details grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                <div className="bg-gray-800/50 rounded-lg p-3">
                                  <span className="text-gray-500 text-xs font-display block mb-1">Customer Name</span>
                                  <span className="text-white font-bold text-sm font-display">{order.fullName || "—"}</span>
                                </div>
                                <div className="bg-gray-800/50 rounded-lg p-3">
                                  <span className="text-gray-500 text-xs font-display block mb-1">Phone</span>
                                  <span className="text-white font-bold text-sm font-display flex items-center gap-1"><Phone className="w-3 h-3" /> {order.phone || "—"}</span>
                                </div>
                                <div className="bg-gray-800/50 rounded-lg p-3">
                                  <span className="text-gray-500 text-xs font-display block mb-1">Email</span>
                                  <span className="text-white text-sm font-display">{order.email || "—"}</span>
                                </div>
                                <div className="bg-gray-800/50 rounded-lg p-3">
                                  <span className="text-gray-500 text-xs font-display block mb-1">Wilaya</span>
                                  <span className="text-white text-sm font-display flex items-center gap-1"><MapPin className="w-3 h-3" /> {order.wilaya || "—"}</span>
                                </div>
                                <div className="bg-gray-800/50 rounded-lg p-3">
                                  <span className="text-gray-500 text-xs font-display block mb-1">Commune</span>
                                  <span className="text-white text-sm font-display">{order.commune || "—"}</span>
                                </div>
                                <div className="bg-gray-800/50 rounded-lg p-3">
                                  <span className="text-gray-500 text-xs font-display block mb-1">Code Postal</span>
                                  <span className="text-white text-sm font-display">{order.codePostal || "—"}</span>
                                </div>
                                <div className="bg-gray-800/50 rounded-lg p-3 sm:col-span-2">
                                  <span className="text-gray-500 text-xs font-display block mb-1">Address</span>
                                  <span className="text-white text-sm font-display">{order.address || "—"}</span>
                                </div>
                                {order.notes && (
                                  <div className="bg-amber-900/20 rounded-lg p-3 sm:col-span-2 border border-amber-700/30">
                                    <span className="text-amber-500 text-xs font-display block mb-1">Notes</span>
                                    <span className="text-amber-200 text-sm font-display">{order.notes}</span>
                                  </div>
                                )}
                              </div>

                              {/* Items */}
                              <div className="mb-4">
                                <span className="text-gray-400 text-xs font-display block mb-2">Items</span>
                                {orderItems.length > 0 ? orderItems.map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between bg-gray-800/30 rounded-lg px-3 py-2 mb-1">
                                    <span className="text-white text-sm font-display">{item.name}</span>
                                    <div className="flex items-center gap-3">
                                      <span className="text-gray-400 text-xs">x{item.quantity}</span>
                                      <span className="text-pink-400 font-bold text-sm">{item.price?.toLocaleString()} DA</span>
                                    </div>
                                  </div>
                                )) : (
                                  <span className="text-gray-500 text-xs">No item details</span>
                                )}
                              </div>

                              {/* Action buttons */}
                              <div className="flex flex-wrap gap-2">
                                {order.status === "pending" && (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(order.id, "confirmed"); }}
                                      disabled={actionLoading === order.id}
                                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1 transition-all disabled:opacity-50"
                                    >
                                      <CheckCircle className="w-3 h-3" /> Confirm
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(order.id, "cancelled"); }}
                                      disabled={actionLoading === order.id}
                                      className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1 transition-all disabled:opacity-50"
                                    >
                                      <XCircle className="w-3 h-3" /> Cancel
                                    </button>
                                  </>
                                )}
                                {order.status === "confirmed" && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(order.id, "shipped"); }}
                                    disabled={actionLoading === order.id}
                                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1 transition-all disabled:opacity-50"
                                  >
                                    🚚 Mark Shipped
                                  </button>
                                )}
                                {order.status === "shipped" && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(order.id, "delivered"); }}
                                    disabled={actionLoading === order.id}
                                    className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1 transition-all disabled:opacity-50"
                                  >
                                    <CheckCircle className="w-3 h-3" /> Mark Delivered
                                  </button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Recharges Tab */}
        {activeTab === "recharges" && (
          <div>
            <input
              type="text"
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              placeholder="Search by email..."
              className="w-full md:w-64 px-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm font-display mb-4 focus:outline-none focus:ring-2 focus:ring-red-500/50"
              dir="ltr"
            />

            {loading ? (
              <div className="text-center py-12 text-gray-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading...
              </div>
            ) : filteredRecharges.length === 0 ? (
              <div className="text-center py-12 text-gray-500 font-display">No recharges found</div>
            ) : (
              <div className="space-y-3">
                {filteredRecharges.map((recharge) => (
                  <motion.div
                    key={recharge.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`bg-gray-900 rounded-xl p-4 border ${
                      recharge.status === "pending"
                        ? "border-amber-500/50"
                        : recharge.status === "confirmed"
                        ? "border-green-800/50"
                        : "border-red-800/50"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-bold text-lg">{recharge.amount?.toLocaleString()} DA</div>
                        <div className="text-gray-400 text-sm font-display">{recharge.email}</div>
                        <div className="text-gray-500 text-xs font-display mt-1">
                          UID: {recharge.uid?.substring(0, 12)}... | {formatDate(recharge.createdAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {recharge.status === "pending" && (
                          <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2 py-1 rounded-full">
                            PENDING
                          </span>
                        )}
                        {recharge.status === "confirmed" && (
                          <span className="bg-green-500/20 text-green-400 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> CONFIRMED
                          </span>
                        )}
                        {recharge.status === "rejected" && (
                          <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> REJECTED
                          </span>
                        )}
                      </div>
                    </div>

                    {recharge.adminNote && (
                      <div className="text-red-300 text-xs font-display mb-2 bg-red-900/30 p-2 rounded-lg">
                        Note: {recharge.adminNote}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2">
                      {recharge.receiptData && (
                        <button
                          onClick={() => setViewReceipt(recharge.receiptData)}
                          className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-display px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all"
                        >
                          <Eye className="w-3 h-3" /> View Receipt
                        </button>
                      )}

                      {recharge.status === "pending" && (
                        <>
                          <button
                            onClick={() => handleConfirm(recharge.id)}
                            disabled={actionLoading === recharge.id}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg flex items-center gap-1 transition-all disabled:opacity-50"
                          >
                            {actionLoading === recharge.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3 h-3" />
                            )}
                            Confirm
                          </button>
                          <button
                            onClick={() => {
                              setRejectId(recharge.id);
                              setRejectNote("");
                            }}
                            disabled={actionLoading === recharge.id}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg flex items-center gap-1 transition-all disabled:opacity-50"
                          >
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </>
                      )}
                    </div>

                    {/* Reject inline form */}
                    <AnimatePresence>
                      {rejectId === recharge.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 bg-red-900/30 rounded-lg p-3"
                        >
                          <input
                            type="text"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            placeholder="Reason for rejection (optional)"
                            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm font-display mb-2 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReject(recharge.id)}
                              className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all"
                            >
                              Confirm Rejection
                            </button>
                            <button
                              onClick={() => setRejectId(null)}
                              className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-4 py-2 rounded-lg transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Wallets Tab */}
        {activeTab === "wallets" && (
          <div>
            {loading ? (
              <div className="text-center py-12 text-gray-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading...
              </div>
            ) : wallets.length === 0 ? (
              <div className="text-center py-12 text-gray-500 font-display">No wallets found</div>
            ) : (
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-400 font-display">UID</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-display">Email</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-display">Balance (DA)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {wallets.map((wallet) => (
                      <tr key={wallet.uid} className="hover:bg-gray-800/50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">{wallet.uid.substring(0, 12)}...</td>
                        <td className="px-4 py-3 font-display">{wallet.email || "—"}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-400">
                          {(wallet.balance || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Credit User Tab */}
        {activeTab === "credit" && (
          <div className="max-w-md">
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h3 className="font-bold font-heading text-lg mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                Credit User by Email
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 font-display mb-1">User Email</label>
                  <input
                    type="email"
                    value={creditEmail}
                    onChange={(e) => setCreditEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm font-display focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 font-display mb-1">Amount (DA)</label>
                  <input
                    type="number"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm font-display focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 font-display mb-1">Note (optional)</label>
                  <input
                    type="text"
                    value={creditNote}
                    onChange={(e) => setCreditNote(e.target.value)}
                    placeholder="Reason for credit..."
                    className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm font-display focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
                <button
                  onClick={handleCreditUser}
                  disabled={actionLoading === "credit" || !creditEmail || !creditAmount}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl font-display transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading === "credit" ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wallet className="w-4 h-4" />
                  )}
                  Credit User
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Receipt Viewer Modal */}
      <AnimatePresence>
        {viewReceipt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setViewReceipt(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setViewReceipt(null)}
                className="absolute -top-3 -right-3 bg-white text-gray-900 rounded-full w-8 h-8 flex items-center justify-center shadow-lg z-10"
              >
                <X className="w-4 h-4" />
              </button>
              <img
                src={viewReceipt}
                alt="Receipt"
                className="w-full rounded-xl shadow-2xl"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
