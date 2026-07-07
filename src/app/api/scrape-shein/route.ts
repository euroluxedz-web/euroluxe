import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const SEARCHAPI_KEY = "RtM4LSxbTiXW8rfqajj1krL9";

/**
 * Extract search terms from SHEIN URL slug
 * URL: https://www.shein.com/Women-Drawstring-Waist-Solid-Bike-Shorts-p-22864534-cat-1732.html
 * Returns: "Drawstring Waist Solid Bike Shorts"
 */
function extractSearchTerms(url: string): string {
  const match = url.match(/\/([^\/]+?)-p-\d+/);
  if (match) {
    let name = match[1]
      .replace(/-/g, " ")
      .replace(/\bWomen\b/gi, "")
      .replace(/\bMen\b/gi, "")
      .replace(/\bCasual\b/gi, "")
      .replace(/\bSolid\b/gi, "Solid")
      .trim();
    const words = name.split(/\s+/).filter(w => w.length > 1).slice(0, 6);
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

    const searchTerms = extractSearchTerms(url);
    console.log(`[SHEIN] Search terms: "${searchTerms}"`);

    if (!searchTerms) {
      return NextResponse.json({ status: "failed", message: "Could not extract search terms from URL" });
    }

    // Use SearchAPI.io's Google Shopping engine
    // This searches Google Shopping and returns product results including SHEIN
    const searchUrl = `https://www.searchapi.io/api/v1/search?engine=google_shopping&q=shein+${encodeURIComponent(searchTerms)}&api_key=${SEARCHAPI_KEY}&gl=us&hl=en`;

    console.log("[SHEIN] Calling SearchAPI.io...");
    const startTime = Date.now();

    const res = await fetch(searchUrl, {
      signal: AbortSignal.timeout(20000),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SHEIN] Response: ${res.status} (${elapsed}s)`);

    if (!res.ok) {
      return NextResponse.json({ status: "failed", message: `SearchAPI error: ${res.status}` });
    }

    const data = await res.json();
    const shoppingResults = data.shopping_results || [];
    console.log(`[SHEIN] Total results: ${shoppingResults.length}`);

    // Filter for SHEIN seller results
    const sheinResults = shoppingResults.filter((r: any) => {
      const seller = String(r.seller || "").toLowerCase();
      const title = String(r.title || "").toLowerCase();
      return seller.includes("shein") || title.includes("shein");
    });

    console.log(`[SHEIN] SHEIN results: ${sheinResults.length}`);

    // Use the first SHEIN result, or the first result overall
    const result = sheinResults[0] || shoppingResults[0];
    if (!result) {
      return NextResponse.json({ status: "failed", message: "No products found" });
    }

    const price = result.extracted_price || parseFloat(String(result.price || "").replace(/[^\d.]/g, "")) || null;
    const originalPrice = result.extracted_original_price || parseFloat(String(result.original_price || "").replace(/[^\d.]/g, "")) || null;

    console.log(`[SHEIN] Product: ${result.title?.substring(0, 60)}`);
    console.log(`[SHEIN] Price: $${price} (original: $${originalPrice})`);
    console.log(`[SHEIN] Seller: ${result.seller}`);

    if (price && price > 0) {
      return NextResponse.json({
        status: "success",
        price: Math.round(price * 100) / 100,
        currency: "USD",
        productName: result.title || null,
        productImage: result.thumbnail || null,
        productUrl: url.trim(),
        originalPrice: originalPrice ? Math.round(originalPrice * 100) / 100 : null,
      });
    }

    return NextResponse.json({
      status: "failed",
      message: "Price not found in search results",
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
    approach: "SearchAPI.io Google Shopping (fast, ~2-5 seconds, cheap)",
  });
}
