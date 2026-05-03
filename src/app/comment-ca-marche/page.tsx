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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card3D } from "@/components/card-3d";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

const steps = [
  {
    step: "01",
    icon: <Globe className="w-8 h-8" />,
    title: "Choisissez votre produit",
    description:
      "Parcourez les boutiques mondiales comme Temu, AliExpress et Amazon, puis choisissez le produit qui vous plaît. Copiez le lien du produit.",
    color: "#b8945f",
  },
  {
    step: "02",
    icon: <Calculator className="w-8 h-8" />,
    title: "Collez le lien dans notre calculateur",
    description:
      "Utilisez notre calculateur intelligent en collant simplement le lien du produit. Nous extrairons le prix automatiquement et le convertirons en Dinar Algérien.",
    color: "#7a7068",
  },
  {
    step: "03",
    icon: <ShoppingCart className="w-8 h-8" />,
    title: "Passez votre commande",
    description:
      "Envoyez-nous le lien du produit et nous l'achèterons pour vous. Nous nous occupons de tout, de la commande jusqu'à la livraison internationale.",
    color: "#342d2d",
  },
  {
    step: "04",
    icon: <Truck className="w-8 h-8" />,
    title: "Recevez votre produit",
    description:
      "Une fois le produit arrivé, nous vous le remettons en toute sécurité. Un processus fiable et transparent du début à la fin.",
    color: "#d4b886",
  },
];

export default function CommentCaMarchePage() {
  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <main className="flex-1 pt-16 sm:pt-20">
        <section className="relative py-20 sm:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-brand-gold/3 to-background" />
          <div className="absolute inset-0 warm-lines" />

          <div className="relative z-10 max-w-6xl mx-auto px-4">
            {/* Section Header */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-20"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-gold/10 border border-brand-gold/20 text-brand-gold text-sm font-medium mb-4 font-display">
                <Sparkles className="w-4 h-4" />
                Comment ça marche
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black mb-4 font-heading">
                <span className="text-brand-dark">4 étapes</span>{" "}
                <span className="text-brand-gold">seulement</span>
              </h1>
              <p className="text-brand-muted-text text-lg max-w-xl mx-auto font-sans">
                Du choix du produit à la livraison, le processus est simple et
                rapide
              </p>
            </motion.div>

            {/* Steps with timeline */}
            <div className="relative">
              {/* Timeline line - hidden on mobile */}
              <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-brand-gold/30 via-brand-muted-warm to-brand-gold/30" />

              <div className="space-y-12 lg:space-y-0">
                {steps.map((step, i) => (
                  <motion.div
                    key={step.step}
                    initial={{ opacity: 0, x: i % 2 === 0 ? -50 : 50 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15, duration: 0.6 }}
                    className={`relative lg:flex items-center lg:mb-16 ${
                      i % 2 === 0 ? "lg:flex-row" : "lg:flex-row-reverse"
                    }`}
                  >
                    {/* Timeline dot - desktop only */}
                    <div
                      className="hidden lg:flex absolute left-1/2 -translate-x-1/2 w-12 h-12 rounded-full items-center justify-center z-10 bg-background"
                      style={{
                        border: `2px solid ${step.color}`,
                      }}
                    >
                      <span
                        className="font-black text-sm font-heading"
                        style={{ color: step.color }}
                      >
                        {step.step}
                      </span>
                    </div>

                    {/* Content card */}
                    <div
                      className={`lg:w-[45%] ${
                        i % 2 === 0 ? "lg:pr-16" : "lg:pl-16"
                      }`}
                    >
                      <Card3D className="rounded-2xl">
                        <div className="warm-glass rounded-2xl p-6 sm:p-8 hover:border-brand-gold/30 transition-all duration-300 group depth-shadow relative overflow-hidden">
                          {/* Step number watermark */}
                          <div
                            className="text-6xl font-black absolute top-3 right-4 opacity-5 font-heading"
                            style={{ color: step.color }}
                          >
                            {step.step}
                          </div>

                          {/* Icon */}
                          <div
                            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 relative z-10 group-hover:scale-110 transition-transform"
                            style={{
                              backgroundColor: `${step.color}12`,
                              color: step.color,
                            }}
                          >
                            {step.icon}
                          </div>

                          <h3 className="text-xl font-bold text-brand-dark mb-3 group-hover:text-brand-gold transition-colors relative z-10 font-heading">
                            {step.title}
                          </h3>

                          <p className="text-brand-muted-text text-sm leading-relaxed relative z-10 font-sans">
                            {step.description}
                          </p>

                          {/* Arrow to next step (mobile) */}
                          {i < 3 && (
                            <div className="lg:hidden flex justify-center mt-4">
                              <motion.div
                                animate={{ y: [0, 5, 0] }}
                                transition={{
                                  duration: 1.5,
                                  repeat: Infinity,
                                }}
                              >
                                <ArrowRight
                                  className="w-5 h-5 rotate-90"
                                  style={{ color: `${step.color}60` }}
                                />
                              </motion.div>
                            </div>
                          )}
                        </div>
                      </Card3D>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* CTA Section */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mt-20"
            >
              <h2 className="text-2xl sm:text-4xl font-black mb-4 font-heading">
                <span className="text-brand-dark">
                  C&apos;est aussi simple que ça !
                </span>
              </h2>
              <p className="text-brand-muted-text text-lg max-w-md mx-auto mb-8 font-sans">
                Commencez dès maintenant et recevez vos produits préférés chez
                vous en Algérie
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/calculateur">
                  <Button
                    size="lg"
                    className="bg-brand-gold text-brand-dark hover:bg-brand-gold-light font-bold text-lg rounded-full px-10 py-6 shadow-xl shadow-brand-gold/25 hover:shadow-brand-gold/40 hover:scale-105 transition-all font-display"
                  >
                    <Calculator className="w-5 h-5 mr-2" />
                    Essayer le calculateur
                  </Button>
                </Link>
                <Link href="/boutiques">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-brand-dark/30 text-brand-dark hover:bg-brand-dark hover:text-brand-light font-bold text-lg rounded-full px-10 py-6 hover:scale-105 transition-all font-display"
                  >
                    <Globe className="w-5 h-5 mr-2" />
                    Voir les boutiques
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
