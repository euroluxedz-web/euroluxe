"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/components/language-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Eye, EyeOff, Mail, Lock, User, Phone, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { registerUser, loginUser } from "@/lib/firebase";
import { mergeGuestCartToServer } from "@/lib/cart-store";

const WILAYAS = [
  "Adrar", "Chlef", "Laghouat", "Oum El Bouaghi", "Batna", "Béjaïa",
  "Biskra", "Béchar", "Blida", "Bouira", "Tamanrasset", "Tébessa",
  "Tlemcen", "Tiaret", "Tizi Ouzou", "Alger", "Djelfa", "Jijel",
  "Sétif", "Saïda", "Skikda", "Sidi Bel Abbès", "Annaba", "Guelma",
  "Constantine", "Médéa", "Mostaganem", "M'Sila", "Mascara", "Ouargla",
  "Oran", "El Bayadh", "Illizi", "Bordj Bou Arréridj", "Boumerdès",
  "El Tarf", "Tindouf", "Tissemsilt", "El Oued", "Khenchela",
  "Souk Ahras", "Tipaza", "Mila", "Aïn Defla", "Naâma", "Aïn Témouchent",
  "Ghardaïa", "Relizane", "El M'Ghair", "El Meniaa", "Ouled Djellal",
  "Bordj Badji Mokhtar", "Béni Abbès", "Timimoun", "Touggourt",
  "Djanet", "In Salah", "In Guezzam",
];

// Steps for the visual progress indicator
const STEPS = [
  { labelFr: "Identité", labelAr: "الهوية" },
  { labelFr: "Sécurité", labelAr: "الأمان" },
  { labelFr: "Localisation", labelAr: "الموقع" },
];

