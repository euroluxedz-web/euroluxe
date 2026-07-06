import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const SHEIN_COOKIES = "_twpid=tw.1783373277498.327604763536648714; _cfuvid=hWhBmvalpuLUgYz1pO09Ewa2tBhvfK8Ka_2EAhau9k4-1783371930.597719-1.0.1.1-3GvdUFC0mbp_R8oEVTksfxKBeG1sXDNFGSw56M; AT=MDEwMDE.eyJiIjo3LCJnIjoxNzgzMzcyMDI5LCJyIjoib3FuaDhtIiwidCI6MiwibSI6NjQ0NzI2NzMwMCwibCI6MTc4MzM3MjAyOX0.4c56089d09d07609.ac001a1b261952665e4c0f7f9022b82362c3e10ec400a08e1e33ed2228352610; memberId=6447267300; sessionID_shein=s%3A0cbHi-oQWkzbYRugpcWDtYvyFtrL1NC5.GYRPAkPB%2FRKvGnHyZQfv5eQAfqloySYNFSDaotjHe0g";

/**
 * Extract goods_id from SHEIN URL
 */
function extractSheinGoodsId(url: string): string | null {
  const m1 = url.match(/-p-(\d+)\.html/i);
  if (m1) return m1[1];
  const m2 = url.match(/goods_id=(\d+)/i);
  if (m2) return m2[1];
  return null;
}

/**
 * Simple direct fetch approach (no Puppeteer needed for SHEIN).
 * SHEIN doesn't have aggressive anti-bot like Temu, so a direct fetch
 * with the user's cookies + proper headers should work.
 */
