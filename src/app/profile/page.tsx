"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { User, Mail, Phone, MapPin, Save, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

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

export default function ProfilePage() {
  const { t, isArabic } = useLanguage();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    wilaya: "",
    address: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetch("/api/user/profile")
        .then((res) => res.json())
        .then((data) => {
          setForm({
            name: data.name || "",
            email: data.email || "",
            phone: data.phone || "",
            wilaya: data.wilaya || "",
            address: data.address || "",
          });
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [status, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          wilaya: form.wilaya,
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

  if (loading) {
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
      <div className="pt-28 pb-16 px-4">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-brand-pink/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <User className="w-10 h-10 text-brand-pink" />
            </div>
            <h1 className="text-3xl font-bold font-heading text-brand-dark">
              {t("profile.title")}
            </h1>
            <p className="mt-2 text-brand-dark/60 font-display">
              {session?.user?.email}
            </p>
          </div>

          <form
            onSubmit={handleSave}
            className="bg-white rounded-2xl shadow-xl p-8 space-y-4 border border-brand-muted-warm/30"
          >
            {message && (
              <div
                className={`text-sm p-3 rounded-xl border ${
                  message === t("profile.saved")
                    ? "bg-green-50 text-green-600 border-green-200"
                    : "bg-red-50 text-red-600 border-red-200"
                }`}
              >
                {message}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-brand-dark mb-1 font-display">
                {t("auth.fullName")}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40" />
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm"
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
                  value={form.email}
                  disabled
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-muted-warm/30 bg-gray-50 text-brand-dark/50 font-display text-sm"
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
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
                  value={form.wilaya}
                  onChange={(e) => setForm({ ...form, wilaya: e.target.value })}
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
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm"
                placeholder={t("auth.addressPlaceholder")}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 rounded-xl shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              <Save className="w-4 h-4" />
              {saving ? t("auth.loading") : t("profile.save")}
            </button>

            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="w-full bg-transparent text-red-500 hover:bg-red-50 font-bold py-3 rounded-xl transition-all font-display flex items-center justify-center gap-2 border border-red-200"
            >
              <LogOut className="w-4 h-4" />
              {t("profile.logout")}
            </button>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
}
