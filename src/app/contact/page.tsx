"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  MessageCircle,
  Instagram,
  Facebook,
  Send,
  Mail,
  MapPin,
  Phone,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card3D } from "@/components/card-3d";
import { Y2KStar, FloatingStars } from "@/components/y2k-star";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

const socialLinks = [
  {
    platform: "WhatsApp",
    icon: <MessageCircle className="w-8 h-8" />,
    handle: "@euroluxe_dz",
    description: "Réponse rapide, commandes et suivi",
    color: "#25D366",
    link: "https://wa.me/213XXXXXXXXX",
  },
  {
    platform: "Instagram",
    icon: <Instagram className="w-8 h-8" />,
    handle: "@euroluxe_dz",
    description: "Découvrir nos produits et promotions",
    color: "#E4405F",
    link: "https://instagram.com/euroluxe_dz",
  },
  {
    platform: "Facebook",
    icon: <Facebook className="w-8 h-8" />,
    handle: "EUROLUXE DZ",
    description: "Rejoignez notre communauté",
    color: "#1877F2",
    link: "https://facebook.com/euroluxedz",
  },
];

export default function ContactPage() {
  const [formState, setFormState] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, this would send to a backend
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormState({ name: "", email: "", message: "" });
    }, 3000);
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-pure-black text-foreground overflow-x-hidden">
      <FloatingStars />
      <Navbar />
      <main className="flex-1 pt-16 sm:pt-20">
        <section className="relative py-20 sm:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo/5 to-background" />
          <div className="scanline-animated absolute inset-0 pointer-events-none" />

          <div className="relative z-10 max-w-6xl mx-auto px-4">
            {/* Section Header */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyber-pink/10 border border-cyber-pink/20 text-cyber-pink text-sm font-medium mb-4">
                <Phone className="w-4 h-4" />
                Contactez-nous
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black mb-4">
                <span className="chrome-text">Contactez</span>{" "}
                <span className="text-cyber-pink">-nous</span>
              </h1>
              <p className="text-frosted-chrome/60 text-lg max-w-xl mx-auto">
                Vous avez une question ou besoin d&apos;informations ? Nous sommes là pour vous aider
              </p>
            </motion.div>

            {/* Social Media Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
              {socialLinks.map((social, i) => (
                <motion.div
                  key={social.platform}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 + 0.2 }}
                >
                  <Card3D className="rounded-2xl">
                    <a
                      href={social.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block frosted-glass rounded-2xl p-6 sm:p-8 text-center hover:border-acid-lime/30 transition-all duration-300 group depth-shadow relative overflow-hidden"
                    >
                      {/* Glow */}
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{
                          background: `radial-gradient(circle at center, ${social.color}15, transparent 70%)`,
                        }}
                      />

                      {/* Icon */}
                      <div
                        className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 relative z-10 group-hover:scale-110 transition-transform"
                        style={{ backgroundColor: `${social.color}20`, color: social.color }}
                      >
                        {social.icon}
                      </div>

                      <h3
                        className="font-bold text-xl mb-1 relative z-10"
                        style={{ color: social.color }}
                      >
                        {social.platform}
                      </h3>

                      <p className="text-frosted-chrome/40 text-sm font-medium mb-2 relative z-10">
                        {social.handle}
                      </p>

                      <p className="text-frosted-chrome/30 text-xs relative z-10">
                        {social.description}
                      </p>
                    </a>
                  </Card3D>
                </motion.div>
              ))}
            </div>

            {/* Contact Form + Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Contact Form */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <div className="frosted-glass-heavy rounded-3xl p-6 sm:p-8 neon-border-pink">
                  <h2 className="text-xl font-bold text-frosted-chrome mb-6 flex items-center gap-2">
                    <Mail className="w-5 h-5 text-cyber-pink" />
                    Envoyez-nous un message
                  </h2>

                  {submitted ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-12"
                    >
                      <CheckCircle2 className="w-16 h-16 text-acid-lime mx-auto mb-4" />
                      <h3 className="text-xl font-bold text-acid-lime mb-2">Message envoyé !</h3>
                      <p className="text-frosted-chrome/50 text-sm">
                        Nous vous répondrons dans les plus brefs délais
                      </p>
                    </motion.div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-frosted-chrome/70 text-sm font-medium mb-1">
                          Nom complet
                        </label>
                        <Input
                          placeholder="Votre nom"
                          value={formState.name}
                          onChange={(e) =>
                            setFormState({ ...formState, name: e.target.value })
                          }
                          required
                          className="bg-pure-black/50 border-white/10 focus:border-acid-lime/50 focus:ring-acid-lime/20 text-frosted-chrome placeholder:text-frosted-chrome/30 rounded-xl h-12"
                        />
                      </div>

                      <div>
                        <label className="block text-frosted-chrome/70 text-sm font-medium mb-1">
                          Email
                        </label>
                        <Input
                          type="email"
                          placeholder="votre@email.com"
                          value={formState.email}
                          onChange={(e) =>
                            setFormState({ ...formState, email: e.target.value })
                          }
                          required
                          className="bg-pure-black/50 border-white/10 focus:border-acid-lime/50 focus:ring-acid-lime/20 text-frosted-chrome placeholder:text-frosted-chrome/30 rounded-xl h-12"
                        />
                      </div>

                      <div>
                        <label className="block text-frosted-chrome/70 text-sm font-medium mb-1">
                          Message
                        </label>
                        <Textarea
                          placeholder="Comment pouvons-nous vous aider ?"
                          value={formState.message}
                          onChange={(e) =>
                            setFormState({ ...formState, message: e.target.value })
                          }
                          required
                          rows={5}
                          className="bg-pure-black/50 border-white/10 focus:border-acid-lime/50 focus:ring-acid-lime/20 text-frosted-chrome placeholder:text-frosted-chrome/30 rounded-xl resize-none"
                        />
                      </div>

                      <Button
                        type="submit"
                        className="w-full bg-cyber-pink text-white hover:bg-cyber-pink/90 font-bold rounded-xl h-12 shadow-xl shadow-cyber-pink/30 hover:shadow-cyber-pink/50 hover:scale-[1.02] transition-all"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Envoyer le message
                      </Button>
                    </form>
                  )}
                </div>
              </motion.div>

              {/* Contact Info */}
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
                className="space-y-6"
              >
                <div className="frosted-glass rounded-2xl p-6 depth-shadow">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-acid-lime/10 flex items-center justify-center text-acid-lime shrink-0">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-frosted-chrome mb-1">Localisation</h3>
                      <p className="text-frosted-chrome/50 text-sm">
                        Algérie — Livraison disponible dans toutes les wilayas
                      </p>
                    </div>
                  </div>
                </div>

                <div className="frosted-glass rounded-2xl p-6 depth-shadow">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-cyber-pink/10 flex items-center justify-center text-cyber-pink shrink-0">
                      <MessageCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-frosted-chrome mb-1">WhatsApp</h3>
                      <p className="text-frosted-chrome/50 text-sm">
                        Le moyen le plus rapide pour passer commande et suivre votre livraison
                      </p>
                    </div>
                  </div>
                </div>

                <div className="frosted-glass rounded-2xl p-6 depth-shadow">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo/10 flex items-center justify-center shrink-0" style={{ color: "#9D7FFF" }}>
                      <Mail className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-frosted-chrome mb-1">Email</h3>
                      <p className="text-frosted-chrome/50 text-sm">
                        contact@euroluxe.dz
                      </p>
                    </div>
                  </div>
                </div>

                {/* Decorative */}
                <div className="flex justify-center pt-4">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                  >
                    <Y2KStar size={40} className="text-acid-lime star-glow" />
                  </motion.div>
                </div>

                <div className="text-center">
                  <p className="text-frosted-chrome/30 text-sm italic">
                    &ldquo;Votre satisfaction est notre priorité&rdquo;
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
