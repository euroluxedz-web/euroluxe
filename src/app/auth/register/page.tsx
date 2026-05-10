"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/components/language-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Eye, EyeOff, Mail, Lock, User, Phone, MapPin } from "lucide-react";

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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
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
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone,
          wilaya: form.wilaya,
          address: form.address,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("auth.registerError"));
        return;
      }

      // Auto login after registration
      await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      router.push("/");
      router.refresh();
    } catch {
      setError(t("auth.registerError"));
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
              {t("auth.registerTitle")}
            </h1>
            <p className="mt-2 text-brand-dark/60 font-display">
              {t("auth.registerSubtitle")}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-xl p-8 space-y-4 border border-brand-muted-warm/30"
          >
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl border border-red-200">
                {error}
              </div>
            )}

            <div>
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
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm"
                  placeholder={t("auth.fullNamePlaceholder")}
                />
              </div>
            </div>

            <div>
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
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm"
                  placeholder="votre@email.com"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
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

            <div>
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
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm"
                  placeholder="••••••"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
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
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm"
                  placeholder="05XX XXX XXX"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-dark mb-1 font-display">
                {t("auth.wilaya")}
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                <select
                  name="wilaya"
                  value={form.wilaya}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm appearance-none bg-white"
                >
                  <option value="">{t("auth.selectWilaya")}</option>
                  {WILAYAS.map((w, i) => (
                    <option key={i} value={w}>
                      {i + 1} - {w}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-dark mb-1 font-display">
                {t("auth.address")}
              </label>
              <input
                name="address"
                value={form.address}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm"
                placeholder={t("auth.addressPlaceholder")}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 rounded-xl shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display disabled:opacity-50 mt-2"
            >
              {loading ? t("auth.loading") : t("auth.registerButton")}
            </button>

            <p className="text-center text-sm text-brand-dark/60 font-display">
              {t("auth.hasAccount")}{" "}
              <Link
                href="/auth/login"
                className="text-brand-pink hover:underline font-bold"
              >
                {t("auth.loginLink")}
              </Link>
            </p>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
}
