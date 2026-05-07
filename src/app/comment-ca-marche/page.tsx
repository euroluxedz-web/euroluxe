"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Globe,
  Calculator,
  ShoppingCart,
  Truck,
  Sparkles,
  ArrowRight,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { useLanguage } from "@/components/language-provider";

/* ── Placeholder Image Component ── */
function ImgPlaceholder({
  number,
  className = "",
  pink = false,
}: {
  number: number;
  className?: string;
  pink?: boolean;
}) {
  return (
    <div
      className={`bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl shadow-lg flex items-center justify-center overflow-hidden ${
        pink
          ? "border-2 border-brand-pink/40"
          : "border-2 border-dashed border-gray-300"
      } ${className}`}
    >
      <div className="text-center">
        <span className="text-5xl font-black text-gray-300">{number}</span>
        <p className="text-xs text-gray-400 mt-1">Image</p>
      </div>
    </div>
  );
}

export default function CommentCaMarchePage() {
  const { t, isArabic } = useLanguage();

  const steps = [
    {
      step: "01",
      icon: <Globe className="w-8 h-8" />,
      title: t("how.step1.title"),
      titleHighlight: isArabic ? "منتجكم" : "produit",
      description: t("how.step1.desc"),
      color: "#FF69B4",
      imageNumber: 20,
    },
    {
      step: "02",
      icon: <Calculator className="w-8 h-8" />,
      title: t("how.step2.title"),
      titleHighlight: isArabic ? "الحاسبة" : "calculateur",
      description: t("how.step2.desc"),
      color: "#3B82F6",
      imageNumber: 21,
    },
    {
      step: "03",
      icon: <ShoppingCart className="w-8 h-8" />,
      title: t("how.step3.title"),
      titleHighlight: isArabic ? "طلبكم" : "commande",
      description: t("how.step3.desc"),
      color: "#FFD700",
      imageNumber: 22,
    },
    {
      step: "04",
      icon: <Truck className="w-8 h-8" />,
      title: t("how.step4.title"),
      titleHighlight: isArabic ? "منتجكم" : "produit",
      description: t("how.step4.desc"),
      color: "#2D3748",
      imageNumber: 23,
    },
  ];

  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <main className="flex-1 pt-16 sm:pt-20">
        <section className="relative py-20 sm:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-blue/30 via-brand-blue-light/20 to-white" />
          <div className="absolute top-0 left-[20%] w-64 h-64 bg-brand-pink/6 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-[20%] w-56 h-56 bg-brand-gold/6 rounded-full blur-3xl" />

          <div className="relative z-10 max-w-6xl mx-auto px-4">
            {/* Section Header */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-20"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-pink/10 border border-brand-pink/20 text-brand-pink text-sm font-medium mb-4 font-display">
                <Sparkles className="w-4 h-4" />
                {t("how.badge")}
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black mb-4 font-heading">
                <span className="text-brand-dark">{t("how.titleSteps")}</span>{" "}
                <span className="bg-brand-gold/30 px-2 py-1 rounded-md text-brand-dark">
                  {t("how.titleOnly")}
                </span>
              </h1>
              <p className="text-brand-muted-text text-lg max-w-xl mx-auto font-sans">
                {t("how.subtitle")}
              </p>
            </motion.div>

            {/* Steps with alternating layout */}
            <div className="space-y-16 lg:space-y-24">
              {steps.map((step, i) => (
                <motion.div
                  key={step.step}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1, duration: 0.6 }}
                  className={`flex flex-col lg:flex-row items-center gap-8 lg:gap-16 ${
                    i % 2 === 1 ? "lg:flex-row-reverse" : ""
                  }`}
                >
                  {/* Image side */}
                  <div className="w-full lg:w-1/2">
                    <div className="relative">
                      <ImgPlaceholder
                        number={step.imageNumber}
                        className="w-full h-[300px] sm:h-[350px] rounded-3xl"
                      />
                      {/* Step number badge overlay */}
                      <div className="absolute -top-4 -left-4 w-14 h-14 rounded-full bg-brand-pink text-white flex items-center justify-center font-black text-lg font-heading shadow-lg shadow-brand-pink/30 z-10">
                        {step.step}
                      </div>
                    </div>
                  </div>

                  {/* Text side */}
                  <div className="w-full lg:w-1/2">
                    <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-md border border-brand-muted-warm/50">
                      {/* Icon */}
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                        style={{
                          backgroundColor: `${step.color}15`,
                          color: step.color,
                        }}
                      >
                        {step.icon}
                      </div>

                      <h3 className="text-xl sm:text-2xl font-bold text-brand-dark mb-3 font-heading">
                        {step.title.includes(step.titleHighlight) ? (
                          <>
                            {step.title.split(step.titleHighlight)[0]}
                            <span className="bg-brand-gold/30 px-1.5 py-0.5 rounded-md">
                              {step.titleHighlight}
                            </span>
                            {step.title.split(step.titleHighlight)[1]}
                          </>
                        ) : (
                          step.title
                        )}
                      </h3>

                      <p className="text-brand-muted-text text-sm leading-relaxed font-sans">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Note card between steps */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="max-w-2xl mx-auto"
              >
                <div className="bg-white rounded-2xl p-6 shadow-md border border-brand-gold/20 flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-brand-gold/20 flex items-center justify-center shrink-0">
                    <Lightbulb className="w-6 h-6 text-brand-gold" />
                  </div>
                  <div>
                    <p className="text-brand-dark font-bold font-heading mb-1">
                      {isArabic ? "نصيحة مهمة" : "Bon à savoir"}
                    </p>
                    <p className="text-brand-muted-text text-sm font-sans">
                      {isArabic
                        ? "يمكنك لصق رمز منتج Temu مباشرة في الحاسبة للحصول على السعر تلقائياً بدون رابط كامل"
                        : "Vous pouvez coller directement le code produit Temu dans le calculateur pour obtenir le prix automatiquement sans lien complet"}
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* CTA Section */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mt-20"
            >
              <h2 className="text-2xl sm:text-4xl font-black mb-4 font-heading">
                <span className="text-brand-dark">{t("how.cta.title")}</span>
              </h2>
              <p className="text-brand-muted-text text-lg max-w-md mx-auto mb-8 font-sans">
                {t("how.cta.subtitle")}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/calculateur">
                  <Button
                    size="lg"
                    className="bg-brand-pink text-white hover:bg-brand-pink-light font-bold text-lg rounded-full px-10 py-6 shadow-xl shadow-brand-pink/25 hover:shadow-brand-pink/40 hover:scale-105 transition-all font-display"
                  >
                    <Calculator
                      className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`}
                    />
                    {t("how.cta.calculator")}
                  </Button>
                </Link>
                <Link href="/boutiques">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-brand-dark/30 text-brand-dark hover:bg-brand-dark hover:text-white font-bold text-lg rounded-full px-10 py-6 hover:scale-105 transition-all font-display"
                  >
                    <Globe
                      className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`}
                    />
                    {t("how.cta.shops")}
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
