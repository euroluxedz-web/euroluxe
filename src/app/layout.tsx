import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EUROLUXE - Votre intermédiaire d'achat depuis les boutiques mondiales",
  description:
    "EUROLUXE - Votre intermédiaire de confiance pour acheter depuis Temu, AliExpress et les boutiques mondiales. Calculez le prix en Dinar Algérien facilement.",
  keywords: [
    "EUROLUXE",
    "intermédiaire achat",
    "Temu",
    "AliExpress",
    "Algérie",
    "Dinar Algérien",
    "shopping international",
  ],
  authors: [{ name: "EUROLUXE" }],
  icons: {
    icon: "/logo.jpeg",
  },
  openGraph: {
    title: "EUROLUXE - Votre intermédiaire d'achat depuis les boutiques mondiales",
    description:
      "EUROLUXE - Votre intermédiaire de confiance pour acheter depuis Temu, AliExpress et les boutiques mondiales",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
