import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * SHEIN Product Price Extraction via clearpath/shein-product-scraper
 *
 * This actor searches SHEIN by keyword and returns product data including
 * prices in USD. We extract the product name from the URL, search for it,
 * and match by productId.
 */

function extractProductId(url: string): string | null {
  const m = url.match(/-p-(\d+)/i);
  return m ? m[1] : null;
}

function extractSearchTerms(url: string): string {
  // Extract product name from URL slug
  // URL format: https://www.shein.com/Women-Drawstring-Waist-Solid-Bike-Shorts-p-22864534-cat-1732.html
  const match = url.match(/\/([^\/]+?)-p-\d+/);
  if (match) {
    // Convert "Women-Drawstring-Waist-Solid-Bike-Shorts" to "Drawstring Waist Solid Bike Shorts"
    let name = match[1]
      .replace(/-/g, " ")
      .replace(/\bWomen\b/gi, "")
      .replace(/\bMen\b/gi, "")
      .replace(/\bCasual\b/gi, "")
      .trim();
    // Limit to first 5 words for better search results
    const words = name.split(/\s+/).filter(w => w.length > 2).slice(0, 5);
    return words.join(" ");
  }
  return "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string" || !url.includes("shein.com")) {
      return NextResponse.json({ status: "failed", message: "SHEIN URL required" });
    }

    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      return NextResponse.json({ status: "failed", message: "APIFY_API_TOKEN not configured" });
    }

    const productId = extractProductId(url);
    const searchTerms = extractSearchTerms(url);

    console.log(`[SHEIN] Product ID: ${productId}`);
    console.log(`[SHEIN] Search terms: "${searchTerms}"`);

    if (!searchTerms) {
      return NextResponse.json({ status: "failed", message: "Could not extract search terms from URL" });
    }

    // Call the clearpath SHEIN scraper
    const apifyUrl = `https://api.apify.com/v2/acts/clearpath~shein-product-scraper/run-sync-get-dataset-items?token=${apifyToken}&timeout=120`;

    const input = {
      searchTerms: [searchTerms],
      country: "US",
      maxItems: 50, // Get enough items to find the right one
    };

    console.log("[SHEIN] Starting Apify clearpath scraper...");
    const startTime = Date.now();

    const res = await fetch(apifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(110000),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SHEIN] Response: ${res.status} (${elapsed}s)`);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json({ status: "failed", message: `Apify error: ${errText.substring(0, 200)}` });
    }

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ status: "failed", message: "No products found on SHEIN" });
    }

    console.log(`[SHEIN] Got ${data.length} products`);

    // Try to find the exact product by productId
    let targetItem = null;
    if (productId) {
      targetItem = data.find((item: any) => String(item.productId) === productId);
      if (targetItem) {
        console.log(`[SHEIN] ✓ Found exact product by ID: ${productId}`);
      }
    }

    // If not found by ID, use the first result (closest match)
    if (!targetItem) {
      console.log("[SHEIN] Exact product not found, using first search result");
      targetItem = data[0];
    }

    const price = targetItem.price;
    let priceUSD: number | null = null;
    let originalPrice: number | null = null;

    if (price && typeof price === "object") {
      priceUSD = price.usdCurrent || price.current || null;
      originalPrice = price.usdOriginal || price.original || null;
    } else if (typeof price === "number") {
      priceUSD = price;
    }

    console.log(`[SHEIN] Product: ${targetItem.name?.substring(0, 60)}`);
    console.log(`[SHEIN] Price: $${priceUSD} (original: $${originalPrice})`);
    console.log(`[SHEIN] Image: ${targetItem.image ? "yes" : "no"}`);

    if (priceUSD && priceUSD > 0) {
      return NextResponse.json({
        status: "success",
        price: Math.round(priceUSD * 100) / 100,
        currency: "USD",
        productName: targetItem.name || null,
        productImage: targetItem.image || null,
        productUrl: targetItem.url || url.trim(),
        originalPrice: originalPrice ? Math.round(originalPrice * 100) / 100 : null,
      });
    }

    return NextResponse.json({
      status: "failed",
      message: "Price not found in SHEIN results",
      productName: targetItem.name || null,
      productImage: targetItem.image || null,
      productUrl: url.trim(),
    });
  } catch (e: any) {
    console.error("[SHEIN] Fatal error:", e);
    return NextResponse.json({ status: "failed", message: e?.message || "Unknown error" });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST { url: 'https://www.shein.com/...' }",
    approach: "clearpath/shein-product-scraper (keyword search + product matching)",
  });
}
