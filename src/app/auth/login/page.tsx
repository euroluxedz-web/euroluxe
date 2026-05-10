"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/components/language-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { loginUser } from "@/lib/firebase";
import { mergeGuestCartToServer } from "@/lib/cart-store";

export default function LoginPage() {
  const { t, isArabic } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await loginUser(email, password);
      // Merge guest cart items into server cart after successful login
      await mergeGuestCartToServer();
      router.push("/");
      router.refresh();
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError(t("auth.invalidCredentials"));
      } else if (code === "auth/too-many-requests") {
        setError(isArabic ? "محاولات كثيرة. حاول لاحقاً" : "Trop de tentatives. Réessayez plus tard.");
      } else {
        setError(t("auth.loginError"));
      }
    } finally {
      setLoading(false);
    }
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
              {t("auth.loginTitle")}
            </h1>
            <p className="mt-2 text-brand-dark/60 font-display">
              {t("auth.loginSubtitle")}
            </p>
          </motion.div>

          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
            className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-5 border border-brand-muted-warm/30"
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
        </div>
      </div>
      <Footer />
    </div>
  );
}
