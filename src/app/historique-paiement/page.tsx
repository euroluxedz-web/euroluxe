"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/components/auth-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import {
  Clock,
  CheckCircle,
  XCircle,
  Wallet,
  Plus,
  Eye,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getUserRecharges, getWallet } from "@/lib/firebase";

type RechargeStatus = "pending" | "confirmed" | "rejected";

interface Recharge {
  id: string;
  amount: number;
  status: RechargeStatus;
  createdAt: any;
  confirmedAt: any;
  rejectedAt: any;
  adminNote: string | null;
}

export default function HistoriquePaiementPage() {
  const { isArabic } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [recharges, setRecharges] = useState<Recharge[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewReceipt, setViewReceipt] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }

    const fetchData = async () => {
      try {
        const [rechargeData, walletBalance] = await Promise.all([
          getUserRecharges(user.uid),
          getWallet(user.uid),
        ]);
        setRecharges(rechargeData as Recharge[]);
        setBalance(walletBalance);
      } catch (err) {
        console.error("Failed to load payment history:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading, router]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "—";
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString(isArabic ? "ar-DZ" : "fr-FR", {
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

  const formatDZD = (val: number) =>
    val.toLocaleString(isArabic ? "ar-DZ" : "fr-DZ") + " دج";

  const getStatusBadge = (status: RechargeStatus) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 font-display">
            <Clock className="w-3 h-3" />
            {isArabic ? "قيد المعالجة" : "En attente"}
          </span>
        );
      case "confirmed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 font-display">
            <CheckCircle className="w-3 h-3" />
            {isArabic ? "مؤكد" : "Confirmé"}
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 font-display">
            <XCircle className="w-3 h-3" />
            {isArabic ? "مرفوض" : "Rejeté"}
          </span>
        );
    }
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
        <div className="max-w-lg mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-6"
          >
            <h1 className="text-3xl font-bold font-heading text-brand-dark">
              {isArabic ? "سجل الدفعات" : "Historique des paiements"}
            </h1>
            <p className="mt-2 text-brand-dark/60 font-display">
              {isArabic ? "تتبع عمليات الشحن الخاصة بك" : "Suivez vos recharges"}
            </p>
          </motion.div>

          {/* Wallet Balance Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-gradient-to-br from-brand-dark to-brand-dark/90 rounded-2xl p-5 mb-6 text-white"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-brand-gold" />
                <span className="text-white/70 font-display text-sm">
                  {isArabic ? "رصيد المحفظة" : "Solde du portefeuille"}
                </span>
              </div>
              <button
                onClick={() => router.push("/recharge")}
                className="bg-brand-pink hover:bg-brand-pink-light text-white text-xs font-bold px-3 py-1.5 rounded-full font-display flex items-center gap-1 transition-all"
              >
                <Plus className="w-3 h-3" />
                {isArabic ? "شحن" : "Recharger"}
              </button>
            </div>
            <div className="text-3xl font-bold font-heading">
              {formatDZD(balance)}
            </div>
          </motion.div>

          {/* Recharge History */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-white rounded-2xl shadow-xl border border-brand-muted-warm/30 overflow-hidden"
          >
            <div className="p-4 border-b border-brand-muted-warm/20">
              <h2 className="font-bold font-heading text-brand-dark">
                {isArabic ? "سجل العمليات" : "Historique des opérations"}
              </h2>
            </div>

            {recharges.length === 0 ? (
              <div className="p-8 text-center">
                <Wallet className="w-12 h-12 text-brand-dark/20 mx-auto mb-3" />
                <p className="text-brand-dark/40 font-display">
                  {isArabic ? "لا توجد عمليات شحن بعد" : "Aucune recharge pour le moment"}
                </p>
                <button
                  onClick={() => router.push("/recharge")}
                  className="mt-3 text-brand-pink font-bold font-display text-sm hover:underline"
                >
                  {isArabic ? "اشحن حسابك الآن" : "Rechargez votre compte maintenant"}
                </button>
              </div>
            ) : (
              <div className="divide-y divide-brand-muted-warm/10">
                {recharges.map((recharge, i) => (
                  <motion.div
                    key={recharge.id}
                    initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="p-4 hover:bg-brand-pink/5 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-brand-dark font-display">
                        {formatDZD(recharge.amount)}
                      </span>
                      {getStatusBadge(recharge.status)}
                    </div>
                    <div className="flex items-center justify-between text-xs text-brand-dark/40 font-display">
                      <span>{formatDate(recharge.createdAt)}</span>
                      {recharge.status === "rejected" && recharge.adminNote && (
                        <span className="text-red-400">
                          {isArabic ? "السبب:" : "Raison :"} {recharge.adminNote}
                        </span>
                      )}
                    </div>
                    {recharge.confirmedAt && (
                      <div className="text-xs text-green-500 font-display mt-1">
                        {isArabic ? "تأكيد:" : "Confirmé :"} {formatDate(recharge.confirmedAt)}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Receipt Viewer Modal */}
      <AnimatePresence>
        {viewReceipt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
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
                className="absolute -top-3 -right-3 bg-white text-brand-dark rounded-full w-8 h-8 flex items-center justify-center shadow-lg z-10"
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

      <Footer />
    </div>
  );
}
