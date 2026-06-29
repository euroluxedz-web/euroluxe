import { NextRequest, NextResponse } from "next/server";
import { calculateAlgeriaPrice } from "@/lib/exchange-rate";
import ZAI from "z-ai-web-dev-sdk";

// 30s timeout — within Vercel limits, leaves room for fallbacks
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/* ───────────────────────────────────────────────────────────────────
 * FAST PARALLEL Temu price scraper (v3)
 *
 * Strategy: Run multiple extraction strategies IN PARALLEL.
 * First one to return a valid price wins. Total max time: 15-20s.
 *
 * Strategies (all run concurrently):
 *   1. AllOrigins on multiple Temu locale pages (qa, om, mu, no-en, se-en, etc.)
 *      — These pages have OG price meta tags accessible via CORS proxy
 *   2. ZAI web_search for snippets (sometimes returns price in snippet text)
 *   3. Direct fetch with browser headers (rarely works but fast when it does)
 *
 * NO manual price entry. If all strategies fail, return clear error.
 * ─────────────────────────────────────────────────────────────────── */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

// Currency → USD conversion rates
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
};

// Helper: create ZAI instance from env vars (Vercel) or .z-ai-config file (local)
async function createZAI(): Promise<InstanceType<typeof ZAI>> {
  try {
    return await ZAI.create();
  } catch {
    const baseUrl = process.env.ZAI_BASE_URL;
    const apiKey = process.env.ZAI_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error("ZAI SDK not configured");
    }
    const config: Record<string, string> = { baseUrl, apiKey };
    if (process.env.ZAI_CHAT_ID) config.chatId = process.env.ZAI_CHAT_ID;
    if (process.env.ZAI_USER_ID) config.userId = process.env.ZAI_USER_ID;
    if (process.env.ZAI_TOKEN) config.token = process.env.ZAI_TOKEN;
    return new ZAI(config);
  }
}

interface PriceResult {
  priceUSD: number;
  originalPriceUSD: number | null;
  productName: string | null;
  productImage: string | null;
  source: string;
  rawPrice?: string;
  rawCurrency?: string;
}

