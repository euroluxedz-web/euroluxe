"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/components/language-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";

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
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(t("auth.invalidCredentials"));
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError(t("auth.loginError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-blue to-white">
      <Navbar />
      <div className="pt-28 pb-16 px-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold font-heading text-brand-dark">
              {t("auth.loginTitle")}
            </h1>
            <p className="mt-2 text-brand-dark/60 font-display">
              {t("auth.loginSubtitle")}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-xl p-8 space-y-5 border border-brand-muted-warm/30"
          >
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl border border-red-200">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-brand-dark mb-1.5 font-display">
                {t("auth.email")}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm"
                  placeholder="votre@email.com"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-dark mb-1.5 font-display">
                {t("auth.password")}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm"
                  placeholder="••••••"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-dark/40 hover:text-brand-pink"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 rounded-xl shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display disabled:opacity-50"
            >
              {loading ? t("auth.loading") : t("auth.loginButton")}
            </button>

            <p className="text-center text-sm text-brand-dark/60 font-display">
              {t("auth.noAccount")}{" "}
              <Link
                href="/auth/register"
                className="text-brand-pink hover:underline font-bold"
              >
                {t("auth.registerLink")}
              </Link>
            </p>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
}
