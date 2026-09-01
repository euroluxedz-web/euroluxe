"use client";

/**
 * EUROLUXE — Professional Admin Panel
 * ====================================
 * Features:
 *  - Dashboard with live KPIs & activity feed
 *  - User management (search, balances, credit/debit wallet & points)
 *  - Order management (status flow + tracking + auto-refund on cancel)
 *  - Recharge moderation (receipt viewer + confirm/reject)
 *  - Review moderation (photo viewer + approve → auto points credit)
 *  - Full financial ledger (transactions)
 *
 * Security: the panel itself contains NO secrets. Every action calls a
 * server API that verifies the admin's Firebase token against ADMIN_EMAIL.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, Package, Wallet, Star, Receipt, Activity,
  Search, RefreshCw, X, Check, Ban, ChevronLeft, ChevronRight, Eye,
  TrendingUp, AlertCircle, Loader2, LogOut, Coins, CreditCard,
  Phone, Mail, MapPin, ShoppingBag, Clock, ExternalLink, Camera,
  Wallet as WalletIcon, Star as StarIcon, ArrowUpRight, ArrowDownLeft, Info,
  WifiOff,
} from "lucide-react";

/* ────────────────────────── Types ────────────────────────── */

interface AdminUser {
  uid: string; email: string; name?: string | null; phone?: string | null;
  wilaya?: string | null; commune?: string | null; address?: string | null;
  walletBalance: number; pointsBalance: number; totalPointsEarned: number; totalSpent: number;
  isAdmin: boolean; createdAt: string; lastSeenAt: string;
  ordersCount: number; rechargesCount: number; reviewsCount: number;
}

interface AdminOrder {
  id: string; items: string; total: number; status: string;
  fullName?: string | null; phone?: string | null; email?: string | null;
  wilaya?: string | null; commune?: string | null; codePostal?: string | null;
  address?: string | null; notes?: string | null; url?: string | null; trackingCode?: string | null;
  paidWithWallet: number; paidWithPoints: number;
  reviewSubmitted: boolean; reviewStatus?: string | null;
  createdAt: string; uid: string; userEmail?: string | null; userName?: string | null;
}

interface AdminRecharge {
  id: string; uid: string; email: string; amount: number; status: string;
  receiptImage?: string | null; adminNote?: string | null; processedBy?: string | null;
  processedAt?: string | null; createdAt: string;
  userEmail?: string | null; userName?: string | null; userWallet?: number;
}

interface AdminReview {
  id: string; uid: string; orderId: string; rating: number; comment: string;
  photo?: string | null; status: string; pointsAwarded: number;
  adminNote?: string | null; processedBy?: string | null; processedAt?: string | null;
  createdAt: string; userEmail?: string | null; userName?: string | null;
  orderTotal?: number; potentialPoints: number;
}

interface AdminTx {
  id: string; uid: string; type: string; balanceType: string; amount: number;
  balanceAfter: number; note?: string | null; performedBy?: string | null;
  refId?: string | null; createdAt: string; userEmail?: string | null;
}

interface Stats {
  users: { total: number; newDay: number; newWeek: number };
  orders: { total: number; byStatus: Record<string, number>; revenueMonth: number; paidWalletMonth: number; paidPointsMonth: number };
  pending: { recharges: number; reviews: number };
  balances: { totalWalletOutstanding: number; totalPointsOutstanding: number; totalPointsEarned: number };
  recentOrders: { id: string; total: number; status: string; createdAt: string; userEmail?: string; paidWithWallet: number; paidWithPoints: number }[];
  recentTransactions: { id: string; type: string; balanceType: string; amount: number; createdAt: string; note?: string; performedBy?: string; user?: { email: string } }[];
}

type Tab = "dashboard" | "users" | "orders" | "recharges" | "reviews" | "transactions";

/** Authorization gate state (hardened — see AdminPage) */
type Gate = "checking" | "ok" | "denied" | "netfail";

/* ────────────────────────── Helpers ────────────────────────── */

const fmtDZD = (v: number) => `${(Math.round(v * 100) / 100).toLocaleString("fr-FR")} دج`;
const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
};

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد الانتظار", confirmed: "مؤكدة", shipped: "قيد الشحن", delivered: "مسلّمة", cancelled: "ملغاة",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  shipped: "bg-purple-100 text-purple-800 border-purple-200",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};
const TX_LABEL: Record<string, string> = {
  ADMIN_CREDIT: "رصيد من الأدمن", ADMIN_DEBIT: "خصم من الأدمن", RECHARGE: "شحن محفظة",
  ORDER_PAYMENT: "دفع طلب", REFUND: "استرجاع", POINTS_EARNED: "نقاط مكتسبة",
  POINTS_SPENT: "نقاط مصروفة", SIGNUP_BONUS: "مكافأة تسجيل",
};
const RECHARGE_STATUS: Record<string, string> = {
  pending: "قيد المراجعة", confirmed: "مؤكدة", rejected: "مرفوضة",
};
const REVIEW_STATUS: Record<string, string> = {
  pending: "قيد المراجعة", approved: "مقبولة", rejected: "مرفوضة",
};

