import { NextRequest, NextResponse } from "next/server";
import { getUsdToDzdRate, calculateAlgeriaPrice } from "@/lib/exchange-rate";
import ZAI from "z-ai-web-dev-sdk";

// Vercel Hobby plan = 60s max. Keep at 30s for safety.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/* ───────────────────────────────────────────────────────────────────
 * SIMPLIFIED Temu price scraper (v2)
 *
 * Strategy: web_search → LLM extraction
 *
 * Why this approach:
 * - Temu uses aggressive anti-bot that blocks page_reader, direct fetch,
 *   and CORS proxies (all return "Security verification" or anti-bot JS).
 * - Google has indexed Temu product pages from various locale subdomains
 *   (qa, om, mu, se-en, etc.) with price snippets in local currencies.
 * - The LLM can convert any local currency to USD reliably.
 *
 * Flow:
 *   1. Resolve share.temu.com/XXX → real goods_id + image URL
 *   2. web_search "site:temu.com <goods_id>" → collect snippets
 *   3. Try extractPricesFromSnippets (fast, free)
 *   4. If no snippet price, use LLM on the snippets
 *   5. If still no price, return product info + ask for manual entry
 * ─────────────────────────────────────────────────────────────────── */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

// Currency → USD conversion rates (kept simple, no external API)
const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1,
  QAR: 0.274, OMR: 2.597, BHD: 2.652, SAR: 0.266, AED: 0.272,
  MUR: 0.0221, PKR: 0.00358, EUR: 1.085, GBP: 1.265,
  DZD: 0.00333, MAD: 0.0995, TND: 0.321, EGP: 0.0207,
  KWD: 3.24, JOD: 1.408, LBP: 0.0000112, TRY: 0.0293,
  INR: 0.0119, BDT: 0.00906, PHP: 0.0172, IDR: 0.0000615,
  VND: 0.0000394, THB: 0.0278, MYR: 0.213, SGD: 0.738,
  HKD: 0.128, TWD: 0.0307, KRW: 0.00072, JPY: 0.0067,
  CNY: 0.138, AUD: 0.658, NZD: 0.605, CAD: 0.735, CHF: 1.115,
  ZAR: 0.0534, BRL: 0.173, MXN: 0.0587, ARS: 0.00117,
  CLP: 0.00103, COP: 0.00025, PEN: 0.265, UYU: 0.0254,
  RUB: 0.0113, UAH: 0.0248, PLN: 0.250, CZK: 0.0432,
  HUF: 0.00274, RON: 0.215, BGN: 0.554, HRK: 0.141,
  SEK: 0.0954, NOK: 0.0938, DKK: 0.145, ISK: 0.00719,
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

interface ProductInfo {
  goodsId: string | null;
  image: string | null;
  shareUrl: string | null;
  canonicalUrl: string | null;
  productName: string | null;
  productDescription: string | null;
}

interface PriceResult {
  priceUSD: number | null;
  originalPriceUSD: number | null;
  source: string;
  confidence: "high" | "medium" | "low";
}

/* ── Resolve share.temu.com/XXX → real goods_id + image URL ── */
async function resolveShareUrl(
  url: string,
): Promise<{ finalUrl: string; goodsId: string | null; image: string | null; productName: string | null }> {
  let currentUrl = url;
  let lastHtml = "";

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

    lastHtml = await res.text();
    break;
  }

  // Extract goods_id from URL
  let goodsId: string | null = null;
  const gidMatch = currentUrl.match(/goods_id=([^&]+)/);
  if (gidMatch) goodsId = gidMatch[1];
  if (!goodsId) {
    const gidMatch2 = currentUrl.match(/-g-(\d+)\.html/);
    if (gidMatch2) goodsId = gidMatch2[1];
  }

  // Extract image URL from query params (share_img or top_gallery_url)
  let image: string | null = null;
  try {
    const u = new URL(currentUrl);
    const shareImg = u.searchParams.get("share_img");
    if (shareImg) image = shareImg;
    const topGallery = u.searchParams.get("top_gallery_url");
    if (topGallery && !image) image = topGallery;
  } catch {
    const m = currentUrl.match(/[?&](?:share_img|top_gallery_url)=([^&]+)/);
    if (m) {
      try { image = decodeURIComponent(m[1]); } catch { image = m[1]; }
    }
  }

  // Try to extract product name from the response HTML (anti-bot page sometimes contains og:title)
  let productName: string | null = null;
  const ogTitleMatch = lastHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogTitleMatch) {
    productName = ogTitleMatch[1].replace(/\s*[-|]\s*Temu.*$/i, "").trim();
  }

  return { finalUrl: currentUrl, goodsId, image, productName };
}

