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
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { useLanguage } from "@/components/language-provider";

export default function ContactPage() {
  const { t, isArabic } = useLanguage();

  const [formState, setFormState] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const socialLinks = [
    {
      platform: "WhatsApp",
      icon: <MessageCircle className="w-8 h-8" />,
      handle: "@euroluxe_dz",
      description: t("contact.whatsapp.desc"),
      color: "#25D366",
      link: "https://wa.me/213XXXXXXXXX",
    },
    {
      platform: "Instagram",
      icon: <Instagram className="w-8 h-8" />,
      handle: "@euroluxe_dz",
      description: t("contact.instagram.desc"),
      color: "#E4405F",
      link: "https://instagram.com/euroluxe_dz",
    },
    {
      platform: "Facebook",
      icon: <Facebook className="w-8 h-8" />,
      handle: "EUROLUXE DZ",
      description: t("contact.facebook.desc"),
      color: "#1877F2",
      link: "https://facebook.com/euroluxedz",
    },
  ];

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
    <div className="relative min-h-screen flex flex-col bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <main className="flex-1 pt-16 sm:pt-20">
        <section className="relative py-20 sm:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-blue/30 via-brand-blue-light/20 to-white" />
          <div className="absolute top-20 left-[10%] w-56 h-56 bg-brand-pink/8 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-[10%] w-64 h-64 bg-brand-gold/8 rounded-full blur-3xl" />

          <div className="relative z-10 max-w-6xl mx-auto px-4">
            {/* Section Header */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-pink/10 border border-brand-pink/20 text-brand-pink text-sm font-medium mb-4 font-display">
                <Phone className="w-4 h-4" />
                {t("contact.badge")}
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black mb-4 font-heading">
                <span className="text-brand-dark">{t("contact.titleContact")}</span>{" "}
                <span className="text-brand-pink">{t("contact.titleUs")}</span>
              </h1>
              <p className="text-brand-muted-text text-lg max-w-xl mx-auto font-sans">
                {t("contact.subtitle")}
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
                      className="block bg-white rounded-2xl p-6 sm:p-8 text-center hover:border-brand-pink/30 transition-all duration-300 group shadow-sm hover:shadow-md border border-brand-muted-warm/50 relative overflow-hidden"
                    >
                      {/* Glow */}
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{
                          background: `radial-gradient(circle at center, ${social.color}10, transparent 70%)`,
                        }}
                      />

                      {/* Icon */}
                      <div
                        className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 relative z-10 group-hover:scale-110 transition-transform"
                        style={{
                          backgroundColor: `${social.color}12`,
                          color: social.color,
                        }}
                      >
                        {social.icon}
                      </div>

                      <h3
                        className="font-bold text-xl mb-1 relative z-10 font-heading"
                        style={{ color: social.color }}
                      >
                        {social.platform}
                      </h3>

                      <p className="text-brand-muted-text text-sm font-medium mb-2 relative z-10 font-display">
                        {social.handle}
                      </p>

                      <p className="text-brand-muted-text/60 text-xs relative z-10 font-sans">
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
                initial={{ opacity: 0, x: isArabic ? 30 : -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-brand-pink/15 shadow-lg">
                  <h2 className="text-xl font-bold text-brand-dark mb-6 flex items-center gap-2 font-heading">
                    <Mail className="w-5 h-5 text-brand-pink" />
                    {t("contact.form.title")}
                  </h2>

                  {submitted ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-12"
                    >
                      <CheckCircle2 className="w-16 h-16 text-brand-pink mx-auto mb-4" />
                      <h3 className="text-xl font-bold text-brand-pink mb-2 font-heading">
                        {t("contact.form.success")}
                      </h3>
                      <p className="text-brand-muted-text text-sm font-sans">
                        {t("contact.form.successDesc")}
                      </p>
                    </motion.div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-brand-dark/70 text-sm font-medium mb-1 font-sans">
                          {t("contact.form.nameLabel")}
                        </label>
                        <Input
                          placeholder={t("contact.form.namePlaceholder")}
                          value={formState.name}
                          onChange={(e) =>
                            setFormState({
                              ...formState,
                              name: e.target.value,
                            })
                          }
                          required
                          className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 text-brand-dark placeholder:text-brand-muted-text/40 rounded-xl h-12 font-sans"
                        />
                      </div>

                      <div>
                        <label className="block text-brand-dark/70 text-sm font-medium mb-1 font-sans">
                          {t("contact.form.emailLabel")}
                        </label>
                        <Input
                          type="email"
                          placeholder={t("contact.form.emailPlaceholder")}
                          value={formState.email}
                          onChange={(e) =>
                            setFormState({
                              ...formState,
                              email: e.target.value,
                            })
                          }
                          required
                          className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 text-brand-dark placeholder:text-brand-muted-text/40 rounded-xl h-12 font-sans"
                        />
                      </div>

                      <div>
                        <label className="block text-brand-dark/70 text-sm font-medium mb-1 font-sans">
                          {t("contact.form.messageLabel")}
                        </label>
                        <Textarea
                          placeholder={t("contact.form.messagePlaceholder")}
                          value={formState.message}
                          onChange={(e) =>
                            setFormState({
                              ...formState,
                              message: e.target.value,
                            })
                          }
                          required
                          rows={5}
                          className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 text-brand-dark placeholder:text-brand-muted-text/40 rounded-xl resize-none font-sans"
                        />
                      </div>

                      <Button
                        type="submit"
                        className="w-full bg-brand-pink text-white hover:bg-brand-pink-light font-bold rounded-xl h-12 shadow-xl shadow-brand-pink/25 hover:shadow-brand-pink/40 hover:scale-[1.02] transition-all font-display"
                      >
                        <Send className={`w-4 h-4 ${isArabic ? "ml-2" : "mr-2"}`} />
                        {t("contact.form.submit")}
                      </Button>
                    </form>
                  )}
                </div>
              </motion.div>

              {/* Contact Info */}
              <motion.div
                initial={{ opacity: 0, x: isArabic ? -30 : 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-brand-muted-warm/50">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-brand-pink/10 flex items-center justify-center text-brand-pink shrink-0">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-brand-dark mb-1 font-heading">
                        {t("contact.info.location")}
                      </h3>
                      <p className="text-brand-muted-text text-sm font-sans">
                        {t("contact.info.locationDesc")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-brand-muted-warm/50">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-brand-pink/10 flex items-center justify-center text-brand-pink shrink-0">
                      <MessageCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-brand-dark mb-1 font-heading">
                        {t("contact.info.whatsapp")}
                      </h3>
                      <p className="text-brand-muted-text text-sm font-sans">
                        {t("contact.info.whatsappDesc")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-brand-muted-warm/50">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-brand-pink/10 flex items-center justify-center text-brand-pink shrink-0">
                      <Mail className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-brand-dark mb-1 font-heading">
                        {t("contact.info.email")}
                      </h3>
                      <p className="text-brand-muted-text text-sm font-sans">
                        contact@euroluxe.dz
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-center pt-4">
                  <p className="text-brand-pink/50 text-sm italic font-sans">
                    &ldquo;{t("contact.info.priority")}&rdquo;
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