/* ────────────────────────── Main Page ────────────────────────── */

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  /* AUTHORIZATION GATE (hardened).
   *
   * The old gate treated ANY failure (network timeout, Firebase token-mint
   * failure, 429 rate-limit after repeated reloads, 5xx server error) as
   * "غير مصرح لك" and kicked the real admin out after 2.5 seconds — a FALSE
   * rejection on slow/flaky connections. New contract, built on a strict
   * server-side distinction (see admin-auth.ts verifyAdminDetailed):
   *  - 403 = Firebase-verified account that is NOT the admin → "denied"
   *    IMMEDIATELY (refreshing a token cannot change who is signed in).
   *  - 401 = token problem → one forced token refresh + retry; anything
   *    else → "netfail": a retryable connection screen — NEVER presented as
   *    an authorization rejection, and never auto-redirects.
   *  - "denied" shows which account is signed in + a sign-out button, so
   *    "logged in with the wrong account" is instantly visible.
   */
  const [gate, setGate] = useState<Gate>("checking");
  const [signingOut, setSigningOut] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [lang, setLang] = useState<"ar" | "fr">("ar");

  const getToken = useCallback(async (forceRefresh = false) => {
    if (!user) return null;
    const { auth } = await import("@/lib/firebase");
    if (!auth.currentUser) return null;
    // Hard timeout — a hung token mint must never hang the gate
    return await Promise.race([
      auth.currentUser.getIdToken(forceRefresh).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
    ]);
  }, [user]);

  const api = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    if (!token) throw new Error("NO_TOKEN");
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    return res;
  }, [getToken]);

  /** Run the hardened authorization check with retries + classification. */
  const runGate = useCallback(async (isCancelled?: () => boolean) => {
    setGate("checking");
    const MAX_ATTEMPTS = 4;
    const backoff = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let forcedRefreshUsed = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (isCancelled?.()) return;

      // 1) Mint a Firebase ID token (forced refresh once, after a 401)
      const token = await getToken(forcedRefreshUsed);
      if (!token) {
        if (attempt < MAX_ATTEMPTS - 1) { await backoff(1000 + attempt * 1500); continue; }
        break;
      }

      // 2) Probe the admin API with a hard 15s timeout
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      let res: Response;
      try {
        res = await fetch("/api/admin/stats", {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
      } catch {
        clearTimeout(timer);
        if (attempt < MAX_ATTEMPTS - 1) { await backoff(1000 + attempt * 1500); continue; }
        break;
      }
      clearTimeout(timer);

      // 3) Classify the outcome
      if (res.ok) { if (!isCancelled?.()) setGate("ok"); return; }

      // 403 = the server Firebase-VERIFIED the token and the signed-in account
      // is simply not the admin. FINAL verdict — no token refresh can ever
      // change the email, so present the denied card immediately.
      if (res.status === 403) {
        if (!isCancelled?.()) setGate("denied");
        return;
      }

      // 401 = token problem (missing/stale/unverifiable server-side). Refresh
      // the Firebase token once and retry; anything beyond that is treated as
      // a connection/server issue (retryable), NEVER as an authorization
      // verdict — a stale token must not condemn a legitimate admin.
      if (res.status === 401) {
        if (!forcedRefreshUsed) { forcedRefreshUsed = true; continue; }
        break; // refresh already attempted — netfail is the honest state
      }
      // 429 (rate limit after rapid reloads) / 5xx / other = server or network
      // problem — retryable, and NEVER an authorization rejection.
      if (attempt < MAX_ATTEMPTS - 1) {
        let wait = 1000 + attempt * 1500;
        if (res.status === 429) {
          const ra = Number(res.headers.get("Retry-After"));
          if (Number.isFinite(ra) && ra > 0) wait = Math.min(ra * 1000, 8000);
        }
        await backoff(wait);
        continue;
      }
      break;
    }
    if (!isCancelled?.()) setGate("netfail");
  }, [getToken]);

  // Authorization check
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/auth/login?callbackUrl=/admin"); return; }
    let cancelled = false;
    runGate(() => cancelled);
    return () => { cancelled = true; };
  }, [user, authLoading, router, runGate]);

  // While stuck on the connection-error card, self-heal: reload when the
  // network comes back or the tab is refocused (safe — the panel is not
  // rendered in this state, so no form data can be lost).
  useEffect(() => {
    if (gate !== "netfail") return;
    const retry = () => window.location.reload();
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [gate]);

  /** Sign out (from the "denied" card) and land on login with /admin callback. */
  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      const { auth } = await import("@/lib/firebase");
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
    } catch { /* auth-provider clears the cookie via onAuthStateChanged anyway */ }
    router.push("/auth/login?callbackUrl=/admin");
  };

  if (authLoading || gate === "checking") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-pink-500 animate-spin" />
          <p className="text-slate-400 text-sm">جارٍ التحقق من الصلاحيات…</p>
        </div>
      </div>
    );
  }

  if (gate === "denied") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-8 text-center max-w-sm">
          <AlertCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">غير مصرح لك</h2>
          <p className="text-slate-400 text-sm mb-4">هذه الصفحة مخصصة للمسؤول فقط.</p>
          <div className="bg-slate-800/60 rounded-xl px-3 py-2.5 mb-4">
            <p className="text-slate-500 text-[11px] mb-0.5">الحساب المسجّل حالياً:</p>
            <p className="text-slate-200 font-bold text-xs break-all" dir="ltr">{user?.email || "—"}</p>
          </div>
          <p className="text-slate-500 text-xs mb-5 leading-relaxed">
            هذا الحساب ليس حساب المسؤول. سجّل الخروج ثم ادخل بحساب المسؤول للوصول إلى لوحة التحكم.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 disabled:opacity-50 text-white font-bold text-xs transition-all flex items-center justify-center gap-2"
            >
              {signingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              تسجيل الخروج
            </button>
            <button
              onClick={() => router.push("/")}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors flex items-center justify-center gap-2"
            >
              الصفحة الرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gate === "netfail") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-8 text-center max-w-sm">
          <WifiOff className="w-14 h-14 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">تعذّر التحقق من الصلاحيات</h2>
          <p className="text-slate-400 text-sm mb-4 leading-relaxed">
            يوجد خلل مؤقت في الاتصال بالخادم (شبكة بطيئة أو ازدحام). هذا{" "}
            <b className="text-amber-300">ليس رفضاً لصلاحياتك</b>{" "}ولم يتم تسجيل خروجك.
          </p>
          <p className="text-slate-500 text-xs mb-5">الحساب: <span dir="ltr">{user?.email || "—"}</span></p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            إعادة المحاولة الآن
          </button>
          <p className="text-slate-600 text-[11px] mt-3">ستتم إعادة المحاولة تلقائياً فور عودة الاتصال.</p>
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
    { id: "users", label: "المستخدمون", icon: Users },
    { id: "orders", label: "الطلبات", icon: Package },
    { id: "recharges", label: "طلبات الشحن", icon: Wallet },
    { id: "reviews", label: "المراجعات", icon: Star },
    { id: "transactions", label: "المعاملات", icon: Receipt },
  ];

  return (
    <div className="min-h-screen bg-slate-950" dir="rtl">
      {/* Top bar */}
      <header className="bg-slate-900/80 backdrop-blur border-b border-slate-800 sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 sm:px-6 h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
              <span className="text-white font-black text-sm">E</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">EUROLUXE</h1>
              <p className="text-slate-400 text-[11px] leading-tight">لوحة تحكم المسؤول</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === "ar" ? "fr" : "ar")}
              className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 transition-colors"
            >
              {lang === "ar" ? "FR" : "AR"}
            </button>
            <button
              onClick={async () => {
                const { logoutUser } = await import("@/lib/firebase");
                await logoutUser();
                router.push("/");
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-red-900/50 hover:text-red-300 transition-colors flex items-center gap-1.5 text-xs font-bold"
            >
              <LogOut className="w-3.5 h-3.5" />
              خروج
            </button>
          </div>
        </div>
        {/* Tabs */}
        <nav className="flex overflow-x-auto px-2 sm:px-4 gap-1 pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                tab === t.id
                  ? "bg-pink-500/15 text-pink-400 border border-pink-500/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-6 pb-24">
        {tab === "dashboard" && <DashboardTab api={api} setTab={setTab} />}
        {tab === "users" && <UsersTab api={api} />}
        {tab === "orders" && <OrdersTab api={api} />}
        {tab === "recharges" && <RechargesTab api={api} />}
        {tab === "reviews" && <ReviewsTab api={api} />}
        {tab === "transactions" && <TransactionsTab api={api} />}
      </main>
    </div>
  );
}

