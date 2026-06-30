import { NextRequest, NextResponse } from "next/server";
import { calculateAlgeriaPrice } from "@/lib/exchange-rate";

export const maxDuration = 10;
export const dynamic = "force-dynamic";

const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1, GBP: 1.265, EUR: 1.085, QAR: 0.274, OMR: 2.597,
};

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
      
      // Check if scraping failed
      if (item.success === false) {
        return NextResponse.json({ 
          status: "error", 
          error: item.error || "Apify scraping failed",
          retry: true,
        });
      }

      const priceUSD = item.priceUsd ? parseFloat(item.priceUsd) : null;
      const priceLocal = item.priceLocal ? parseFloat(item.priceLocal) : null;
      const currency = item.currency || "USD";
      const title = item.title || null;
      const image = item.imageUrl || shareImage || null;
      const originalPriceUsd = item.originalPriceUsd ? parseFloat(item.originalPriceUsd) : null;

      let finalPriceUSD = priceUSD;
      if ((!finalPriceUSD || finalPriceUSD <= 0) && priceLocal && currency !== "USD" && CURRENCY_TO_USD[currency]) {
        finalPriceUSD = Math.round(priceLocal * CURRENCY_TO_USD[currency] * 100) / 100;
      }

      // Sanity check: price must be reasonable ($0.10 - $500)
      if (finalPriceUSD && finalPriceUSD > 0.1 && finalPriceUSD < 500) {
        const breakdown = calculateAlgeriaPrice(finalPriceUSD);
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

      // Item exists but no valid price
      return NextResponse.json({ 
        status: "error", 
        error: "No valid price found",
        retry: true,
      });
    }

    // No items yet - still pending
    return NextResponse.json({ status: "pending" });
  } catch (e: any) {
    return NextResponse.json({ status: "pending" }); // Don't error on network issues, keep polling
  }
}