async function scrapeSheinDirect(productUrl: string) {
  console.log("[SHEIN] Direct fetch via Bright Data proxy...");
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  
  const brdUser = process.env.BRD_USER || "brd-customer-hl_e4276258-zone-residential_proxy1";
  const brdPass = process.env.BRD_PASS || "e3trwtkjfmx9";
  const proxyUrl = `http://${brdUser}-country-us:${brdPass}@brd.superproxy.io:33335`;
  
  // Use undici ProxyAgent for the fetch
  const undici = require("undici");
  const dispatcher = new undici.ProxyAgent({
    uri: proxyUrl,
    connect: { rejectUnauthorized: false },
  });
  
  const startTime = Date.now();
  const res = await (undici.fetch as any)(productUrl, {
    dispatcher,
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cookie": SHEIN_COOKIES,
      "Cache-Control": "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    },
    redirect: "follow",
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[SHEIN] Response: ${res.status} (${elapsed}s), URL: ${res.url.substring(0, 80)}`);
  
  if (!res.ok) {
    return { status: "failed", message: `SHEIN returned ${res.status}` };
  }

  const html = await res.text();
  console.log(`[SHEIN] HTML length: ${html.length}`);
  
  // Extract product info from meta tags
  let productName: string | null = null;
  let productImage: string | null = null;
  
  const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (titleMatch) productName = titleMatch[1];
  if (!productName) {
    const t2 = html.match(/<title>([^<]+)<\/title>/i);
    if (t2) productName = t2[1].replace(/\s*\|\s*SHEIN.*$/i, "").trim();
  }
  
  const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  if (imgMatch) productImage = imgMatch[1];
  
  // Extract price - SHEIN uses multiple formats
  let price: number | null = null;
  let currency = "USD";
  
  // Strategy 1: JSON-LD structured data
  const jsonLdMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  console.log(`[SHEIN] JSON-LD blocks: ${jsonLdMatches.length}`);
  for (const m of jsonLdMatches) {
    try {
      const json = JSON.parse(m[1]);
      const candidates = Array.isArray(json) ? json : [json];
      for (const c of candidates) {
        if (c?.offers?.price) {
          price = parseFloat(c.offers.price);
          currency = c.offers.priceCurrency || "USD";
          console.log(`[SHEIN] JSON-LD price: ${price} ${currency}`);
          break;
        }
        if (c?.offers?.lowPrice) {
          price = parseFloat(c.offers.lowPrice);
          currency = c.offers.priceCurrency || "USD";
          console.log(`[SHEIN] JSON-LD lowPrice: ${price} ${currency}`);
          break;
        }
      }
      if (price) break;
    } catch {}
  }
  
  // Strategy 2: Look for price in meta tags (SHEIN sometimes has them)
  if (!price) {
    const priceMeta = html.match(/<meta\s+(?:property|name)="(?:product:price:amount|og:price:amount)"\s+content="([\d.]+)"/i);
    if (priceMeta) {
      price = parseFloat(priceMeta[1]);
      const curMeta = html.match(/<meta\s+(?:property|name)="(?:product:price:currency|og:price:currency)"\s+content="([A-Z]+)"/i);
      currency = curMeta?.[1] || "USD";
      console.log(`[SHEIN] Meta price: ${price} ${currency}`);
    }
  }
  
  // Strategy 3: SHEIN's data attributes in HTML (data-price, etc.)
  if (!price) {
    const dataPriceMatch = html.match(/data-price="([\d.]+)"/i);
    if (dataPriceMatch) {
      price = parseFloat(dataPriceMatch[1]);
      console.log(`[SHEIN] data-price: ${price}`);
    }
  }
  
  // Strategy 4: Look for "retailPrice" or "salePrice" in JSON data
  if (!price) {
    const salePriceMatch = html.match(/"(?:salePrice|retailPrice|sale_price|unitPrice)"\s*:\s*"?([\d.]{1,10})/i);
    if (salePriceMatch) {
      const p = parseFloat(salePriceMatch[1]);
      if (p > 0 && p < 10000) {
        price = p;
        console.log(`[SHEIN] JSON salePrice: ${price}`);
      }
    }
  }
  
  // Strategy 5: Look for price in the page text ($X.XX pattern, excluding shipping credits)
  if (!price) {
    const shippingCredits = [1.01, 5.00, 8.00, 13.00];
    const priceMatches = [...html.matchAll(/\$\s*(\d+\.\d{2})/g)];
    if (priceMatches.length > 0) {
      const prices = priceMatches
        .map(m => parseFloat(m[1]))
        .filter(p => p > 0 && p < 10000 && !shippingCredits.includes(p));
      if (prices.length > 0) {
        prices.sort((a, b) => a - b);
        price = prices[0];
        console.log(`[SHEIN] Text price (smallest): ${price}, all: ${prices.join(", ")}`);
      }
    }
  }
  
  // Detect currency from page
  if (html.includes("€") && currency === "USD") currency = "EUR";
  else if (html.includes("£") && currency === "USD") currency = "GBP";
  
  // Convert to USD
  let priceUSD = price;
  if (price && currency === "EUR") priceUSD = price * 1.085;
  else if (price && currency === "GBP") priceUSD = price * 1.265;
  else if (price && currency === "DZD") priceUSD = price / 240;
  
  console.log(`[SHEIN] Final: ${priceUSD} USD (from ${price} ${currency})`);
  
  if (priceUSD && priceUSD > 0) {
    return {
      status: "success",
      price: Math.round(priceUSD * 100) / 100,
      currency: "USD",
      productName,
      productImage,
      productUrl: res.url || productUrl,
    };
  }
  
  return {
    status: "failed",
    message: "Could not extract price from SHEIN page.",
    productName,
    productImage,
    productUrl: res.url || productUrl,
  };
}

/**
 * Fallback: SHEIN's public API endpoint
 * SHEIN has a JSON API that returns product data including prices
 */
async function scrapeSheinAPI(goodsId: string) {
  console.log(`[SHEIN] API approach for goods_id: ${goodsId}...`);
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  
  const brdUser = process.env.BRD_USER || "brd-customer-hl_e4276258-zone-residential_proxy1";
  const brdPass = process.env.BRD_PASS || "e3trwtkjfmx9";
  const proxyUrl = `http://${brdUser}-country-us:${brdPass}@brd.superproxy.io:33335`;
  
  const undici = require("undici");
  const dispatcher = new undici.ProxyAgent({
    uri: proxyUrl,
    connect: { rejectUnauthorized: false },
  });
  
  // SHEIN's internal API - returns JSON with product details
  const apiUrl = `https://www.shein.com/products/goods-detail/queryDetailInfo?goods_id=${goodsId}&country=US&currency=USD&language=en`;
  
  const res = await (undici.fetch as any)(apiUrl, {
    dispatcher,
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Cookie": SHEIN_COOKIES,
      "Referer": `https://www.shein.com/`,
      "Origin": "https://www.shein.com",
    },
  });
  
  console.log(`[SHEIN] API response: ${res.status}`);
  if (!res.ok) return null;
  
  const data = await res.json();
  console.log(`[SHEIN] API keys: ${Object.keys(data).join(", ")}`);
  
  // Parse product info from API response
  const productIntro = data?.info?.products || data?.info?.productIntro || data?.info;
  if (productIntro) {
    const salePrice = productIntro.salePrice?.amount || productIntro.salePrice?.amountWithSymbol;
    const retailPrice = productIntro.retailPrice?.amount || productIntro.retailPrice?.amountWithSymbol;
    const productName = productIntro.goods_name || productIntro.goodsName || productIntro.name;
    const productImage = productIntro.goods_img || productIntro.goodsImg || productIntro.mainImage;
    
    let price = salePrice ? parseFloat(salePrice) : (retailPrice ? parseFloat(retailPrice) : null);
    if (price) {
      console.log(`[SHEIN] API price: ${price}`);
      return {
        status: "success",
        price: Math.round(price * 100) / 100,
        currency: "USD",
        productName,
        productImage,
        productUrl: `https://www.shein.com/-p-${goodsId}.html`,
      };
    }
  }
  
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ status: "failed", message: "URL required" }, { status: 400 });
    }

    if (!url.includes("shein.com")) {
      return NextResponse.json({ status: "failed", message: "Please provide a SHEIN URL" }, { status: 400 });
    }

    console.log(`\n=== [SHEIN] ${url.substring(0, 80)} ===`);

    // Try API approach first (faster, returns clean JSON)
    const goodsId = extractSheinGoodsId(url);
    if (goodsId) {
      try {
        const apiResult = await scrapeSheinAPI(goodsId);
        if (apiResult && apiResult.price) {
          console.log("[SHEIN] ✓ API approach succeeded");
          return NextResponse.json(apiResult);
        }
      } catch (e) {
        console.log(`[SHEIN] API failed: ${String(e).slice(0, 100)}`);
      }
    }

    // Fallback: direct HTML fetch
    const result = await scrapeSheinDirect(url);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[SHEIN] Fatal error:", e);
    return NextResponse.json({ status: "failed", message: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST { url: 'https://www.shein.com/...' }",
    approach: "Direct fetch + SHEIN API (no Puppeteer needed)",
  });
}