/* ────────────────────────── Dashboard ────────────────────────── */

function DashboardTab({ api, setTab }: { api: (p: string, o?: RequestInit) => Promise<Response>; setTab: (t: Tab) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/api/admin/stats");
      if (res.ok) setStats(await res.json());
    } catch {}
    setLoading(false);
  }, [api]);

  useEffect(() => { load(); }, [load]);

  if (loading && !stats) {
    return <CenterSpinner text="جارٍ تحميل الإحصائيات…" />;
  }
  if (!stats) return <ErrorBox onRetry={load} />;

  const kpis = [
    { label: "إجمالي المستخدمين", value: stats.users.total.toLocaleString("fr-FR"), sub: `+${stats.users.newDay} اليوم · +${stats.users.newWeek} هذا الأسبوع`, icon: Users, color: "from-blue-500 to-cyan-500" },
    { label: "إجمالي الطلبات", value: stats.orders.total.toLocaleString("fr-FR"), sub: `${stats.orders.byStatus.pending || 0} قيد الانتظار · ${stats.orders.byStatus.delivered || 0} مسلّمة`, icon: Package, color: "from-pink-500 to-rose-500" },
    { label: "مبيعات الشهر", value: fmtDZD(stats.orders.revenueMonth), sub: `محفظة: ${fmtDZD(stats.orders.paidWalletMonth)} · نقاط: ${fmtDZD(stats.orders.paidPointsMonth)}`, icon: TrendingUp, color: "from-emerald-500 to-teal-500" },
    { label: "أرصدة المستحقين", value: fmtDZD(stats.balances.totalWalletOutstanding), sub: `نقاط قائمة: ${stats.balances.totalPointsOutstanding.toLocaleString("fr-FR")} نقطة`, icon: Wallet, color: "from-amber-500 to-orange-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Pending alerts */}
      {(stats.pending.recharges > 0 || stats.pending.reviews > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          {stats.pending.recharges > 0 && (
            <button onClick={() => setTab("recharges")} className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 hover:bg-amber-500/15 transition-colors text-right">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-amber-300 font-bold text-sm">{stats.pending.recharges} طلب شحن بانتظار المراجعة</p>
                <p className="text-amber-400/70 text-xs">اضغط للمعالجة</p>
              </div>
              <ChevronLeft className="w-4 h-4 text-amber-400 rotate-180" />
            </button>
          )}
          {stats.pending.reviews > 0 && (
            <button onClick={() => setTab("reviews")} className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/30 rounded-2xl p-4 hover:bg-violet-500/15 transition-colors text-right">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                <Star className="w-5 h-5 text-violet-400" />
              </div>
              <div className="flex-1">
                <p className="text-violet-300 font-bold text-sm">{stats.pending.reviews} مراجعة بانتظار الموافقة</p>
                <p className="text-violet-400/70 text-xs">اضغط للمعالجة</p>
              </div>
              <ChevronLeft className="w-4 h-4 text-violet-400 rotate-180" />
            </button>
          )}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${k.color} flex items-center justify-center shadow-lg`}>
                <k.icon className="w-5 h-5 text-white" />
              </div>
            </div>
            <p className="text-slate-400 text-xs font-medium mb-1">{k.label}</p>
            <p className="text-white font-black text-2xl mb-1" dir="ltr">{k.value}</p>
            <p className="text-slate-500 text-[11px]" dir="rtl">{k.sub}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Order status breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-sm">
            <Activity className="w-4 h-4 text-pink-400" />
            حالات الطلبات
          </h3>
          <div className="space-y-3">
            {Object.entries(STATUS_LABEL).map(([status, label]) => {
              const count = stats.orders.byStatus[status] || 0;
              const pct = stats.orders.total > 0 ? Math.round((count / stats.orders.total) * 100) : 0;
              return (
                <div key={status}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-300 font-medium">{label}</span>
                    <span className="text-slate-400 font-mono">{count}</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${status === "delivered" ? "bg-emerald-500" : status === "cancelled" ? "bg-red-500" : status === "pending" ? "bg-amber-500" : status === "shipped" ? "bg-purple-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-pink-400" />
            آخر المعاملات المالية
          </h3>
          <div className="space-y-2.5">
            {stats.recentTransactions.length === 0 && <p className="text-slate-500 text-xs text-center py-6">لا توجد معاملات بعد</p>}
            {stats.recentTransactions.map((t) => (
              <div key={t.id} className="flex items-center gap-3 bg-slate-800/50 rounded-xl p-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.balanceType === "points" ? "bg-violet-500/20" : "bg-pink-500/20"}`}>
                  {t.type.includes("EARNED") || t.type === "RECHARGE" || t.type === "ADMIN_CREDIT" || t.type === "REFUND"
                    ? <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                    : <ArrowUpRight className="w-4 h-4 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-xs font-bold truncate">{TX_LABEL[t.type] || t.type}</p>
                  <p className="text-slate-500 text-[11px] truncate">{t.user?.email || t.performedBy} · {fmtDate(t.createdAt)}</p>
                </div>
                <span className={`text-xs font-mono font-bold shrink-0 ${t.type.includes("EARNED") || t.type === "RECHARGE" || t.type === "ADMIN_CREDIT" || t.type === "REFUND" ? "text-emerald-400" : "text-red-400"}`} dir="ltr">
                  {t.type.includes("EARNED") || t.type === "RECHARGE" || t.type === "ADMIN_CREDIT" || t.type === "REFUND" ? "+" : "−"}{t.amount.toLocaleString("fr-FR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent orders */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold flex items-center gap-2 text-sm">
            <ShoppingBag className="w-4 h-4 text-pink-400" />
            آخر الطلبات
          </h3>
          <button onClick={() => setTab("orders")} className="text-pink-400 hover:text-pink-300 text-xs font-bold flex items-center gap-1">
            عرض الكل <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="space-y-2">
          {stats.recentOrders.length === 0 && <p className="text-slate-500 text-xs text-center py-6">لا توجد طلبات بعد</p>}
          {stats.recentOrders.map((o) => (
            <div key={o.id} className="flex items-center gap-3 bg-slate-800/50 rounded-xl p-3">
              <div className="flex-1 min-w-0">
                <p className="text-slate-200 text-xs font-bold font-mono truncate">{o.id}</p>
                <p className="text-slate-500 text-[11px] truncate">{o.userEmail} · {fmtDate(o.createdAt)}</p>
              </div>
              <span className={`px-2 py-1 rounded-lg text-[10px] font-bold border shrink-0 ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
              <span className="text-white text-xs font-mono font-bold shrink-0" dir="ltr">{fmtDZD(o.total)}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={load} disabled={loading} className="mx-auto flex items-center gap-2 text-slate-400 hover:text-pink-400 text-xs font-bold transition-colors">
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        تحديث البيانات
      </button>
    </div>
  );
}

/* ────────────────────────── Users ────────────────────────── */

function UsersTab({ api }: { api: (p: string, o?: RequestInit) => Promise<Response> }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (pageNum = page, query = q) => {
    setLoading(true);
    try {
      const res = await api(`/api/admin/users?q=${encodeURIComponent(query)}&page=${pageNum}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setPages(data.pages);
        setTotal(data.total);
        setPage(data.page);
      }
    } catch {}
    setLoading(false);
  }, [api, page, q]);

  useEffect(() => { load(1, ""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(1, q)}
            placeholder="ابحث بالبريد، الاسم، الهاتف…"
            className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-pink-500/50"
            dir="rtl"
          />
        </div>
        <button onClick={() => load(1, q)} className="px-5 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-sm font-bold transition-colors">
          بحث
        </button>
      </div>

      <p className="text-slate-500 text-xs">{total.toLocaleString("fr-FR")} مستخدم</p>

      {/* Users table (desktop) */}
      <div className="hidden lg:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/50 text-slate-400 text-xs">
              <th className="px-4 py-3 text-right font-bold">المستخدم</th>
              <th className="px-4 py-3 text-right font-bold">الهاتف / الولاية</th>
              <th className="px-4 py-3 text-right font-bold">المحفظة</th>
              <th className="px-4 py-3 text-right font-bold">النقاط</th>
              <th className="px-4 py-3 text-right font-bold">الطلبات</th>
              <th className="px-4 py-3 text-right font-bold">آخر ظهور</th>
              <th className="px-4 py-3 text-right font-bold">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr><td colSpan={7} className="py-12"><CenterSpinner text="" /></td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-slate-500 text-sm">لا توجد نتائج</td></tr>
            ) : users.map((u) => (
              <tr key={u.uid} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-white font-bold text-xs truncate max-w-[200px]">{u.name || "—"}</p>
                  <p className="text-slate-500 text-[11px] truncate max-w-[200px]" dir="ltr">{u.email}</p>
                  {u.isAdmin && <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-400 text-[9px] font-bold border border-pink-500/30">مسؤول</span>}
                </td>
                <td className="px-4 py-3">
                  <p className="text-slate-300 text-xs font-mono" dir="ltr">{u.phone || "—"}</p>
                  <p className="text-slate-500 text-[11px]">{u.wilaya || "—"}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="text-emerald-400 font-bold font-mono text-xs" dir="ltr">{fmtDZD(u.walletBalance)}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-violet-400 font-bold font-mono text-xs" dir="ltr">{u.pointsBalance.toLocaleString("fr-FR")} pt</span>
                </td>
                <td className="px-4 py-3 text-slate-300 font-mono text-xs">{u.ordersCount}</td>
                <td className="px-4 py-3 text-slate-500 text-[11px]">{fmtDate(u.lastSeenAt)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setSelected(u.uid)} className="px-3 py-1.5 rounded-lg bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 text-xs font-bold border border-pink-500/30 transition-colors flex items-center gap-1">
                    <Wallet className="w-3 h-3" /> إدارة
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Users cards (mobile) */}
      <div className="lg:hidden space-y-3">
        {loading ? <CenterSpinner text="جارٍ التحميل…" /> : users.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-10">لا توجد نتائج</p>
        ) : users.map((u) => (
          <div key={u.uid} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <p className="text-white font-bold text-sm truncate">{u.name || "—"}</p>
                <p className="text-slate-500 text-xs truncate" dir="ltr">{u.email}</p>
              </div>
              {u.isAdmin && <span className="px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-400 text-[9px] font-bold border border-pink-500/30 shrink-0">مسؤول</span>}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-slate-800/50 rounded-xl p-2 text-center">
                <p className="text-slate-500 text-[10px] mb-0.5">المحفظة</p>
                <p className="text-emerald-400 font-bold text-xs font-mono" dir="ltr">{Math.round(u.walletBalance).toLocaleString("fr-FR")}</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-2 text-center">
                <p className="text-slate-500 text-[10px] mb-0.5">النقاط</p>
                <p className="text-violet-400 font-bold text-xs font-mono" dir="ltr">{u.pointsBalance.toLocaleString("fr-FR")}</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-2 text-center">
                <p className="text-slate-500 text-[10px] mb-0.5">الطلبات</p>
                <p className="text-white font-bold text-xs font-mono">{u.ordersCount}</p>
              </div>
            </div>
            <button onClick={() => setSelected(u.uid)} className="w-full py-2 rounded-xl bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 text-xs font-bold border border-pink-500/30 transition-colors flex items-center justify-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" /> إدارة الرصيد
            </button>
          </div>
        ))}
      </div>

      <Pagination page={page} pages={pages} onPage={(p) => load(p, q)} />

      {selected && <UserDetailDrawer api={api} uid={selected} onClose={() => { setSelected(null); load(page, q); }} />}
    </div>
  );
}

/* ────────────────────────── User Detail Drawer ────────────────────────── */

function UserDetailDrawer({ api, uid, onClose }: { api: (p: string, o?: RequestInit) => Promise<Response>; uid: string; onClose: () => void }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [balanceTab, setBalanceTab] = useState<"wallet" | "points">("wallet");
  const [action, setAction] = useState<"credit" | "debit" | "set">("credit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api(`/api/admin/users?uid=${uid}`);
      if (res.ok) setUser((await res.json()).user);
    } catch {}
    setLoading(false);
  }, [api, uid]);

  useEffect(() => { load(); }, [load]);

  const submitAdjust = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setMsg({ ok: false, text: "أدخل مبلغاً صحيحاً أكبر من صفر" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await api("/api/admin/users/wallet", {
        method: "POST",
        body: JSON.stringify({ uid, action, balanceType: balanceTab, amount: amt, note: note || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ ok: true, text: `تم بنجاح ✓ الرصيد الجديد: ${balanceTab === "wallet" ? fmtDZD(data.newBalance) : data.newBalance + " نقطة"}` });
        setAmount("");
        setNote("");
        await load();
      } else {
        setMsg({ ok: false, text: data.error === "INSUFFICIENT_FUNDS" ? "الرصيد غير كافٍ للخصم" : (data.error || "فشلت العملية") });
      }
    } catch {
      setMsg({ ok: false, text: "خطأ في الاتصال" });
    }
    setBusy(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-start"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="bg-slate-900 border-l border-slate-800 w-full max-w-lg h-full overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
          dir="rtl"
        >
          {/* Header */}
          <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-5 py-4 flex items-center justify-between z-10">
            <div className="min-w-0">
              <h3 className="text-white font-bold truncate">{user?.name || user?.email || "…"}</h3>
              <p className="text-slate-500 text-xs truncate" dir="ltr">{user?.email}</p>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center shrink-0">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {loading ? (
            <div className="py-20"><CenterSpinner text="جارٍ تحميل بيانات المستخدم…" /></div>
          ) : !user ? (
            <p className="text-slate-500 text-center py-20 text-sm">المستخدم غير موجود</p>
          ) : (
            <div className="p-5 space-y-6">
              {/* Balances */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-emerald-600/20 to-emerald-900/20 border border-emerald-500/30 rounded-2xl p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <WalletIcon className="w-4 h-4 text-emerald-400" />
                    <p className="text-emerald-300 text-xs font-bold">المحفظة</p>
                  </div>
                  <p className="text-white font-black text-xl font-mono" dir="ltr">{fmtDZD(user.walletBalance)}</p>
                </div>
                <div className="bg-gradient-to-br from-violet-600/20 to-violet-900/20 border border-violet-500/30 rounded-2xl p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Coins className="w-4 h-4 text-violet-400" />
                    <p className="text-violet-300 text-xs font-bold">النقاط</p>
                  </div>
                  <p className="text-white font-black text-xl font-mono" dir="ltr">{user.pointsBalance.toLocaleString("fr-FR")}</p>
                </div>
              </div>

              {/* Info */}
              <div className="bg-slate-800/40 rounded-2xl p-4 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-300"><Phone className="w-3.5 h-3.5 text-slate-500" /><span dir="ltr">{user.phone || "—"}</span></div>
                <div className="flex items-center gap-2 text-slate-300"><MapPin className="w-3.5 h-3.5 text-slate-500" /><span>{[user.wilaya, user.commune, user.address].filter(Boolean).join(" · ") || "—"}</span></div>
                <div className="flex items-center gap-2 text-slate-300"><Clock className="w-3.5 h-3.5 text-slate-500" /><span>انضم: {fmtDate(user.createdAt)}</span></div>
                <div className="flex items-center gap-2 text-slate-300"><TrendingUp className="w-3.5 h-3.5 text-slate-500" /><span>إجمالي المصروف: <b className="text-emerald-400" dir="ltr">{fmtDZD(user.totalSpent)}</b></span></div>
                <div className="flex items-center gap-2 text-slate-300"><Coins className="w-3.5 h-3.5 text-slate-500" /><span>إجمالي النقاط المكتسبة: <b className="text-violet-400">{user.totalPointsEarned.toLocaleString("fr-FR")}</b></span></div>
              </div>

              {/* Adjust balance */}
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4">
                <h4 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-pink-400" />
                  تعديل الرصيد
                </h4>

                <div className="flex gap-2 mb-3">
                  <button onClick={() => setBalanceTab("wallet")} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${balanceTab === "wallet" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-slate-800 text-slate-400 border border-transparent"}`}>المحفظة (دج)</button>
                  <button onClick={() => setBalanceTab("points")} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${balanceTab === "points" ? "bg-violet-500/20 text-violet-300 border border-violet-500/40" : "bg-slate-800 text-slate-400 border border-transparent"}`}>النقاط</button>
                </div>

                <div className="flex gap-2 mb-3">
                  {(["credit", "debit", "set"] as const).map((a) => (
                    <button key={a} onClick={() => setAction(a)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${action === a ? "bg-pink-500/20 text-pink-300 border border-pink-500/40" : "bg-slate-800 text-slate-400 border border-transparent"}`}>
                      {a === "credit" ? "إضافة" : a === "debit" ? "خصم" : "تعيين"}
                    </button>
                  ))}
                </div>

                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={balanceTab === "wallet" ? "المبلغ بالدينار" : "عدد النقاط"}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm mb-2 focus:outline-none focus:border-pink-500/50"
                  dir="ltr"
                />
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ملاحظة (اختياري) — تُسجَّل في السجل"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs mb-3 focus:outline-none focus:border-pink-500/50"
                  dir="rtl"
                />
                <button
                  onClick={submitAdjust}
                  disabled={busy}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 disabled:opacity-50 text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  تنفيذ العملية
                </button>

                <AnimatePresence>
                  {msg && (
                    <motion.p
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`mt-3 text-xs font-bold rounded-xl p-3 ${msg.ok ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30" : "bg-red-500/10 text-red-300 border border-red-500/30"}`}
                    >
                      {msg.text}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Orders */}
              <section>
                <h4 className="text-white font-bold text-sm mb-2 flex items-center gap-2"><Package className="w-4 h-4 text-pink-400" /> الطلبات ({user.orders?.length || 0})</h4>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {(user.orders || []).map((o: any) => (
                    <div key={o.id} className="bg-slate-800/40 rounded-xl p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 text-xs font-mono font-bold">{o.id}</p>
                        <p className="text-slate-500 text-[11px]">{fmtDate(o.createdAt)}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                      <span className="text-white text-xs font-mono font-bold shrink-0" dir="ltr">{fmtDZD(o.total)}</span>
                    </div>
                  ))}
                  {(!user.orders || user.orders.length === 0) && <p className="text-slate-500 text-xs text-center py-4">لا توجد طلبات</p>}
                </div>
              </section>

              {/* Transactions */}
              <section>
                <h4 className="text-white font-bold text-sm mb-2 flex items-center gap-2"><Receipt className="w-4 h-4 text-pink-400" /> آخر المعاملات ({user.transactions?.length || 0})</h4>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {(user.transactions || []).map((t: any) => (
                    <div key={t.id} className="bg-slate-800/40 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-slate-200 text-xs font-bold">{TX_LABEL[t.type] || t.type}</span>
                        <span className={`text-xs font-mono font-bold ${["POINTS_EARNED", "RECHARGE", "ADMIN_CREDIT", "REFUND"].includes(t.type) ? "text-emerald-400" : "text-red-400"}`} dir="ltr">
                          {["POINTS_EARNED", "RECHARGE", "ADMIN_CREDIT", "REFUND"].includes(t.type) ? "+" : "−"}{t.amount.toLocaleString("fr-FR")} {t.balanceType === "points" ? "pt" : "دج"}
                        </span>
                      </div>
                      <p className="text-slate-500 text-[11px]">{t.note} · {fmtDate(t.createdAt)} · بواسطة {t.performedBy}</p>
                    </div>
                  ))}
                  {(!user.transactions || user.transactions.length === 0) && <p className="text-slate-500 text-xs text-center py-4">لا توجد معاملات</p>}
                </div>
              </section>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ────────────────────────── Orders ────────────────────────── */

function OrdersTab({ api }: { api: (p: string, o?: RequestInit) => Promise<Response> }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (p = page, s = status, query = q) => {
    setLoading(true);
    try {
      const res = await api(`/api/admin/orders?status=${s}&q=${encodeURIComponent(query)}&page=${p}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders);
        setPages(data.pages);
        setTotal(data.total);
        setPage(data.page);
      }
    } catch {}
    setLoading(false);
  }, [api, page, status, q]);

  useEffect(() => { load(1, "all", ""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changeStatus = async (orderId: string, newStatus: string) => {
    setBusy(orderId);
    try {
      const res = await api("/api/admin/orders", {
        method: "PATCH",
        body: JSON.stringify({ orderId, status: newStatus, ...(tracking[orderId] ? { trackingCode: tracking[orderId] } : {}) }),
      });
      if (res.ok) {
        await load(page, status, q);
      }
    } catch {}
    setBusy(null);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(1, status, q)}
            placeholder="ابحث برقم الطلب، الاسم، الهاتف…"
            className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-pink-500/50"
            dir="rtl"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); load(1, e.target.value, q); }}
          className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-pink-500/50"
        >
          <option value="all">كل الحالات</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <p className="text-slate-500 text-xs">{total.toLocaleString("fr-FR")} طلب</p>

      {/* Orders list */}
      <div className="space-y-3">
        {loading ? <CenterSpinner text="جارٍ تحميل الطلبات…" /> : orders.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-10">لا توجد طلبات</p>
        ) : orders.map((o) => {
          let items: any[] = [];
          try { items = JSON.parse(o.items || "[]"); } catch {}
          const isExpanded = expanded === o.id;
          return (
            <div key={o.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              {/* Row */}
              <button onClick={() => setExpanded(isExpanded ? null : o.id)} className="w-full px-4 py-4 flex items-center gap-3 hover:bg-slate-800/30 transition-colors text-right">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-mono font-bold text-xs">{o.id}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                    {(o.paidWithWallet > 0 || o.paidWithPoints > 0) && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                        مدفوع {Math.round(o.paidWithWallet + o.paidWithPoints).toLocaleString("fr-FR")} دج
                      </span>
                    )}
                    {o.reviewSubmitted && (
                      <span className="px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 text-[10px] font-bold border border-violet-500/30">
                        مراجعة {o.reviewStatus === "approved" ? "مقبولة" : o.reviewStatus === "rejected" ? "مرفوضة" : "منتظرة"}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 text-[11px] mt-1 truncate">{o.fullName || o.userName} · {o.phone || o.userEmail} · {fmtDate(o.createdAt)}</p>
                </div>
                <span className="text-white font-bold font-mono text-sm shrink-0" dir="ltr">{fmtDZD(o.total)}</span>
              </button>

              {/* Expanded details */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-slate-800 overflow-hidden"
                  >
                    <div className="p-4 space-y-4">
                      {/* Items */}
                      <div className="space-y-2">
                        {items.map((item, i) => (
                          <div key={i} className="flex items-center gap-3 bg-slate-800/40 rounded-xl p-2.5">
                            {item.image && item.image.startsWith("http") && (
                              <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-slate-200 text-xs font-bold truncate">{item.name}</p>
                              <p className="text-slate-500 text-[11px]">× {item.quantity} — {fmtDZD(item.price)}</p>
                            </div>
                            {item.url && (
                              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300 shrink-0">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Shipping info */}
                      <div className="bg-slate-800/40 rounded-xl p-3 grid sm:grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-2 text-slate-300 col-span-2"><Mail className="w-3.5 h-3.5 text-slate-500" /><span dir="ltr">{o.email || o.userEmail}</span></div>
                        <div className="flex items-center gap-2 text-slate-300"><Phone className="w-3.5 h-3.5 text-slate-500" /><span dir="ltr">{o.phone}</span></div>
                        <div className="flex items-center gap-2 text-slate-300"><MapPin className="w-3.5 h-3.5 text-slate-500" /><span>{[o.wilaya, o.commune, o.codePostal].filter(Boolean).join(", ")}</span></div>
                        {o.address && <div className="flex items-center gap-2 text-slate-300 col-span-2"><MapPin className="w-3.5 h-3.5 text-slate-500" /><span>{o.address}</span></div>}
                        {o.notes && <div className="flex items-center gap-2 text-amber-300 col-span-2"><Info className="w-3.5 h-3.5" /><span>{o.notes}</span></div>}
                        {o.paidWithWallet > 0 && <p className="text-emerald-400">مدفوع من المحفظة: {fmtDZD(o.paidWithWallet)}</p>}
                        {o.paidWithPoints > 0 && <p className="text-violet-400">مدفوع بالنقاط: {o.paidWithPoints.toLocaleString("fr-FR")}</p>}
                      </div>

                      {/* Tracking + Status */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          value={tracking[o.id] ?? o.trackingCode ?? ""}
                          onChange={(e) => setTracking({ ...tracking, [o.id]: e.target.value })}
                          placeholder="كود التتبع (اختياري)"
                          className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-pink-500/50"
                          dir="ltr"
                        />
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(STATUS_LABEL).map(([k, label]) => (
                            <button
                              key={k}
                              onClick={() => changeStatus(o.id, k)}
                              disabled={busy === o.id || o.status === k}
                              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-40 ${
                                o.status === k ? STATUS_COLOR[k] : "bg-slate-800 text-slate-300 border-slate-700 hover:border-pink-500/40 hover:text-white"
                              }`}
                            >
                              {busy === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-slate-600 text-[10px]">ملاحظة: تغيير الحالة إلى "ملغاة" يعيد تلقائياً ما دُفع من المحفظة/النقاط إلى المستخدم. بعد "مسلّمة" يمكن للمستخدم إرسال مراجعة بالصورة لكسب النقاط.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <Pagination page={page} pages={pages} onPage={(p) => load(p, status, q)} />
    </div>
  );
}

/* ────────────────────────── Recharges ────────────────────────── */

function RechargesTab({ api }: { api: (p: string, o?: RequestInit) => Promise<Response> }) {
  const [recharges, setRecharges] = useState<AdminRecharge[]>([]);
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<AdminRecharge | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (p = page, s = status) => {
    setLoading(true);
    try {
      const res = await api(`/api/admin/recharges?status=${s}&page=${p}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setRecharges(data.recharges);
        setPages(data.pages);
        setTotal(data.total);
        setPage(data.page);
      }
    } catch {}
    setLoading(false);
  }, [api, page, status]);

  useEffect(() => { load(1, "pending"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (id: string, action: "confirm" | "reject") => {
    setBusy(id);
    setMsg(null);
    try {
      const res = await api("/api/admin/recharges", {
        method: "POST",
        body: JSON.stringify({ id, action, note: note || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(action === "confirm" ? `تم تأكيد الشحن وإضافة ${fmtDZD(recharges.find((r) => r.id === id)?.amount || 0)} للمحفظة ✓` : "تم رفض الطلب");
        await load(page, status);
      } else {
        setMsg(data.error || "فشلت العملية");
      }
    } catch {
      setMsg("خطأ في الاتصال");
    }
    setBusy(null);
    setNote("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          {(["pending", "confirmed", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); load(1, s); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${status === s ? "bg-pink-500/15 text-pink-400 border border-pink-500/30" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200"}`}
            >
              {s === "pending" ? "قيد المراجعة" : s === "confirmed" ? "مؤكدة" : s === "rejected" ? "مرفوضة" : "الكل"}
            </button>
          ))}
        </div>
        <p className="text-slate-500 text-xs">{total} طلب</p>
      </div>

      <AnimatePresence>
        {msg && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs font-bold rounded-xl p-3 bg-pink-500/10 text-pink-300 border border-pink-500/30"
          >
            {msg}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="space-y-3">
        {loading ? <CenterSpinner text="جارٍ التحميل…" /> : recharges.length === 0 ? (
          <div className="text-center py-14">
            <Wallet className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">لا توجد طلبات شحن {status === "pending" ? "قيد المراجعة" : ""}</p>
          </div>
        ) : recharges.map((r) => (
          <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              {/* Receipt thumbnail */}
              {r.receiptImage && (
                <button onClick={() => setViewing(r)} className="relative shrink-0 group">
                  <img src={r.receiptImage} alt="receipt" className="w-16 h-16 rounded-xl object-cover border border-slate-700" />
                  <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="w-5 h-5 text-white" />
                  </div>
                </button>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-emerald-400 font-black text-lg font-mono" dir="ltr">{fmtDZD(r.amount)}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    r.status === "pending" ? "bg-amber-500/15 text-amber-300 border-amber-500/30" :
                    r.status === "confirmed" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" :
                    "bg-red-500/15 text-red-300 border-red-500/30"
                  }`}>{RECHARGE_STATUS[r.status]}</span>
                </div>
                <p className="text-slate-300 text-xs truncate">{r.userName || r.email}</p>
                <p className="text-slate-500 text-[11px]" dir="ltr">{r.email}</p>
                <p className="text-slate-600 text-[11px]">{fmtDate(r.createdAt)}{r.processedBy ? ` · بواسطة ${r.processedBy}` : ""}</p>
                {r.adminNote && <p className="text-amber-300/70 text-[11px] mt-1">ملاحظة: {r.adminNote}</p>}
              </div>
            </div>

            {r.status === "pending" && (
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ملاحظة (اختياري)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-pink-500/50"
                  dir="rtl"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => act(r.id, "confirm")}
                    disabled={busy === r.id}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" />}
                    تأكيد وإضافة الرصيد
                  </button>
                  <button
                    onClick={() => act(r.id, "reject")}
                    disabled={busy === r.id}
                    className="flex-1 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Ban className="w-4 h-4" />
                    رفض
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <Pagination page={page} pages={pages} onPage={(p) => load(p, status)} />

      {/* Receipt viewer modal */}
      <AnimatePresence>
        {viewing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setViewing(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-slate-900 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-white font-bold text-sm">{viewing.userName || viewing.email}</p>
                    <p className="text-emerald-400 text-xs font-mono" dir="ltr">{fmtDZD(viewing.amount)}</p>
                  </div>
                  <button onClick={() => setViewing(null)} className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center">
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                <img src={viewing.receiptImage || ""} alt="receipt" className="w-full rounded-xl" />
                {viewing.status === "pending" && (
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => { act(viewing.id, "confirm"); setViewing(null); }}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4" /> تأكيد
                    </button>
                    <button
                      onClick={() => { act(viewing.id, "reject"); setViewing(null); }}
                      className="flex-1 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Ban className="w-4 h-4" /> رفض
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ────────────────────────── Reviews ────────────────────────── */

function ReviewsTab({ api }: { api: (p: string, o?: RequestInit) => Promise<Response> }) {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<AdminReview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (p = page, s = status) => {
    setLoading(true);
    try {
      const res = await api(`/api/admin/reviews?status=${s}&page=${p}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews);
        setPages(data.pages);
        setTotal(data.total);
        setPage(data.page);
      }
    } catch {}
    setLoading(false);
  }, [api, page, status]);

  useEffect(() => { load(1, "pending"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    setMsg(null);
    try {
      const res = await api("/api/admin/reviews", {
        method: "POST",
        body: JSON.stringify({ id, action, note: note || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(action === "approve" ? `تمت الموافقة وإضافة ${data.pointsCredited} نقطة للمستخدم ✓` : "تم رفض المراجعة");
        await load(page, status);
      } else {
        setMsg(data.error || "فشلت العملية");
      }
    } catch {
      setMsg("خطأ في الاتصال");
    }
    setBusy(null);
    setNote("");
  };

  return (
    <div className="space-y-4">
      <div className="bg-violet-500/10 border border-violet-500/30 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
        <p className="text-violet-200 text-xs leading-relaxed">
          عند الموافقة على مراجعة، يحصل المستخدم تلقائياً على نقاط بقيمة <b>10% من قيمة الطلب</b> (1000 دج = 100 نقطة). النقاط قابلة للصرف في المشتريات (1 نقطة = 1 دج).
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); load(1, s); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${status === s ? "bg-pink-500/15 text-pink-400 border border-pink-500/30" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200"}`}
            >
              {s === "pending" ? "قيد المراجعة" : s === "approved" ? "مقبولة" : s === "rejected" ? "مرفوضة" : "الكل"}
            </button>
          ))}
        </div>
        <p className="text-slate-500 text-xs">{total} مراجعة</p>
      </div>

      <AnimatePresence>
        {msg && (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs font-bold rounded-xl p-3 bg-pink-500/10 text-pink-300 border border-pink-500/30">
            {msg}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="space-y-3">
        {loading ? <CenterSpinner text="جارٍ التحميل…" /> : reviews.length === 0 ? (
          <div className="text-center py-14">
            <Star className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">لا توجد مراجعات {status === "pending" ? "قيد المراجعة" : ""}</p>
          </div>
        ) : reviews.map((r) => (
          <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              {r.photo && (
                <button onClick={() => setViewing(r)} className="relative shrink-0 group">
                  <img src={r.photo} alt="review" className="w-16 h-16 rounded-xl object-cover border border-slate-700" />
                  <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="w-5 h-5 text-white" />
                  </div>
                </button>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <StarIcon key={i} className={`w-3.5 h-3.5 ${i < r.rating ? "text-amber-400 fill-amber-400" : "text-slate-700"}`} />
                    ))}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    r.status === "pending" ? "bg-amber-500/15 text-amber-300 border-amber-500/30" :
                    r.status === "approved" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" :
                    "bg-red-500/15 text-red-300 border-red-500/30"
                  }`}>{REVIEW_STATUS[r.status]}</span>
                  {r.status === "pending" && (
                    <span className="px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 text-[10px] font-bold border border-violet-500/30" dir="ltr">
                      +{r.potentialPoints} نقطة
                    </span>
                  )}
                  {r.status !== "pending" && r.pointsAwarded > 0 && (
                    <span className="px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 text-[10px] font-bold border border-violet-500/30" dir="ltr">
                      +{r.pointsAwarded} نقطة
                    </span>
                  )}
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">{r.comment}</p>
                <p className="text-slate-500 text-[11px] mt-1.5">{r.userName || r.userEmail} · طلب {r.orderId} ({fmtDZD(r.orderTotal || 0)}) · {fmtDate(r.createdAt)}</p>
                {r.adminNote && <p className="text-amber-300/70 text-[11px] mt-1">ملاحظة: {r.adminNote}</p>}
              </div>
            </div>

            {r.status === "pending" && (
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ملاحظة (اختياري)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-pink-500/50"
                  dir="rtl"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => act(r.id, "approve")}
                    disabled={busy === r.id}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" />}
                    موافقة (+{r.potentialPoints} نقطة)
                  </button>
                  <button
                    onClick={() => act(r.id, "reject")}
                    disabled={busy === r.id}
                    className="flex-1 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Ban className="w-4 h-4" />
                    رفض
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <Pagination page={page} pages={pages} onPage={(p) => load(p, status)} />

      {/* Photo viewer modal */}
      <AnimatePresence>
        {viewing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setViewing(null)}
          >
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
              <div className="bg-slate-900 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-white font-bold text-sm">{viewing.userName || viewing.userEmail}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <StarIcon key={i} className={`w-3.5 h-3.5 ${i < viewing.rating ? "text-amber-400 fill-amber-400" : "text-slate-700"}`} />
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setViewing(null)} className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center">
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                <img src={viewing.photo || ""} alt="review photo" className="w-full rounded-xl" />
                <p className="text-slate-300 text-xs mt-3 leading-relaxed">{viewing.comment}</p>
                {viewing.status === "pending" && (
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => { act(viewing.id, "approve"); setViewing(null); }} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5">
                      <Check className="w-4 h-4" /> موافقة (+{viewing.potentialPoints} نقطة)
                    </button>
                    <button onClick={() => { act(viewing.id, "reject"); setViewing(null); }} className="flex-1 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5">
                      <Ban className="w-4 h-4" /> رفض
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ────────────────────────── Transactions ────────────────────────── */

function TransactionsTab({ api }: { api: (p: string, o?: RequestInit) => Promise<Response> }) {
  const [txs, setTxs] = useState<AdminTx[]>([]);
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p = page, t = type, query = q) => {
    setLoading(true);
    try {
      const res = await api(`/api/admin/transactions?type=${t}&q=${encodeURIComponent(query)}&page=${p}&limit=30`);
      if (res.ok) {
        const data = await res.json();
        setTxs(data.transactions);
        setPages(data.pages);
        setTotal(data.total);
        setTotalAmount(data.totalAmount);
        setPage(data.page);
      }
    } catch {}
    setLoading(false);
  }, [api, page, type, q]);

  useEffect(() => { load(1, "all", ""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(1, type, q)}
            placeholder="ابحث ببريد المستخدم…"
            className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-pink-500/50"
            dir="rtl"
          />
        </div>
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); load(1, e.target.value, q); }}
          className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-pink-500/50"
        >
          <option value="all">كل الأنواع</option>
          {Object.entries(TX_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <p className="text-slate-500 text-xs">{total} معاملة · إجمالي المبالغ: {totalAmount.toLocaleString("fr-FR")}</p>

      <div className="space-y-2">
        {loading ? <CenterSpinner text="جارٍ التحميل…" /> : txs.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-10">لا توجد معاملات</p>
        ) : txs.map((t) => (
          <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.balanceType === "points" ? "bg-violet-500/20" : "bg-pink-500/20"}`}>
              {["POINTS_EARNED", "RECHARGE", "ADMIN_CREDIT", "REFUND"].includes(t.type)
                ? <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
                : <ArrowUpRight className="w-5 h-5 text-red-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white text-xs font-bold">{TX_LABEL[t.type] || t.type}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${t.balanceType === "points" ? "bg-violet-500/15 text-violet-300" : "bg-pink-500/15 text-pink-300"}`}>
                  {t.balanceType === "points" ? "نقاط" : "محفظة"}
                </span>
              </div>
              <p className="text-slate-500 text-[11px] truncate">{t.userEmail} · {fmtDate(t.createdAt)} · بواسطة {t.performedBy}</p>
              {t.note && <p className="text-slate-600 text-[10px] truncate">{t.note}</p>}
            </div>
            <div className="text-left shrink-0">
              <p className={`font-mono font-bold text-sm ${["POINTS_EARNED", "RECHARGE", "ADMIN_CREDIT", "REFUND"].includes(t.type) ? "text-emerald-400" : "text-red-400"}`} dir="ltr">
                {["POINTS_EARNED", "RECHARGE", "ADMIN_CREDIT", "REFUND"].includes(t.type) ? "+" : "−"}{t.amount.toLocaleString("fr-FR")}
              </p>
              <p className="text-slate-600 text-[10px] font-mono" dir="ltr">→ {t.balanceAfter.toLocaleString("fr-FR")}</p>
            </div>
          </div>
        ))}
      </div>

      <Pagination page={page} pages={pages} onPage={(p) => load(p, type, q)} />
    </div>
  );
}

/* ────────────────────────── Shared Components ────────────────────────── */

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 disabled:opacity-30 flex items-center justify-center hover:border-pink-500/40 transition-colors">
        <ChevronRight className="w-4 h-4 text-slate-300" />
      </button>
      <span className="text-slate-400 text-xs font-mono px-3">{page} / {pages}</span>
      <button onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages} className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 disabled:opacity-30 flex items-center justify-center hover:border-pink-500/40 transition-colors">
        <ChevronLeft className="w-4 h-4 text-slate-300" />
      </button>
    </div>
  );
}

function CenterSpinner({ text }: { text: string }) {
  return (
    <div className="py-16 flex flex-col items-center gap-3">
      <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
      {text && <p className="text-slate-500 text-xs">{text}</p>}
    </div>
  );
}

function ErrorBox({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-16 flex flex-col items-center gap-4">
      <AlertCircle className="w-10 h-10 text-red-500" />
      <p className="text-slate-400 text-sm">فشل تحميل البيانات</p>
      <button onClick={onRetry} className="px-4 py-2 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/30 text-xs font-bold">
        إعادة المحاولة
      </button>
    </div>
  );
}
