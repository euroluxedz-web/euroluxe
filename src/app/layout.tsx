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
  title: "EUROLUXE - وسيط الشراء من المواقع العالمية",
  description:
    "EUROLUXE - وسيطك الموثوق للشراء من Temu, AliExpress والمواقع العالمية. حساب السعر بالدينار الجزائري بسهولة.",
  keywords: [
    "EUROLUXE",
    "وسيط شراء",
    "Temu",
    "AliExpress",
    "الجزائر",
    "دينار جزائري",
    "تسوق دولي",
  ],
  authors: [{ name: "EUROLUXE" }],
  icons: {
    icon: "/logo.jpeg",
  },
  openGraph: {
    title: "EUROLUXE - وسيط الشراء من المواقع العالمية",
    description:
      "EUROLUXE - وسيطك الموثوق للشراء من Temu, AliExpress والمواقع العالمية",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
