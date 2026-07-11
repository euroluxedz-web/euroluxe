"use client";
import { CaptchaSolver } from "@/components/captcha-solver";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  Zap,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Pencil,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  Info,
  Check,
  X,
  MapPin,
  Phone,
  User,
  Truck,
  StickyNote,
  Package,
  Upload,
  MousePointerClick,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { useLanguage } from "@/components/language-provider";
import { useCartStore, syncAddToServer } from "@/lib/cart-store";
import { useAuth } from "@/components/auth-provider";
import { createOrder, updateUserData } from "@/lib/firebase";
import { getCommunesForWilaya, getWilayaNames, type Commune } from "@/lib/algeria-communes";

/* ── Algerian Wilayas (from data file) ── */
const WILAYAS = getWilayaNames();

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
  // HIDDEN: numbered image placeholders are disabled site-wide.
  // To re-enable, restore the JSX below.
  return null;
}

interface PriceBreakdown {
  basePriceUSD: number;
  basePriceDZD: number;
  shippingUSD: number;
  shippingDZD: number;
  customsDZD: number;
  marginDZD: number;
  totalDZD: number;
  exchangeRate: number;
}

interface PriceResult {
  usd: number;
  dzd: number;
  breakdown?: PriceBreakdown;
  productName?: string | null;
  originalPrice?: number | null;
  image?: string | null;
  estimated?: boolean;
  manual?: boolean;
  source?: string;
  itemId?: string;
}

interface DetectedProduct {
  name: string | null;
  description?: string | null;
  image: string | null;
  url: string | null;
  antiBotDetected?: boolean;
  message?: string;
}

interface ShippingInfo {
  fullName: string;
  phone: string;
  wilaya: string;
  commune: string;
  codePostal: string;
  address: string;
  notes: string;
}

