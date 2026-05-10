import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { LanguageProvider } from "@/components/language-provider";
import { AuthProvider } from "@/components/auth-provider";

const exo2 = localFont({
  src: "../../public/fonts/Exo2-VariableFont.ttf",
  variable: "--font-exo2",
  weight: "100 900",
  display: "swap",
});

const spaceGrotesk = localFont({
  src: "../../public/fonts/SpaceGrotesk-VariableFont.ttf",
  variable: "--font-space-grotesk",
  weight: "300 700",
  display: "swap",
});

const montserrat = localFont({
  src: [
    {
      path: "../../public/fonts/Montserrat-VariableFont.ttf",
      style: "normal",
      weight: "100 900",
    },
    {
      path: "../../public/fonts/Montserrat-Italic.ttf",
      style: "italic",
      weight: "100 900",
    },
  ],
  variable: "--font-montserrat",
  display: "swap",
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
    icon: "/logo.png",
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
    <html lang="fr" dir="ltr" suppressHydrationWarning>
      <body
        className={`${exo2.variable} ${spaceGrotesk.variable} ${montserrat.variable} antialiased bg-background text-foreground`}
      >
        {/* Grain Animation Overlay - sits above background, below content */}
        <div className="grain-overlay" aria-hidden="true" />
        <LanguageProvider>
          <AuthProvider>
            <div className="grain-content-wrapper">
              {children}
              <Toaster />
            </div>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
