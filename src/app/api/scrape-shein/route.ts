import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string" || !url.includes("shein.com")) {
      return NextResponse.json({ status: "failed", message: "SHEIN URL required" });
    }

    const productId = extractProductId(url);
    const searchTerms = extractSearchTerms(url);

    console.log(`[SHEIN] Product ID: ${productId}, Search: "${searchTerms}"`);

    // Run both strategies in PARALLEL for speed
    // Strategy 1: google_shopping (fast, ~5s) - returns approximate match
    // Strategy 2: shein_product (slow, ~47s) - returns exact product
    
    const googlePromise = productId ? scrapeViaGoogleShopping(searchTerms, productId) : null;
    
    // Wait for google_shopping first (fast)
    if (googlePromise) {
      const googleResult = await googlePromise;
      if (googleResult) {
        console.log("[SHEIN] ✓ Google Shopping result found");
        return NextResponse.json(googleResult);
      }
    }

    // Fallback: shein_product (slow but exact)
    if (productId) {
      const exactResult = await scrapeExactProduct(productId);
      if (exactResult) {
        console.log("[SHEIN] ✓ Exact product found");
        return NextResponse.json(exactResult);
      }
    }

    return NextResponse.json({
      status: "failed",
      message: "Could not find this product on SHEIN. Please enter the price manually.",
      productUrl: url.trim(),
    });
  } catch (e: any) {
    console.error("[SHEIN] Fatal error:", e);
    return NextResponse.json({ status: "failed", message: e?.message || "Unknown error" });
  }
}

async function scrapeViaGoogleShopping(searchTerms: string, productId: string) {
  if (!searchTerms) return null;
  
  console.log(`[SHEIN] Google Shopping search for "${searchTerms}"...`);
  const startTime = Date.now();
  
  // Step 1: Search Google Shopping
  const searchUrl = `https://www.searchapi.io/api/v1/search?engine=google_shopping&q=shein+${encodeURIComponent(searchTerms)}&api_key=${SEARCHAPI_KEY}&gl=us&hl=en`;
  
  const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(20000) });
  if (!searchRes.ok) return null;
  
  const searchData = await searchRes.json();
  const shoppingResults = searchData.shopping_results || [];
  if (shoppingResults.length === 0) return null;
  
  console.log(`[SHEIN] Google Shopping: ${shoppingResults.length} results (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
  
  // Find SHEIN result
  const sheinResult = shoppingResults.find((r: any) => 
    String(r.seller || "").toLowerCase().includes("shein") ||
    String(r.title || "").toLowerCase().includes("shein")
  ) || shoppingResults[0];
  
  const productToken = sheinResult.product_token;
  
  // Step 2: If we have a product_token, get all offers with prices
  if (productToken) {
    console.log("[SHEIN] Fetching product offers...");
    const productUrl = `https://www.searchapi.io/api/v1/search?engine=google_product&product_token=${encodeURIComponent(productToken)}&api_key=${SEARCHAPI_KEY}`;
    
    try {
      const productRes = await fetch(productUrl, { signal: AbortSignal.timeout(15000) });
      if (productRes.ok) {
        const productData = await productRes.json();
        const offers = productData.offers || [];
        console.log(`[SHEIN] Found ${offers.length} offers (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
        
        // Filter SHEIN offers
        const sheinOffers = offers.filter((o: any) => {
          const source = JSON.stringify(o.source || o.merchant || "").toLowerCase();
          const link = String(o.link || "").toLowerCase();
          return source.includes("shein") || link.includes("shein");
        });
        
        // Try to match by goods_id
        if (productId && sheinOffers.length > 0) {
          const matching = sheinOffers.find((o: any) => {
            const m = String(o.link || "").match(/goods_id=(\d+)/);
            return m && m[1] === productId;
          });
          if (matching) {
            const price = parseFloat(String(matching.price || "").replace(/[^\d.]/g, "")) || null;
            if (price && price > 0) {
              console.log(`[SHEIN] ✓ Exact match by goods_id! Price: $${price}`);
              return {
                status: "success",
                price: Math.round(price * 100) / 100,
                currency: "USD",
                productName: matching.title || sheinResult.title || null,
                productImage: sheinResult.thumbnail || null,
                productUrl: String(matching.link || "").split("?")[0] || null,
                originalPrice: null,
              };
            }
          }
        }
        
        // Use cheapest SHEIN offer
        if (sheinOffers.length > 0) {
          sheinOffers.sort((a: any, b: any) => {
            const pa = parseFloat(String(a.price || "").replace(/[^\d.]/g, "")) || 999999;
            const pb = parseFloat(String(b.price || "").replace(/[^\d.]/g, "")) || 999999;
            return pa - pb;
          });
          const best = sheinOffers[0];
          const price = parseFloat(String(best.price || "").replace(/[^\d.]/g, "")) || null;
          if (price && price > 0) {
            console.log(`[SHEIN] ✓ Cheapest SHEIN offer: $${price}`);
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
      }
    } catch (e) {
      console.log(`[SHEIN] google_product error: ${String(e).slice(0, 80)}`);
    }
  }
  
  // Fallback: use the shopping result directly
  const price = sheinResult.extracted_price || parseFloat(String(sheinResult.price || "").replace(/[^\d.]/g, "")) || null;
  if (price && price > 0) {
    console.log(`[SHEIN] ✓ Shopping result: $${price} (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
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

async function scrapeExactProduct(productId: string) {
  console.log(`[SHEIN] shein_product for ID ${productId}...`);
  const url = `https://www.searchapi.io/api/v1/search?engine=shein_product&product_id=${productId}&api_key=${SEARCHAPI_KEY}`;
  
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(50000) });
    if (!res.ok) return null;
    
    const data = await res.json();
    const product = data.product;
    
    if (product && (product.price || product.sale_price)) {
      const price = product.price || product.sale_price;
      const priceNum = typeof price === "object" 
        ? parseFloat(price.usdCurrent || price.current || price.amount || "0") 
        : parseFloat(price);
      
      if (priceNum > 0 && priceNum < 10000) {
        console.log(`[SHEIN] ✓ Exact product: $${priceNum}`);
        return {
          status: "success",
          price: Math.round(priceNum * 100) / 100,
          currency: "USD",
          productName: product.name || product.title || null,
          productImage: product.image || product.thumbnail || null,
          productUrl: product.url || null,
          originalPrice: null,
        };
      }
    }
    return null;
  } catch (e: any) {
    console.log(`[SHEIN] shein_product error: ${String(e).slice(0, 80)}`);
    return null;
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST { url: 'https://www.shein.com/...' }",
    approach: "SearchAPI.io (Google Shopping fast + shein_product exact fallback)",
  });
}