export default function CalculateurPage() {
  const [productUrl, setProductUrl] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PriceResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [temuLink, setTemuLink] = useState<string | null>(null);
  const [detectedProduct, setDetectedProduct] = useState<DetectedProduct | null>(null);
  const [progressStep, setProgressStep] = useState(0);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [interactiveCookies, setInteractiveCookies] = useState("");
  const [activeSite, setActiveSite] = useState<"temu" | "shein">("temu");
  const [sheinLoading, setSheinLoading] = useState(false);
  const [sheinUrl, setSheinUrl] = useState("");
  const [sheinSessionId, setSheinSessionId] = useState<string | null>(null);
  const [sheinScreenshot, setSheinScreenshot] = useState<string | null>(null);
  const [sheinCaptchaMessage, setSheinCaptchaMessage] = useState("");
  const [sheinCaptchaLoading, setSheinCaptchaLoading] = useState(false);
  const [sheinProgress, setSheinProgress] = useState(0);
  const [imageUploadLoading, setImageUploadLoading] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const [imageUploadStage, setImageUploadStage] = useState("");
  const [imageUploadError, setImageUploadError] = useState("");
  const [selectedSite, setSelectedSite] = useState<"temu" | "shein" | "asos" | "aliexpress">("temu");
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const sheinImgRef = useRef<HTMLImageElement>(null);
  const [ocrError, setOcrError] = useState("");
  const { t, isArabic } = useLanguage();
  const { user, profile, refreshProfile, loading: authLoading } = useAuth();
  // Admin sees USD prices; regular users see only DZD
  const isAdmin = user?.email === "euroluxe.dz@gmail.com";
  const isAuthenticated = !!user;
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/login?callbackUrl=/calculateur");
    }
  }, [authLoading, isAuthenticated, router]);
  const addItemToStore = useCartStore((s) => s.addItem);

  // Checkout state
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveInfo, setSaveInfo] = useState(true);
  const [useSaved, setUseSaved] = useState(false);
  const [shippingError, setShippingError] = useState("");

  const [shipping, setShipping] = useState<ShippingInfo>({
    fullName: "",
    phone: "",
    wilaya: "",
    commune: "",
    codePostal: "",
    address: "",
    notes: "",
  });

  // Available communes based on selected wilaya
  const [availableCommunes, setAvailableCommunes] = useState<Commune[]>([]);


  // Pre-fill shipping info from user profile
  useEffect(() => {
    if (profile && isAuthenticated) {
      const hasSavedInfo = profile.phone || profile.wilaya || profile.address;
      if (hasSavedInfo) {
        setUseSaved(true);
        const communes = getCommunesForWilaya(profile.wilaya || "");
        setAvailableCommunes(communes);
        setShipping({
          fullName: profile.name || "",
          phone: profile.phone || "",
          wilaya: profile.wilaya || "",
          commune: profile.commune || "",
          codePostal: profile.codePostal || "",
          address: profile.address || "",
          notes: "",
        });
      } else {
        setShipping((prev) => ({
          ...prev,
          fullName: profile.name || "",
          phone: profile.phone || "",
        }));
      }
    }
  }, [profile, isAuthenticated]);

  // Detect Temu product code / Item ID in real-time
  useEffect(() => {
    const input = productUrl.trim();
    const isTemuCode = /^[a-zA-Z0-9]{6,30}$/.test(input);
    if (isTemuCode) {
      setDetectedCode(input);
      // Item IDs (like TV10922608) don't work in -g- URL format, use search instead
      if (/^[A-Z]{2}\d+/i.test(input)) {
        setTemuLink(`https://www.temu.com/search_result.html?search_key=${input}`);
      } else {
        setTemuLink(`https://www.temu.com/-g-${input}.html`);
      }
    } else if (input.includes("temu.com")) {
      setDetectedCode(null);
      setTemuLink(input.startsWith("http") ? input : `https://${input}`);
    } else {
      setDetectedCode(null);
      setTemuLink(null);
    }
  }, [productUrl]);

  // Auto-scroll to result when it becomes available
  // Single, well-timed scroll to avoid "jumping" effect
  useEffect(() => {
    if (!result) return;
    
    let cancelled = false;
    
    const scrollToResult = () => {
      if (cancelled || !resultRef.current) return;
      
      // Calculate the target scroll position
      // We want the result to be at the top of the viewport, 
      // with some offset for the fixed navbar (~80px on mobile, ~100px on desktop)
      const navbarOffset = 90;
      const elementTop = resultRef.current.getBoundingClientRect().top;
      const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
      const targetScroll = currentScroll + elementTop - navbarOffset;
      
      // Smooth scroll to the target position
      window.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: "smooth",
      });
    };
    
    // Wait for the result animation to start, then scroll once
    // 300ms is enough for the motion.div to begin rendering
    const timer = setTimeout(scrollToResult, 300);
    
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [result]);

  /**
   * Handle screenshot upload for OCR price extraction.
   * Reads the file as base64, sends to /api/ocr-price, fills the manual price field.
   */
  const handleScreenshotUpload = async (rawFile: File) => {
    setOcrLoading(true);
    setOcrError("");
    try {
      // Validate file type
      if (!rawFile.type.startsWith("image/")) {
        setOcrError(isArabic ? "الرجاء رفع صورة (PNG أو JPG)" : "Veuillez télécharger une image (PNG ou JPG)");
        return;
      }

      // Compress the image client-side if too large
      const file = await compressImage(rawFile, 4);

      // Use OCR.space API (more accurate than Tesseract)
      setImageUploadProgress(35);
      setImageUploadStage(isArabic ? "جارٍ قراءة الصورة..." : "Lecture de l'image...");
      console.log("[OCR] Sending to OCR.space API...");

      const ocrFormData = new FormData();
      ocrFormData.append("file", file);
      ocrFormData.append("language", "eng");
      ocrFormData.append("isOverlayRequired", "false");
      ocrFormData.append("scale", "true");
      ocrFormData.append("OCREngine", "2");

      setImageUploadProgress(50);
      const ocrResponse = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        headers: { "apikey": "helloworld" },
        body: ocrFormData,
      });
      const ocrData = await ocrResponse.json();
      
      const text = ocrData?.ParsedResults?.[0]?.ParsedText || "";
      console.log("[OCR] OCR.space text:", text.substring(0, 300));

      // Extract price from the recognized text
      const priceResult = extractPriceFromText(text);

      if (priceResult.price !== null && priceResult.price > 0) {
        let priceUSD = priceResult.price;
        const cur = (priceResult.currency || "USD").toUpperCase();
        if (cur === "DZD") priceUSD = priceResult.price / 300;
        else if (cur === "EUR") priceUSD = priceResult.price * 1.085;
        else if (cur === "GBP") priceUSD = priceResult.price * 1.265;

        setManualPrice(priceUSD.toFixed(2));
        setResult(null);
        setError("");
        setShowCheckout(false);
        console.log(`[OCR] ✓ Extracted: ${priceResult.price} ${cur} = $${priceUSD.toFixed(2)}`);
      } else {
        setOcrError(
          isArabic
            ? "تعذّر استخراج السعر من الصورة. تأكد أن لقطة الشاشة تحتوي على سعر واضح للمنتج (مثل: US $11.50)."
            : "Impossible d'extraire le prix. Assurez-vous que la capture montre un prix clair (ex: US $11.50)."
        );
      }
    } catch (e: any) {
      setOcrError(isArabic ? "خطأ في معالجة الصورة: " + e.message : "Erreur lors du traitement: " + e.message);
      console.error("[OCR] Upload error:", e);
    } finally {
      setOcrLoading(false);
      // Reset file input so the same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Extract price from recognized text using multiple patterns
  const extractPriceFromText = (text: string): { price: number | null; currency: string | null } => {
    const clean = text.replace(/\s+/g, " ").trim();

    // Pattern 1: US $X.XX (Temu's format)
    const usdMatch = clean.match(/US\s*\$\s*(\d+(?:[.,]\d{1,2})?)/i);
    if (usdMatch) {
      const p = parseFloat(usdMatch[1].replace(",", "."));
      if (p > 0 && p < 10000) return { price: p, currency: "USD" };
    }

    // Pattern 2: $X.XX (generic)
    const dollarMatch = clean.match(/\$\s*(\d+(?:[.,]\d{1,2})?)/);
    if (dollarMatch) {
      const p = parseFloat(dollarMatch[1].replace(",", "."));
      if (p > 0 && p < 10000) return { price: p, currency: "USD" };
    }

    // Pattern 3: DZD / DA
    const dzdMatch = clean.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:DZD|DA|دج)/i);
    if (dzdMatch) {
      const p = parseFloat(dzdMatch[1].replace(",", "."));
      if (p > 0 && p < 1000000) return { price: p, currency: "DZD" };
    }

    // Pattern 4: €X.XX
    const eurMatch = clean.match(/€\s*(\d+(?:[.,]\d{1,2})?)/);
    if (eurMatch) {
      const p = parseFloat(eurMatch[1].replace(",", "."));
      if (p > 0 && p < 10000) return { price: p, currency: "EUR" };
    }

    // Pattern 5: £X.XX
    const gbpMatch = clean.match(/£\s*(\d+(?:[.,]\d{1,2})?)/);
    if (gbpMatch) {
      const p = parseFloat(gbpMatch[1].replace(",", "."));
      if (p > 0 && p < 10000) return { price: p, currency: "GBP" };
    }

    // Pattern 6: Plain number with 2 decimals (often the price after $ sign in OCR)
    const plainMatch = clean.match(/\b(\d+\.\d{2})\b/);
    if (plainMatch) {
      const p = parseFloat(plainMatch[1]);
      if (p > 0 && p < 10000) return { price: p, currency: "USD" };
    }

    return { price: null, currency: null };
  };

  /**
   * Preprocess an image for better OCR accuracy.
   * - Converts to grayscale
   * - Increases contrast (2.5x) to make colored text (like red prices) more visible
   * - Returns a new File object with the enhanced image
   */
  const preprocessImageForOCR = async (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) { resolve(file); return; }

            // Draw original image
            ctx.drawImage(img, 0, 0);

            // Get image data for processing
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Convert to grayscale with enhanced contrast
            // We use a higher contrast factor to make red text more visible
            const contrastFactor = 2.5; // 2.5x contrast
            const intercept = 128 * (1 - contrastFactor);

            for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];

              // Standard grayscale conversion
              let gray = 0.299 * r + 0.587 * g + 0.114 * b;

              // Apply contrast enhancement
              gray = gray * contrastFactor + intercept;
              gray = Math.max(0, Math.min(255, gray));

              data[i] = gray;
              data[i + 1] = gray;
              data[i + 2] = gray;
            }

            ctx.putImageData(imageData, 0, 0);

            // Convert to blob and return as File
            canvas.toBlob(
              (blob) => {
                if (!blob) { resolve(file); return; }
                const processedFile = new File(
                  [blob],
                  file.name.replace(/\.[^.]+$/, ".jpg"),
                  { type: "image/jpeg", lastModified: Date.now() }
                );
                console.log(`[ImagePreprocess] Enhanced image: ${(processedFile.size / 1024).toFixed(0)} KB`);
                resolve(processedFile);
              },
              "image/jpeg",
              0.95
            );
          } catch (err) {
            console.warn("[ImagePreprocess] Error, using original:", err);
            resolve(file);
          }
        };
        img.onerror = () => resolve(file);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  };

  /**
   * Compress an image file client-side to be under the size limit.
   * Uses canvas to resize and re-encode the image.
   * Returns a File object (compressed) or the original if already small enough.
   */
  const compressImage = async (file: File, maxSizeMB: number = 4): Promise<File> => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    // If already under the limit, return as-is
    if (file.size <= maxSizeBytes) return file;

    console.log(`[ImageCompress] Original: ${(file.size / 1024 / 1024).toFixed(2)} MB, compressing...`);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Calculate new dimensions - cap at max 2000px on the longest side
          const MAX_DIM = 2000;
          let width = img.width;
          let height = img.height;

          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas context not available"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);

          // Try JPEG with decreasing quality until under the size limit
          let quality = 0.85;
          let attempts = 0;
          const tryCompress = () => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  // Fallback: return original
                  resolve(file);
                  return;
                }
                attempts++;
                console.log(`[ImageCompress] Attempt ${attempts}: quality=${quality.toFixed(2)}, size=${(blob.size / 1024 / 1024).toFixed(2)} MB`);

                if (blob.size <= maxSizeBytes || attempts >= 5 || quality <= 0.3) {
                  // Good enough, or max attempts reached
                  const compressedFile = new File(
                    [blob],
                    file.name.replace(/\.[^.]+$/, ".jpg"),
                    { type: "image/jpeg", lastModified: Date.now() }
                  );
                  console.log(`[ImageCompress] Final: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);
                  resolve(compressedFile);
                } else {
                  // Reduce quality and try again
                  quality -= 0.15;
                  tryCompress();
                }
              },
              "image/jpeg",
              quality
            );
          };
          tryCompress();
        };
        img.onerror = () => resolve(file); // fallback to original
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  };

  // Handle image upload - uses OCR.space API (accurate, server-side, no Tesseract)
  const handleImageUpload = async (rawFile: File) => {
    setImageUploadLoading(true);
    setImageUploadProgress(10);
    setImageUploadStage(isArabic ? "جارٍ تحضير الصورة..." : "Préparation de l'image...");
    setImageUploadError("");
    try {
      if (!rawFile.type.startsWith("image/")) {
        setImageUploadError(isArabic ? "الرجاء رفع صورة (PNG أو JPG)" : "Veuillez télécharger une image");
        return;
      }

      // Use ORIGINAL file for OCR (not compressed - compression can change OCR results)
      // OCR.space handles large images fine (up to 1MB for free tier)
      console.log(`[ImageUpload] Original size: ${(rawFile.size / 1024 / 1024).toFixed(2)} MB`);
      setImageUploadProgress(20);
      
      // Convert to data URL for display (use original file)
      const buffer = await rawFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      const dataUrl = `data:${rawFile.type};base64,${base64}`;

      // Use OCR.space API (more accurate than Tesseract, handles colored text)
      setImageUploadProgress(35);
      setImageUploadStage(isArabic ? "جارٍ قراءة الصورة..." : "Lecture de l'image...");
      console.log("[ImageUpload] Sending to OCR.space API...");

      const formData = new FormData();
      formData.append("file", rawFile);  // Send ORIGINAL file, not compressed
      formData.append("language", "eng");
      formData.append("isOverlayRequired", "false");
      formData.append("scale", "true");
      formData.append("OCREngine", "2"); // Engine 2 is more accurate

      setImageUploadProgress(50);
      const ocrResponse = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        headers: { "apikey": "helloworld" }, // Free API key (25000 req/month)
        body: formData,
      });
      
      if (!ocrResponse.ok) {
        console.log("[ImageUpload] OCR.space API error:", ocrResponse.status);
        throw new Error("OCR API failed");
      }
      
      const ocrData = await ocrResponse.json();
      console.log("[ImageUpload] OCR.space response status:", ocrData?.OCRExitCode);
      
      let text = "";
      if (ocrData?.ParsedResults?.[0]?.ParsedText) {
        text = ocrData.ParsedResults[0].ParsedText;
        console.log("[ImageUpload] OCR.space text:", text.substring(0, 300));
      } else {
        console.log("[ImageUpload] OCR.space failed, no text found");
      }
      setImageUploadProgress(75);
      setImageUploadStage(isArabic ? "جارٍ استخراج السعر..." : "Extraction du prix...");

      // Extract price from text
      let priceResult = extractPriceFromImageText(text, selectedSite);
      console.log("[ImageUpload] Price extracted:", priceResult);
      
      // Extract product name - SHORT and CLEAR (not long and confusing)
      const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      
      // Patterns that indicate a line is NOT a product name
      const skipPatterns = [
        /^\d{1,2}:\d{2}/i,          // "3:19" (time)
        /\d+%/i,                      // battery percentage
        /\bLTE\b|\b5G\b|\b4G\b|\b3G\b/i,  // signal
        /^[<>=~()\[\]{}]+/,         // UI chars only
        /\bVERIFIED\b/i,             // SHEIN badges
        /^\d+\s*Articl/i,            // "2 Articl..."
        /^\d+\s*Article/i,
        /\bAJOUTER\b|\bPANIER\b|\bADD\b|\bCART\b/i,  // Add to cart buttons
        /\bOFF\b.*\borders?\b/i,   // "30% OFF For orders"
        /^\$\s*\d/i,                // price-only lines
        /^€\s*\d/i,                  // EUR price-only lines
        /\bFREES\b|\bFREE\b/i,     // "FREE SHIPPING"
        /\bSHEIN\b/i,                // SHEIN brand name
        /\bMODE\b/i,                 // "Mode en ligne"
        /\bT\u00e9l\u00e9chargez\b/i,  // "Téléchargez"
        /\bAPP\b/i,                  // APP download
        /\bOBTENIR\b/i,              // OBTENIR button
        /\bavantages\b/i,            // "avantages"
        /\bLivraison\b/i,            // "Livraison"
        /\bEntrepat\b/i,             // "Entrepat UE"
        /\bEntrep\u00f4t\b/i,       // "Entrepôt"
        /^\d+\s*ventes/i,            // "7 ventes"
        /^\d+\s*reviews/i,           // review counts
        /\bService\/Avantages\b/i,
        /\bS\u00e9lectionner\b/i,   // "Sélectionner"
        /\bGRANDES PROMOS\b/i,
        /\bTERMINE\b/i,
        /\bTaille\b/i,               // "Taille (EU)"
        /\bGuide\b/i,
        /\bPr\u00e9-commande\b/i,   // "Pré-commande"
        /\bPantalon Droit T\b/i,     // SHEIN product type prefix
        /\bXLLAIS\b/i,               // brand code
        /\bdavantages\b/i,           // "davantages" (garbled)
        /\bdiavantages\b/i,          // "diavantages" (garbled)
        /\bNey\b/i,                  // garbled text
        /\bEBB\b/i,                  // garbled text
        /!$/,                         // lines ending with !
        /\.\.\.$/,                   // lines ending with ...
        /^\d+\s/,                    // lines starting with number
        /\bGratuit\b/i,              // "Gratuit" (free)
        /\bPANIER\b/i,
        /\bCommander\b/i,
        /\bJOUTER\b/i,               // "JOUTER AU" (garbled AJOUTER)
        /^-/,                         // lines starting with -
        /^\d+\s*\)/,                // lines starting with number)
        /\bQa\b/i,                   // garbled text "Qa"
        /\bGE\b$/,                   // garbled text "GE" at end
        /^c=/i,                       // "c= SHEIN"
        /\bDécontra\b/i,             // garbled "Décontractées"
        /\baille\b/i,                // garbled "Taille"
        /\bBlanc\b/i,                // color (not product name)
        /\bFemme\b/i,                // category (not product name)
        /\bMode\b/i,                 // category
      ];
      
      // Find the FIRST line that looks like a product name (short and descriptive)
      let productName: string | null = null;
      
      for (const line of lines) {
        // Skip if too short or too long
        if (line.length < 5 || line.length > 80) continue;
        // Skip if matches any skip pattern
        if (skipPatterns.some(p => p.test(line))) continue;
        // Skip if only numbers/symbols
        if (/^[\d\s\$£€.,+\-*/%=<>()]+$/i.test(line)) continue;
        // Skip if starts with special chars
        if (/^[<>=~()\[\]{}\d+]/.test(line)) continue;
        // Skip if has too many special chars (garbled text)
        const alphaChars = line.replace(/[^a-zA-ZÀ-ÿ]/g, "").length;
        if (alphaChars < 4) continue;
        // Skip if has "!" or "..." (usually UI text)
        if (/[!.]{2,}/.test(line) || line.endsWith("!")) continue;
        // Must have at least 2 words with 3+ chars
        const words = line.split(/\s+/).filter(w => w.length >= 3);
        if (words.length < 1) continue;
        
        // Clean up the line
        let cleaned = line
          .replace(/\s*\d+\.\d{1,2}\s*\(\d+\+?\)\s*>?\s*/gi, "")  // remove "4.64 (100+)"
          .replace(/\s*\(\d+\+?\)\s*>?\s*/gi, "")  // remove "(100+)"
          .replace(/\s*>\s*$/g, "")  // remove trailing ">"
          .replace(/\s*\|\s*$/gi, "")  // remove trailing "|"
          .replace(/\s*\b[vV]\s*$/i, "")  // remove trailing "v"
          .replace(/\s{2,}/g, " ")  // collapse spaces
          .trim();
        
        // Skip if cleaned is too short
        if (cleaned.length < 5) continue;
        
        // Limit to 50 characters (short and clear)
        if (cleaned.length > 50) {
          // Try to cut at a word boundary
          const cut = cleaned.substring(0, 50);
          const lastSpace = cut.lastIndexOf(" ");
          cleaned = lastSpace > 20 ? cut.substring(0, lastSpace) : cut;
        }
        
        productName = cleaned;
        console.log(`[ImageUpload] Product name: "${productName}"`);
        break;
      }
      
      if (!productName || productName.length < 3) {
        productName = isArabic ? "منتج" : "Produit";
      }

      if (priceResult.price !== null && priceResult.price > 0) {
        let priceUSD = priceResult.price;
        const cur = (priceResult.currency || "USD").toUpperCase();
        if (cur === "DZD") priceUSD = priceResult.price / 300;
        else if (cur === "EUR") priceUSD = priceResult.price * 1.085;
        else if (cur === "GBP") priceUSD = priceResult.price * 1.265;

        const RATE = 300;
        const totalDZD = Math.round(priceUSD * RATE);

        setResult({
          usd: priceUSD,
          dzd: totalDZD,
          breakdown: {
            basePriceUSD: priceUSD, basePriceDZD: totalDZD,
            shippingUSD: 0, shippingDZD: 0, customsUSD: 0, customsDZD: 0,
            commissionUSD: 0, commissionDZD: 0, extraFeesDZD: 0,
            totalUSD: priceUSD, totalDZD: totalDZD, finalTotalRoundedDZD: totalDZD,
            quantity: 1,
          },
          productName: productName,
          originalPrice: null,
          image: dataUrl,
          estimated: false, manual: false, source: "image-upload",
        });

        setDetectedProduct({
          name: productName,
          description: isArabic
            ? `تم استخراج السعر من الصورة بواسطة OCR`
            : `Prix extrait depuis l'image via OCR`,
          image: dataUrl,
          url: null,
          antiBotDetected: false,
        });

        setManualPrice(priceUSD.toFixed(2));
        setError("");
        setShowCheckout(false);
        setImageUploadProgress(100);
        setImageUploadStage(isArabic ? "تم!" : "Terminé!");
        console.log(`[ImageUpload] ✓ Price extracted: ${priceResult.price} ${priceResult.currency} = $${priceUSD.toFixed(2)} = ${totalDZD.toLocaleString()} DA`);
      } else {
        setImageUploadProgress(100);
        setImageUploadStage(isArabic ? "لم يتم العثور على سعر" : "Aucun prix trouvé");
        // Show first 150 chars of OCR text for debugging
        const ocrPreview = text.substring(0, 150).replace(/\n/g, " ");
        setImageUploadError(
          isArabic
            ? "تعذّر استخراج السعر. أدخل السعر يدوياً بالدولار (مثلا: 10.50)"
            : "Prix non détecté automatiquement. Saisissez le prix en $ manuellement (ex: 10.50)"
        );
        console.log("[ImageUpload] Full OCR text:", text);
        console.log("[ImageUpload] OCR preview:", ocrPreview);
        // Still set the detected product so user can use manual price entry
        setDetectedProduct({
          name: productName,
          description: isArabic
            ? `تم استخراج المنتج - أدخل السعر يدوياً`
            : `Produit détecté - saisissez le prix manuellement`,
          image: dataUrl,
          url: null,
          antiBotDetected: false,
        });
      }
    } catch (e: any) {
      setImageUploadError(isArabic ? "خطأ في معالجة الصورة: " + e.message : "Erreur: " + e.message);
    } finally {
      setImageUploadLoading(false);
      setTimeout(() => {
        setImageUploadProgress(0);
        setImageUploadStage("");
      }, 2000);
      if (imageUploadRef.current) imageUploadRef.current.value = "";
    }
  };

  // Extract price from OCR text
  /**
   * Extract price from OCR text with smart filtering to avoid confusing 
   * product RATINGS (e.g. "4.64 (100+)") with actual PRICES.
   * 
   * Strategy:
   * 1. Look for explicit currency symbols ($, €, £, DZD, US $)
   * 2. Filter out numbers that appear near rating indicators (stars, reviews, ratings)
   * 3. Only fall back to plain numbers if NO currency symbols are found
   * 4. For plain numbers, exclude those near "(\d+)" patterns (review counts)
   */
  const extractPriceFromImageText = (text: string, site?: string): { price: number | null; currency: string | null } => {
    const clean = text.replace(/\s+/g, " ").trim();
    console.log("[PriceExtract] Text:", clean.substring(0, 300));

    // Step 1: Try currency-prefixed prices (most reliable)
    // Order matters: most specific patterns first
    const currencyPatterns: Array<{ name: string; regex: RegExp; currency: string }> = [
      { name: "US $", regex: /US\s*\$\s*(\d+(?:[.,]\d{1,2})?)/i, currency: "USD" },
      { name: "$", regex: /\$\s*(\d+(?:[.,]\d{1,2})?)/, currency: "USD" },
      { name: "EUR", regex: /(?:€|EUR|E\u20ac)\s*(\d+(?:[.,]\d{1,2})?)/i, currency: "EUR" },
      { name: "EUR-suffix", regex: /(\d+(?:[.,]\d{1,2})?)\s*(?:€|EUR)/i, currency: "EUR" },
      { name: "EUR-comma", regex: /(\d+),(\d{2})\s*€/, currency: "EUR" },  // "10,69€" European format
      { name: "EUR-garbled", regex: /(\d+[.,]\d{1,2})\s*[¢\u00A2]/, currency: "EUR" },
      { name: "EUR-split", regex: /(\d+)\s+(\d{1,2})[¢\u00A2]/, currency: "EUR" },  // "10 60¢" = €10.60
      { name: "EUR-space", regex: /(\d+)\s+(\d{2})\s*(?:\+|EBB|EURO?|€)/i, currency: "EUR" },  // "10 60 +" = €10.60
      { name: "GBP", regex: /£\s*(\d+(?:[.,]\d{1,2})?)/, currency: "GBP" },
      { name: "DZD", regex: /(\d+(?:[.,]\d{1,2})?)\s*(?:DZD|DA|دج)/i, currency: "DZD" },
    ];

    // Phrases that indicate the price is a PROMO threshold, not the product price
    const promoPhrases = [
      "for orders", "pour commandes", "spend ", "dépensez",
      "off for", "off sur", "minimum", "min ", "orders $",
      "crédit", "credit", "de crédit",  // Skip credit amounts like "$1.01 de crédit"
      "capped at", "coupon", "coupons",  // Skip coupon/capped prices
      "price after", "may vary",  // Skip "Price after applying coupons"
    ];

    // Phrases that indicate this is the ORIGINAL price (not sale price)
    // These appear near crossed-out/strikethrough prices
    const originalPricePhrases = [
      "après application", "aprés application", "de réduction", "de reduction",
      "original", "was ", "était ",  // Note: "after applying" handled by promo phrases
    ];

    // Phrases that indicate this is the SALE price (preferred)
    const salePricePhrases = [
      "est.", "est ", "now ", "maintenant ", "sale", "promo",
      "prix", "price",
    ];

    for (const { name, regex, currency } of currencyPatterns) {
      // matchAll requires the 'g' flag - add it if missing
      const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
      const matches = [...clean.matchAll(new RegExp(regex.source, flags))];
      
      // Collect all valid prices with their context
      const validPrices: Array<{ price: number; index: number; before: string; hasDecimal: boolean }> = [];
      for (const match of matches) {
        let rawValue: string;
        let p: number;
        
        // Handle patterns with 2 groups (euros + cents)
        if ((name === "EUR-split" || name === "EUR-space" || name === "EUR-comma") && match[2]) {
          rawValue = match[1] + "." + match[2];
          p = parseFloat(match[1]) + parseFloat(match[2]) / 100;
        } else {
          rawValue = match[1];
          p = parseFloat(rawValue.replace(",", "."));
        }
        
        if (p > 0 && p < 10000) {
          const matchStart = match.index!;
          // Check ONLY the 15 chars immediately before the price
          const before = clean.substring(Math.max(0, matchStart - 15), matchStart).toLowerCase();
          // Real prices usually have decimal places (e.g., $10.14, not $1569)
          const hasDecimal = rawValue.includes(".") || rawValue.includes(",");
          validPrices.push({ price: p, index: matchStart, before, hasDecimal });
        }
      }
      
      // Filter: 1) Not promo thresholds, 2) Not original/crossed-out prices
      const nonPromoPrices = validPrices.filter(({ before, index, price }) => {
        // Check BEFORE context for ALL promo/credit phrases
        const isPromoBefore = promoPhrases.some(phrase => before.includes(phrase));
        // Only check AFTER context for CREDIT phrases (not "for orders")
        // "for orders" in after-context is OK (e.g., "$10.60 30% off for orders $15.00+")
        // But "$1.01 de crédit" needs to be caught
        const creditPhrases = ["crédit", "credit", "de crédit"];
        const afterForPromo = clean.substring(index, index + 20).toLowerCase();
        const isPromoAfter = creditPhrases.some(phrase => afterForPromo.includes(phrase));
        if (isPromoBefore || isPromoAfter) {
          console.log(`[PriceExtract] Skipping promo/credit: $${price} (before: "${before}", after: "${afterForPromo.substring(0, 20)}")`);
          return false;
        }
        // Check if this looks like an original price (crossed out)
        // Only skip if NOT a sale price (no "Est." or sale indicator before)
        const isSalePrice = salePricePhrases.some(phrase => before.includes(phrase));
        if (!isSalePrice) {
          // Only check IMMEDIATE after-context (20 chars) for original price phrases
          const afterContext = clean.substring(index, index + 20).toLowerCase();
          const isOriginal = originalPricePhrases.some(phrase => afterContext.includes(phrase));
          if (isOriginal) {
            console.log(`[PriceExtract] Skipping original/crossed-out price: $${price} (after: "${afterContext.substring(0, 30)}")`);
            return false;
          }
        }
        return true;
      });
      
      // Among non-promo prices, prefer ones with "Est." or sale price indicators
      const salePrices = nonPromoPrices.filter(({ before }) => 
        salePricePhrases.some(phrase => before.includes(phrase))
      );
      
      // Prefer decimal prices (real prices have .XX)
      const decimalPrices = nonPromoPrices.filter(({ hasDecimal }) => hasDecimal);
      
      // Priority: 1) Sale prices (Est.), 2) Decimal prices, 3) All non-promo prices
      const candidates = salePrices.length > 0 
        ? salePrices 
        : (decimalPrices.length > 0 ? decimalPrices : nonPromoPrices);
      
      // Return the first candidate
      if (candidates.length > 0) {
        console.log(`[PriceExtract] Found ${name}: ${candidates[0].price} (sale: ${salePrices.length > 0}, decimals: ${candidates[0].hasDecimal})`);
        return { price: candidates[0].price, currency };
      }
    }
    
    // SHEIN-SPECIFIC: If SHEIN selected, try aggressive price detection
    // SHEIN prices are in EUR and OCR often garbles the € symbol
    // Look for patterns like "10 60", "10,60", "10.60", "10 60¢" etc.
    if (site === "shein") {
      console.log("[PriceExtract] SHEIN mode - aggressive EUR detection");
      
      // Pattern 1: "XX XX" with any separator (space, comma, period) + optional ¢/€
      const sheinPatterns = [
        /\b(\d{1,3})[\s,.]+(\d{2})\s*[¢€\u00A2]?/g,  // "10 60", "10,60", "10.60"
        /\b(\d{2,3})[.,](\d{2})\b/g,  // "10.60", "10,60"
      ];
      
      for (const pattern of sheinPatterns) {
        const matches = [...clean.matchAll(pattern)];
        for (const m of matches) {
          const euros = parseInt(m[1]);
          const cents = parseInt(m[2]);
          // Valid price: 1-499 euros, 0-99 cents
          if (euros > 0 && euros < 500 && cents >= 0 && cents < 100) {
            const price = euros + cents / 100;
            // Skip if this is actually a rating (4.80 with 1000+ reviews)
            // Only skip if "(NNNN" is IMMEDIATELY after the number (within 5 chars)
            const afterStart = m.index! + m[0].length;
            const afterImmediate = clean.substring(afterStart, afterStart + 5).toLowerCase();
            const afterContext = clean.substring(afterStart, afterStart + 30).toLowerCase();
            // Rating pattern: number immediately followed by "(1000+" or "(100+" etc.
            const isRating = /^\s*\(\d{2,}/.test(afterImmediate) || 
                            afterImmediate.startsWith("(") ||
                            (price >= 1 && price <= 5 && afterContext.includes("("));
            if (isRating) {
              console.log(`[PriceExtract] Skipping rating: ${price} (after: "${afterImmediate}")`);
              continue;
            }
            console.log(`[PriceExtract] SHEIN price: ${price} EUR (from "${m[0]}")`);
            return { price, currency: "EUR" };
          }
        }
      }
    }

    // FALLBACK: No currency symbol found. Try plain decimal numbers (XX.XX format)
    // but skip ratings (near "stars", "(1000+)", etc.)
    const plainNumbers = [...clean.matchAll(/\b(\d+\.\d{2})\b/g)];
    const ratingPhrases = ["stars", "star", "rating", "avis", "ventes", "sales", "reviews", "review"];
    const ratingSkipPatterns = /\(\d+\+?\)|stars?|rating|avis|ventes|reviews?/i;
    
    const validPlainPrices: Array<{ price: number; index: number; before: string; after: string }> = [];
    for (const match of plainNumbers) {
      const numStr = match[1];
      const num = parseFloat(numStr);
      if (num <= 0 || num >= 10000) continue;
      
      const matchEnd = match.index! + match[0].length;
      const before = clean.substring(Math.max(0, match.index! - 20), match.index!).toLowerCase();
      const after = clean.substring(matchEnd, matchEnd + 30).toLowerCase();
      
      // Skip if near rating indicators
      if (ratingSkipPatterns.test(before) || ratingSkipPatterns.test(after)) {
        console.log(`[PriceExtract] Skipping rating: ${numStr} (before: "${before}", after: "${after}")`);
        continue;
      }
      
      // Skip very small numbers (likely not prices)
      if (num < 0.50) continue;
      
      // Skip numbers that look like percentages (near %)
      if (before.includes("%") || after.includes("%")) continue;
      
      validPlainPrices.push({ price: num, index: match.index!, before, after });
    }
    
    if (validPlainPrices.length > 0) {
      // Sort by price (prefer higher prices, they're more likely to be product prices)
      // But filter out obviously wrong ones (too high = > $500 for typical items)
      const reasonablePrices = validPlainPrices.filter(p => p.price <= 200);
      const sorted = (reasonablePrices.length > 0 ? reasonablePrices : validPlainPrices)
        .sort((a, b) => b.price - a.price);
      // If SHEIN was selected, assume EUR; if Temu/AliExpress, assume USD
      const detectedCurrency = site === "shein" ? "EUR" : "USD";
      console.log(`[PriceExtract] Found plain price: ${sorted[0].price} ${detectedCurrency} (site: ${site}, ${validPlainPrices.length} candidates)`);
      return { price: sorted[0].price, currency: detectedCurrency };
    }
    
    return { price: null, currency: null };
  };

  // Handle SHEIN price extraction
  const handleSheinExtract = async () => {
    if (!sheinUrl.trim()) {
      setError(isArabic ? "الرجاء إدخال رابط منتج SHEIN" : "Veuillez entrer un lien SHEIN");
      return;
    }
    if (!sheinUrl.includes("shein.com")) {
      setError(isArabic ? "الرابط يجب أن يكون من shein.com" : "Le lien doit venir de shein.com");
      return;
    }

    setSheinLoading(true);
    setSheinProgress(1);
    setError("");
    setResult(null);
    setDetectedProduct(null);

    try {
      setSheinProgress(2);
      const res = await fetch("/api/scrape-shein", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sheinUrl.trim() }),
      });
      const data = await res.json();
      setSheinProgress(3);

      if (data.status === "success" && data.price && data.price > 0) {
        const priceUSD = data.price;
        const RATE = 300;
        const totalDZD = Math.round(priceUSD * RATE);
        
        setTemuLink(data.productUrl || sheinUrl.trim());
        setResult({
          usd: priceUSD,
          dzd: totalDZD,
          breakdown: {
            basePriceUSD: priceUSD, basePriceDZD: totalDZD,
            shippingUSD: 0, shippingDZD: 0, customsUSD: 0, customsDZD: 0,
            commissionUSD: 0, commissionDZD: 0, extraFeesDZD: 0,
            totalUSD: priceUSD, totalDZD: totalDZD, finalTotalRoundedDZD: totalDZD,
            quantity: 1,
          },
          productName: data.productName || "Produit SHEIN",
          originalPrice: null,
          image: data.productImage || null,
          estimated: false, manual: false, source: "shein-auto",
        });
        // Show detected product so user can verify
        setDetectedProduct({
          name: data.productName || "Produit SHEIN",
          description: isArabic
            ? "⚠️ تأكد من أن هذا هو نفس المنتج على SHEIN. إذا كان مختلفاً، أدخل السعر يدوياً."
            : "⚠️ Vérifiez que c'est le bon produit SHEIN. Si non, saisissez le prix manuellement.",
          image: data.productImage || null,
          url: data.productUrl || sheinUrl.trim(),
          antiBotDetected: false,
        });
        setSheinLoading(false);
      } else if (data.status === "captcha" && data.sessionId) {
        // CAPTCHA detected - store session and show interactive solver
        setSheinLoading(false);
        setSheinSessionId(data.sessionId);
        setSheinScreenshot(data.screenshot);
        setSheinCaptchaMessage(data.message || (isArabic ? "انقر على زر التحقق" : "Cliquez sur vérifier"));
      } else {
        setSheinLoading(false);
        setError(data.message || (isArabic ? "تعذّر استخراج السعر من SHEIN" : "Extraction indisponible"));
        if (data.productName || data.productImage) {
          setDetectedProduct({
            name: data.productName || "Produit SHEIN",
            description: null, image: data.productImage || null,
            url: data.productUrl || sheinUrl.trim(), antiBotDetected: true,
            message: isArabic ? "أدخل السعر من SHEIN" : "Saisissez le prix SHEIN",
          });
        }
        setTimeout(() => priceInputRef.current?.focus(), 300);
      }
    } catch (e: any) {
      setSheinLoading(false);
      setError(isArabic ? "خطأ في الاتصال" : "Erreur de connexion");
    }
  };

  // Handle SHEIN CAPTCHA click
  const handleSheinCaptchaClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!sheinSessionId || !sheinImgRef.current || sheinCaptchaLoading) return;

    const rect = sheinImgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1920;
    const y = ((e.clientY - rect.top) / rect.height) * 1080;

    setSheinCaptchaLoading(true);
    try {
      const res = await fetch("/api/scrape-shein", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "click", sessionId: sheinSessionId, x: Math.round(x), y: Math.round(y) }),
      });
      const data = await res.json();
      setSheinProgress(3);

      if (data.status === "success" && data.price && data.price > 0) {
        const priceUSD = data.price;
        const RATE = 300;
        const totalDZD = Math.round(priceUSD * RATE);
        setTemuLink(sheinUrl.trim());
        setResult({
          usd: priceUSD, dzd: totalDZD,
          breakdown: {
            basePriceUSD: priceUSD, basePriceDZD: totalDZD,
            shippingUSD: 0, shippingDZD: 0, customsUSD: 0, customsDZD: 0,
            commissionUSD: 0, commissionDZD: 0, extraFeesDZD: 0,
            totalUSD: priceUSD, totalDZD: totalDZD, finalTotalRoundedDZD: totalDZD,
            quantity: 1,
          },
          productName: data.productName || "Produit SHEIN",
          originalPrice: null, image: data.productImage || null,
          estimated: false, manual: false, source: "shein-auto",
        });
        setSheinSessionId(null);
        setSheinScreenshot(null);
      } else if (data.status === "captcha" && data.screenshot) {
        setSheinScreenshot(data.screenshot);
        setSheinCaptchaMessage(data.message || (isArabic ? "حاول مرة أخرى" : "Réessayer"));
      } else {
        setError(data.message || "Failed");
        setSheinSessionId(null);
        setSheinScreenshot(null);
      }
    } catch (e: any) {
      setError(e?.message || "Error");
      setSheinSessionId(null);
      setSheinScreenshot(null);
    } finally {
      setSheinCaptchaLoading(false);
    }
  };

  // Extract product name from URL
  const extractProductName = (url: string): string | null => {
    try {
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      const segments = parsed.pathname.split("/").filter(Boolean);
      const slug =
        segments.find((s) => s.includes("-g-") && s.length > 10) ||
        segments.find((s) => s.includes("-") && s.length > 10) ||
        segments[segments.length - 1] ||
        "";
      const name = slug
        .replace(/-g-[a-zA-Z0-9]+\.html?$/i, "")
        .replace(/\.html?$/i, "")
        .replace(/-/g, " ")
        .trim();
      if (name && name.length > 3) {
        return name.replace(/\b\w/g, (l) => l.toUpperCase());
      }
    } catch { /* skip */ }
    return null;
  };

  // AUTO-EXTRACT
  const handleAutoExtract = async () => {
    setError("");
    setResult(null);
    setShowCheckout(false);
    setOrderSuccess(false);
    setDetectedProduct(null);

    if (!productUrl.trim()) {
      setError(t("calc.error.empty"));
      return;
    }

    const isTemuProductId = /^[a-zA-Z0-9]{6,30}$/.test(productUrl.trim());
    let finalUrl = productUrl.trim();

    if (isTemuProductId) {
      // Item ID format (e.g. TV10922608) — pass as-is, the API will use web search
      // Numeric goods_id — construct -g- URL
      if (/^[A-Z]{2}\d+/i.test(productUrl.trim())) {
        finalUrl = productUrl.trim(); // Pass Item ID directly
      } else {
        finalUrl = `https://www.temu.com/-g-${productUrl.trim()}.html`;
      }
    } else {
      try {
        new URL(finalUrl);
      } catch {
        setError(t("calc.error.invalidUrl"));
        return;
      }
    }

    setLoading(true);

    try {
      const response = await fetch("/api/scrape-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: finalUrl }),
      });

      const data = await response.json();

      // Case 0: Apify is running in background - poll for results
      if (data.pending && data.datasetId) {
        console.log("[Apify] Polling for results...", data.datasetId);
        let pollResult = null;
        for (let i = 0; i < 30; i++) {
          setProgressStep(i < 3 ? 1 : i < 8 ? 2 : i < 15 ? 3 : 4);
          await new Promise(r => setTimeout(r, 2000));
          try {
            const pollRes = await fetch("/api/scrape-poll", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                datasetId: data.datasetId,
                goodsId: data.goodsId,
                shareImage: data.productImage,
              }),
            });
            pollResult = await pollRes.json();
            console.log(`[Apify Poll ${i+1}]`, pollResult.status);
            if (pollResult.status === "done" && pollResult.success) {
              setTemuLink(pollResult.productUrl || finalUrl);
              setResult({
                usd: pollResult.price,
                dzd: pollResult.dzd,
                breakdown: pollResult.breakdown,
                productName: pollResult.productName,
                originalPrice: pollResult.originalPrice || null,
                image: pollResult.productImage || data.productImage || null,
                estimated: false,
                manual: false,
                source: pollResult.source || "apify",
                itemId: pollResult.itemId || undefined,
              });
              setLoading(false);
              return;
            }
            if (pollResult.status === "error") break;
          } catch (e) {
            console.log("[Apify Poll error]", e);
          }
        }
        // Polling finished without result - retry once with a new Apify run
        if (true) {
          console.log("[Apify] Retrying with new run...");
          // Start a new Apify run
          const retryRes = await fetch("/api/scrape-price", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: productUrl.trim() || finalUrl }),
          });
          const retryData = await retryRes.json();
          if (retryData.pending && retryData.datasetId) {
            // Poll again with the new dataset
            for (let i = 0; i < 30; i++) {
              setProgressStep(i < 3 ? 1 : i < 8 ? 2 : i < 15 ? 3 : 4);
              await new Promise(r => setTimeout(r, 2000));
              try {
                const pollRes2 = await fetch("/api/scrape-poll", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    datasetId: retryData.datasetId,
                    goodsId: retryData.goodsId,
                    shareImage: retryData.productImage,
                  }),
                });
                const pollResult2 = await pollRes2.json();
                if (pollResult2.status === "done" && pollResult2.success) {
                  setTemuLink(pollResult2.productUrl || finalUrl);
                  setResult({
                    usd: pollResult2.price,
                    dzd: pollResult2.dzd,
                    breakdown: pollResult2.breakdown,
                    productName: pollResult2.productName,
                    originalPrice: pollResult2.originalPrice || null,
                    image: pollResult2.productImage || retryData.productImage || null,
                    estimated: false,
                    manual: false,
                    source: pollResult2.source || "apify",
                    itemId: pollResult2.itemId || undefined,
                  });
                  setLoading(false);
                  return;
                }
                if (pollResult2.status === "error") break;
              } catch {}
            }
          }
        }
        
        // All attempts failed
        setLoading(false);
        setTemuLink(data.productUrl || finalUrl);
        setDetectedProduct({
          name: data.productName || "Produit Temu",
          description: null,
          image: data.productImage || null,
          url: data.productUrl || finalUrl,
          antiBotDetected: true,
          message: isArabic
            ? "تعذّر استخراج السعر تلقائياً. حاول مرة أخرى أو افتح المنتج على Temu."
            : "Extraction automatique indisponible. Réessayez ou ouvrez le produit sur Temu.",
        });
        setError(
          isArabic
            ? "تعذّر استخراج السعر. حاول مرة أخرى."
            : "Extraction automatique indisponible. Réessayez."
        );
        setTimeout(() => priceInputRef.current?.focus(), 300);
        return;
      }

      // Case 1: Auto-extracted price found
      if (data.success && data.price && data.price > 0) {
        setTemuLink(finalUrl);
        setResult({
          usd: data.price,
          dzd: data.dzd || Math.round(data.price * 300),
          breakdown: data.breakdown,
          productName: data.productName,
          originalPrice: data.originalPrice || null,
          image: data.productImage || data.image || null,
          estimated: data.estimated || false,
          manual: data.manual || false,
          source: data.source || "auto",
          itemId: data.itemId || undefined,
        });
      }
      // Case 2: Product detected but price not auto-extracted — show manual price entry
      else if (data.success === false && data.productUrl && data.itemId) {
        setTemuLink(data.productUrl || finalUrl);
        setDetectedProduct({
          name: data.productName || "Produit Temu",
          description: null,
          image: data.productImage || null,
          url: data.productUrl || finalUrl,
          antiBotDetected: true,
          message: isArabic
            ? "تم العثور على المنتج! يرجى إدخال السعر المعروض على Temu في الحقل أدناه."
            : "Produit trouvé ! Veuillez saisir le prix affiché sur Temu dans le champ ci-dessous.",
        });
        setError(
          isArabic
            ? "تعذّر استخراج السعر تلقائياً. افتح المنتج على Temu وأدخل السعر يدوياً."
            : "Extraction automatique indisponible. Ouvrez le produit sur Temu et saisissez le prix manuellement."
        );
        setTimeout(() => priceInputRef.current?.focus(), 300);
      }
      // Case 3: Complete failure — show error
      else {
        setTemuLink(finalUrl);
        setError(
          data.error ||
            (isArabic
              ? "تعذّر استخراج السعر تلقائياً. حاول مرة أخرى."
              : "Extraction automatique indisponible. Veuillez réessayer.")
        );
      }
    } catch {
      setError(
        isArabic
          ? "يرجى إدخال السعر يدوياً في الحقل أدناه."
          : "Veuillez entrer le prix manuellement dans le champ ci-dessous."
      );
      setTimeout(() => priceInputRef.current?.focus(), 300);
    } finally {
      setLoading(false);
    }
  };

  // Manual price calculation - uses API for proper breakdown
  const handleManualCalculate = async () => {
    setError("");
    setResult(null);
    setShowCheckout(false);
    setOrderSuccess(false);

    const normalized = manualPrice.trim().replace(/,/g, ".");
    const priceStr = normalized.replace(/[^\d.]/g, "");
    const parts = priceStr.split(".");
    const cleaned = parts.length > 1
      ? parts[0] + "." + parts.slice(1).join("")
      : priceStr;
    const price = parseFloat(cleaned);

    if (!price || price <= 0) {
      setError(isArabic ? "يرجى إدخال سعر صالح" : "Veuillez entrer un prix valide");
      return;
    }

    setLoading(true);
    try {
      // If SHEIN is selected, the price is in EUR - convert to USD first
      let priceUSD = price;
      if (selectedSite === "shein") {
        priceUSD = price * 1.085; // EUR to USD
        console.log(`[ManualCalc] SHEIN: €${price} → $${priceUSD.toFixed(2)}`);
      }
      
      const RATE = 300;
      const totalDZD = Math.round(priceUSD * RATE);
      
      const productName = detectedProduct?.name || (isArabic ? "منتج" : "Produit");
      setResult({
        usd: priceUSD,
        dzd: totalDZD,
        breakdown: {
          basePriceUSD: priceUSD, basePriceDZD: totalDZD,
          shippingUSD: 0, shippingDZD: 0, customsUSD: 0, customsDZD: 0,
          commissionUSD: 0, commissionDZD: 0, extraFeesDZD: 0,
          totalUSD: priceUSD, totalDZD: totalDZD, finalTotalRoundedDZD: totalDZD,
          quantity: 1,
        },
        productName,
        image: detectedProduct?.image || null,
        estimated: false, manual: true, source: "manual",
      });
      setDetectedProduct({
        name: productName,
        description: selectedSite === "shein" 
          ? (isArabic ? `السعر باليورو: €${price} = $${priceUSD.toFixed(2)}` : `Prix en EUR: €${price} = $${priceUSD.toFixed(2)}`)
          : (isArabic ? `السعر بالدولار: $${price}` : `Prix en USD: $${price}`),
        image: detectedProduct?.image || null,
        url: null,
        antiBotDetected: false,
      });
      setShowCheckout(false);
      setLoading(false);
      return;

      const response = await fetch("/api/scrape-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (data.success && data.price) {
        const productName = detectedProduct?.name
          || (productUrl.trim() ? extractProductName(productUrl) : null)
          || data.productName;
        setResult({
          usd: data.price,
          dzd: data.dzd,
          breakdown: data.breakdown,
          productName,
          image: detectedProduct?.image || null,
          estimated: false,
          manual: true,
          source: "manual",
        });
      } else {
        setError(isArabic ? "يرجى إدخال سعر صالح" : "Veuillez entrer un prix valide");
      }
    } catch {
      setError(isArabic ? "حدث خطأ، حاول مرة أخرى" : "Une erreur est survenue, réessayez");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyResult = () => {
    if (result) {
      const text = result.productName
        ? `${result.productName} — ${t("calc.priceDzd")}: ${result.dzd.toLocaleString()} DA`
        : `${t("calc.priceDzd")}: ${result.dzd.toLocaleString()} DA`;
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAddToCart = () => {
    if (!result) return;
    const cartItem = {
      id: `calc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId: detectedCode || undefined,
      name: result.productName || (isArabic ? "منتج" : "Produit"),
      image: result.image || undefined,
      price: result.usd,
      quantity: 1,
      url: productUrl.trim() || undefined,
    };
    addItemToStore(cartItem);
    syncAddToServer(cartItem);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  // Validate phone
  const isValidPhone = (phone: string) => /^(05|06|07)\d{8}$/.test(phone.trim());

  // Handle checkout submission
  const handleSubmitOrder = async () => {
    setShippingError("");

    // Validate
    if (!shipping.fullName.trim()) {
      setShippingError(isArabic ? "يرجى إدخال الاسم الكامل" : "Veuillez entrer votre nom complet");
      return;
    }
    if (!isValidPhone(shipping.phone)) {
      setShippingError(t("calc.checkout.errorPhone"));
      return;
    }
    if (!shipping.wilaya) {
      setShippingError(isArabic ? "يرجى اختيار الولاية" : "Veuillez sélectionner votre wilaya");
      return;
    }
    if (!shipping.commune) {
      setShippingError(isArabic ? "يرجى اختيار البلدية" : "Veuillez sélectionner votre commune");
      return;
    }
    if (!shipping.address.trim()) {
      setShippingError(isArabic ? "يرجى إدخال العنوان" : "Veuillez entrer votre adresse");
      return;
    }

    setSubmitting(true);

    try {
      // Save shipping info to user profile via API (more reliable)
      if (isAuthenticated && saveInfo && user) {
        try {
          const { auth } = await import("@/lib/firebase");
          const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
          if (token) {
            await fetch("/api/user/profile", {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
              },
              body: JSON.stringify({
                name: shipping.fullName,
                phone: shipping.phone,
                wilaya: shipping.wilaya,
                commune: shipping.commune,
                codePostal: shipping.codePostal,
                address: shipping.address,
              }),
            });
            // Refresh profile so data is available everywhere
            await refreshProfile();
          }
        } catch (e) {
          console.error("Failed to save shipping info:", e);
        }
      }

      // Create the order
      if (isAuthenticated && user) {
        const orderItems = [{
          name: result?.productName || (isArabic ? "منتج" : "Produit"),
          price: result?.dzd || 0,
          quantity: 1,
          image: result?.image || undefined,
          url: productUrl.trim() || undefined,
          productId: detectedCode || undefined,
        }];

        const { auth } = await import("@/lib/firebase");
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

        const res = await fetch("/api/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            items: orderItems,
            total: result?.dzd || 0,
            fullName: shipping.fullName,
            phone: shipping.phone,
            email: user?.email || "",
            wilaya: shipping.wilaya,
            commune: shipping.commune,
            codePostal: shipping.codePostal,
            address: shipping.address,
            notes: shipping.notes,
            url: productUrl.trim() || "",
          }),
        });

        if (res.ok) {
          setOrderSuccess(true);
        } else {
          setShippingError(isArabic ? "حدث خطأ، يرجى المحاولة مرة أخرى" : "Une erreur est survenue, veuillez réessayer");
        }
      }
    } catch (err) {
      console.error("Order error:", err);
      setShippingError(isArabic ? "حدث خطأ في الاتصال" : "Erreur de connexion");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-transparent text-foreground overflow-x-hidden">
      <Navbar />
      <main className="flex-1 pt-16 sm:pt-20">
        <section className="relative py-20 sm:py-32 pb-32 overflow-hidden min-h-[80vh]">
          {/* Background Effects */}
          <div className="absolute inset-0 bg-gradient-to-b from-brand-blue/20 via-brand-blue-light/15 to-white/60" />
          <div className="absolute top-0 left-0 w-72 h-72 bg-brand-pink/8 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-72 h-72 bg-brand-blue/8 rounded-full blur-3xl" />

          <div className="relative z-10 max-w-4xl mx-auto px-4">
            {/* Section Header */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12 relative"
            >
              <div className="hidden lg:block">
                <ImgPlaceholder number={32} className="absolute -left-16 top-4 w-[120px] h-[150px] rounded-xl rotate-[-8deg]" />
                <ImgPlaceholder number={33} className="absolute -right-16 top-4 w-[120px] h-[150px] rounded-xl rotate-[8deg]" />
              </div>

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-pink/10 border border-brand-pink/20 text-brand-pink text-sm font-medium mb-4 font-display">
                <Zap className="w-4 h-4" />
                {t("calc.badge")}
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black mb-4 font-heading">
                <span className="text-brand-dark">{t("calc.titleCalc")}</span>{" "}
                <span className="bg-brand-gold/30 px-2 py-1 rounded-md text-brand-dark">
                  {t("calc.titleProduct")}
                </span>
              </h1>
              <p className="text-brand-muted-text text-lg max-w-xl mx-auto font-sans">
                {t("calc.subtitle")}
              </p>
            </motion.div>

            {/* Calculator Card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 sm:p-10 border border-brand-pink/15 shadow-lg"
            >
              {/* ──── Site Selector (choose which boutique) ──── */}
              <div className="mb-6">
                <label className="block text-brand-dark/80 text-sm font-medium mb-3 font-sans">
                  {isArabic ? "اختر المتجر:" : "Choisissez la boutique :"}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: "temu", name: "Temu", logo: "/logos/temu.png" },
                    { id: "shein", name: "SHEIN", logo: "/logos/shein.png" },
                    { id: "asos", name: "ASOS", logo: "/logos/asos.jpg" },
                    { id: "aliexpress", name: "AliExpress", logo: "/logos/aliexpress.webp" },
                  ].map((site) => (
                    <button
                      key={site.id}
                      onClick={() => { setSelectedSite(site.id as any); setResult(null); setError(""); setDetectedProduct(null); }}
                      className={`flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl border-2 font-bold text-sm transition-all font-sans ${
                        selectedSite === site.id
                          ? "border-brand-pink bg-brand-pink/10 text-brand-pink shadow-md"
                          : "border-brand-muted-warm/50 text-brand-muted-text hover:border-brand-pink/30"
                      }`}
                    >
                      <img src={site.logo} alt={site.name} className="h-8 w-auto object-contain" />
                      {site.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* ──── Image Upload (extract from screenshot) ──── */}
              <div className="mb-6">
                <input
                  ref={imageUploadRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                  }}
                />
                
                {/* Progress Bar (visible during processing) */}
                {imageUploadLoading && (
                  <div className="mb-3 p-3 rounded-xl bg-purple-50 border border-purple-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-purple-700 font-display flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {imageUploadStage}
                      </span>
                      <span className="text-xs font-bold text-purple-700 font-display">{imageUploadProgress}%</span>
                    </div>
                    <div className="h-2 bg-purple-100 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${imageUploadProgress}%` }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                )}
                
                <button
                  type="button"
                  onClick={() => imageUploadRef.current?.click()}
                  disabled={imageUploadLoading || loading}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-50 to-indigo-50 hover:from-purple-100 hover:to-indigo-100 border-2 border-dashed border-purple-300 text-purple-700 font-bold rounded-xl h-14 px-4 transition-all disabled:opacity-50 text-sm font-sans"
                >
                  {imageUploadLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {isArabic ? "جارٍ المعالجة..." : "Traitement en cours..."}
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-5 h-5" />
                      {isArabic ? `📸 ارفع صورة من ${selectedSite === "temu" ? "Temu" : selectedSite === "shein" ? "SHEIN" : selectedSite === "asos" ? "ASOS" : "AliExpress"}` : `📸 Télécharger une image ${selectedSite === "temu" ? "Temu" : selectedSite === "shein" ? "SHEIN" : selectedSite === "asos" ? "ASOS" : "AliExpress"}`}
                    </>
                  )}
                </button>
                {imageUploadError && (
                  <p className="mt-2 text-xs text-red-600 text-center font-sans">{imageUploadError}</p>
                )}
                <p className="mt-2 text-[10px] text-brand-muted-text/60 text-center font-sans">
                  {isArabic
                    ? "اعمل لقطة شاشة لصفحة المنتج وارفعها هنا · يتم استخراج السعر تلقائياً"
                    : "Capturez la page produit et téléchargez-la · Le prix est extrait automatiquement"}
                </p>
                <div className="mt-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="text-[11px] text-blue-700 text-center font-sans leading-relaxed">
                    {isArabic
                      ? "💡 للحصول على أفضل نتيجة: يُفضّل أن يكون السعر بالدولار ($) وأن تكون الصورة واضحة فيها المنتج والاسم والسعر"
                      : "💡 Pour un meilleur résultat: prix en $ de préférence, image claire montrant le produit, le nom et le prix"}
                  </p>
                </div>
              </div>

              {/* ──── SHEIN Input (TEMPORARILY HIDDEN) ──── */}
              {false && (
              <div className="mb-6" style={{ display: activeSite === "shein" ? "block" : "none" }}>
                <label className="block text-brand-dark/80 text-sm font-medium mb-2 font-sans">
                  <Link2 className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                  {isArabic ? "رابط منتج SHEIN" : "Lien produit SHEIN"}
                </label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Input
                      type="text"
                      placeholder="https://www.shein.com/..."
                      value={sheinUrl}
                      onChange={(e) => { setSheinUrl(e.target.value); setResult(null); setError(""); setDetectedProduct(null); }}
                      onKeyDown={(e) => e.key === "Enter" && handleSheinExtract()}
                      className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-dark/50 focus:ring-brand-dark/20 text-brand-dark placeholder:text-brand-muted-text/50 rounded-xl h-14 text-base font-sans"
                      disabled={sheinLoading}
                    />
                    <ShoppingBag className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted-text/40 ${isArabic ? "left-4" : "right-4"}`} />
                  </div>
                  <Button
                    onClick={handleSheinExtract}
                    disabled={sheinLoading || !sheinUrl.trim()}
                    className="bg-brand-dark text-white hover:bg-brand-dark/90 font-bold rounded-xl h-14 px-6 shadow-xl shadow-brand-dark/25 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 font-display"
                  >
                    {sheinLoading ? <Loader2 className={`w-5 h-5 animate-spin ${isArabic ? "ml-2" : "mr-2"}`} /> : <Sparkles className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`} />}
                    {sheinLoading ? (isArabic ? "جارٍ البحث..." : "Recherche...") : isArabic ? "استخراج" : "Analyser"}
                  </Button>
                </div>
                <p className="text-xs text-brand-muted-text/60 mt-2 font-sans">
                  {isArabic ? "💡 الصق رابط منتج SHEIN وسيتم استخراج السعر تلقائياً" : "💡 Collez le lien SHEIN, le prix sera extrait automatiquement"}
                </p>
              </div>
              )}

              {/* ──── SHEIN CAPTCHA Solver (TEMPORARILY HIDDEN) ──── */}
              {false && activeSite === "shein" && sheinScreenshot && (
                <div className="mb-6 bg-blue-50 rounded-xl border border-blue-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MousePointerClick className="w-5 h-5 text-blue-600" />
                    <h3 className="font-bold text-blue-900 text-sm">
                      {isArabic ? "حل التحقق (CAPTCHA) - SHEIN" : "Résoudre la vérification - SHEIN"}
                    </h3>
                  </div>
                  <p className="text-blue-700 text-xs mb-3">{sheinCaptchaMessage}</p>
                  <div className="relative">
                    <img
                      ref={sheinImgRef}
                      src={`data:image/png;base64,${sheinScreenshot}`}
                      alt="SHEIN page screenshot"
                      onClick={handleSheinCaptchaClick}
                      className={`w-full rounded-lg border-2 border-blue-300 cursor-crosshair ${sheinCaptchaLoading ? "opacity-60" : "hover:border-blue-500"}`}
                      style={{ maxHeight: "500px", objectFit: "contain" }}
                    />
                    {sheinCaptchaLoading && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { setSheinSessionId(null); setSheinScreenshot(null); }}
                    className="mt-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100"
                  >
                    {isArabic ? "إلغاء" : "Annuler"}
                  </button>
                  <p className="text-blue-500 text-[10px] mt-2">
                    {isArabic ? "💡 انقر على زر 'تحقق' في الصورة" : "💡 Cliquez sur le bouton 'Verify' dans l'image"}
                  </p>
                </div>
              )}

              {/* ──── Temu Product URL / Code Input (TEMPORARILY HIDDEN) ──── */}
              {false && (
              <div className="mb-6" style={{ display: activeSite === "temu" ? "block" : "none" }}>
                <label className="block text-brand-dark/80 text-sm font-medium mb-2 font-sans">
                  <Link2 className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                  {t("calc.label")}
                </label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Input
                      type="text"
                      placeholder={t("calc.placeholder")}
                      value={productUrl}
                      onChange={(e) => {
                        setProductUrl(e.target.value);
                        setResult(null);
                        setError("");
                        setShowCheckout(false);
                        setDetectedProduct(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleAutoExtract()}
                      className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 text-brand-dark placeholder:text-brand-muted-text/50 rounded-xl h-14 text-base font-sans"
                      disabled={loading}
                    />
                    <ShoppingBag
                      className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted-text/40 ${
                        isArabic ? "left-4" : "right-4"
                      }`}
                    />
                  </div>
                  <Button
                    onClick={handleAutoExtract}
                    disabled={loading || !productUrl.trim()}
                    className="bg-brand-pink text-white hover:bg-brand-pink-light font-bold rounded-xl h-14 px-6 shadow-xl shadow-brand-pink/25 hover:shadow-brand-pink/40 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 font-display"
                  >
                    {loading ? (
                      <Loader2 className={`w-5 h-5 animate-spin ${isArabic ? "ml-2" : "mr-2"}`} />
                    ) : (
                      <Sparkles className={`w-5 h-5 ${isArabic ? "ml-2" : "mr-2"}`} />
                    )}
                    {loading ? t("calc.analyzing") : isArabic ? "استخراج السعر" : "Analyser"}
                  </Button>
                </div>

                {/* Temu Code / Item ID Detected Banner */}
                <AnimatePresence>
                  {detectedCode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 p-4 rounded-xl bg-brand-pink/10 border border-brand-pink/20">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-brand-pink/20 flex items-center justify-center shrink-0">
                            <ShoppingBag className="w-4 h-4 text-brand-pink" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-brand-dark font-semibold text-sm font-heading">
                              {/^[A-Z]{1,3}\d{5,}$/i.test(detectedCode)
                                ? (isArabic ? `Item ID من Temu: ${detectedCode}` : `Item ID Temu : ${detectedCode}`)
                                : (isArabic ? `كود منتج Temu: ${detectedCode}` : `Code produit Temu : ${detectedCode}`)
                              }
                            </p>
                            <p className="text-brand-muted-text text-xs mt-1 font-sans">
                              {isArabic
                                ? "اضغط \"استخراج السعر\" للحصول على السعر والصورة تلقائياً"
                                : "Cliquez \"Analyser\" pour obtenir le prix et l'image automatiquement"}
                            </p>
                            <a
                              href={temuLink || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-2 text-brand-pink hover:text-brand-pink-light text-sm font-medium transition-colors font-display"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              {isArabic ? "فتح على Temu" : "Ouvrir sur Temu"}
                              <ArrowRight className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className="text-brand-muted-text/50 text-xs mt-2 font-sans">
                  {t("calc.hint")}
                </p>
              </div>
              )}

              {/* Loading State */}
              <AnimatePresence>
                {loading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mb-6 text-center"
                  >
                    <div className="inline-flex flex-col items-center gap-2 px-6 py-4 rounded-2xl bg-brand-pink/5 border border-brand-pink/15">
                      <div className="inline-flex items-center gap-3">
                        <Loader2 className="w-4 h-4 text-brand-pink animate-spin" />
                        <span className="text-brand-dark font-medium text-sm font-sans">
                          {progressStep === 0
                            ? (isArabic ? "جارٍ الاتصال بـ Temu..." : "Connexion à Temu...")
                            : progressStep === 1
                            ? (isArabic ? "جارٍ البحث عن المنتج..." : "Recherche du produit...")
                            : progressStep === 2
                            ? (isArabic ? "جارٍ استخراج السعر..." : "Extraction du prix...")
                            : progressStep === 3
                            ? (isArabic ? "اكتمل تقريبًا..." : "Presque terminé...")
                            : (isArabic ? "جارٍ الانتهاء..." : "Finalisation...")}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="w-48 h-1.5 bg-brand-pink/10 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-brand-pink rounded-full"
                          initial={{ width: "10%" }}
                          animate={{ width: `${Math.min((progressStep + 1) * 25, 95)}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <span className="text-brand-muted-text/60 text-xs font-sans">
                        {isArabic ? "قد تستغرق العملية 30-60 ثانية" : "Cela peut prendre 30-60 secondes"}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error/Info */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mb-6"
                  >
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                      <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-amber-700 font-medium text-sm font-sans">{error}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ──── Detected Product Card (when price needs manual entry) ──── */}
              <AnimatePresence>
                {detectedProduct && !result && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.98 }}
                    className="mt-5 bg-gradient-to-br from-brand-pink/10 to-brand-pink/5 border border-brand-pink/30 rounded-2xl p-4"
                  >
                    <div className="flex items-start gap-3">
                      {detectedProduct.image ? (
                        <img
                          src={detectedProduct.image}
                          alt={detectedProduct.name || "Product"}
                          className="w-16 h-16 rounded-xl object-cover shrink-0 border border-brand-pink/20"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-brand-pink/10 flex items-center justify-center shrink-0 border border-brand-pink/20">
                          <Package className="w-7 h-7 text-brand-pink/60" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-sans font-bold">
                            {isArabic ? "تم العثور على المنتج ✓" : "Produit trouvé ✓"}
                          </span>
                          {detectedProduct.antiBotDetected && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-sans">
                              {isArabic ? "الحظر التلقائي" : "Anti-bot"}
                            </span>
                          )}
                        </div>
                        <p className="text-brand-dark font-bold text-sm line-clamp-2 font-sans">
                          {detectedProduct.name}
                        </p>
                        {detectedProduct.description && (
                          <p className="text-brand-muted-text/70 text-xs mt-1 line-clamp-2 font-sans">
                            {detectedProduct.description}
                          </p>
                        )}
                        {detectedProduct.url && (
                          <a
                            href={detectedProduct.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-brand-pink hover:text-brand-pink/80 mt-2 font-bold font-sans"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {isArabic ? "افتح المنتج على Temu لرؤية السعر" : "Ouvrir sur Temu pour voir le prix"}
                          </a>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ──── Manual Price Entry (fallback when auto-extraction fails) ──── */}
              {detectedProduct && !result && (
              <div className="border-t border-brand-muted-warm/50 pt-5 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Pencil className="w-4 h-4 text-brand-muted-text/60" />
                  <span className="text-brand-muted-text/60 text-xs font-sans">
                    {detectedProduct
                      ? (isArabic 
                        ? (selectedSite === "shein" ? "أدخل سعر SHEIN (€)" : "أدخل سعر Temu ($)")
                        : (selectedSite === "shein" ? "Saisissez le prix SHEIN (€)" : "Saisissez le prix Temu ($)"))
                      : (isArabic ? "أو أدخل السعر يدوياً" : "Ou entrez le prix manuellement")}
                  </span>
                </div>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Input
                      ref={priceInputRef}
                      type="text"
                      placeholder={t("calc.manual.placeholder")}
                      value={manualPrice}
                      onChange={(e) => {
                        setManualPrice(e.target.value);
                        setResult(null);
                        setError("");
                        setShowCheckout(false);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleManualCalculate()}
                      className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 text-brand-dark placeholder:text-brand-muted-text/50 rounded-xl h-12 text-base font-sans"
                      disabled={loading || ocrLoading}
                    />
                    <span className={`absolute top-1/2 -translate-y-1/2 text-brand-muted-text/40 font-bold ${isArabic ? "left-3" : "right-3"}`}>$</span>
                  </div>
                  <Button
                    onClick={handleManualCalculate}
                    disabled={loading || ocrLoading}
                    className="bg-brand-pink/80 text-white hover:bg-brand-pink font-bold rounded-xl h-12 px-6 transition-all disabled:opacity-50 font-display"
                  >
                    <Calculator className={`w-4 h-4 ${isArabic ? "ml-1" : "mr-1"}`} />
                    {t("calc.manual.calculate")}
                  </Button>
                </div>

                {/* OCR Screenshot Upload Button */}
                <div className="mt-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleScreenshotUpload(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={ocrLoading}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 border-2 border-dashed border-blue-300 text-blue-700 font-bold rounded-xl h-12 px-4 transition-all disabled:opacity-50 text-sm font-sans"
                  >
                    {ocrLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {isArabic ? "جارٍ استخراج السعر..." : "Extraction en cours..."}
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4" />
                        {isArabic ? "📸 رفع لقطة شاشة لاستخراج السعر تلقائياً" : "📸 Télécharger une capture pour extraire le prix"}
                      </>
                    )}
                  </button>
                  {ocrError && (
                    <p className="mt-2 text-xs text-red-600 text-center font-sans">{ocrError}</p>
                  )}
                  <p className="mt-1.5 text-[10px] text-brand-muted-text/60 text-center font-sans">
                    {isArabic
                      ? "خذ لقطة شاشة لصفحة المنتج على Temu ثم ارفعها هنا - سيتم استخراج السعر تلقائياً"
                      : "Capturez la page produit Temu, téléchargez-la ici — le prix sera extrait automatiquement"}
                  </p>
                </div>

                {/* Interactive CAPTCHA Solving Button */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setInteractiveMode(true);
                      setInteractiveCookies("");
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 border-2 border-dashed border-green-400 text-green-800 font-bold rounded-xl h-12 px-4 transition-all text-sm font-sans"
                  >
                    <MousePointerClick className="w-4 h-4" />
                    {isArabic
                      ? "🤖 استخراج تلقائي مع حل CAPTCHA (إذا لزم)"
                      : "🤖 Extraction auto avec résolution CAPTCHA (si nécessaire)"}
                  </button>
                  <p className="mt-1.5 text-[10px] text-brand-muted-text/60 text-center font-sans">
                    {isArabic
                      ? "يفتح متصفحاً حقيقياً على الخادم. إذا ظهر CAPTCHA، ستراه هنا وتحله بنفسك."
                      : "Ouvre un vrai navigateur sur le serveur. Si CAPTCHA apparaît, vous le résolvez ici."}
                  </p>
                </div>
              </div>
              )}

              {/* Interactive CAPTCHA Solver */}
              {interactiveMode && detectedProduct && !result && (
                <div className="mt-4">
                  <CaptchaSolver
                    goodsId={detectedProduct.url?.match(/-g-(\d+)\.html/)?.[1] || detectedProduct.url?.match(/goods_id=([^&]+)/)?.[1] || ""}
                    finalUrl={temuLink || detectedProduct.url || ""}
                    shareImage={detectedProduct.image}
                    cookies={interactiveCookies}
                    onPriceExtracted={(price, currency, productName, productImage) => {
                      // Convert to USD if needed
                      let priceUSD = price;
                      if (currency === "DZD") priceUSD = price / 240;
                      else if (currency === "EUR") priceUSD = price * 1.085;
                      else if (currency === "GBP") priceUSD = price * 1.265;
                      setManualPrice(priceUSD.toFixed(2));
                      setInteractiveMode(false);
                      setResult(null);
                      setError("");
                      setShowCheckout(false);
                    }}
                    onCancel={() => setInteractiveMode(false)}
                    isArabic={isArabic}
                  />
                </div>
              )}

              {/* ──── Result ──── */}
              <AnimatePresence>
                {result && (
                  <motion.div
                    ref={resultRef}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    className="mt-6 scroll-mt-20"
                  >
                    <div className="bg-brand-light/60 rounded-2xl p-6 border border-brand-pink/15">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-brand-pink font-bold text-lg flex items-center gap-2 font-heading">
                          <CheckCircle2 className="w-5 h-5" />
                          {t("calc.result")}
                          {result.source && result.source !== "manual" && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-sans">
                              {isArabic ? "تلقائي" : "Auto"}
                            </span>
                          )}
                          {result.manual && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-sans">
                              {isArabic ? "يدوي" : "Manuel"}
                            </span>
                          )}
                        </h3>
                        <Button variant="ghost" size="sm" onClick={handleCopyResult} className="text-brand-muted-text hover:text-brand-pink">
                          {copied ? (
                            <CheckCircle2 className={`w-4 h-4 ${isArabic ? "ml-1" : "mr-1"} text-brand-pink`} />
                          ) : (
                            <Copy className={`w-4 h-4 ${isArabic ? "ml-1" : "mr-1"}`} />
                          )}
                          {copied ? t("calc.copied") : t("calc.copy")}
                        </Button>
                      </div>

                      {/* Product name + image */}
                      {result.productName && (
                        <div className="mb-4 p-3 rounded-lg bg-white border border-brand-muted-warm flex items-center gap-3">
                          {result.image ? (
                            <img src={result.image} alt={result.productName} className="w-20 h-20 rounded-xl object-cover shrink-0 border border-brand-pink/20" />
                          ) : (
                            <div className="w-20 h-20 rounded-xl bg-brand-pink/10 flex items-center justify-center shrink-0 border border-brand-pink/20"><Package className="w-8 h-8 text-brand-pink/60" /></div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-brand-muted-text text-xs mb-0.5 font-sans">{t("calc.product")}</p>
                            <p className="text-brand-dark font-medium text-sm line-clamp-2 font-sans">{result.productName}</p>
                            {result.itemId && (
                              <p className="text-brand-muted-text/60 text-xs mt-0.5 font-mono font-sans">
                                Item ID: {result.itemId}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Price breakdown */}
                      {result.breakdown ? (
                        <div className="space-y-2 mb-4">
                          <p className="text-brand-dark/60 text-xs font-bold uppercase tracking-wide font-sans mb-2">
                            {t("calc.breakdown.title")}
                          </p>
                          {/* Base price */}
                          <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-white border border-brand-muted-warm/50">
                            <span className="text-brand-muted-text text-sm font-sans">{t("calc.breakdown.base")}</span>
                            <span className="text-brand-dark font-bold text-sm font-heading">
                              {isAdmin && <>{result.breakdown.basePriceUSD.toFixed(2)}$ · </>}
                              {result.breakdown.basePriceDZD.toLocaleString()} DA
                            </span>
                          </div>
                          {/* Free shipping badge */}
                          <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-emerald-50 border border-emerald-200">
                            <span className="text-brand-muted-text text-sm font-sans">{t("calc.breakdown.shipping")}</span>
                            <span className="text-emerald-700 font-bold text-sm font-heading">
                              {t("calc.breakdown.freeShipping")}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className={isAdmin ? "grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4" : "mb-4"}>
                          {isAdmin && (
                          <div className="text-center p-4 rounded-xl bg-white border border-brand-muted-warm">
                            <p className="text-brand-muted-text text-sm mb-1 font-sans">{t("calc.priceUsd")}</p>
                            {result.originalPrice && result.originalPrice > result.usd && (
                              <p className="text-brand-muted-text/40 text-xs line-through font-sans">{result.originalPrice.toFixed(2)}$</p>
                            )}
                            <p className="text-2xl font-black text-brand-dark font-heading">{result.usd.toFixed(2)}$</p>
                          </div>
                          )}
                          <div className={isAdmin ? "text-center p-4 rounded-xl bg-brand-pink/10 border border-brand-pink/25 relative overflow-hidden" : "text-center p-6 rounded-xl bg-brand-pink/10 border border-brand-pink/25 relative overflow-hidden"}>
                            <div className="absolute inset-0 bg-gradient-to-br from-brand-pink/5 to-transparent" />
                            <p className="text-brand-pink/70 text-sm mb-1 relative z-10 font-sans">{t("calc.priceDzd")}</p>
                            <p className={isAdmin ? "text-3xl font-black text-brand-pink relative z-10 font-heading" : "text-5xl font-black text-brand-pink relative z-10 font-heading"}>{result.dzd.toLocaleString()} DA</p>
                          </div>
                        </div>
                      )}

                      {/* Price correction hint */}
                      {result && result.source === "image-upload" && !result.manual && (
                        <div className="mb-3 p-2 rounded-lg bg-amber-50 border border-amber-200 text-center">
                          <p className="text-xs text-amber-700 font-sans">
                            {isArabic 
                              ? "هل السعر غير صحيح؟ يمكنك إدخاله يدوياً في الحقل أدناه"
                              : "Prix incorrect ? Vous pouvez le saisir manuellement dans le champ ci-dessous"}
                          </p>
                        </div>
                      )}
                      
                      {/* Total price highlight */}
                      <div className="p-4 rounded-xl bg-gradient-to-r from-brand-pink/15 to-brand-pink/5 border-2 border-brand-pink/25 text-center">
                        <p className="text-brand-muted-text text-sm mb-1 font-sans">{t("calc.breakdown.total")}</p>
                        <p className="text-4xl font-black text-brand-pink font-heading">
                          {result.dzd.toLocaleString()} <span className="text-2xl">DA</span>
                        </p>
                        {result.estimated && (
                          <p className="text-brand-muted-text/60 text-xs mt-2 font-sans">{t("calc.estimated")}</p>
                        )}
                      </div>

                      {/* Correct Price Button (for image uploads) */}
                      {result.source === "image-upload" && !result.manual && (
                        <div className="mt-3 mb-1">
                          <button
                            onClick={() => {
                              const savedImage = result.image;
                              const savedName = result.productName;
                              const savedUsd = result.usd;
                              setResult(null);
                              if (savedImage) {
                                setDetectedProduct({
                                  name: savedName || (isArabic ? "منتج" : "Produit"),
                                  description: isArabic ? "أدخل السعر الصحيح يدوياً" : "Saisissez le prix correct",
                                  image: savedImage,
                                  url: null,
                                  antiBotDetected: false,
                                });
                              }
                              // Pre-fill with the detected price (user can correct it)
                              setManualPrice(savedUsd ? savedUsd.toFixed(2) : "");
                            }}
                            className="w-full flex items-center justify-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-display py-2 px-4 rounded-xl border border-amber-200 hover:bg-amber-50 transition-all"
                          >
                            <Pencil className="w-4 h-4" />
                            {isArabic ? "السعر غير صحيح؟ أدخل يدوياً" : "Prix incorrect ? Saisir manuellement"}
                          </button>
                        </div>
                      )}

                      {/* Action Buttons: COMMANDER + Add to Cart */}
                      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                        {/* COMMANDER - Primary CTA */}
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            if (!isAuthenticated) {
                              router.push("/auth/login");
                              return;
                            }
                            setShowCheckout(true);
                          }}
                          className="w-full sm:w-auto flex items-center justify-center gap-2 font-black rounded-xl px-8 py-3.5 shadow-lg transition-all font-display text-sm bg-brand-pink text-white hover:bg-brand-pink-light shadow-brand-pink/30 hover:shadow-brand-pink/50"
                        >
                          <ShoppingBag className="w-5 h-5" />
                          {t("calc.commander")}
                          <ArrowRight className="w-4 h-4" />
                        </motion.button>

                        {/* Add to Cart - Secondary */}
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={handleAddToCart}
                          disabled={addedToCart}
                          className={`w-full sm:w-auto flex items-center justify-center gap-2 font-bold rounded-xl px-6 py-3 shadow-md transition-all font-display text-sm ${
                            addedToCart
                              ? "bg-green-500 text-white shadow-green-500/30"
                              : "bg-white text-brand-pink border-2 border-brand-pink/30 hover:bg-brand-pink/5"
                          }`}
                        >
                          {addedToCart ? (
                            <>
                              <Check className="w-4 h-4" />
                              {t("calc.addedToCart")}
                            </>
                          ) : (
                            <>
                              <ShoppingBag className="w-4 h-4" />
                              {t("calc.addToCart")}
                            </>
                          )}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ──── Checkout Form ──── */}
              <AnimatePresence>
                {showCheckout && result && !orderSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -30 }}
                    className="mt-6"
                  >
                    <div className="bg-white rounded-2xl p-6 sm:p-8 border-2 border-brand-pink/20 shadow-xl">
                      {/* Checkout Header */}
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-brand-dark font-bold text-xl flex items-center gap-2 font-heading">
                            <Truck className="w-5 h-5 text-brand-pink" />
                            {t("calc.checkout.title")}
                          </h3>
                          <p className="text-brand-muted-text text-sm mt-1 font-sans">
                            {t("calc.checkout.subtitle")}
                          </p>
                        </div>
                        <button
                          onClick={() => setShowCheckout(false)}
                          className="p-2 hover:bg-brand-pink/10 rounded-full transition-colors"
                        >
                          <X className="w-5 h-5 text-brand-dark/50" />
                        </button>
                      </div>

                      {/* Order Summary */}
                      <div className="mb-6 p-4 rounded-xl bg-brand-pink/5 border border-brand-pink/10">
                        <div className="flex items-center gap-3">
                          {result.image && (
                            <img src={result.image} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-brand-dark font-bold text-sm truncate font-display">
                              {result.productName || (isArabic ? "منتج" : "Produit")}
                            </p>
                            <p className="text-brand-pink font-black text-lg font-heading">
                              {result.dzd.toLocaleString()} DA
                            </p>
                          </div>
                          <span className="text-xs bg-brand-pink/10 text-brand-pink px-3 py-1 rounded-full font-display font-bold">
                            x1
                          </span>
                        </div>
                      </div>

                      {/* Use Saved Info Toggle */}
                      {profile && (profile.phone || profile.wilaya || profile.address) && (
                        <div className="mb-4">
                          <button
                            onClick={() => {
                              const newVal = !useSaved;
                              setUseSaved(newVal);
                              if (newVal) {
                                const communes = getCommunesForWilaya(profile.wilaya || "");
                                setAvailableCommunes(communes);
                                setShipping({
                                  fullName: profile.name || shipping.fullName,
                                  phone: profile.phone || shipping.phone,
                                  wilaya: profile.wilaya || shipping.wilaya,
                                  commune: profile.commune || shipping.commune,
                                  codePostal: profile.codePostal || shipping.codePostal,
                                  address: profile.address || shipping.address,
                                  notes: shipping.notes,
                                });
                              }
                            }}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all w-full text-left ${
                              useSaved
                                ? "bg-brand-pink/10 border-brand-pink/30 text-brand-pink"
                                : "bg-white border-brand-muted-warm/30 text-brand-dark/60 hover:border-brand-pink/20"
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                              useSaved ? "bg-brand-pink border-brand-pink" : "border-brand-muted-warm"
                            }`}>
                              {useSaved && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className="font-display font-medium text-sm">
                              {t("calc.checkout.useSaved")}
                            </span>
                          </button>
                        </div>
                      )}

                      {/* Shipping Form */}
                      <div className="space-y-4">
                        {/* Full Name */}
                        <div>
                          <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-sans">
                            <User className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                            {t("calc.checkout.fullName")}
                          </label>
                          <Input
                            value={shipping.fullName}
                            onChange={(e) => setShipping({ ...shipping, fullName: e.target.value })}
                            placeholder={t("calc.checkout.fullNamePlaceholder")}
                            className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-sans"
                            dir={isArabic ? "rtl" : "ltr"}
                          />
                        </div>

                        {/* Phone */}
                        <div>
                          <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-sans">
                            <Phone className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                            {t("calc.checkout.phone")}
                          </label>
                          <Input
                            value={shipping.phone}
                            onChange={(e) => setShipping({ ...shipping, phone: e.target.value })}
                            placeholder={t("calc.checkout.phonePlaceholder")}
                            className={`bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-sans ${
                              shipping.phone && !isValidPhone(shipping.phone) ? "border-red-300 focus:border-red-400" : ""
                            }`}
                            dir="ltr"
                          />
                          {shipping.phone && !isValidPhone(shipping.phone) && (
                            <p className="text-red-500 text-xs mt-1 font-sans">{t("calc.checkout.errorPhone")}</p>
                          )}
                        </div>

                        {/* Wilaya */}
                        <div>
                          <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-sans">
                            <MapPin className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                            {t("calc.checkout.wilaya")}
                          </label>
                          <select
                            value={shipping.wilaya}
                            onChange={(e) => {
                              const newWilaya = e.target.value;
                              const communes = getCommunesForWilaya(newWilaya);
                              setAvailableCommunes(communes);
                              setShipping({ ...shipping, wilaya: newWilaya, commune: "", codePostal: "" });
                            }}
                            className="w-full bg-brand-light/50 border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 px-4 text-brand-dark font-sans appearance-none cursor-pointer"
                            dir={isArabic ? "rtl" : "ltr"}
                          >
                            <option value="">{t("calc.checkout.wilayaPlaceholder")}</option>
                            {WILAYAS.map((w) => (
                              <option key={w} value={w}>{w}</option>
                            ))}
                          </select>
                        </div>

                        {/* Commune */}
                        <div>
                          <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-sans">
                            <MapPin className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                            {t("calc.checkout.commune")}
                          </label>
                          <select
                            value={shipping.commune}
                            onChange={(e) => {
                              const selectedCommune = availableCommunes.find(c => c.name === e.target.value);
                              setShipping({ 
                                ...shipping, 
                                commune: e.target.value, 
                                codePostal: selectedCommune?.postalCode || shipping.codePostal,
                              });
                            }}
                            disabled={!shipping.wilaya}
                            className="w-full bg-brand-light/50 border border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 px-4 text-brand-dark font-sans appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            dir={isArabic ? "rtl" : "ltr"}
                          >
                            <option value="">{t("calc.checkout.communePlaceholder")}</option>
                            {availableCommunes.map((c) => (
                              <option key={c.name} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Code Postal */}
                        <div>
                          <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-sans">
                            <MapPin className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                            {t("calc.checkout.codePostal")}
                          </label>
                          <Input
                            value={shipping.codePostal}
                            onChange={(e) => setShipping({ ...shipping, codePostal: e.target.value })}
                            placeholder={t("calc.checkout.codePostalPlaceholder")}
                            className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-sans"
                            dir="ltr"
                            maxLength={5}
                          />
                        </div>

                        {/* Address */}
                        <div>
                          <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-sans">
                            <Truck className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                            {t("calc.checkout.address")}
                          </label>
                          <Input
                            value={shipping.address}
                            onChange={(e) => setShipping({ ...shipping, address: e.target.value })}
                            placeholder={t("calc.checkout.addressPlaceholder")}
                            className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-sans"
                            dir={isArabic ? "rtl" : "ltr"}
                          />
                        </div>

                        {/* Notes */}
                        <div>
                          <label className="block text-brand-dark/80 text-sm font-medium mb-1.5 font-sans">
                            <StickyNote className={`w-4 h-4 inline ${isArabic ? "ml-1" : "mr-1"}`} />
                            {t("calc.checkout.notes")}
                          </label>
                          <Input
                            value={shipping.notes}
                            onChange={(e) => setShipping({ ...shipping, notes: e.target.value })}
                            placeholder={t("calc.checkout.notesPlaceholder")}
                            className="bg-brand-light/50 border-brand-muted-warm focus:border-brand-pink/50 focus:ring-brand-pink/20 rounded-xl h-12 font-sans"
                            dir={isArabic ? "rtl" : "ltr"}
                          />
                        </div>

                        {/* Save Info Checkbox */}
                        <div>
                          <button
                            onClick={() => setSaveInfo(!saveInfo)}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all w-full text-left ${
                              saveInfo
                                ? "bg-brand-pink/5 border-brand-pink/20 text-brand-pink"
                                : "bg-white border-brand-muted-warm/30 text-brand-dark/60 hover:border-brand-pink/20"
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                              saveInfo ? "bg-brand-pink border-brand-pink" : "border-brand-muted-warm"
                            }`}>
                              {saveInfo && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className="font-display font-medium text-sm">
                              {t("calc.checkout.saveInfo")}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Error */}
                      {shippingError && (
                        <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200">
                          <p className="text-red-600 text-sm font-sans font-medium">{shippingError}</p>
                        </div>
                      )}

                      {/* Submit */}
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={handleSubmitOrder}
                        disabled={submitting}
                        className="w-full mt-6 bg-brand-pink text-white hover:bg-brand-pink-light font-black rounded-xl py-4 shadow-lg shadow-brand-pink/30 hover:shadow-brand-pink/50 transition-all font-display text-base flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            {t("calc.checkout.submitting")}
                          </>
                        ) : (
                          <>
                            <Check className="w-5 h-5" />
                            {t("calc.checkout.submit")}
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ──── Order Success ──── */}
              <AnimatePresence>
                {orderSuccess && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="mt-6"
                  >
                    <div className="bg-green-50 rounded-2xl p-8 border border-green-200 text-center">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                        className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4"
                      >
                        <Check className="w-8 h-8 text-white" />
                      </motion.div>
                      <h3 className="text-green-700 font-bold text-xl font-heading mb-2">
                        {t("calc.checkout.success")}
                      </h3>
                      <p className="text-green-600 text-sm font-sans mb-6">
                        {t("calc.checkout.successMsg")}
                      </p>
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href="/commandes">
                          <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            className="bg-green-600 text-white font-bold rounded-xl px-6 py-3 shadow-lg font-display text-sm hover:bg-green-700 transition-all"
                          >
                            {t("calc.checkout.viewOrders")}
                          </motion.button>
                        </Link>
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            setOrderSuccess(false);
                            setShowCheckout(false);
                            setResult(null);
                            setProductUrl("");
                            setManualPrice("");
                          }}
                          className="bg-white text-green-700 font-bold rounded-xl px-6 py-3 shadow-md font-display text-sm border border-green-200 hover:bg-green-50 transition-all"
                        >
                          {t("calc.checkout.newOrder")}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Supported stores hint */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-8 text-center"
            >
              <p className="text-brand-muted-text/60 text-sm mb-3 font-sans">{t("calc.supportedStores")}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {["Temu", "AliExpress"].map((store) => (
                  <span key={store} className="px-3 py-1 rounded-full text-xs bg-white text-brand-muted-text border border-brand-muted-warm font-display">
                    {store}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
