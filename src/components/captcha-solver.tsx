"use client";

import { useState, useRef, useCallback } from "react";
import { Loader2, RefreshCw, MousePointerClick, CheckCircle2, XCircle } from "lucide-react";

interface CaptchaSolverProps {
  goodsId: string;
  finalUrl: string;
  shareImage: string | null;
  cookies: string;
  onPriceExtracted: (price: number, currency: string, productName: string, productImage: string) => void;
  onCancel: () => void;
  isArabic: boolean;
}

export function CaptchaSolver({
  goodsId,
  finalUrl,
  shareImage,
  cookies,
  onPriceExtracted,
  onCancel,
  isArabic,
}: CaptchaSolverProps) {
  const [loading, setLoading] = useState(true);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [clicking, setClicking] = useState(false);
  const [error, setError] = useState("");
  const [solved, setSolved] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Start the interactive session on mount
  const startSession = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage(isArabic ? "جارٍ تحميل صفحة Temu..." : "Chargement de la page Temu...");
    try {
      const res = await fetch("/api/scrape-interactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goodsId,
          finalUrl,
          shareImage,
          cookies: "use_env", // Tell backend to use TEMU_COOKIES env var
        }),
      });
      const data = await res.json();

      if (data.status === "success" && data.price) {
        setSolved(true);
        setMessage(isArabic ? "تم استخراج السعر تلقائياً!" : "Prix extrait automatiquement!");
        onPriceExtracted(data.price, data.currency || "USD", data.productName, data.productImage);
        return;
      }

      if (data.status === "captcha" && data.screenshot) {
        setScreenshot(data.screenshot);
        setSessionId(data.sessionId);
        setMessage(
          isArabic
            ? "Temu يطلب التحقق. انقر على زر التحقق في الصورة أدناه."
            : "Temu demande une vérification. Cliquez sur le bouton de vérification dans l'image ci-dessous."
        );
      } else {
        setError(data.message || (isArabic ? "فشل تحميل الصفحة" : "Échec du chargement"));
      }
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }, [goodsId, finalUrl, shareImage, cookies, onPriceExtracted, isArabic]);

  // Start on mount
  useState(() => {
    startSession();
  });

  // Handle click on screenshot
  const handleScreenshotClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!sessionId || !imgRef.current || clicking) return;

    const rect = imgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1920; // Scale to viewport
    const y = ((e.clientY - rect.top) / rect.height) * 1080;

    setClicking(true);
    setError("");
    setMessage(isArabic ? "جارٍ معالجة النقر..." : "Traitement du clic...");

    try {
      const res = await fetch("/api/scrape-interactive-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, x: Math.round(x), y: Math.round(y) }),
      });
      const data = await res.json();

      if (data.status === "success" && data.price) {
        setSolved(true);
        setMessage(isArabic ? `تم! السعر: $${data.price}` : `Terminé! Prix: $${data.price}`);
        onPriceExtracted(data.price, data.currency || "USD", data.productName, data.productImage);
        return;
      }

      if (data.status === "captcha" && data.screenshot) {
        setScreenshot(data.screenshot);
        setMessage(
          data.message ||
            (isArabic
              ? "لم ينجح بعد. انقر مرة أخرى على زر التحقق."
              : "Pas encore réussi. Cliquez à nouveau sur le bouton de vérification.")
        );
      } else {
        setError(data.message || "Failed");
      }
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setClicking(false);
    }
  };

  // Refresh screenshot
  const handleRefresh = async () => {
    if (!sessionId || clicking) return;
    setClicking(true);
    try {
      const res = await fetch("/api/scrape-interactive-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "refresh" }),
      });
      const data = await res.json();
      if (data.status === "success" && data.price) {
        setSolved(true);
        setMessage(isArabic ? `تم! السعر: $${data.price}` : `Terminé! Prix: $${data.price}`);
        onPriceExtracted(data.price, data.currency || "USD", data.productName, data.productImage);
        return;
      }
      if (data.status === "captcha" && data.screenshot) {
        setScreenshot(data.screenshot);
        setMessage(data.message || (isArabic ? "تم التحديث" : "Actualisé"));
      } else {
        setError(data.message || "Failed");
      }
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setClicking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-blue-50 rounded-xl border border-blue-200">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
        <p className="text-blue-700 font-medium text-sm">{message}</p>
        <p className="text-blue-500 text-xs mt-1">
          {isArabic ? "قد يستغرق هذا 10-20 ثانية" : "Cela peut prendre 10-20 secondes"}
        </p>
      </div>
    );
  }

  if (solved) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-green-50 rounded-xl border border-green-200">
        <CheckCircle2 className="w-8 h-8 text-green-600 mb-3" />
        <p className="text-green-700 font-medium text-sm">{message}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-red-50 rounded-xl border border-red-200">
        <XCircle className="w-8 h-8 text-red-600 mb-3" />
        <p className="text-red-700 font-medium text-sm mb-3">{error}</p>
        <button
          onClick={startSession}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
        >
          {isArabic ? "إعادة المحاولة" : "Réessayer"}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <MousePointerClick className="w-5 h-5 text-blue-600" />
        <h3 className="font-bold text-blue-900 text-sm">
          {isArabic ? "حل التحقق (CAPTCHA)" : "Résoudre la vérification (CAPTCHA)"}
        </h3>
      </div>
      <p className="text-blue-700 text-xs mb-3">{message}</p>

      {screenshot && (
        <div className="relative">
          <img
            ref={imgRef}
            src={`data:image/png;base64,${screenshot}`}
            alt="Temu page screenshot"
            onClick={handleScreenshotClick}
            className={`w-full rounded-lg border-2 border-blue-300 cursor-crosshair ${clicking ? "opacity-60" : "hover:border-blue-500"}`}
            style={{ maxHeight: "500px", objectFit: "contain" }}
          />
          {clicking && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleRefresh}
          disabled={clicking}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 disabled:opacity-50"
        >
          <RefreshCw className="w-3 h-3" />
          {isArabic ? "تحديث الصورة" : "Actualiser"}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100"
        >
          {isArabic ? "إلغاء" : "Annuler"}
        </button>
      </div>

      <p className="text-blue-500 text-[10px] mt-2">
        {isArabic
          ? "💡 انقر على زر 'تحقق' أو 'Verify' الذي تراه في الصورة. إذا لم ترَ زراً، اضغط تحديث."
          : "💡 Cliquez sur le bouton 'Verify' visible dans l'image. Si rien, cliquez Actualiser."}
      </p>
    </div>
  );
}
