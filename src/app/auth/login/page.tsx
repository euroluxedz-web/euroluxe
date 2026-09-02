"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/components/language-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Eye, EyeOff, Mail, Lock, KeyRound, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { loginUser, resetPassword } from "@/lib/firebase";
import { mergeGuestCartToServer } from "@/lib/cart-store";

export default function LoginPage() {
  const { t, isArabic } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Forgot-password mode state
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Login with timeout (20s max for slow connections)
      const loginPromise = loginUser(email, password);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Login timed out. Please check your internet connection and try again.")), 20000)
      );
      await Promise.race([loginPromise, timeoutPromise]);

      // Try to merge guest cart (non-blocking - don't fail login if this fails)
      try {
        await mergeGuestCartToServer();
      } catch (cartErr) {
        console.warn("Cart merge failed (non-critical):", cartErr);
      }
      router.push("/");
      router.refresh();
    } catch (err: any) {
      const code = err?.code || "";
      const message = err?.message || "";
      console.error("Login error:", code, message);

      if (message.includes("timed out")) {
        setError(isArabic ? "انتهت مهلة الاتصال. تحقق من الإنترنت وحاول مرة أخرى." : "Délai d'attente dépassé. Vérifiez votre connexion et réessayez.");
      } else if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError(t("auth.invalidCredentials"));
      } else if (code === "auth/too-many-requests") {
        setError(isArabic ? "محاولات كثيرة. حاول لاحقاً" : "Trop de tentatives. Réessayez plus tard.");
      } else if (code === "auth/network-request-failed") {
        setError(isArabic ? "خطأ في الاتصال. تحقق من الإنترنت." : "Erreur réseau. Vérifiez votre connexion.");
      } else if (code === "auth/operation-not-allowed") {
        setError(isArabic ? "تسجيل الدخول غير مفعّل في Firebase" : "Connexion désactivée dans Firebase");
      } else {
        // Show more detail for unknown errors
        if (message.includes("Firebase") || code) {
          setError(isArabic ? `خطأ: ${code}` : `Erreur: ${code}`);
        } else {
          setError(t("auth.loginError"));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  /** Send the password reset email. Unknown emails are reported as success (anti-enumeration). */
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");

    if (!forgotEmail.trim()) {
      setForgotError(t("auth.email"));
      return;
    }

    setForgotLoading(true);
    try {
      const resetPromise = resetPassword(forgotEmail.trim(), isArabic ? "ar" : "fr");
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Reset email send timed out")), 20000)
      );
      await Promise.race([resetPromise, timeoutPromise]);
      setForgotSent(true);
    } catch (err: any) {
      const code = err?.code || "";
      console.error("Password reset error:", code, err?.message);
      if (code === "auth/user-not-found" || code === "auth/invalid-email" || code === "auth/email-not-found") {
        // Do NOT reveal whether the account exists (email enumeration protection)
        setForgotSent(true);
      } else if (code === "auth/too-many-requests") {
        setForgotError(isArabic
          ? "أرسلنا بالفعل رابطاً لهذا البريد. تحققوا من بريدكم وحاولوا لاحقاً."
          : "Un lien a déjà été envoyé récemment. Vérifiez votre boîte de réception et réessayez plus tard.");
      } else if (code === "auth/network-request-failed" || (err?.message || "").includes("timed out")) {
        setForgotError(isArabic
          ? "خطأ في الاتصال. تحققوا من الإنترنت وحاولوا مرة أخرى."
          : "Erreur réseau. Vérifiez votre connexion et réessayez.");
      } else {
        setForgotError(isArabic
          ? "تعذّر إرسال الرابط. حاولوا مرة أخرى."
          : "Échec de l'envoi du lien. Veuillez réessayer.");
      }
    } finally {
      setForgotLoading(false);
    }
  };

  /** Switch mode and reset the forgot-password state */
  const switchMode = (next: "login" | "forgot") => {
    setMode(next);
    setForgotSent(false);
    setForgotError("");
    setForgotEmail("");
    setError("");
  };

  const formFields = [
    {
      label: t("auth.email"),
      type: "email",
      value: email,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value),
      icon: Mail,
      placeholder: "votre@email.com",
      dir: "ltr" as const,
      isPassword: false,
    },
    {
      label: t("auth.password"),
      type: showPassword ? "text" : "password",
      value: password,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value),
      icon: Lock,
      placeholder: "••••••",
      dir: "ltr" as const,
      isPassword: true,
    },
  ];

  const BackIcon = isArabic ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-blue to-white">
      <Navbar />
      <div className="pt-24 sm:pt-28 pb-24 sm:pb-16 px-4 sm:px-6">
        <div className="max-w-md mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl font-bold font-heading text-brand-dark">
              {mode === "login" ? t("auth.loginTitle") : t("auth.forgotTitle")}
            </h1>
            <p className="mt-2 text-brand-dark/60 font-display">
              {mode === "login" ? t("auth.loginSubtitle") : t("auth.forgotSubtitle")}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
            className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-5 border border-brand-muted-warm/30"
          >
            <AnimatePresence mode="wait">
              {/* ───────── LOGIN MODE ───────── */}
              {mode === "login" && (
                <motion.form
                  key="login-form"
                  onSubmit={handleSubmit}
                  initial={{ opacity: 0, x: isArabic ? 30 : -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: isArabic ? -30 : 30 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-5"
                >
                  <AnimatePresence mode="wait">
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        transition={{ duration: 0.3 }}
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

                  {formFields.map((field, i) => {
                    const Icon = field.icon;
                    return (
                      <motion.div
                        key={field.label}
                        initial={{ opacity: 0, x: isArabic ? 20 : -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
                      >
                        <label className="block text-sm font-medium text-brand-dark mb-1.5 font-display">
                          {field.label}
                        </label>
                        <div className="relative">
                          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                          <input
                            type={field.type}
                            value={field.value}
                            onChange={field.onChange}
                            required
                            className="w-full pl-10 pr-4 py-3 h-12 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(255,105,180,0.15)]"
                            placeholder={field.placeholder}
                            dir={field.dir}
                          />
                          {field.isPassword && (
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
                          )}
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Forgot password link */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="flex"
                  >
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-sm text-brand-pink hover:text-brand-pink-light hover:underline font-semibold font-display transition-colors flex items-center gap-1.5 mx-0 ms-auto"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      {t("auth.forgotPassword")}
                    </button>
                  </motion.div>

                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.4 }}
                    className="w-full bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 h-12 rounded-xl shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display disabled:opacity-50"
                  >
                    {loading ? t("auth.loading") : t("auth.loginButton")}
                  </motion.button>

                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-center text-sm text-brand-dark/60 font-display"
                  >
                    {t("auth.noAccount")}{" "}
                    <Link
                      href="/auth/register"
                      className="text-brand-pink hover:underline font-bold"
                    >
                      {t("auth.registerLink")}
                    </Link>
                  </motion.p>
                </motion.form>
              )}

              {/* ───────── FORGOT PASSWORD MODE ───────── */}
              {mode === "forgot" && (
                <motion.div
                  key="forgot-form"
                  initial={{ opacity: 0, x: isArabic ? 30 : -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: isArabic ? -30 : 30 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-5"
                >
                  {forgotSent ? (
                    /* ── Success confirmation ── */
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.35 }}
                      className="text-center py-4 space-y-4"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                        className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center"
                      >
                        <CheckCircle2 className="w-8 h-8 text-green-600" />
                      </motion.div>
                      <div className="bg-green-50 text-green-700 text-sm p-4 rounded-xl border border-green-200 leading-relaxed font-display">
                        {t("auth.forgotSent")}
                      </div>
                      <button
                        type="button"
                        onClick={() => switchMode("login")}
                        className="w-full flex items-center justify-center gap-2 text-sm text-brand-dark/70 hover:text-brand-pink font-semibold font-display transition-colors py-2"
                      >
                        <BackIcon className="w-4 h-4" />
                        {t("auth.backToLogin")}
                      </button>
                    </motion.div>
                  ) : (
                    /* ── Email entry form ── */
                    <form onSubmit={handleForgotSubmit} className="space-y-5">
                      <AnimatePresence mode="wait">
                        {forgotError && (
                          <motion.div
                            initial={{ opacity: 0, y: -10, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: "auto" }}
                            exit={{ opacity: 0, y: -10, height: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <motion.div
                              animate={{ x: [0, -8, 8, -4, 4, 0] }}
                              transition={{ duration: 0.4, delay: 0.1 }}
                              className="bg-red-50 text-red-600 text-sm p-3 rounded-xl border border-red-200"
                            >
                              {forgotError}
                            </motion.div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                      >
                        <label className="block text-sm font-medium text-brand-dark mb-1.5 font-display">
                          {t("auth.email")}
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                          <input
                            type="email"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            required
                            autoFocus
                            className="w-full pl-10 pr-4 py-3 h-12 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(255,105,180,0.15)]"
                            placeholder="votre@email.com"
                            dir="ltr"
                          />
                        </div>
                      </motion.div>

                      <motion.button
                        type="submit"
                        disabled={forgotLoading}
                        whileTap={{ scale: 0.98 }}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="w-full bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 h-12 rounded-xl shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {forgotLoading ? (
                          <>
                            <motion.span
                              animate={{ rotate: 360 }}
                              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                              className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full"
                            />
                            {t("auth.forgotSending")}
                          </>
                        ) : (
                          <>
                            <KeyRound className="w-4 h-4" />
                            {t("auth.forgotButton")}
                          </>
                        )}
                      </motion.button>

                      <button
                        type="button"
                        onClick={() => switchMode("login")}
                        className="w-full flex items-center justify-center gap-2 text-sm text-brand-dark/70 hover:text-brand-pink font-semibold font-display transition-colors py-2"
                      >
                        <BackIcon className="w-4 h-4" />
                        {t("auth.backToLogin")}
                      </button>
                    </form>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
