import { NextRequest, NextResponse } from "next/server";
import { calculateAlgeriaPrice } from "@/lib/exchange-rate";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/* ───────────────────────────────────────────────────────────────────
 * Temu price scraper v4 — Cloudflare Worker + Session Cookies
 *
 * Based on FarisAshhab/temu-product-scraper approach:
 * Temu requires LOGIN to show prices. After login, session cookies
 * bypass the CAPTCHA and the price is available in the page HTML.
 *
 * Flow:
 *   1. Resolve share link → goods_id + image
 *   2. Call Cloudflare Worker with Temu session cookies
 *   3. Worker fetches product page (cookies bypass CAPTCHA)
 *   4. Parse response for og:price or JSON price data
 *   5. Return price in USD → DZD (×300)
 *
 * Requires TEMU_COOKIES env var (session cookies from logged-in Temu account)
 * ─────────────────────────────────────────────────────────────────── */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1,
  QAR: 0.274, OMR: 2.597, BHD: 2.652, SAR: 0.266, AED: 0.272, KWD: 3.24,
  MUR: 0.0221, PKR: 0.00358, EUR: 1.085, GBP: 1.265,
  DZD: 0.00333, MAD: 0.0995, TND: 0.321, EGP: 0.0207,
  SEK: 0.0954, NOK: 0.0938, DKK: 0.145, CHF: 1.115,
  AUD: 0.658, NZD: 0.605, CAD: 0.735, JPY: 0.0067, CNY: 0.138,
  HKD: 0.128, SGD: 0.738, KRW: 0.00072, INR: 0.0119, BDT: 0.00906,
  PHP: 0.0172, IDR: 0.0000615, VND: 0.0000394, THB: 0.0278, MYR: 0.213,
  BRL: 0.173, MXN: 0.0587, ZAR: 0.0534, TRY: 0.0293, RUB: 0.0113,
  ILS: 0.278, PLN: 0.250, CZK: 0.0432, HUF: 0.00274, RON: 0.215,
};

// Cloudflare Worker URL
const WORKER_URL = "https://temu-proxy.euroluxe.workers.dev";

interface PriceResult {
  priceUSD: number;
  originalPriceUSD: number | null;
  productName: string | null;
  productImage: string | null;
  source: string;
}