/* ── Extract product name from URL slug ── */
function extractNameFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const slug =
      segments.find((s) => s.includes("-g-") && s.length > 10) ||
      segments[segments.length - 1] ||
      "";
    const name = slug
      .replace(/-g-[a-zA-Z0-9]+\.html?$/i, "")
      .replace(/\.html?$/i, "")
      .replace(/-/g, " ")
      .trim();
    if (name && name.length > 3) {
      return name.replace(/\b\w/g, (l) => l.toUpperCase());
    }
  } catch { /* skip */ }
  return null;
}

/* ── Run ZAI web_search and collect Temu result snippets ── */
async function searchTemuSnippets(
  zai: InstanceType<typeof ZAI>,
  goodsId: string,
): Promise<{ name: string; url: string; snippet: string }[]> {
  // Use multiple queries to maximize chance of finding price snippets.
  // Different queries surface different locale pages with prices.
  const queries = [
    `site:temu.com ${goodsId}`,
    `temu "${goodsId}"`,
    `temu ${goodsId} QAR OMR price`,
  ];

  const all: { name: string; url: string; snippet: string }[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    try {
      console.log(`[Search] Query: ${q}`);
      const results = await (zai as any).invokeFunction("web_search", { query: q, num: 10 });
      let arr: any[] = [];
      if (Array.isArray(results)) arr = results;
      else if (results && typeof results === "object")
        arr = results.results || results.data || results.items || [];

      console.log(`[Search] Got ${arr.length} results`);
      for (const r of arr) {
        const url = r.url || r.link || r.href || "";
        if (!url || !url.includes("temu.com") || seen.has(url)) continue;
        seen.add(url);
        all.push({
          name: r.name || r.title || "",
          url,
          snippet: r.snippet || r.description || r.summary || "",
        });
      }

      // If we got enough results, skip remaining queries
      if (all.length >= 8) break;
    } catch (err) {
      console.log(`[Search] Error: ${String(err).slice(0, 100)}`);
    }
  }

  return all;
}

