"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/components/auth-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import {
  Wallet,
  Upload,
  CheckCircle,
  AlertCircle,
  X,
  Image as ImageIcon,
  ChevronRight,
  Clock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createRechargeRequest } from "@/lib/firebase";

const PRESET_AMOUNTS = [1000, 2000, 3000, 5000, 10000, 20000, 50000, 100000];

// BaridiMob / CCP info — admin should change these
const PAYMENT_INFO = {
  baridiMob: "00799999001234567890",
  ccp: "12345678901",
  key: "12",
  name: "EUROLUXE",
};

export default function RechargePage() {
  const { t, isArabic } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();

  const [amount, setAmount] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedAmount = customAmount ? parseInt(customAmount) : amount ? parseInt(amount) : 0;

  const handleAmountSelect = (val: number) => {
    setAmount(String(val));
    setCustomAmount("");
    setError("");
  };

  const handleCustomAmountChange = (val: string) => {
    const num = val.replace(/\D/g, "");
    setCustomAmount(num);
    setAmount("");
    setError("");
  };

  const validateAmount = (): string | null => {
    const val = selectedAmount;
    if (!val || val <= 0) {
      return isArabic ? "يرجى اختيار أو إدخال المبلغ" : "Veuillez sélectionner ou saisir un montant";
    }
    if (val < 1000) {
      return isArabic ? "الحد الأدنى للشحن هو 1,000 دج" : "Le montant minimum est de 1 000 DA";
    }
    if (val > 100000) {
      return isArabic ? "الحد الأقصى للشحن هو 100,000 دج" : "Le montant maximum est de 100 000 DA";
    }
    return null;
  };

  const handleNextStep = () => {
    const validationError = validateAmount();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setShowPaymentInfo(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError(isArabic ? "حجم الملف يجب أن يكون أقل من 5MB" : "Le fichier doit être inférieur à 5MB");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError(isArabic ? "يرجى رفع صورة فقط" : "Veuillez télécharger une image uniquement");
      return;
    }

    setReceiptFile(file);
    setError("");

    const reader = new FileReader();
    reader.onload = (ev) => setReceiptPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async () => {
    if (!user) {
      setError(isArabic ? "يجب تسجيل الدخول أولاً" : "Vous devez être connecté");
      return;
    }

    if (!receiptFile) {
      setError(isArabic ? "يرجى رفع وصلة الدفع" : "Veuillez télécharger le reçu de paiement");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const base64Receipt = await fileToBase64(receiptFile);
      await createRechargeRequest(user.uid, user.email || "", selectedAmount, base64Receipt);
      setSuccess(true);
    } catch (err: any) {
      setError(
        isArabic
          ? "حدث خطأ أثناء إرسال الطلب. حاول مرة أخرى."
          : "Erreur lors de l'envoi de la demande. Veuillez réessayer."
      );
    } finally {
      setLoading(false);
    }
  };

  const formatDZD = (val: number) =>
    val.toLocaleString(isArabic ? "ar-DZ" : "fr-DZ") + " دج";

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-blue to-white">
        <Navbar />
        <div className="pt-24 sm:pt-28 pb-24 sm:pb-16 px-4 sm:px-6">
          <div className="max-w-md mx-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="bg-white rounded-2xl shadow-xl p-8 border border-brand-muted-warm/30 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
                className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle className="w-10 h-10 text-green-500" />
              </motion.div>
              <h2 className="text-2xl font-bold font-heading text-brand-dark mb-3">
                {isArabic ? "تم إرسال طلب الشحن بنجاح!" : "Demande de recharge envoyée avec succès !"}
              </h2>
              <p className="text-brand-dark/60 font-display mb-2">
                {isArabic
                  ? `تم تقديم طلب شحن بمبلغ ${formatDZD(selectedAmount)}`
                  : `Votre demande de recharge de ${formatDZD(selectedAmount)} a été soumise`}
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 text-amber-700 font-display text-sm">
                  <Clock className="w-4 h-4 shrink-0" />
                  {isArabic
                    ? "سيتم الرد عليك خلال 24 ساعة بعد تأكيد وصول الدفعة"
                    : "Vous recevrez une réponse dans les 24 heures après confirmation du paiement"}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => router.push("/historique-paiement")}
                  className="flex-1 bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 rounded-xl font-display text-sm transition-all"
                >
                  {isArabic ? "سجل الدفعات" : "Historique des paiements"}
                </button>
                <button
                  onClick={() => {
                    setSuccess(false);
                    setShowPaymentInfo(false);
                    setAmount("");
                    setCustomAmount("");
                    removeReceipt();
                  }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-brand-dark font-bold py-3 rounded-xl font-display text-sm transition-all"
                >
                  {isArabic ? "شحن آخر" : "Autre recharge"}
                </button>
              </div>
            </motion.div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

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
            <div className="w-16 h-16 bg-brand-pink/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <Wallet className="w-8 h-8 text-brand-pink" />
            </div>
            <h1 className="text-3xl font-bold font-heading text-brand-dark">
              {isArabic ? "شحن المحفظة" : "Recharger le portefeuille"}
            </h1>
            <p className="mt-2 text-brand-dark/60 font-display">
              {isArabic
                ? "أضف رصيداً إلى حسابك لشراء المنتجات"
                : "Ajoutez du solde à votre compte pour acheter des produits"}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-brand-muted-warm/30"
          >
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-4"
                >
                  <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl border border-red-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!showPaymentInfo ? (
              /* Step 1: Select Amount */
              <div>
                <h3 className="text-lg font-bold font-heading text-brand-dark mb-4">
                  {isArabic ? "اختر المبلغ" : "Choisir le montant"}
                </h3>

                <div className="grid grid-cols-4 gap-2 mb-4">
                  {PRESET_AMOUNTS.map((val) => (
                    <motion.button
                      key={val}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleAmountSelect(val)}
                      className={`py-2.5 px-1 rounded-xl font-display text-xs font-bold transition-all ${
                        amount === String(val)
                          ? "bg-brand-pink text-white shadow-md shadow-brand-pink/30"
                          : "bg-gray-50 text-brand-dark hover:bg-brand-pink/10 hover:text-brand-pink border border-brand-muted-warm/30"
                      }`}
                    >
                      {val >= 1000 ? `${val / 1000}K` : val} دج
                    </motion.button>
                  ))}
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-brand-dark mb-1 font-display">
                    {isArabic ? "أو أدخل مبلغ مخصص" : "Ou saisir un montant personnalisé"}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={customAmount}
                      onChange={(e) => handleCustomAmountChange(e.target.value)}
                      className="w-full px-4 py-3 h-12 rounded-xl border border-brand-muted-warm/50 focus:outline-none focus:ring-2 focus:ring-brand-pink/50 focus:border-brand-pink font-display text-sm transition-all dir-ltr"
                      placeholder={isArabic ? "مبلغ بين 1,000 و 100,000" : "Montant entre 1 000 et 100 000"}
                      dir="ltr"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-dark/40 font-display text-sm">
                      دج
                    </span>
                  </div>
                </div>

                {selectedAmount > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-brand-pink/5 rounded-xl p-3 mb-4 text-center"
                  >
                    <span className="text-brand-dark/60 font-display text-sm">
                      {isArabic ? "المبلغ المختار: " : "Montant sélectionné : "}
                    </span>
                    <span className="text-brand-pink font-bold text-lg font-heading">
                      {formatDZD(selectedAmount)}
                    </span>
                  </motion.div>
                )}

                <div className="text-xs text-brand-dark/40 font-display mb-4">
                  {isArabic
                    ? "الحد الأدنى: 1,000 دج | الحد الأقصى: 100,000 دج"
                    : "Minimum : 1 000 DA | Maximum : 100 000 DA"}
                </div>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleNextStep}
                  className="w-full bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 h-12 rounded-xl shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display flex items-center justify-center gap-2"
                >
                  {isArabic ? "متابعة الدفع" : "Continuer au paiement"}
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              </div>
            ) : (
              /* Step 2: Payment Info + Receipt Upload */
              <div>
                <button
                  onClick={() => setShowPaymentInfo(false)}
                  className="text-brand-dark/60 hover:text-brand-pink font-display text-sm mb-4 flex items-center gap-1 transition-colors"
                >
                  ← {isArabic ? "رجوع" : "Retour"}
                </button>

                {/* Payment Info Card */}
                <div className="bg-gradient-to-br from-brand-dark to-brand-dark/90 rounded-2xl p-5 mb-5 text-white">
                  <h3 className="text-lg font-bold font-heading mb-3">
                    {isArabic ? "معلومات الدفع" : "Informations de paiement"}
                  </h3>
                  <p className="text-white/70 text-xs font-display mb-4">
                    {isArabic
                      ? "أرسل المبلغ إلى أحد الحسابات التالية:"
                      : "Envoyez le montant à l'un des comptes suivants :"}
                  </p>

                  {/* BaridiMob */}
                  <div className="bg-white/10 rounded-xl p-3 mb-3">
                    <div className="text-xs text-white/60 font-display mb-1">
                      {isArabic ? "باريدي موب (BaridiMob)" : "BaridiMob"}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold tracking-wider">
                        {PAYMENT_INFO.baridiMob}
                      </span>
                      <button
                        onClick={() => navigator.clipboard.writeText(PAYMENT_INFO.baridiMob)}
                        className="text-white/60 hover:text-white text-xs font-display transition-colors"
                      >
                        {isArabic ? "نسخ" : "Copier"}
                      </button>
                    </div>
                  </div>

                  {/* CCP */}
                  <div className="bg-white/10 rounded-xl p-3">
                    <div className="text-xs text-white/60 font-display mb-1">
                      {isArabic ? "حساب بريدي جاري (CCP)" : "CCP"}
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-sm font-bold tracking-wider">
                        {PAYMENT_INFO.ccp} {isArabic ? "مفتاح" : "Clé"} {PAYMENT_INFO.key}
                      </span>
                      <button
                        onClick={() => navigator.clipboard.writeText(`${PAYMENT_INFO.ccp} ${PAYMENT_INFO.key}`)}
                        className="text-white/60 hover:text-white text-xs font-display transition-colors"
                      >
                        {isArabic ? "نسخ" : "Copier"}
                      </button>
                    </div>
                    <div className="text-xs text-white/50 font-display">
                      {isArabic ? "الاسم:" : "Nom :"} {PAYMENT_INFO.name}
                    </div>
                  </div>

                  <div className="mt-4 bg-brand-pink/20 rounded-xl p-3 text-center">
                    <span className="text-brand-pink font-bold text-lg font-heading">
                      {formatDZD(selectedAmount)}
                    </span>
                  </div>
                </div>

                {/* Receipt Upload */}
                <h3 className="text-lg font-bold font-heading text-brand-dark mb-3">
                  {isArabic ? "رفع وصلة الدفع" : "Télécharger le reçu"}
                </h3>
                <p className="text-brand-dark/60 font-display text-sm mb-3">
                  {isArabic
                    ? "بعد إرسال الأموال، قم برفع صورة الوصل هنا"
                    : "Après avoir envoyé l'argent, téléchargez une photo du reçu ici"}
                </p>

                {!receiptPreview ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-brand-muted-warm/50 rounded-xl p-8 text-center cursor-pointer hover:border-brand-pink/50 hover:bg-brand-pink/5 transition-all"
                  >
                    <Upload className="w-10 h-10 text-brand-dark/30 mx-auto mb-2" />
                    <p className="text-brand-dark/60 font-display text-sm">
                      {isArabic ? "اضغط لرفع صورة الوصل" : "Cliquez pour télécharger le reçu"}
                    </p>
                    <p className="text-brand-dark/30 font-display text-xs mt-1">
                      PNG, JPG — {isArabic ? "أقل من" : "Max"} 5MB
                    </p>
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border border-brand-muted-warm/30">
                    <img
                      src={receiptPreview}
                      alt="Receipt"
                      className="w-full max-h-48 object-contain bg-gray-50"
                    />
                    <button
                      onClick={removeReceipt}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="p-2 bg-green-50 text-green-600 text-xs font-display flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      {isArabic ? "تم رفع الوصل بنجاح" : "Reçu téléchargé avec succès"}
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSubmit}
                  disabled={loading || !receiptFile}
                  className="w-full bg-brand-pink hover:bg-brand-pink-light text-white font-bold py-3 h-12 rounded-xl shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display disabled:opacity-50 mt-5 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4" />
                      {isArabic ? "إرسال طلب الشحن" : "Envoyer la demande de recharge"}
                    </>
                  )}
                </motion.button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
