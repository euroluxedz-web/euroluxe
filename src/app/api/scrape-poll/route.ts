import { NextRequest, NextResponse } from "next/server";
import { calculateAlgeriaPrice } from "@/lib/exchange-rate";

export const maxDuration = 10;
export const dynamic = "force-dynamic";

const RATE = 300; // 1 USD = 300 DZD

export async function POST(req: NextRequest) {
  const { datasetId, goodsId, shareImage } = await req.json();
  
  if (!datasetId) {
    return NextResponse.json({ status: "error", error: "Missing datasetId" });
  }

  const apifyToken = process.env.APIFY_API_TOKEN;
  
  try {
    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const items = await itemsRes.json();

    if (Array.isArray(items) && items.length > 0) {
      const item = items[0];
      
      if (item.success === false) {
        return NextResponse.json({ status: "error", error: item.error || "Failed", retry: true });
      }

      const priceText = item.priceText || item.priceRaw || "";
      const priceLocal = item.priceLocal ? parseFloat(item.priceLocal) : null;
      const priceUsd = item.priceUsd ? parseFloat(item.priceUsd) : null;
      const currency = item.currency || "USD";
      const title = item.title || null;
      const image = item.imageUrl || shareImage || null;
      const originalPriceText = item.originalPriceText || "";
      const originalPriceLocal = item.originalPriceLocal ? parseFloat(item.originalPriceLocal) : null;

      let finalPriceUSD: number | null = null;
      let finalPriceDZD: number | null = null;

      // Detect DZD: priceText contains "DA" (Algerian Dinar)
      if (priceText.includes("DA") || priceText.includes("DZD") || priceText.includes("دج")) {
        // Price is in DZD - this is the EXACT price the user sees on Temu Algeria
        if (priceLocal && priceLocal > 0 && priceLocal < 100000) {
          finalPriceDZD = Math.round(priceLocal);
          finalPriceUSD = Math.round((priceLocal / RATE) * 100) / 100;
          console.log(`[Poll] DZD detected: ${priceLocal} DZD = $${finalPriceUSD}`);
        }
      }
      // Detect USD: priceText contains "US$" or "$"
      else if (priceText.includes("US$") || (priceText.includes("$") && !priceText.includes("£") && !priceText.includes("€"))) {
        if (priceUsd && priceUsd > 0 && priceUsd < 500) {
          finalPriceUSD = priceUsd;
          finalPriceDZD = Math.round(priceUsd * RATE);
          console.log(`[Poll] USD detected: $${priceUsd}`);
        } else if (priceLocal && priceLocal > 0 && priceLocal < 500) {
          finalPriceUSD = priceLocal;
          finalPriceDZD = Math.round(priceLocal * RATE);
          console.log(`[Poll] USD local: $${priceLocal}`);
        }
      }
      // Detect GBP
      else if (priceText.includes("£") || currency === "GBP") {
        if (priceLocal && priceLocal > 0) {
          finalPriceUSD = Math.round(priceLocal * 1.265 * 100) / 100;
          finalPriceDZD = Math.round(finalPriceUSD * RATE);
          console.log(`[Poll] GBP detected: £${priceLocal} = $${finalPriceUSD}`);
        }
      }
      // Detect EUR
      else if (priceText.includes("€") || currency === "EUR") {
        if (priceLocal && priceLocal > 0) {
          finalPriceUSD = Math.round(priceLocal * 1.085 * 100) / 100;
          finalPriceDZD = Math.round(finalPriceUSD * RATE);
          console.log(`[Poll] EUR detected: €${priceLocal} = $${finalPriceUSD}`);
        }
      }
      // Fallback: use priceUsd if reasonable
      else if (priceUsd && priceUsd > 0.1 && priceUsd < 500) {
        finalPriceUSD = priceUsd;
        finalPriceDZD = Math.round(priceUsd * RATE);
        console.log(`[Poll] Fallback USD: $${priceUsd}`);
      }

      if (finalPriceUSD && finalPriceDZD && finalPriceDZD > 0) {
        const breakdown = calculateAlgeriaPrice(finalPriceUSD);
        
        // Calculate original price in DZD if available
        let originalPriceUSD: number | null = null;
        if (originalPriceText.includes("DA") || originalPriceText.includes("DZD")) {
          if (originalPriceLocal && originalPriceLocal > 0) {
            originalPriceUSD = Math.round((originalPriceLocal / RATE) * 100) / 100;
          }
        } else if (item.originalPriceUsd) {
          originalPriceUSD = parseFloat(item.originalPriceUsd);
        }

        return NextResponse.json({
          status: "done",
          success: true,
          price: finalPriceUSD,
          dzd: finalPriceDZD,
          breakdown,
          productName: title || `Produit Temu #${goodsId}`,
          productImage: image,
          productUrl: `https://www.temu.com/-g-${goodsId}.html`,
          originalPrice: originalPriceUSD,
          source: "apify",
          itemId: goodsId,
        });
      }

      return NextResponse.json({ status: "error", error: "No valid price", retry: true });
    }

    return NextResponse.json({ status: "pending" });
  } catch (e: any) {
    return NextResponse.json({ status: "pending" });
  }
}
