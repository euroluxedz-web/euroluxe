import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

const SEARCHAPI_KEY = "RtM4LSxbTiXW8rfqajj1krL9";

function extractProductId(url: string): string | null {
  const m = url.match(/-p-(\d+)/i);
  return m ? m[1] : null;
}

function extractSearchTerms(url: string): string {
  const match = url.match(/\/([^\/]+?)-p-\d+/);
  if (match) {
    let name = match[1].replace(/-/g, " ")
      .replace(/\bWomen\b/gi, "").replace(/\bMen\b/gi, "")
      .replace(/\bCasual\b/gi, "").trim();
    return name.split(/\s+/).filter(w => w.length > 1).slice(0, 6).join(" ");
  }
  return "";
}

/**
 * Strategy 1: shein_product engine (EXACT product, ~47s)
 * Uses the product_id from the URL to fetch the EXACT product.
 */
async function scrapeExactProduct(productId: string) {
  console.log(`[SHEIN] Strategy 1: shein_product (exact) for ID ${productId}...`);
  const url = `https://www.searchapi.io/api/v1/search?engine=shein_product&product_id=${productId}&api_key=${SEARCHAPI_KEY}`;
  
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(55000) });
    if (!res.ok) return null;
    
    const data = await res.json();
    const product = data.product;
    
    if (product && (product.price || product.sale_price)) {
      const price = product.price || product.sale_price;
      const priceNum = typeof price === "object" ? parseFloat(price.usdCurrent || price.current || price.amount || "0") : parseFloat(price);
      
      if (priceNum > 0 && priceNum < 10000) {
        console.log(`[SHEIN] ✓ Exact product found! Price: $${priceNum}`);
        return {
          status: "success",
          price: Math.round(priceNum * 100) / 100,
          currency: "USD",
          productName: product.name || product.title || null,
          productImage: product.image || product.thumbnail || null,
          productUrl: product.url || null,
          originalPrice: product.original_price ? (typeof product.original_price === "object" ? parseFloat(product.original_price.usdCurrent || product.original_price.current || "0") : parseFloat(product.original_price)) : null,
        };
      }
    }
    console.log("[SHEIN] shein_product returned no product data");
    return null;
  } catch (e: any) {
    console.log(`[SHEIN] shein_product error: ${String(e).slice(0, 100)}`);
    return null;
  }
}

/**
 * Strategy 2: google_shopping + google_product (fast, ~5s, but approximate)
 * Searches Google Shopping and returns SHEIN offers with prices.
 */