/* ── Resolve share.temu.com/XXX → real goods_id + image + URL ── */
async function resolveShareUrl(
  url: string,
): Promise<{ finalUrl: string; goodsId: string | null; image: string | null }> {
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

/* ── STRATEGY 1: AllOrigins on locale URL ── */
async function tryAllOrigins(
  locale: string,
  goodsId: string,
): Promise<PriceResult | null> {
  const url = `https://www.temu.com/${locale}/-g-${goodsId}.html`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    const html: string = data?.contents || "";
    if (!html || html.length < 3000 || html.includes("Security verification")) return null;

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
        console.log(`[AllOrigins/${locale}] ✓ ${price} ${currency} = $${usd}`);
        return {
          priceUSD: usd,
          originalPriceUSD: null,
          productName: ogTitle ? ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim() : null,
          productImage: ogImage || null,
          source: `allorigins(${locale},${currency})`,
          rawPrice: ogPrice,
          rawCurrency: currency,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/* ── STRATEGY 2: ZAI web_search for snippets ── */
async function tryWebSearch(
  zai: InstanceType<typeof ZAI>,
  goodsId: string,
): Promise<PriceResult | null> {
  // Multiple queries to maximize chance of finding price snippets.
  // Try them in sequence until one returns a price.
  const queries = [
    `site:temu.com ${goodsId}`,
    `temu "${goodsId}"`,
    `temu ${goodsId} price`,
  ];

  for (const query of queries) {
    try {
      console.log(`[WebSearch] Query: ${query}`);
      const results = await (zai as any).invokeFunction("web_search", { query, num: 10 });
      let arr: any[] = [];
      if (Array.isArray(results)) arr = results;
      else if (results && typeof results === "object")
        arr = results.results || results.data || results.items || [];

      console.log(`[WebSearch] Got ${arr.length} results`);

      for (const r of arr) {
        const url = r.url || r.link || r.href || "";
        if (!url.includes("temu.com")) continue;
        const snippet = r.snippet || r.description || r.summary || "";
        const name = r.name || r.title || "";

        // Detect URL locale → expected currency
        const locale = url.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i)?.[1]?.toLowerCase() || "";
        const LOCALE_CUR: Record<string, string> = {
          qa: "QAR", om: "OMR", bh: "BHD", sa: "SAR", ae: "AED", kw: "KWD",
          pk: "PKR", mu: "MUR", bd: "BDT", no: "NOK", "no-en": "NOK",
          se: "SEK", "se-en": "SEK", de: "EUR", "de-en": "EUR",
          fr: "EUR", "fr-en": "EUR", gb: "GBP", uk: "GBP", us: "USD",
          au: "AUD", "au-en": "AUD", ca: "CAD", "ca-en": "CAD",
          jp: "JPY", kr: "KRW", cn: "CNY", hk: "HKD", sg: "SGD",
          nz: "NZD", "nz-en": "NZD", at: "EUR", "at-en": "EUR",
          ch: "CHF", "ch-en": "CHF", ie: "EUR", "ie-en": "EUR",
          it: "EUR", "it-en": "EUR", es: "EUR", "es-en": "EUR",
          nl: "EUR", "nl-en": "EUR", be: "EUR", "be-en": "EUR",
          pt: "EUR", "pt-en": "EUR", pl: "PLN", "pl-en": "PLN",
          tr: "TRY", "tr-en": "TRY", th: "THB", "th-en": "THB",
          my: "MYR", "my-en": "MYR", ph: "PHP", "ph-en": "PHP",
          id: "IDR", "id-en": "IDR", vn: "VND", "vn-en": "VND",
          mx: "MXN", "mx-en": "MXN", br: "BRL", "br-en": "BRL",
          ar: "ARS", "ar-en": "ARS", cl: "CLP", "cl-en": "CLP",
          co: "COP", "co-en": "COP", pe: "PEN", "pe-en": "PEN",
          za: "ZAR", "za-en": "ZAR", ng: "NGN", "ng-en": "NGN",
          eg: "EGP", "eg-en": "EGP", ma: "MAD", "ma-en": "MAD",
          dz: "DZD", "dz-en": "DZD", "dz-fr": "DZD", tn: "TND", "tn-en": "TND",
        };
        const expectedCur = LOCALE_CUR[locale] || "USD";

        // Match patterns like "68.00 QAR21.65 68% OFF" (original then sale)
        const pattern1 = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${expectedCur}(\\d+(?:\\.\\d+)?)`, "i");
        const m1 = snippet.match(pattern1);
        if (m1 && m1[2]) {
          const sale = parseFloat(m1[2]);
          const usdRate = CURRENCY_TO_USD[expectedCur] || 1;
          const usd = Math.round(sale * usdRate * 100) / 100;
          if (usd > 0.1 && usd < 500 && usd !== 30) {
            console.log(`[WebSearch/${locale}] ✓ ${sale} ${expectedCur} = $${usd}`);
            return {
              priceUSD: usd,
              originalPriceUSD: null,
              productName: name || null,
              productImage: null,
              source: `websearch(${locale},${expectedCur})`,
              rawPrice: String(sale),
              rawCurrency: expectedCur,
            };
          }
        }

        // Match single price like "QAR 22.36" or "OMR 3.56"
        const pattern2 = new RegExp(`${expectedCur}\\s?(\\d+(?:\\.\\d+)?)`, "i");
        const m2 = snippet.match(pattern2);
        if (m2) {
          const price = parseFloat(m2[1]);
          const usdRate = CURRENCY_TO_USD[expectedCur] || 1;
          const usd = Math.round(price * usdRate * 100) / 100;
          if (usd > 0.1 && usd < 500 && usd !== 30) {
            console.log(`[WebSearch/${locale}] ✓ ${price} ${expectedCur} = $${usd}`);
            return {
              priceUSD: usd,
              originalPriceUSD: null,
              productName: name || null,
              productImage: null,
              source: `websearch(${locale},${expectedCur})`,
              rawPrice: String(price),
              rawCurrency: expectedCur,
            };
          }
        }

        // Match Rs (MUR/INR/PKR)
        const m4 = snippet.match(/Rs\s?(\d+(?:\.\d+)?)/i);
        if (m4 && (locale === "mu" || locale === "pk" || locale === "bd")) {
          const price = parseFloat(m4[1]);
          const cur = locale === "mu" ? "MUR" : locale === "pk" ? "PKR" : "BDT";
          const usdRate = CURRENCY_TO_USD[cur] || 1;
          const usd = Math.round(price * usdRate * 100) / 100;
          if (usd > 0.1 && usd < 500 && usd !== 30) {
            console.log(`[WebSearch/${locale}] ✓ Rs ${price} = $${usd}`);
            return {
              priceUSD: usd,
              originalPriceUSD: null,
              productName: name || null,
              productImage: null,
              source: `websearch(${locale},${cur})`,
              rawPrice: String(price),
              rawCurrency: cur,
            };
          }
        }

        // Match USD
        const m3 = snippet.match(/\$\s?(\d+(?:\.\d+)?)/);
        if (m3) {
          const usd = parseFloat(m3[1]);
          if (usd > 0.1 && usd < 500 && usd !== 30) {
            console.log(`[WebSearch/USD] ✓ $${usd}`);
            return {
              priceUSD: usd,
              originalPriceUSD: null,
              productName: name || null,
              productImage: null,
              source: `websearch(USD)`,
              rawPrice: String(usd),
              rawCurrency: "USD",
            };
          }
        }
      }
    } catch { /* search error */ }
  }

  return null;
}

/* ── STRATEGY 3: Direct fetch (rarely works but very fast) ── */
async function tryDirectFetch(goodsId: string): Promise<PriceResult | null> {
  const url = `https://www.temu.com/-g-${goodsId}.html`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const html = await res.text();
    if (html.length < 3000 || html.includes("Security verification")) return null;

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
        console.log(`[Direct] ✓ ${price} ${currency} = $${usd}`);
        return {
          priceUSD: usd,
          originalPriceUSD: null,
          productName: ogTitle ? ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim() : null,
          productImage: ogImage || null,
          source: `direct(${currency})`,
          rawPrice: ogPrice,
          rawCurrency: currency,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/* ── STRATEGY 4: ZAI page_reader on share URL (last resort) ── */
async function tryPageReader(
  zai: InstanceType<typeof ZAI>,
  shareUrl: string | null,
  goodsId: string,
): Promise<PriceResult | null> {
  // Try page_reader on multiple URLs
  const urls: string[] = [];
  if (shareUrl) urls.push(shareUrl);
  // Also try the SEO goods URL — sometimes page_reader can bypass anti-bot
  urls.push(`https://www.temu.com/-g-${goodsId}.html`);

  for (const url of urls) {
    try {
      console.log(`[PageReader] Trying: ${url.slice(0, 60)}`);
      const result = await (zai as any).invokeFunction("page_reader", { url });
      const data = typeof result === "string" ? JSON.parse(result) : result;
      const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html || "";

      if (!content || content.length < 1000) continue;
      if (content.includes("Security verification") || content.includes("Login")) continue;

      // Extract OG price
      const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogCurrency = content.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogTitle = content.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogImage = content.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];

      if (ogPrice) {
        const price = parseFloat(ogPrice);
        const currency = ogCurrency || "USD";
        const usdRate = CURRENCY_TO_USD[currency] || 1;
        const usd = Math.round(price * usdRate * 100) / 100;
        if (usd > 0.1 && usd < 500 && usd !== 30) {
          console.log(`[PageReader] ✓ ${price} ${currency} = $${usd}`);
          return {
            priceUSD: usd,
            originalPriceUSD: null,
            productName: ogTitle ? ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim() : null,
            productImage: ogImage || null,
            source: `pagereader(${currency})`,
            rawPrice: ogPrice,
            rawCurrency: currency,
          };
        }
      }

      // Try window.rawData extraction
      const gidIdx = content.indexOf(goodsId);
      if (gidIdx >= 0) {
        const window_ = content.slice(Math.max(0, gidIdx - 2000), Math.min(content.length, gidIdx + 10000));
        const matches = [...window_.matchAll(/"(minPrice|salePrice|price|appPrice|displayPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
        if (matches.length > 0) {
          const saleField = matches.find(m => m[1] === "minPrice") || matches.find(m => m[1] === "salePrice") || matches[0];
          const price = parseFloat(saleField[2]);
          // Convert cents to dollars if price seems too high
          const actualPrice = price > 100 ? price / 100 : price;
          if (actualPrice > 0.1 && actualPrice < 500 && actualPrice !== 30) {
            console.log(`[PageReader] ✓ rawData ${saleField[1]}=${price} = $${actualPrice}`);
            return {
              priceUSD: actualPrice,
              originalPriceUSD: null,
              productName: ogTitle ? ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim() : null,
              productImage: ogImage || null,
              source: `pagereader(rawData)`,
              rawPrice: String(price),
              rawCurrency: "USD",
            };
          }
        }
      }
    } catch (err) {
      console.log(`[PageReader] Error: ${String(err).slice(0, 80)}`);
    }
  }

  return null;
}

/* ── Main POST handler ── */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const url: string = (body.url || body.input || "").trim();

  if (!url) {
    return NextResponse.json(
      { success: false, error: "URL is required" },
      { status: 400 },
    );
  }

  console.log(`\n=== [scrape-price v3-parallel] ${url.slice(0, 80)} ===`);

  try {
    // Step 1: Resolve URL → goods_id + image (1-2s)
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
      finalUrl = `https://www.temu.com/-g-${url}.html`;
    }

    if (!goodsId) {
      return NextResponse.json({
        success: false,
        error: "Could not extract goods_id from URL. Please paste a valid Temu share link or product URL.",
      });
    }

    // Step 2: Run all strategies IN PARALLEL (Promise.race for first success)
    console.log("[Step 2] Running strategies in parallel...");
    const zai = await createZAI().catch(() => null);

    // The original share URL (for page_reader fallback)
    const originalShareUrl = url.includes("share.temu.com/") ? url : null;

    // Build list of strategies
    const strategies: Promise<PriceResult | null>[] = [
      // Strategy 1: AllOrigins on multiple locale pages (run in parallel)
      ...["qa", "om", "mu", "bh", "no-en", "se-en"].map((locale) =>
        tryAllOrigins(locale, goodsId).catch(() => null)
      ),
      // Strategy 2: Direct fetch
      tryDirectFetch(goodsId).catch(() => null),
      // Strategy 3: ZAI web_search (only if ZAI is available)
      zai ? tryWebSearch(zai, goodsId).catch(() => null) : Promise.resolve(null),
      // Strategy 4: ZAI page_reader (last resort, slowest)
      zai ? tryPageReader(zai, originalShareUrl, goodsId).catch(() => null) : Promise.resolve(null),
    ];

    // Use Promise.race with a wrapper that ignores nulls
    const findFirstSuccess = async (promises: Promise<PriceResult | null>[]): Promise<PriceResult | null> => {
      // Wait for all to settle, but return first non-null
      return new Promise((resolve) => {
        let remaining = promises.length;
        let resolved = false;
        for (const p of promises) {
          p.then((result) => {
            if (result && !resolved) {
              resolved = true;
              resolve(result);
            } else {
              remaining--;
              if (remaining === 0 && !resolved) resolve(null);
            }
          }).catch(() => {
            remaining--;
            if (remaining === 0 && !resolved) resolve(null);
          });
        }
      });
    };

    // 25s overall timeout (within Vercel 30s limit)
    const overallTimeout = new Promise<PriceResult | null>((resolve) =>
      setTimeout(() => resolve(null), 25000)
    );

    const priceResult = await Promise.race([
      findFirstSuccess(strategies),
      overallTimeout,
    ]);

    console.log(`[Step 2] Result: ${priceResult ? `$${priceResult.priceUSD}` : "no price found"}`);

    // Step 3: Build response
    if (priceResult && priceResult.priceUSD) {
      const breakdown = calculateAlgeriaPrice(priceResult.priceUSD);
      console.log(`[Done] ✓ Price: $${priceResult.priceUSD} = ${breakdown.totalDZD} DZD (source: ${priceResult.source})`);

      return NextResponse.json({
        success: true,
        price: priceResult.priceUSD,
        dzd: breakdown.totalDZD,
        breakdown,
        productName: priceResult.productName || `Produit Temu #${goodsId}`,
        productImage: priceResult.productImage || shareImage,
        productUrl: `https://www.temu.com/-g-${goodsId}.html`,
        originalPrice: priceResult.originalPriceUSD,
        source: priceResult.source,
        confidence: "high",
        itemId: goodsId,
      });
    }

    // No price found — return error (NO manual entry)
    console.log("[Done] ✗ No price found via any strategy");
    return NextResponse.json({
      success: false,
      error: "Impossible d'extraire le prix automatiquement. Veuillez réessayer dans un instant ou ouvrir le produit sur Temu pour voir le prix.",
      productName: `Produit Temu #${goodsId}`,
      productImage: shareImage,
      productUrl: `https://www.temu.com/-g-${goodsId}.html`,
      itemId: goodsId,
    });
  } catch (error) {
    console.error("[scrape-price v3] Fatal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Une erreur est survenue. Veuillez réessayer.",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: "v3-parallel",
    description: "Fast parallel Temu price extractor",
    usage: 'POST { "url": "https://share.temu.com/XXX" | "601105214745191" | "https://www.temu.com/..." }',
  });
}