/* ── Resolve share.temu.com/XXX → goods_id + image URL ── */
async function resolveShareUrl(url: string): Promise<{
  finalUrl: string;
  goodsId: string | null;
  image: string | null;
}> {
  let currentUrl = url;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(currentUrl, {
      redirect: "manual",
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    const location = res.headers.get("location");
    if (location && res.status >= 300 && res.status < 400) {
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }
    await res.text();
    break;
  }

  let goodsId: string | null = null;
  const gidMatch = currentUrl.match(/goods_id=([^&]+)/);
  if (gidMatch) goodsId = gidMatch[1];
  if (!goodsId) {
    const gidMatch2 = currentUrl.match(/-g-(\d+)\.html/);
    if (gidMatch2) goodsId = gidMatch2[1];
  }

  let image: string | null = null;
  try {
    const u = new URL(currentUrl);
    image = u.searchParams.get("share_img") || u.searchParams.get("top_gallery_url") || null;
  } catch {
    const m = currentUrl.match(/[?&](?:share_img|top_gallery_url)=([^&]+)/);
    if (m) {
      try { image = decodeURIComponent(m[1]); } catch { image = m[1]; }
    }
  }

  return { finalUrl: currentUrl, goodsId, image };
}

/* ── Fetch page via Cloudflare Worker with cookies ── */
async function fetchViaWorker(targetUrl: string, cookies: string): Promise<string> {
  const workerUrl = `${WORKER_URL}/?url=${encodeURIComponent(targetUrl)}&cookie=${encodeURIComponent(cookies)}`;
  const res = await fetch(workerUrl, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Worker returned ${res.status}`);
  return await res.text();
}

/* ── Extract price from Temu page HTML ── */
function extractPriceFromHtml(html: string, goodsId: string): PriceResult | null {
  // Check if page has anti-bot (no real content)
  if (html.includes("Security verification") && html.length < 5000) {
    return null;
  }

  // Strategy 1: OG price meta tag
  const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];

  if (ogPrice) {
    const price = parseFloat(ogPrice);
    const currency = ogCurrency || "USD";
    const usdRate = CURRENCY_TO_USD[currency] || 1;
    const usd = Math.round(price * usdRate * 100) / 100;
    if (usd > 0.1 && usd < 500 && usd !== 30) {
      console.log(`[Extract] OG price: ${price} ${currency} = $${usd}`);
      return {
        priceUSD: usd,
        originalPriceUSD: null,
        productName: ogTitle ? ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim() : null,
        productImage: ogImage || null,
        source: `og(${currency})`,
      };
    }
  }

  // Strategy 2: Find price in window.rawData near goods_id
  const rawDataMatch = html.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|<\/script>)/);
  if (rawDataMatch) {
    const rawData = rawDataMatch[1];
    const gidIdx = rawData.indexOf(goodsId);
    if (gidIdx >= 0) {
      const window = rawData.slice(Math.max(0, gidIdx - 3000), Math.min(rawData.length, gidIdx + 15000));
      
      // Look for various price field patterns
      const priceFields = [
        "minPrice", "salePrice", "price", "marketPrice", "origPrice",
        "appPrice", "displayPrice", "priceNum", "sale_amount", "skuPrice",
      ];
      
      for (const field of priceFields) {
        const pattern = new RegExp(`"${field}"\\s*:\\s*"?([\\d.]+)"?`, "i");
        const match = window.match(pattern);
        if (match) {
          const price = parseFloat(match[1]);
          // Convert cents to dollars if price > 100 (common Temu pattern)
          const actualPrice = price > 100 ? price / 100 : price;
          if (actualPrice > 0.1 && actualPrice < 500 && actualPrice !== 30) {
            console.log(`[Extract] rawData ${field}: ${price} → $${actualPrice}`);
            return {
              priceUSD: actualPrice,
              originalPriceUSD: null,
              productName: ogTitle ? ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim() : null,
              productImage: ogImage || null,
              source: `rawData(${field})`,
            };
          }
        }
      }
    }
  }

  // Strategy 3: Find price in JSON-LD structured data
  const jsonLdMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of jsonLdMatches) {
    try {
      const data = JSON.parse(m[1]);
      const offers = data?.offers?.price || data?.offers?.[0]?.price;
      const currency = data?.offers?.priceCurrency || data?.offers?.[0]?.priceCurrency || "USD";
      if (offers) {
        const price = parseFloat(offers);
        const usdRate = CURRENCY_TO_USD[currency] || 1;
        const usd = Math.round(price * usdRate * 100) / 100;
        if (usd > 0.1 && usd < 500 && usd !== 30) {
          console.log(`[Extract] JSON-LD price: ${price} ${currency} = $${usd}`);
          return {
            priceUSD: usd,
            originalPriceUSD: null,
            productName: data?.name || ogTitle?.replace(/\s*[-|]\s*Temu.*$/i, "").trim() || null,
            productImage: data?.image || ogImage || null,
            source: `jsonld(${currency})`,
          };
        }
      }
    } catch { /* parse error */ }
  }

  // Strategy 4: Find priceInfo blocks in HTML
  const priceInfoMatches = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*"?(\d+\.?\d*)"?[^}]*?"currency"\s*:\s*"([A-Z]{3})"/gi)];
  for (const m of priceInfoMatches) {
    const price = parseFloat(m[1]);
    const currency = m[2];
    // Convert cents to dollars if price > 100
    const actualPrice = price > 100 ? price / 100 : price;
    const usdRate = CURRENCY_TO_USD[currency] || 1;
    const usd = Math.round(actualPrice * usdRate * 100) / 100;
    if (usd > 0.1 && usd < 500 && usd !== 30) {
      console.log(`[Extract] priceInfo: ${price} ${currency} → $${usd}`);
      return {
        priceUSD: usd,
        originalPriceUSD: null,
        productName: ogTitle ? ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim() : null,
        productImage: ogImage || null,
        source: `priceInfo(${currency})`,
      };
    }
  }

  // Return product info even without price
  if (ogTitle) {
    return {
      priceUSD: 0,
      originalPriceUSD: null,
      productName: ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim(),
      productImage: ogImage || null,
      source: "no-price",
    };
  }

  return null;
}

/* ── Extract product name from URL slug ── */
function extractNameFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const slug = segments.find((s) => s.includes("-g-") && s.length > 10) || segments[segments.length - 1] || "";
    const name = slug.replace(/-g-[a-zA-Z0-9]+\.html?$/i, "").replace(/\.html?$/i, "").replace(/-/g, " ").trim();
    if (name && name.length > 3) return name.replace(/\b\w/g, (l) => l.toUpperCase());
  } catch { /* skip */ }
  return null;
}

/* ── Main POST handler ── */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const url: string = (body.url || body.input || "").trim();
  const manualPrice: string = (body.manualPrice || "").trim();

  // Case: Manual price entry — user provided the price directly
  if (manualPrice) {
    console.log(`\n=== [scrape-price v4] MANUAL: ${manualPrice} ===`);
    const normalized = manualPrice.replace(/,/g, ".");
    const priceStr = normalized.replace(/[^\d.]/g, "");
    const parts = priceStr.split(".");
    const cleaned = parts.length > 1 ? parts[0] + "." + parts.slice(1).join("") : priceStr;
    const price = parseFloat(cleaned);

    if (!price || price <= 0 || isNaN(price)) {
      return NextResponse.json({ success: false, error: "Invalid price" }, { status: 400 });
    }

    const breakdown = calculateAlgeriaPrice(price);
    const productName: string = body.productName || (url ? extractNameFromUrl(url) : null) || "Produit Temu";

    return NextResponse.json({
      success: true,
      price,
      dzd: breakdown.totalDZD,
      breakdown,
      productName,
      productImage: body.productImage || null,
      productUrl: url || "",
      originalPrice: null,
      source: "manual",
      itemId: body.itemId || undefined,
    });
  }

  if (!url) {
    return NextResponse.json({ success: false, error: "URL is required" }, { status: 400 });
  }

  console.log(`\n=== [scrape-price v4] ${url.slice(0, 80)} ===`);

  try {
    // Get Temu cookies from env var
    const temuCookies = process.env.TEMU_COOKIES || "";

    // Step 1: Resolve share URL
    let finalUrl = url;
    let goodsId: string | null = null;
    let shareImage: string | null = null;

    if (url.includes("share.temu.com/")) {
      console.log("[Step 1] Resolving share URL...");
      const resolved = await resolveShareUrl(url);
      finalUrl = resolved.finalUrl;
      goodsId = resolved.goodsId;
      shareImage = resolved.image;
      console.log(`[Step 1] goods_id=${goodsId}, image=${shareImage ? "yes" : "no"}`);
    } else if (url.includes("temu.com")) {
      const m = url.match(/goods_id=([^&]+)/) || url.match(/-g-(\d+)\.html/);
      if (m) goodsId = m[1];
      try {
        const u = new URL(url);
        shareImage = u.searchParams.get("share_img") || u.searchParams.get("top_gallery_url") || null;
      } catch { /* skip */ }
    } else if (/^\d{10,}$/.test(url)) {
      goodsId = url;
    }

    if (!goodsId) {
      return NextResponse.json({
        success: false,
        error: "Could not extract goods_id from URL",
      });
    }

    // Step 2: Fetch product page via Cloudflare Worker with cookies
    // Try multiple locale URLs in parallel
    const productUrls = [
      `https://www.temu.com/-g-${goodsId}.html`,
      `https://www.temu.com/qa/-g-${goodsId}.html`,
      `https://www.temu.com/om/-g-${goodsId}.html`,
      `https://www.temu.com/us/-g-${goodsId}.html`,
    ];

    console.log(`[Step 2] Fetching via Worker (cookies: ${temuCookies ? "yes" : "no"})...`);

    // Fetch first URL (US/global - most likely to work without login)
    let html = "";
    try {
      html = await fetchViaWorker(productUrls[0], temuCookies);
      console.log(`[Step 2] Got ${html.length} bytes from ${productUrls[0].slice(0, 50)}`);
    } catch (e) {
      console.log(`[Step 2] Worker error: ${String(e).slice(0, 100)}`);
    }

    // Step 3: Extract price from HTML
    console.log("[Step 3] Extracting price...");
    const result = extractPriceFromHtml(html, goodsId);

    if (result && result.priceUSD > 0) {
      const breakdown = calculateAlgeriaPrice(result.priceUSD);
      console.log(`[Done] ✓ Price: $${result.priceUSD} = ${breakdown.totalDZD} DZD`);

      return NextResponse.json({
        success: true,
        price: result.priceUSD,
        dzd: breakdown.totalDZD,
        breakdown,
        productName: result.productName || `Produit Temu #${goodsId}`,
        productImage: result.productImage || shareImage,
        productUrl: `https://www.temu.com/-g-${goodsId}.html`,
        originalPrice: result.originalPriceUSD,
        source: result.source,
        itemId: goodsId,
      });
    }

    // No price found
    console.log("[Done] No price found");
    const productName = result?.productName || extractNameFromUrl(finalUrl) || `Produit Temu #${goodsId}`;
    return NextResponse.json({
      success: false,
      error: temuCookies
        ? "Could not extract price. The Temu session cookies may have expired. Please update TEMU_COOKIES env var."
        : "TEMU_COOKIES not configured. Please set the TEMU_COOKIES environment variable with your Temu session cookies.",
      productName,
      productImage: result?.productImage || shareImage,
      productUrl: `https://www.temu.com/-g-${goodsId}.html`,
      itemId: goodsId,
    });
  } catch (error) {
    console.error("[scrape-price v4] Fatal error:", error);
    return NextResponse.json(
      { success: false, error: "An error occurred. Please try again." },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: "v4-worker-cookies",
    description: "Temu price extractor using Cloudflare Worker + session cookies",
    requiresCookies: !process.env.TEMU_COOKIES,
    usage: 'POST { "url": "https://share.temu.com/XXX" | "601105214745191" }',
  });
}