/* ── Try to extract price from snippet text using regex ── */
function extractPriceFromSnippets(
  snippets: { name: string; url: string; snippet: string }[],
): { usd: number; originalAmount: number; currency: string; source: string } | null {
  for (const s of snippets) {
    // Detect URL locale → expected currency
    const locale = s.url.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i)?.[1]?.toLowerCase() || "";
    const LOCALE_CUR: Record<string, string> = {
      qa: "QAR", om: "OMR", bh: "BHD", sa: "SAR", ae: "AED", kw: "KWD",
      pk: "PKR", mu: "MUR", bd: "BDT", ph: "PHP", id: "IDR", vn: "VND",
      th: "THB", my: "MYR", sg: "SGD", hk: "HKD", tw: "TWD", kr: "KRW",
      jp: "JPY", cn: "CNY", au: "AUD", nz: "NZD", ca: "CAD", us: "USD",
      gb: "GBP", fr: "EUR", de: "EUR", es: "EUR", it: "EUR", nl: "EUR",
      se: "SEK", "se-en": "SEK", no: "NOK", "no-en": "NOK", dk: "DKK",
      "de-en": "EUR", "fr-en": "EUR", "es-en": "EUR", "it-en": "EUR",
      "nl-en": "EUR", dz: "DZD", "dz-en": "DZD", "dz-fr": "DZD",
      ma: "MAD", "ma-en": "MAD", tn: "TND",
    };
    const expectedCur = LOCALE_CUR[locale] || "USD";

    // Match patterns like "68.00 QAR21.65 68% OFF" or "QAR 21.65" or "$5.85"
    // The SALE price is the smaller one (after discount)
    const pricePatterns: RegExp[] = [
      // "68.00 QAR21.65" — original then sale
      new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${expectedCur}(\\d+(?:\\.\\d+)?)`, "i"),
      // "QAR 21.65" or "QAR21.65"
      new RegExp(`${expectedCur}\\s?(\\d+(?:\\.\\d+)?)`, "i"),
      // "$5.85" (USD)
      /\$\s?(\d+(?:\.\d+)?)/i,
    ];

    for (const pattern of pricePatterns) {
      const m = s.snippet.match(pattern);
      if (m) {
        if (m.length === 3 && m[2]) {
          // Pattern matched: "original CURsale" — sale price is m[2]
          const sale = parseFloat(m[2]);
          const usdRate = CURRENCY_TO_USD[expectedCur] || 1;
          const usd = Math.round(sale * usdRate * 100) / 100;
          if (usd > 0.1 && usd < 500) {
            console.log(`[Snippet] Found sale price: ${sale} ${expectedCur} = $${usd}`);
            return { usd, originalAmount: parseFloat(m[1]), currency: expectedCur, source: `snippet(${expectedCur})` };
          }
        } else {
          // Pattern matched: single price
          const price = parseFloat(m[1]);
          const cur = expectedCur;
          const usdRate = CURRENCY_TO_USD[cur] || 1;
          const usd = Math.round(price * usdRate * 100) / 100;
          if (usd > 0.1 && usd < 500) {
            console.log(`[Snippet] Found price: ${price} ${cur} = $${usd}`);
            return { usd, originalAmount: price, currency: cur, source: `snippet(${cur})` };
          }
        }
      }
    }
  }
  return null;
}

/* ── Use LLM to extract price from snippets ── */
async function extractPriceWithLLM(
  zai: InstanceType<typeof ZAI>,
  snippets: { name: string; url: string; snippet: string }[],
  goodsId: string,
): Promise<PriceResult | null> {
  if (snippets.length === 0) return null;

  const context = snippets
    .slice(0, 10)
    .map((r, i) => `${i + 1}. ${r.name}\n   URL: ${r.url}\n   Snippet: ${r.snippet}`)
    .join("\n\n");

  console.log(`[LLM] Asking LLM on ${Math.min(snippets.length, 10)} snippets...`);

  const completion = await (zai as any).createChatCompletion({
    messages: [
      {
        role: "system",
        content: `You are a price extraction assistant for Temu products.
You will be given web search results for a Temu product. Extract the SALE PRICE from the search results.

CRITICAL: Examine EVERY snippet carefully. Some snippets contain price information that may not be obvious at first glance.

The web search results show the same product on different Temu locale pages (Qatar, Oman, Mauritius, US, etc.). Each locale shows the price in its local currency.

Currency conversion rates to USD:
- QAR → USD: ×0.274 (e.g., QAR 21.65 = $5.93)
- OMR → USD: ×2.597 (e.g., OMR 3.56 = $9.25)
- BHD → USD: ×2.652 (e.g., BHD 1.23 = $3.26)
- SAR → USD: ×0.266
- AED → USD: ×0.272
- MUR (Rs) → USD: ×0.0221
- EUR → USD: ×1.085
- GBP → USD: ×1.265
- NZD → USD: ×0.605
- AUD → USD: ×0.658

Price patterns to look for in snippets:
- "68.00 QAR21.65 68% OFF" → sale price is QAR 21.65 (after discount)
- "OMR 3.56" or "OMR3.56" → OMR 3.56
- "Rs 451" or "Rs451" → MUR 451
- "$5.85" or "$ 5.85" → USD 5.85
- "NZ$ 8.99" → NZD 8.99
- "AU$ 9.99" → AUD 9.99

RULES:
1. The SALE price is the smaller one (after discount), NOT the original.
2. Do NOT confuse discount percentages with the price.
3. NEVER return $30.00 — this is a "delivery guarantee" amount, not the product price.
4. If a snippet mentions a price like "55.99 AED12.64 77% OFF", extract AED 12.64 (sale).
5. Return ONLY JSON: {"price_usd": <number>, "name": "<short_product_name>", "confidence": "<high|medium|low>"}
6. If you genuinely cannot find ANY price in any snippet, return {"price_usd": null, "confidence": "low"}`,
      },
      {
        role: "user",
        content: `Product goods_id: ${goodsId}\n\nSearch Results:\n${context}\n\nExamine every snippet carefully. Extract the product's SALE price in USD. Return JSON only.`,
      },
    ],
  });

  const response = completion.choices?.[0]?.message?.content || "";
  console.log(`[LLM] Response: ${response.slice(0, 300)}`);

  const jsonMatch = response.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const priceUSD = typeof parsed.price_usd === "number"
      ? parsed.price_usd
      : parseFloat(String(parsed.price_usd));

    if (!priceUSD || priceUSD <= 0 || priceUSD >= 500) return null;
    if (priceUSD === 30) return null; // Suspicious delivery guarantee

    return {
      priceUSD,
      originalPriceUSD: null,
      source: `llm(${parsed.confidence || "low"})`,
      confidence: parsed.confidence || "low",
    };
  } catch {
    return null;
  }
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

  console.log(`\n=== [scrape-price v2] ${url.slice(0, 80)} ===`);

  try {
    const zai = await createZAI();

    // Step 1: Resolve share URL (if share.temu.com) → goods_id + image
    let finalUrl = url;
    let goodsId: string | null = null;
    let shareImage: string | null = null;

    if (url.includes("share.temu.com/")) {
      console.log("[Step 1] Resolving share URL...");
      const resolved = await resolveShareUrl(url);
      finalUrl = resolved.finalUrl;
      goodsId = resolved.goodsId;
      shareImage = resolved.image;
      console.log(`[Step 1] goods_id=${goodsId}, image=${shareImage ? "yes" : "no"}, name=${resolved.productName ? "yes" : "no"}`);
      // Stash the product name from redirect for later use
      if (resolved.productName) {
        (body as any)._resolvedName = resolved.productName;
      }
    } else if (url.includes("temu.com")) {
      // Try to extract goods_id from URL
      const m = url.match(/goods_id=([^&]+)/) || url.match(/-g-(\d+)\.html/);
      if (m) goodsId = m[1];
      // Also try to extract image from URL params
      try {
        const u = new URL(url);
        shareImage = u.searchParams.get("share_img") || u.searchParams.get("top_gallery_url") || null;
      } catch { /* skip */ }
    } else if (/^\d{10,}$/.test(url)) {
      // Numeric goods_id
      goodsId = url;
      finalUrl = `https://www.temu.com/-g-${url}.html`;
    } else if (/^[A-Z]{2}\d+/i.test(url)) {
      // Item ID like RT09023 — search for it
      goodsId = null; // Will use item ID for search
    }

    if (!goodsId && !/^[A-Z]{2}\d+/i.test(url)) {
      return NextResponse.json({
        success: false,
        error: "Could not extract goods_id from URL",
      });
    }

    // Step 2: web_search for snippets (with retry on first failure)
    console.log("[Step 2] Searching Temu for snippets...");
    const searchId = goodsId || url;
    let snippets = await searchTemuSnippets(zai, searchId);
    console.log(`[Step 2] Got ${snippets.length} unique Temu snippets`);

    // Extract product name from search results
    let productName: string | null = snippets[0]?.name || null;
    // If search didn't give a name, try the resolved name from redirect
    if (!productName && (body as any)._resolvedName) {
      productName = (body as any)._resolvedName;
    }
    // If still no name, try URL slug
    if (!productName) productName = extractNameFromUrl(finalUrl);
    // Filter out generic "Goods" placeholder
    if (productName === "Goods" && (body as any)._resolvedName) {
      productName = (body as any)._resolvedName;
    }

    // Last resort: if name is still "Goods" or null, try page_reader on the share URL
    // to get the og:title (sometimes the anti-bot page includes it in the redirect chain)
    // IMPORTANT: Wrap in a 15s timeout to avoid exceeding Vercel's 60s function limit
    if ((!productName || productName === "Goods") && url.includes("share.temu.com/")) {
      console.log("[Step 2b] Trying page_reader for product name (15s timeout)...");
      try {
        const prPromise = (zai as any).invokeFunction("page_reader", { url });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("page_reader timeout")), 15000)
        );
        const prResult = await Promise.race([prPromise, timeoutPromise]);
        const prData = typeof prResult === "string" ? JSON.parse(prResult) : prResult;
        const prContent = prData?.data?.content || prData?.data?.text || prData?.data?.html || prData?.content || prData?.text || prData?.html || "";
        if (prContent.length > 1000) {
          // Look for og:title
          const ogTitle = prContent.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
          if (ogTitle) {
            const cleanName = ogTitle[1].replace(/\s*[-|]\s*Temu.*$/i, "").trim();
            if (cleanName && cleanName.length > 3 && cleanName !== "Temu" && !cleanName.includes("Login") && !cleanName.includes("Register")) {
              productName = cleanName;
              console.log(`[Step 2b] ✓ Got name from page_reader: ${cleanName.slice(0, 60)}`);
            }
          }
          // Also look for og:url which contains the SEO slug
          if (!productName || productName === "Goods") {
            const ogUrl = prContent.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i);
            if (ogUrl) {
              const slugName = extractNameFromUrl(ogUrl[1]);
              if (slugName && slugName !== "Goods") {
                productName = slugName;
                console.log(`[Step 2b] ✓ Got name from og:url slug: ${slugName.slice(0, 60)}`);
              }
            }
          }
        }
      } catch (err) {
        console.log(`[Step 2b] page_reader skipped: ${String(err).slice(0, 80)}`);
      }
    }

    // Step 3: Try snippet regex extraction (fast, free)
    console.log("[Step 3] Trying snippet regex extraction...");
    let snippetPrice = extractPriceFromSnippets(snippets);

    let priceResult: PriceResult | null = null;
    if (snippetPrice) {
      priceResult = {
        priceUSD: snippetPrice.usd,
        originalPriceUSD: snippetPrice.originalAmount ? Math.round(snippetPrice.originalAmount * (CURRENCY_TO_USD[snippetPrice.currency] || 1) * 100) / 100 : null,
        source: snippetPrice.source,
        confidence: "high",
      };
    }

    // Step 4: If no snippet price, use LLM
    if (!priceResult && snippets.length > 0) {
      console.log("[Step 4] Snippet extraction failed, using LLM...");
      priceResult = await extractPriceWithLLM(zai, snippets, searchId);
    }

    // Step 5: RETRY — if first attempt failed, search with different query and try again
    if (!priceResult) {
      console.log("[Step 5] First attempt failed. Retrying with different search queries...");
      // Use a different search approach: search by product name first if we have it
      const retryQueries = [
        `temu ${searchId}`,
        `"${searchId}" temu`,
        `temu ${productName || ""} ${searchId}`.trim(),
      ].filter((q, i, arr) => arr.indexOf(q) === i).slice(0, 2);

      const retrySnippets: { name: string; url: string; snippet: string }[] = [];
      const seenRetry = new Set<string>();
      for (const q of retryQueries) {
        try {
          console.log(`[Retry Search] Query: ${q}`);
          const results = await (zai as any).invokeFunction("web_search", { query: q, num: 10 });
          let arr: any[] = [];
          if (Array.isArray(results)) arr = results;
          else if (results && typeof results === "object")
            arr = results.results || results.data || results.items || [];
          for (const r of arr) {
            const u = r.url || r.link || r.href || "";
            if (!u || !u.includes("temu.com") || seenRetry.has(u)) continue;
            seenRetry.add(u);
            retrySnippets.push({
              name: r.name || r.title || "",
              url: u,
              snippet: r.snippet || r.description || r.summary || "",
            });
          }
          if (retrySnippets.length >= 8) break;
        } catch (err) {
          console.log(`[Retry Search] Error: ${String(err).slice(0, 80)}`);
        }
      }

      // Combine with original snippets
      const allSnippets = [...snippets, ...retrySnippets];
      console.log(`[Step 5] Combined ${allSnippets.length} snippets`);

      if (allSnippets.length > 0) {
        // Try regex again on combined snippets
        const retrySnippetPrice = extractPriceFromSnippets(allSnippets);
        if (retrySnippetPrice) {
          priceResult = {
            priceUSD: retrySnippetPrice.usd,
            originalPriceUSD: retrySnippetPrice.originalAmount ? Math.round(retrySnippetPrice.originalAmount * (CURRENCY_TO_USD[retrySnippetPrice.currency] || 1) * 100) / 100 : null,
            source: retrySnippetPrice.source,
            confidence: "high",
          };
        }
        // Try LLM again
        if (!priceResult) {
          console.log("[Step 5] Trying LLM on combined snippets...");
          priceResult = await extractPriceWithLLM(zai, allSnippets, searchId);
        }
      }
    }

    // Step 6: Build response
    if (priceResult && priceResult.priceUSD) {
      const breakdown = calculateAlgeriaPrice(priceResult.priceUSD);
      console.log(`[Done] ✓ Price: $${priceResult.priceUSD} = ${breakdown.totalDZD} DZD (source: ${priceResult.source})`);

      return NextResponse.json({
        success: true,
        price: priceResult.priceUSD,
        dzd: breakdown.totalDZD,
        breakdown,
        productName: productName || (goodsId ? `Temu product #${goodsId}` : "Temu product"),
        productImage: shareImage,
        productUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : finalUrl,
        originalPrice: priceResult.originalPriceUSD,
        source: priceResult.source,
        confidence: priceResult.confidence,
        itemId: goodsId || undefined,
      });
    }

    // No price found — return product info for manual entry
    console.log("[Done] No price found, returning product info for manual entry");
    return NextResponse.json({
      success: true,
      price: null,
      requiresManualPrice: true,
      productName: productName || (goodsId ? `Temu product #${goodsId}` : "Temu product"),
      productImage: shareImage,
      productUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : finalUrl,
      itemId: goodsId || undefined,
      source: "no-price-found",
      message: "تم العثور على المنتج! يرجى إدخال السعر المعروض على Temu في الحقل أدناه.",
    });
  } catch (error) {
    console.error("[scrape-price v2] Fatal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Une erreur est survenue. Veuillez entrer le prix manuellement.",
        allowManual: true,
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: "v2-simplified",
    usage: 'POST { "url": "https://share.temu.com/XXX" | "601105214745191" | "https://www.temu.com/-g-XXX.html" }',
  });
}
