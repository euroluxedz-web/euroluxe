"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { User, Mail, Phone, MapPin, Save, LogOut, CheckCircle, Wallet } from "lucide-react";
import { logoutUser } from "@/lib/firebase";
import { getCommunesForWilaya, getWilayaNames, type Commune } from "@/lib/algeria-communes";
import { motion, AnimatePresence } from "framer-motion";

const WILAYAS = getWilayaNames();

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

export default function ProfilePage() {
  const { t, isArabic } = useLanguage();
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const walletBalance = profile?.walletBalance || 0;
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    wilaya: "",
    commune: "",
    codePostal: "",
    address: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [availableCommunes, setAvailableCommunes] = useState<Commune[]>([]);

  // Redirect if not authenticated
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }
  }, [user, authLoading, router]);

  // Load profile data
  useEffect(() => {
    if (authLoading || !user) return;

    const fetchProfile = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;

        const res = await fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setForm({
            name: data.name || "",
            email: data.email || "",
            phone: data.phone || "",
            wilaya: data.wilaya || "",
            commune: data.commune || "",
            codePostal: data.codePostal || "",
            address: data.address || "",
          });
          if (data.wilaya) {
            setAvailableCommunes(getCommunesForWilaya(data.wilaya));
          }
        } else {
          // Fallback: use profile from auth context
          if (profile) {
            setForm({
              name: profile.name || "",
              email: profile.email || "",
              phone: profile.phone || "",
              wilaya: profile.wilaya || "",
              commune: profile.commune || "",
              codePostal: profile.codePostal || "",
              address: profile.address || "",
            });
            if (profile.wilaya) {
              setAvailableCommunes(getCommunesForWilaya(profile.wilaya));
            }
          }
        }
      } catch (err) {
        console.error(err);
        // Fallback: use profile from auth context
        if (profile) {
          setForm({
            name: profile.name || "",
            email: profile.email || "",
            phone: profile.phone || "",
            wilaya: profile.wilaya || "",
            address: profile.address || "",
          });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user, authLoading, profile]);

  /** Validate Algerian phone number: must start with 05/06/07 and be exactly 10 digits */
  const validatePhone = (phone: string): string => {
    if (!phone.trim()) return t("auth.phoneRequired");
    const digits = phone.replace(/\s/g, "");
    if (!/^\d+$/.test(digits)) return isArabic ? "يجب أن يحتوي الرقم على أرقام فقط" : "Le numéro doit contenir uniquement des chiffres";
    if (!/^0[567]/.test(digits)) return t("auth.phoneInvalidStart");
    if (digits.length !== 10) return t("auth.phoneInvalidLength");
    return "";
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setPhoneError("");

    // Validate phone number if provided
    if (form.phone.trim()) {
      const phoneValidationError = validatePhone(form.phone);
      if (phoneValidationError) {
        setPhoneError(phoneValidationError);
        setMessage(phoneValidationError);
        setSaving(false);
        return;
      }
    }

    try {
      const token = await getAuthToken();
      if (!token) {
        setMessage(t("profile.saveError"));
        return;
      }

      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          wilaya: form.wilaya,
          commune: form.commune,
          codePostal: form.codePostal,
          address: form.address,
        }),
      });

      if (res.ok) {
        setMessage(t("profile.saved"));
      } else {
        setMessage(t("profile.saveError"));
      }
    } catch {
      setMessage(t("profile.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    if (!showLogoutConfirm) {
      setShowLogoutConfirm(true);
      setTimeout(() => setShowLogoutConfirm(false), 3000);
      return;
    }
    logoutUser().then(() => {
      router.push("/");
      router.refresh();
    });
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
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
              className="w-24 h-24 sm:w-20 sm:h-20 bg-brand-pink/10 rounded-full flex items-center justify-center mx-auto mb-3 ring-4 ring-brand-pink/10"
            >
              <User className="w-12 h-12 sm:w-10 sm:h-10 text-brand-pink" />
            </motion.div>
            <h1 className="text-3xl font-bold font-heading text-brand-dark">
              {t("profile.title")}
            </h1>
            <p className="mt-2 text-brand-dark/60 font-display">
              {user?.email}
            </p>
          </motion.div>

          {/* Wallet Balance Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-gradient-to-br from-brand-dark to-brand-dark/90 rounded-2xl p-5 mb-5 text-white"
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
                <Wallet className="w-3 h-3" />
                {isArabic ? "شحن" : "Recharger"}
              </button>
            </div>
            <div className="text-3xl font-bold font-heading">
              {walletBalance.toLocaleString(isArabic ? "ar-DZ" : "fr-DZ")} دج
            </div>
            <button
              onClick={() => router.push("/historique-paiement")}
              className="mt-2 text-white/50 hover:text-white text-xs font-display underline transition-colors"
            >
              {isArabic ? "عرض سجل الدفعات" : "Voir l'historique des paiements"}
            </button>
          </motion.div>

          <motion.form
            onSubmit={handleSave}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
            className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-5 border border-brand-muted-warm/30"
          >
            <AnimatePresence mode="wait">
              {message && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div
                    className={`text-sm p-3 rounded-xl border flex items-center gap-2 ${
                      message === t("profile.saved")
                        ? "bg-green-50 text-green-600 border-green-200"
                        : "bg-red-50 text-red-600 border-red-200"
                    }`}
                  >
                    {message === t("profile.saved") && (
                      <CheckCircle className="w-4 h-4 shrink-0" />
                    )}
                    {message}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <label className="block text-sm font-medium text-brand-dark mb-1.5 font-display">
                {t("auth.fullName")}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 h-12 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(255,105,180,0.15)]"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.28 }}
            >
              <label className="block text-sm font-medium text-brand-dark mb-1.5 font-display">
                {t("auth.email")}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                <input
                  value={form.email}
                  disabled
                  className="w-full pl-10 pr-4 py-3 h-12 rounded-xl border border-brand-muted-warm/30 bg-gray-50 text-brand-dark/50 font-display text-sm"
                  dir="ltr"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.36 }}
            >
              <label className="block text-sm font-medium text-brand-dark mb-1.5 font-display">
                {t("auth.phone")}
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                <input
                  value={form.phone}
                  onChange={(e) => {
                    setForm({ ...form, phone: e.target.value });
                    setPhoneError("");
                  }}
                  onBlur={() => {
                    if (form.phone.trim()) {
                      setPhoneError(validatePhone(form.phone));
                    }
                  }}
                  className={`w-full pl-10 pr-4 py-3 h-12 rounded-xl border ${phoneError ? "border-red-400 focus:ring-red-200 focus:border-red-400" : "border-brand-muted-warm/50 focus:ring-brand-pink/50 focus:border-brand-pink"} focus:outline-none focus:ring-2 font-display text-sm transition-all duration-200 ${phoneError ? "focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]" : "focus:shadow-[0_0_0_3px_rgba(255,105,180,0.15)]"}`}
                  placeholder="05XX XXX XXX"
                  dir="ltr"
                />
              </div>
              {phoneError && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-500 text-xs mt-1 font-display"
                >
                  {phoneError}
                </motion.p>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.44 }}
            >
              <label className="block text-sm font-medium text-brand-dark mb-1.5 font-display">
                {t("auth.wilaya")}
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                <select
                  value={form.wilaya}
                  onChange={(e) => {
                    const newWilaya = e.target.value;
                    const communes = getCommunesForWilaya(newWilaya);
                    setAvailableCommunes(communes);
                    setForm({ ...form, wilaya: newWilaya, commune: "", codePostal: "" });
                  }}
                  className="w-full pl-10 pr-4 py-3 h-12 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm appearance-none bg-white transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(255,105,180,0.15)]"
                >
                  <option value="">{t("auth.selectWilaya")}</option>
                  {WILAYAS.map((w, i) => (
                    <option key={i} value={w}>
                      {i + 1} - {w}
                    </option>
                  ))}
                </select>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.48 }}
            >
              <label className="block text-sm font-medium text-brand-dark mb-1.5 font-display">
                {t("calc.checkout.commune")}
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                <select
                  value={form.commune}
                  onChange={(e) => {
                    const selectedCommune = availableCommunes.find(c => c.name === e.target.value);
                    setForm({ ...form, commune: e.target.value, codePostal: selectedCommune?.postalCode || form.codePostal });
                  }}
                  disabled={!form.wilaya}
                  className="w-full pl-10 pr-4 py-3 h-12 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm appearance-none bg-white transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(255,105,180,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">{t("calc.checkout.communePlaceholder")}</option>
                  {availableCommunes.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.50 }}
            >
              <label className="block text-sm font-medium text-brand-dark mb-1.5 font-display">
                {t("calc.checkout.codePostal")}
              </label>
              <input
                value={form.codePostal}
                onChange={(e) => setForm({ ...form, codePostal: e.target.value })}
                className="w-full px-4 py-3 h-12 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(255,105,180,0.15)]"
                placeholder={t("calc.checkout.codePostalPlaceholder")}
                dir="ltr"
                maxLength={5}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.52 }}
            >
              <label className="block text-sm font-medium text-brand-dark mb-1.5 font-display">
                {t("auth.address")}
              </label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-4 py-3 h-12 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(255,105,180,0.15)]"
                placeholder={t("auth.addressPlaceholder")}
              />
            </motion.div>

            <motion.button
              type="submit"
              disabled={saving}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.6 }}
              className="w-full bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 h-12 rounded-xl shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? t("auth.loading") : t("profile.save")}
            </motion.button>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65 }}
            >
              <AnimatePresence mode="wait">
                {showLogoutConfirm ? (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-red-50 border border-red-200 rounded-xl p-4"
                  >
                    <p className="text-sm text-red-600 font-display mb-3 text-center">
                      {isArabic ? "هل أنت متأكد من تسجيل الخروج؟" : "Êtes-vous sûr de vouloir vous déconnecter ?"}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          logoutUser().then(() => {
                            router.push("/");
                            router.refresh();
                          });
                        }}
                        className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded-lg font-display text-sm transition-all"
                      >
                        {isArabic ? "نعم" : "Oui"}
                      </button>
                      <button
                        onClick={() => setShowLogoutConfirm(false)}
                        className="flex-1 bg-white hover:bg-gray-50 text-brand-dark font-bold py-2 rounded-lg font-display text-sm border border-gray-200 transition-all"
                      >
                        {isArabic ? "لا" : "Non"}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.button
                    key="logout"
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={handleLogout}
                    className="w-full bg-transparent text-red-500 hover:bg-red-50 font-bold py-3 h-12 rounded-xl transition-all font-display flex items-center justify-center gap-2 border border-red-200"
                  >
                    <LogOut className="w-4 h-4" />
                    {t("profile.logout")}
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.form>
        </div>
      </div>
      <Footer />
    </div>
  );
}
