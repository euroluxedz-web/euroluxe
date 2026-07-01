import { NextRequest, NextResponse } from "next/server";
import { calculateAlgeriaPrice } from "@/lib/exchange-rate";

export const maxDuration = 10;
export const dynamic = "force-dynamic";

const RATE = 300;

export async function POST(req: NextRequest) {
  const { datasetId, goodsId, shareImage } = await req.json();
  if (!datasetId) return NextResponse.json({ status: "error", error: "Missing datasetId" });

  const apifyToken = process.env.APIFY_API_TOKEN;
  
  try {
    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}`, { signal: AbortSignal.timeout(5000) });
    const items = await itemsRes.json();

    if (Array.isArray(items) && items.length > 0) {
      const item = items[0];
      
      if (item.success === false) {
        return NextResponse.json({ status: "error", error: item.error || "Failed", retry: true });
      }

      const priceText = (item.priceText || "").toUpperCase();
      const priceLocal = item.priceLocal ? parseFloat(item.priceLocal) : null;
      const priceUsd = item.priceUsd ? parseFloat(item.priceUsd) : null;
      const currency = (item.currency || "USD").toUpperCase();
      const title = item.title || null;
      const image = item.imageUrl || shareImage || null;

      let finalPriceUSD: number | null = null;

      // With US locale + US proxy, Apify should return USD prices directly
      // But we still handle other currencies as fallback
      
      if (priceText.includes("DA") || priceText.includes("DZ")) {
        // DZD: divide by 300 to get USD
        if (priceLocal && priceLocal > 0 && priceLocal < 100000) {
          finalPriceUSD = Math.round((priceLocal / RATE) * 100) / 100;
        }
      } else if (priceText.includes("£") || currency === "GBP") {
        if (priceLocal && priceLocal > 0 && priceLocal < 500) {
          finalPriceUSD = Math.round(priceLocal * 1.265 * 100) / 100;
        }
      } else if (priceText.includes("€") || currency === "EUR") {
        if (priceLocal && priceLocal > 0 && priceLocal < 500) {
          finalPriceUSD = Math.round(priceLocal * 1.085 * 100) / 100;
        }
      } else if (priceUsd && priceUsd >= 0.1 && priceUsd <= 500) {
        // USD - use directly
        finalPriceUSD = priceUsd;
      } else if (priceLocal && priceLocal >= 0.1 && priceLocal <= 500 && (priceText.includes("US$") || priceText.includes("$") || currency === "USD")) {
        finalPriceUSD = priceLocal;
      }

      if (finalPriceUSD && finalPriceUSD >= 0.1 && finalPriceUSD <= 500) {
        const breakdown = calculateAlgeriaPrice(finalPriceUSD);
        const originalPriceUsd = item.originalPriceUsd ? parseFloat(item.originalPriceUsd) : null;
        
        return NextResponse.json({
          status: "done",
          success: true,
          price: Math.round(finalPriceUSD * 100) / 100,
          dzd: breakdown.totalDZD,
          breakdown,
          productName: title || `Produit Temu #${goodsId}`,
          productImage: image,
          productUrl: `https://www.temu.com/-g-${goodsId}.html`,
          originalPrice: originalPriceUsd,
          source: "apify",
          itemId: goodsId,
        });
      }

      return NextResponse.json({ status: "error", error: "No valid price", retry: true });
    }

    return NextResponse.json({ status: "pending" });
  } catch {
    return NextResponse.json({ status: "pending" });
  }
}