export default function RegisterPage() {
  const { t, isArabic } = useLanguage();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    wilaya: "",
    address: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Determine which step is active based on filled fields
  const getActiveStep = () => {
    if (form.name && form.email) {
      if (form.password && form.confirmPassword) {
        return 2;
      }
      return 1;
    }
    return 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password.length < 6) {
      setError(t("auth.passwordTooShort"));
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    setLoading(true);

    try {
      // Register with Firebase Auth + create Firestore profile
      await registerUser(form.email, form.password, {
        name: form.name,
        phone: form.phone,
        wilaya: form.wilaya,
        address: form.address,
      });

      // Merge any guest cart items
      await mergeGuestCartToServer();

      router.push("/");
      router.refresh();
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/email-already-in-use") {
        setError(isArabic ? "البريد الإلكتروني مستخدم بالفعل" : "Cet email est déjà utilisé");
      } else if (code === "auth/weak-password") {
        setError(t("auth.passwordTooShort"));
      } else {
        setError(t("auth.registerError"));
      }
    } finally {
      setLoading(false);
    }
  };

  const activeStep = getActiveStep();

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-blue to-white">
      <Navbar />
      <div className="pt-24 sm:pt-28 pb-24 sm:pb-16 px-4 sm:px-6">
        <div className="max-w-md mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-6"
          >
            <h1 className="text-3xl font-bold font-heading text-brand-dark">
              {t("auth.registerTitle")}
            </h1>
            <p className="mt-2 text-brand-dark/60 font-display">
              {t("auth.registerSubtitle")}
            </p>
          </motion.div>

          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
            className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-brand-muted-warm/30"
          >
            {/* Step Progress Indicator */}
            <div className="flex items-center gap-2 mb-6">
              {STEPS.map((step, i) => (
                <div key={i} className="flex-1 flex items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <motion.div
                        animate={{
                          backgroundColor: i <= activeStep ? "#FF69B4" : "#E5E7EB",
                          scale: i === activeStep ? 1.1 : 1,
                        }}
                        transition={{ duration: 0.3 }}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      >
                        {i < activeStep ? "✓" : i + 1}
                      </motion.div>
                      <span className={`text-[10px] font-display font-medium hidden sm:block ${
                        i <= activeStep ? "text-brand-pink" : "text-brand-dark/40"
                      }`}>
                        {isArabic ? step.labelAr : step.labelFr}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
                      <motion.div
                        animate={{ width: i <= activeStep ? "100%" : "0%" }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="h-full bg-brand-pink rounded-full"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mb-4"
                >
                  <motion.div
                    animate={{ x: [0, -8, 8, -4, 4, 0] }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="bg-red-50 text-red-600 text-sm p-3 rounded-xl border border-red-200"
                  >
                    {error}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-4 max-h-[60vh] sm:max-h-none overflow-y-auto pr-1">
              {/* Step 1: Identity */}
              <motion.div
                initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                <label className="block text-sm font-medium text-brand-dark mb-1 font-display">
                  {t("auth.fullName")}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                    onFocus={() => setCurrentStep(0)}
                    className="w-full pl-10 pr-4 py-3 h-12 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(255,105,180,0.15)]"
                    placeholder={t("auth.fullNamePlaceholder")}
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.28 }}
              >
                <label className="block text-sm font-medium text-brand-dark mb-1 font-display">
                  {t("auth.email")}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    required
                    onFocus={() => setCurrentStep(0)}
                    className="w-full pl-10 pr-4 py-3 h-12 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(255,105,180,0.15)]"
                    placeholder="votre@email.com"
                    dir="ltr"
                  />
                </div>
              </motion.div>

              {/* Step 2: Security */}
              <motion.div
                initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.36 }}
              >
                <label className="block text-sm font-medium text-brand-dark mb-1 font-display">
                  {t("auth.password")}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={handleChange}
                    required
                    onFocus={() => setCurrentStep(1)}
                    className="w-full pl-10 pr-10 py-3 h-12 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(255,105,180,0.15)]"
                    placeholder="••••••"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-dark/40 hover:text-brand-pink transition-colors p-1"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.44 }}
              >
                <label className="block text-sm font-medium text-brand-dark mb-1 font-display">
                  {t("auth.confirmPassword")}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                  <input
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={handleChange}
                    required
                    onFocus={() => setCurrentStep(1)}
                    className="w-full pl-10 pr-4 py-3 h-12 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(255,105,180,0.15)]"
                    placeholder="••••••"
                    dir="ltr"
                  />
                </div>
              </motion.div>

              {/* Step 3: Location */}
              <motion.div
                initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.52 }}
              >
                <label className="block text-sm font-medium text-brand-dark mb-1 font-display">
                  {t("auth.phone")}
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                  <input
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    onFocus={() => setCurrentStep(2)}
                    className="w-full pl-10 pr-4 py-3 h-12 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(255,105,180,0.15)]"
                    placeholder="05XX XXX XXX"
                    dir="ltr"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.6 }}
              >
                <label className="block text-sm font-medium text-brand-dark mb-1 font-display">
                  {t("auth.wilaya")}
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                  <select
                    name="wilaya"
                    value={form.wilaya}
                    onChange={handleChange}
                    onFocus={() => setCurrentStep(2)}
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
                transition={{ duration: 0.4, delay: 0.68 }}
              >
                <label className="block text-sm font-medium text-brand-dark mb-1 font-display">
                  {t("auth.address")}
                </label>
                <input
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  onFocus={() => setCurrentStep(2)}
                  className="w-full px-4 py-3 h-12 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(255,105,180,0.15)]"
                  placeholder={t("auth.addressPlaceholder")}
                />
              </motion.div>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.7 }}
              className="w-full bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 h-12 rounded-xl shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display disabled:opacity-50 mt-4"
            >
              {loading ? t("auth.loading") : t("auth.registerButton")}
            </motion.button>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-center text-sm text-brand-dark/60 font-display mt-4"
            >
              {t("auth.hasAccount")}{" "}
              <Link
                href="/auth/login"
                className="text-brand-pink hover:underline font-bold"
              >
                {t("auth.loginLink")}
              </Link>
            </motion.p>
          </motion.form>
        </div>
      </div>
      <Footer />
    </div>
  );
}