async function scrapeViaGoogleShopping(searchTerms: string, productId: string) {
  console.log(`[SHEIN] Strategy 2: google_shopping for "${searchTerms}"...`);
  
  // Step 1: Search Google Shopping
  const searchUrl = `https://www.searchapi.io/api/v1/search?engine=google_shopping&q=shein+${encodeURIComponent(searchTerms)}&api_key=${SEARCHAPI_KEY}&gl=us&hl=en`;
  const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) });
  if (!searchRes.ok) return null;
  
  const searchData = await searchRes.json();
  const shoppingResults = searchData.shopping_results || [];
  if (shoppingResults.length === 0) return null;
  
  console.log(`[SHEIN] Google Shopping: ${shoppingResults.length} results`);
  
  // Step 2: Get product_token from first SHEIN result
  const sheinResult = shoppingResults.find((r: any) => 
    String(r.seller || "").toLowerCase().includes("shein") ||
    String(r.title || "").toLowerCase().includes("shein")
  ) || shoppingResults[0];
  
  const productToken = sheinResult.product_token;
  if (!productToken) {
    // No token - just return the shopping result directly
    const price = sheinResult.extracted_price || parseFloat(String(sheinResult.price || "").replace(/[^\d.]/g, "")) || null;
    if (price && price > 0) {
      return {
        status: "success",
        price: Math.round(price * 100) / 100,
        currency: "USD",
        productName: sheinResult.title || null,
        productImage: sheinResult.thumbnail || null,
        productUrl: null,
        originalPrice: sheinResult.extracted_original_price || null,
      };
    }
    return null;
  }
  
  // Step 3: Call google_product to get all offers (including exact SHEIN prices)
  console.log("[SHEIN] Fetching product offers via google_product...");
  const productUrl = `https://www.searchapi.io/api/v1/search?engine=google_product&product_token=${encodeURIComponent(productToken)}&api_key=${SEARCHAPI_KEY}`;
  const productRes = await fetch(productUrl, { signal: AbortSignal.timeout(15000) });
  if (!productRes.ok) return null;
  
  const productData = await productRes.json();
  const offers = productData.offers || [];
  console.log(`[SHEIN] Found ${offers.length} offers`);
  
  // Filter for SHEIN offers
  const sheinOffers = offers.filter((o: any) => {
    const source = JSON.stringify(o.source || o.merchant || "").toLowerCase();
    const link = String(o.link || "").toLowerCase();
    return source.includes("shein") || link.includes("shein");
  });
  
  console.log(`[SHEIN] SHEIN offers: ${sheinOffers.length}`);
  
  // Try to find an offer with matching goods_id
  if (productId && sheinOffers.length > 0) {
    const matchingOffer = sheinOffers.find((o: any) => {
      const link = String(o.link || "");
      const match = link.match(/goods_id=(\d+)/);
      return match && match[1] === productId;
    });
    
    if (matchingOffer) {
      console.log(`[SHEIN] ✓ Found offer with matching goods_id!`);
      const price = parseFloat(String(matchingOffer.price || "").replace(/[^\d.]/g, "")) || null;
      if (price && price > 0) {
        return {
          status: "success",
          price: Math.round(price * 100) / 100,
          currency: "USD",
          productName: matchingOffer.title || sheinResult.title || null,
          productImage: sheinResult.thumbnail || null,
          productUrl: String(matchingOffer.link || "").split("?")[0] || null,
          originalPrice: null,
        };
      }
    }
  }
  
  // Use the cheapest SHEIN offer
  if (sheinOffers.length > 0) {
    sheinOffers.sort((a: any, b: any) => {
      const pa = parseFloat(String(a.price || "").replace(/[^\d.]/g, "")) || 999999;
      const pb = parseFloat(String(b.price || "").replace(/[^\d.]/g, "")) || 999999;
      return pa - pb;
    });
    
    const best = sheinOffers[0];
    const price = parseFloat(String(best.price || "").replace(/[^\d.]/g, "")) || null;
    if (price && price > 0) {
      console.log(`[SHEIN] Using cheapest SHEIN offer: $${price}`);
      return {
        status: "success",
        price: Math.round(price * 100) / 100,
        currency: "USD",
        productName: best.title || sheinResult.title || null,
        productImage: sheinResult.thumbnail || null,
        productUrl: String(best.link || "").split("?")[0] || null,
        originalPrice: null,
      };
    }
  }
  
  // Fallback: use the shopping result price
  const price = sheinResult.extracted_price || parseFloat(String(sheinResult.price || "").replace(/[^\d.]/g, "")) || null;
  if (price && price > 0) {
    return {
      status: "success",
      price: Math.round(price * 100) / 100,
      currency: "USD",
      productName: sheinResult.title || null,
      productImage: sheinResult.thumbnail || null,
      productUrl: null,
      originalPrice: sheinResult.extracted_original_price || null,
    };
  }
  
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string" || !url.includes("shein.com")) {
      return NextResponse.json({ status: "failed", message: "SHEIN URL required" });
    }

    const productId = extractProductId(url);
    const searchTerms = extractSearchTerms(url);

    console.log(`\n=== [SHEIN] ${url.substring(0, 80)} ===`);
    console.log(`[SHEIN] Product ID: ${productId}`);
    console.log(`[SHEIN] Search terms: "${searchTerms}"`);

    // Strategy 1: Try exact product match (slow but accurate)
    if (productId) {
      const exactResult = await scrapeExactProduct(productId);
      if (exactResult) {
        return NextResponse.json(exactResult);
      }
    }

    // Strategy 2: Google Shopping fallback (fast but approximate)
    if (searchTerms) {
      const googleResult = await scrapeViaGoogleShopping(searchTerms, productId || "");
      if (googleResult) {
        return NextResponse.json(googleResult);
      }
    }

    return NextResponse.json({
      status: "failed",
      message: "Could not find this product on SHEIN. Please try entering the price manually.",
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
    approach: "SearchAPI.io shein_product (exact) + google_shopping fallback",
  });
}
