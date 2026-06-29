import { NextRequest, NextResponse } from "next/server";
import { getUsdToDzdRate, calculateAlgeriaPrice } from "@/lib/exchange-rate";

import ZAI from "z-ai-web-dev-sdk";

// Helper: create ZAI instance from env vars (Vercel) or .z-ai-config file (local)
async function createZAI(): Promise<InstanceType<typeof ZAI>> {
  // Try the default ZAI.create() first (reads from .z-ai-config file)
  try {
    return await ZAI.create();
  } catch {
    // Fallback: create from env vars (for Vercel where filesystem is read-only)
    const baseUrl = process.env.ZAI_BASE_URL;
    const apiKey = process.env.ZAI_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error("ZAI SDK not configured: no .z-ai-config file and no ZAI_BASE_URL/ZAI_API_KEY env vars");
    }
    const config: Record<string, string> = { baseUrl, apiKey };
    if (process.env.ZAI_CHAT_ID) config.chatId = process.env.ZAI_CHAT_ID;
    if (process.env.ZAI_USER_ID) config.userId = process.env.ZAI_USER_ID;
    if (process.env.ZAI_TOKEN) config.token = process.env.ZAI_TOKEN;
    console.log("[ZAI] Created instance from env vars");
    return new ZAI(config);
  }
}

export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface TemuProductData {
  price: number | null;
  currency: string;
  productName: string | null;
  productDescription?: string | null;
  canonicalUrl?: string | null;
  originalPrice: number | null;
  image: string | null;
  source: string;
  antiBotDetected?: boolean;
}

/* ───────────────────────────────────────────────────────────────────
 * Strategy 0-C: Page Reader + LLM — read the rendered product page.
 *
 * Uses the ZAI page_reader to read the fully rendered Temu product page,
 * then extracts the price using LLM. This is more reliable than web
 * search because it reads the actual page content.
 *
 * Key insight: When reading the share URL via page_reader, the browser
 * follows the redirect and renders the page. The product data (including
 * price) may be in the window.rawData JavaScript object.
 * ─────────────────────────────────────────────────────────────────── */
async function fetchPriceWithPageReader(
  goodsId: string | null,
  itemId: string | null,
  shareUrl: string | null,
  resolvedShareUrl?: string | null,
  shareLocale?: string | null,
): Promise<TemuProductData | null> {
  try {
    const zai = await createZAI();

    // Determine the best URL(s) to read — try multiple URLs in order
    const readUrls: { url: string; label: string }[] = [];
    if (shareUrl) {
      // Read the share URL directly — page_reader follows redirects
      readUrls.push({ url: shareUrl, label: "share-url" });
    }
    // Try the RESOLVED share URL (with all original params like _bg_fs=1, goods_id, etc.)
    // This is often more accessible than the share URL because it has the full product URL
    if (resolvedShareUrl && resolvedShareUrl !== shareUrl) {
      readUrls.push({ url: resolvedShareUrl, label: "resolved-share-url" });
    }
    if (goodsId && /^\d{10,}$/.test(goodsId)) {
      // Try the US product page directly — more likely to have USD prices
      readUrls.push({ url: `https://www.temu.com/-g-${goodsId}.html?_x_sessn=us&currency=USD`, label: "us-product-page" });
      // Also try the goods.html page with US session
      readUrls.push({ url: `https://www.temu.com/goods.html?goods_id=${goodsId}&_x_sessn=us&currency=USD`, label: "goods-api-us" });
    }
    if (itemId && /^[A-Z]{2}\d+/i.test(itemId)) {
      // Read the Temu product page directly with Item ID
      readUrls.push({ url: `https://www.temu.com/-i-${itemId}.html?_x_sessn=us&currency=USD`, label: "item-id-page" });
      // Also try searching on Temu — the Item ID often appears in search results
      readUrls.push({ url: `https://www.temu.com/search?q=${encodeURIComponent(itemId)}&_x_sessn=us&currency=USD`, label: "item-id-search" });
    }
    // Fallback: if no URLs were added, return null
    if (readUrls.length === 0) return null;

    // Try each URL until we get a price
    for (const { url: readUrl, label } of readUrls) {
      console.log(`[PageReader] Reading (${label}): ${readUrl}`);

      try {
        const pageResult = await (zai as any).invokeFunction("page_reader", {
          url: readUrl,
        });

        const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
        const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;

        if (!content || content.length < 1000) {
          console.log(`[PageReader] No content or too short for ${label}`);
          continue;
        }

        console.log(`[PageReader] Got content from ${label}: ${content.length} chars`);

        // Strategy A: Search for window.rawData in the HTML and extract price from it
        const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
        if (rawDataMatch) {
          try {
            const rawDataStr = rawDataMatch[1];

            // Search for price patterns near the goods_id
            if (goodsId && rawDataStr.includes(goodsId)) {
              const gidIdx = rawDataStr.indexOf(goodsId);
              const searchWindow = rawDataStr.slice(Math.max(0, gidIdx - 2000), Math.min(rawDataStr.length, gidIdx + 10000));

              const priceFields: Record<string, number> = {};
              const priceMatches = [...searchWindow.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice|priceNum|displayPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
              for (const m of priceMatches) {
                priceFields[m[1]] = parseFloat(m[2]);
              }

              if (Object.keys(priceFields).length > 0) {
                console.log(`[PageReader] Found price fields in rawData near goods_id:`, priceFields);

                const salePrice = priceFields.minPrice || priceFields.salePrice || priceFields.price || priceFields.appPrice || priceFields.displayPrice;
                const originalPrice = priceFields.marketPrice || priceFields.origPrice || null;

                if (salePrice && salePrice > 0 && salePrice < 100000) {
                  const actualPrice = salePrice > 100 ? salePrice / 100 : salePrice;
                  const actualOrigPrice = originalPrice ? (originalPrice > 100 ? originalPrice / 100 : originalPrice) : null;

                  const currencyMatch = rawDataStr.match(/"currency"\s*:\s*"([^"]+)"/);
                  const rawCurrency = currencyMatch ? currencyMatch[1] : "USD";

                  // If the currency is not USD, convert to USD
                  let priceUSD = actualPrice;
                  let currency = "USD";
                  if (rawCurrency !== "USD" && CURRENCY_TO_USD[rawCurrency]) {
                    priceUSD = Math.round(actualPrice * CURRENCY_TO_USD[rawCurrency] * 100) / 100;
                  } else {
                    currency = rawCurrency;
                  }

                  // Skip suspicious $30.00 price (delivery guarantee / delay credit)
                  if (isSuspiciousPrice(priceUSD, `page-reader-rawdata(${label})`)) {
                    console.log(`[PageReader] ⚠️ Skipping suspicious $${priceUSD} price from rawData (${label}) — likely delivery guarantee amount`);
                    // Don't return — try next URL or strategy
                  } else {
                    console.log(`[PageReader] ✓ Found price from rawData: ${actualPrice} ${rawCurrency} = $${priceUSD} USD`);

                    return {
                      price: priceUSD,
                      currency,
                      productName: null,
                      productDescription: null,
                      canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
                      originalPrice: actualOrigPrice,
                      image: null,
                      source: `page-reader-rawdata(${label})`,
                      antiBotDetected: false,
                    };
                  }
                }
              }
            }
          } catch (e) {
            console.log("[PageReader] rawData extraction error:", String(e).slice(0, 100));
          }
        }

        // Strategy A2: Broader search for price in content without requiring goods_id match in rawData
        // Sometimes the rawData structure is different and goods_id might not appear as text,
        // or the price might be in priceInfo blocks or other JSON structures
        {
          // Try to find priceInfo blocks directly in the HTML content
          const priceInfoMatches = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
          if (priceInfoMatches.length > 0) {
            const candidates: { usd: number; currency: string }[] = [];
            for (const pi of priceInfoMatches) {
              const cents = parseInt(pi[1]);
              const cur = pi[2];
              if (cents <= 0 || cents >= 100000000) continue;
              const value = cents / 100;
              if (cur === "USD") {
                candidates.push({ usd: value, currency: cur });
              } else if (CURRENCY_TO_USD[cur]) {
                candidates.push({ usd: Math.round(value * CURRENCY_TO_USD[cur] * 100) / 100, currency: cur });
              }
            }
            if (candidates.length > 0) {
              candidates.sort((a, b) => a.usd - b.usd);
              const best = candidates[0];
              if (best.usd >= 0.01 && best.usd < 100000) {
                // Skip suspicious $30.00 price (delivery guarantee)
                if (isSuspiciousPrice(best.usd, `page-reader-priceInfo(${label})`)) {
                  console.log(`[PageReader] ⚠️ Skipping suspicious $${best.usd} price from priceInfo (${label}) — likely delivery guarantee amount`);
                } else {
                  console.log(`[PageReader] ✓ Found priceInfo price (${label}): ${best.usd} USD (from ${best.currency})`);
                  return {
                    price: best.usd,
                    currency: "USD",
                    productName: null,
                    productDescription: null,
                    canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
                    originalPrice: null,
                    image: null,
                    source: `page-reader-priceInfo(${label})`,
                    antiBotDetected: false,
                  };
                }
              }
            }
          }
        }

        // Strategy B: Use LLM to extract price from the page content
        console.log(`[PageReader] Using LLM to extract price from ${label}...`);

        const contentForLLM = content.slice(0, Math.min(content.length, 60000));

        // Build a more specific prompt that warns about common wrong prices
        const wrongPriceWarning = shareUrl || shareLocale
          ? `CRITICAL: This product is from a share.temu.com link for the Algerian market (locale: ${shareLocale || "dz-en"}). ` +
            `The actual product price is likely between $1-$50 USD (or 300-15000 DZD). ` +
            `IGNORE any price that appears to be exactly $30.00 or 9000 DZD — this is a "delivery guarantee" / "coupon" / "credit" amount, NOT the product price. ` +
            `Also IGNORE prices labeled as "delay credit", "shipping credit", "guarantee", "coupon", "off", or "% discount". ` +
            `The REAL product price is typically shown near the top of the page, often with a "was" / "original" price struck through.`
          : "";

        const completion = await (zai as any).createChatCompletion({
          messages: [
            {
              role: "system",
              content:
                "You are a price extraction assistant for Temu products. " +
                "You will be given HTML content from a Temu product page. " +
                "Extract the SALE PRICE of the MAIN product being viewed. " +
                "IMPORTANT RULES:\n" +
                "1. IGNORE prices from 'recommended', 'you may also like', 'similar', 'related', or 'bought together' sections.\n" +
                "2. ONLY return the price of the product at the TOP of the page (the main product).\n" +
                "3. If you see 'window.rawData', look for price fields like minPrice, salePrice, or price near the goods_id.\n" +
                "4. Look for priceInfo blocks with 'price' (in cents) and 'currency' fields.\n" +
                "5. Prices in DZD (Algerian Dinar) are large numbers (e.g., 900-30000 DA). Prices in USD are small numbers (e.g., $3-$100).\n" +
                "6. If the price is in DZD, convert it: USD = DZD / 300. If in EUR, USD = EUR * 1.08.\n" +
                "7. Do NOT confuse 'delivery guarantee' prices, 'credit for delay' amounts, or '30% OFF' discount percentages with the product price.\n" +
                "8. Do NOT confuse coupon amounts or shipping credits with the product price.\n" +
                "9. ⚠️ ESPECIALLY ignore prices of exactly $30.00 or 9,000 DZD — these are Temu's 'delivery guarantee' amounts, NOT product prices.\n" +
                "10. Return ONLY a JSON object: {\"price_usd\": <number_in_USD>, \"price_local\": \"<amount> <currency>\", \"product_name\": \"<name>\", \"confidence\": \"<high|medium|low>\"}\n" +
                "11. If you cannot find a clear price for the main product, return {\"price_usd\": null, \"confidence\": \"low\"}\n" +
                "12. NEVER guess or estimate a price. Only return a price you actually found in the content.\n" +
                wrongPriceWarning,
            },
            {
              role: "user",
              content:
                `Product goods_id: ${goodsId || "unknown"}\n` +
                `Item ID: ${itemId || "unknown"}\n\n` +
                `Temu page HTML content:\n${contentForLLM}`,
            },
          ],
        });

        const aiResponse = completion.choices?.[0]?.message?.content || "";
        console.log(`[PageReader] LLM response for ${label}:`, aiResponse.slice(0, 300));

        const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            const priceUSD = typeof parsed.price_usd === "number"
              ? parsed.price_usd
              : parseFloat(String(parsed.price_usd));

            if (priceUSD && priceUSD > 0 && priceUSD < 100000) {
              // Skip suspicious $30.00 price (delivery guarantee)
              if (isSuspiciousPrice(priceUSD, `page-reader-llm(${label})`)) {
                console.log(`[PageReader] ⚠️ Skipping suspicious $${priceUSD} price from LLM (${label}) — likely delivery guarantee amount`);
                // Don't return — try next URL
              } else {
                console.log(`[PageReader] ✓ LLM found price from ${label}: $${priceUSD} (confidence: ${parsed.confidence})`);
                return {
                  price: priceUSD,
                  currency: "USD",
                  productName: parsed.product_name || null,
                  productDescription: null,
                  canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
                  originalPrice: null,
                  image: null,
                  source: `page-reader-llm(${label},${parsed.confidence})`,
                  antiBotDetected: false,
                };
              }
            }

            // LLM found product name but no price — useful for later
            if (parsed.product_name) {
              return {
                price: null,
                currency: "USD",
                productName: parsed.product_name,
                productDescription: null,
                canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
                originalPrice: null,
                image: null,
                source: "page-reader-llm(no-price)",
                antiBotDetected: false,
              };
            }
          } catch { /* JSON parse error */ }
        }
      } catch (err) {
        console.log(`[PageReader] Error reading ${label}:`, String(err).slice(0, 100));
        continue;
      }
    }

    return null;
  } catch (err) {
    console.error("[PageReader] Error:", String(err).slice(0, 200));
    return null;
  }
}

/* ───────────────────────────────────────────────────────────────────
 * Strategy 0 (FREE, 0 network): extract everything from URL params.
 *
 * Temu share URLs include everything we need:
 *   - _oak_rec_ext_1     = base64-encoded price in MINOR units (cents)
 *   - top_gallery_url    = URL-encoded product image URL
 *   - pathname slug      = human-readable product name (e.g. "tongue-scrapers--...")
 *
 * This strategy costs ZERO API credits and is INSTANT. We try it first.
 * ─────────────────────────────────────────────────────────────────── */
function extractFromUrlParams(originalUrl: string): TemuProductData | null {
  let parsed: URL;
  try {
    parsed = new URL(originalUrl);
  } catch {
    return null;
  }

  let price: number | null = null;
  let currency = "USD";
  let priceSource = "";

  // Price from _oak_rec_ext_1 (base64-encoded cents)
  const hint = parsed.searchParams.get("_oak_rec_ext_1");
  if (hint) {
    try {
      const b64 = hint.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = Buffer.from(b64, "base64").toString("utf-8").trim();
      const cents = parseInt(decoded.replace(/\D/g, ""), 10);
      if (cents > 0 && cents < 10000000) {
        const usd = cents / 100;
        if (usd >= 0.01 && usd < 100000) {
          price = usd;
          currency = "USD";
          priceSource = "url-hint";
        }
      }
    } catch { /* not valid base64 */ }
  }

  // Product image from top_gallery_url
  let image: string | null = null;
  const topGallery = parsed.searchParams.get("top_gallery_url");
  if (topGallery) {
    try {
      // Validate it's a real URL
      const imgUrl = new URL(topGallery);
      if (imgUrl.protocol === "http:" || imgUrl.protocol === "https:") {
        image = topGallery;
      }
    } catch { /* not a valid URL */ }
  }

  // Product name from URL slug
  let productName: string | null = null;
  const segments = parsed.pathname.split("/").filter(Boolean);
  const slug = segments.find((s) => s.includes("-g-")) || segments[segments.length - 1] || "";
  const nameFromSlug = slug
    .replace(/-g-[a-zA-Z0-9]+\.html?$/i, "")
    .replace(/\.html?$/i, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (nameFromSlug && nameFromSlug.length > 3) {
    productName = nameFromSlug.replace(/\b\w/g, (l) => l.toUpperCase());
  }

  // If we got at least the price (the most important piece), return success
  if (price) {
    return {
      price,
      currency,
      productName,
      productDescription: null,
      canonicalUrl: null,
      originalPrice: null,
      image,
      source: priceSource,
      antiBotDetected: false,
    };
  }

  // No price from URL — return null so caller tries HTML-based strategies
  return null;
}

/* ───────────────────────────────────────────────────────────────────
 * Strategy 0-AI (ZAI Web Search + LLM): most reliable for Temu.
 *
 * Temu aggressively blocks all server-side scraping with anti-bot
 * measures. This strategy uses the ZAI SDK to:
 *   1. Search the web for the product (finds Temu pages indexed by Google)
 *   2. Use the LLM to extract price and product info from search results
 *   3. Convert any non-USD price to USD using known exchange rates
 *
 * This works because Google has already indexed Temu's product pages
 * and includes price snippets in search results, often in the local
 * currency of the Temu locale the page was indexed from.
 * ─────────────────────────────────────────────────────────────────── */

// Known exchange rates for currencies commonly found in Temu search snippets
const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  MUR: 0.022,   // Mauritian Rupee
  OMR: 2.60,    // Omani Rial
  BHD: 2.65,    // Bahraini Dinar
  PKR: 0.0036,  // Pakistani Rupee
  INR: 0.012,   // Indian Rupee
  SAR: 0.27,    // Saudi Riyal
  AED: 0.27,    // UAE Dirham
  KWD: 3.26,    // Kuwaiti Dinar
  QAR: 0.27,    // Qatari Riyal
  EGP: 0.021,   // Egyptian Pound
  JOD: 1.41,    // Jordanian Dinar
  MAD: 0.10,    // Moroccan Dirham
  TND: 0.32,    // Tunisian Dinar
  DZD: 0.00333, // Algerian Dinar (1 USD = 300 DZD, matching business rate)
  CNY: 0.14,    // Chinese Yuan
  JPY: 0.0067,  // Japanese Yen
  KRW: 0.00074, // Korean Won
  PHP: 0.017,   // Philippine Peso
  BRL: 0.18,    // Brazilian Real
  MXN: 0.059,   // Mexican Peso
  TRY: 0.030,   // Turkish Lira
  ZAR: 0.055,   // South African Rand
  AUD: 0.66,    // Australian Dollar
  CAD: 0.74,    // Canadian Dollar
  NZD: 0.61,    // New Zealand Dollar
  SGD: 0.74,    // Singapore Dollar
  HKD: 0.13,    // Hong Kong Dollar
  TWD: 0.031,   // Taiwan Dollar
  THB: 0.029,   // Thai Baht
  VND: 0.000039,// Vietnamese Dong
  MYR: 0.22,    // Malaysian Ringgit
  IDR: 0.000062,// Indonesian Rupiah
  BDT: 0.0083,  // Bangladeshi Taka
  LKR: 0.0033,  // Sri Lankan Rupee
  NPR: 0.0072,  // Nepalese Rupee
};

async function fetchPriceWithWebSearch(
  goodsId: string | null,
  itemId: string | null,
  originalUrl: string,
): Promise<TemuProductData | null> {
  try {
    const zai = await createZAI();

    // Build search query — try different strategies
    let searchQuery = "";
    if (itemId && /^[A-Z]{2}\d+/i.test(itemId)) {
      // Item ID like TV10922608 — search broadly on Temu
      searchQuery = `temu ${itemId}`;
    } else if (goodsId && /^\d{10,}$/.test(goodsId)) {
      // Numeric goods_id — search with the -g- pattern
      searchQuery = `site:temu.com "g-${goodsId}"`;
    } else {
      // Fallback: search with the URL
      const cleanUrl = originalUrl.replace(/https?:\/\//, "").split("?")[0];
      searchQuery = `site:temu.com ${cleanUrl}`;
    }

    console.log(`[WebSearch] Searching: ${searchQuery}`);

    // Step 1: Web search to find the product
    const searchResults = await (zai as any).invokeFunction("web_search", {
      query: searchQuery,
      num: 5,
    });

    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      console.log("[WebSearch] No results found, trying broader search...");

      // Broader search without site: restriction
      const broadQuery = itemId
        ? `temu ${itemId} price`
        : goodsId
          ? `temu ${goodsId} price`
          : `temu ${originalUrl.replace(/https?:\/\//, "").split("?")[0]} price`;

      console.log(`[WebSearch] Broader search: ${broadQuery}`);
      const broadResults = await (zai as any).invokeFunction("web_search", {
        query: broadQuery,
        num: 5,
      });

      if (!Array.isArray(broadResults) || broadResults.length === 0) {
        console.log("[WebSearch] No results from broader search either");
        return null;
      }

      return extractPriceFromSearchResults(zai, broadResults, goodsId, itemId);
    }

    // Step 2: Try to parse price from initial search results
    const initialPrice = parsePriceFromSnippets(searchResults, goodsId);
    if (initialPrice?.price && initialPrice.price > 0) {
      console.log(`[WebSearch] ✓ Found price from initial search: $${initialPrice.price}`);
      return initialPrice;
    }

    // Step 3: If initial search found product names but no prices,
    // try a more targeted search with the product name to find prices
    const productNameFromResults = searchResults
      .filter((r: any) => r.url?.includes("temu.com") && r.name)
      .map((r: any) => r.name?.replace(/\s*[-|]\s*Temu\s*$/i, "").replace(/\s*[-|]\s*(Mauritius|Oman|Bahrain|Ecuador|Pakistan|Algeria|Morocco|Tunisia).*$/i, "").trim())
      .find((n: string) => n && n.length > 10);

    if (productNameFromResults) {
      console.log(`[WebSearch] No price in initial results. Trying name-based search: "${productNameFromResults.slice(0, 60)} price temu"`);
      try {
        const nameQuery = `${productNameFromResults.slice(0, 80)} price temu`;
        const nameResults = await (zai as any).invokeFunction("web_search", {
          query: nameQuery,
          num: 5,
        });
        if (Array.isArray(nameResults) && nameResults.length > 0) {
          const namePrice = parsePriceFromSnippets(nameResults, goodsId);
          if (namePrice?.price && namePrice.price > 0) {
            console.log(`[WebSearch] ✓ Found price from name search: $${namePrice.price}`);
            return namePrice;
          }
          // Merge results and try LLM on combined results
          const combinedResults = [...searchResults, ...nameResults];
          return extractPriceFromSearchResults(zai, combinedResults, goodsId, itemId);
        }
      } catch (err) {
        console.log("[WebSearch] Name search failed:", String(err).slice(0, 80));
      }
    }

    // Step 4: Use LLM on whatever results we have
    const llmResult = await extractPriceFromSearchResults(zai, searchResults, goodsId, itemId);
    if (llmResult?.price && llmResult.price > 0) {
      return llmResult;
    }

    // Step 5: If LLM didn't find price, try reading Temu search result pages
    // via AllOrigins proxy — sometimes the proxy can access the product page
    // when direct access is blocked
    const temuResults = searchResults
      .filter((r: any) => r.url?.includes("temu.com") && r.url?.includes("-g-"))
      .slice(0, 2);

    for (const result of temuResults) {
      try {
        console.log(`[WebSearch] Trying AllOrigins for search result: ${result.url.slice(0, 80)}...`);
        // Try both /raw and /get endpoints
        const proxyUrls = [
          `https://api.allorigins.win/raw?url=${encodeURIComponent(result.url)}`,
          `https://api.allorigins.win/get?url=${encodeURIComponent(result.url)}`,
        ];

        let proxyHtml: string | null = null;

        for (const pUrl of proxyUrls) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const proxyRes = await fetch(pUrl, { signal: controller.signal });
            clearTimeout(timeout);
            if (!proxyRes.ok) continue;

            const isRaw = pUrl.includes("/raw?");
            if (isRaw) {
              const text = await proxyRes.text();
              if (text && text.length > 5000 && text.includes("<")) {
                proxyHtml = text;
                break;
              }
            } else {
              const data = await proxyRes.json();
              const contents = typeof data === "string" ? data : data?.contents;
              if (contents && typeof contents === "string" && contents.length > 5000) {
                proxyHtml = contents;
                break;
              }
            }
          } catch { /* try next */ }
        }

        if (!proxyHtml || proxyHtml.length < 5000) continue;

        // Check if we got the real product page (has OG title)
        const hasOGTitle = /<meta[^>]*property=["']og:title["']/i.test(proxyHtml);
        if (!hasOGTitle) continue;

        // Extract price using extractProductInfo
        const proxyResult = extractProductInfo(proxyHtml, result.url);
        if (proxyResult.price && proxyResult.price > 0) {
          console.log(`[WebSearch] ✓ Got price $${proxyResult.price} from AllOrigins search result`);
          return proxyResult;
        }

        // Also try direct OG price extraction
        const ogPriceMatch = proxyHtml.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
        const ogCurrencyMatch = proxyHtml.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
        if (ogPriceMatch) {
          const priceVal = parseFloat(ogPriceMatch[1]);
          const cur = ogCurrencyMatch?.[1] || "USD";
          if (priceVal > 0 && priceVal < 100000) {
            let priceUSD = priceVal;
            if (cur !== "USD" && CURRENCY_TO_USD[cur]) {
              priceUSD = Math.round(priceVal * CURRENCY_TO_USD[cur] * 100) / 100;
            }
            const ogTitle = proxyHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
            const ogImage = proxyHtml.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
            const foundGoodsId = result.url.match(/-g-(\d{10,})/)?.[1] || goodsId;
            console.log(`[WebSearch] ✓ Got OG price ${priceVal} ${cur} = $${priceUSD} from AllOrigins search result`);
            return {
              price: priceUSD,
              currency: "USD",
              productName: ogTitle ? decodeHtmlEntities(ogTitle).replace(/\s*[-|]\s*Temu\s*$/i, "").trim() : null,
              productDescription: null,
              canonicalUrl: foundGoodsId ? `https://www.temu.com/-g-${foundGoodsId}.html` : null,
              originalPrice: null,
              image: ogImage || null,
              source: `websearch-allorigins-og(${cur})`,
              antiBotDetected: false,
            };
          }
        }
      } catch (err) {
        console.log(`[WebSearch] AllOrigins for search result failed:`, String(err).slice(0, 80));
      }
    }

    return llmResult; // Return whatever the LLM found (may be null)
  } catch (err) {
    console.error("[WebSearch] Error:", String(err).slice(0, 200));
    return null;
  }
}

async function extractPriceFromSearchResults(
  zai: any,
  searchResults: any[],
  goodsId: string | null,
  itemId: string | null,
): Promise<TemuProductData | null> {
  // Step 2: Try to parse prices directly from search snippets first (fast, no LLM cost)
  const snippetPrice = parsePriceFromSnippets(searchResults, goodsId);
  if (snippetPrice?.price && snippetPrice.price > 0) {
    console.log(`[WebSearch] ✓ Found price from snippet: ${snippetPrice.price} USD (source: ${snippetPrice.source})`);
    return snippetPrice;
  }

  // Step 3: If snippets don't have a clear price, use LLM to extract
  console.log("[WebSearch] Snippets don't have clear price, using LLM...");

  const searchContext = searchResults
    .slice(0, 5)
    .map(
      (r: any, i: number) =>
        `${i + 1}. ${r.name || "No title"}\n   URL: ${r.url}\n   Snippet: ${r.snippet || "No snippet"}`,
    )
    .join("\n\n");

  try {
    const completion = await zai.createChatCompletion({
      messages: [
        {
          role: "system",
          content:
            'You are a price extraction assistant for Temu products. Extract the product price from the search results. ' +
            'Return ONLY a JSON object with: {"price_usd": <number_in_USD>, "name": "<product_name>", "currency": "<original_currency>", "original_price": <number_before_conversion>, "confidence": <high|medium|low>}. ' +
            'If the price is in a non-USD currency, CONVERT it to USD using approximate exchange rates. ' +
            'Common conversions: MUR→USD ÷47, OMR→USD ×2.60, BHD→USD ×2.65, PKR→USD ÷278, EUR→USD ×1.08, GBP→USD ×1.27, SAR→USD ×0.27, AED→USD ×0.27. ' +
            'If you cannot find a clear price, return {"price_usd": null, "name": "<best_guess_name>", "confidence": "low"}. ' +
            'ALWAYS return valid JSON. The price_usd must be a number, not a string. ' +
            'IMPORTANT: Do NOT estimate or guess the price. If the search results do not contain a clear price for this specific product, return null. ' +
            'Do NOT confuse "delivery guarantee" prices, "credit for delay" amounts, or "30% OFF" discount percentages with the product price. ' +
            'Do NOT use prices from unrelated products. Only extract the price that clearly corresponds to the product with the given goods_id or Item ID.',
        },
        {
          role: "user",
          content:
            `Product goods_id: ${goodsId || "unknown"}\n` +
            `Item ID: ${itemId || "unknown"}\n\n` +
            `Search Results:\n${searchContext}\n\n` +
            `Extract the product price in USD from these results. Return JSON only.`,
        },
      ],
    });

    const aiResponse = completion.choices?.[0]?.message?.content || "";
    console.log("[WebSearch] LLM response:", aiResponse.slice(0, 300));

    // Parse AI response — extract JSON
    const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.log("[WebSearch] No JSON in LLM response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const priceUSD = typeof parsed.price_usd === "number"
      ? parsed.price_usd
      : parseFloat(String(parsed.price_usd));

    if (priceUSD && priceUSD > 0 && priceUSD < 100000) {
      console.log(`[WebSearch] ✓ LLM found price: $${priceUSD} (confidence: ${parsed.confidence})`);
      return {
        price: priceUSD,
        currency: "USD",
        productName: parsed.name || null,
        productDescription: null,
        canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
        originalPrice: null,
        image: null, // Image will come from share URL params
        source: `web-search-llm(${parsed.confidence})`,
        antiBotDetected: false,
      };
    }

    // LLM couldn't find price either — return what we can
    if (parsed.name) {
      return {
        price: null,
        currency: "USD",
        productName: parsed.name,
        productDescription: null,
        canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
        originalPrice: null,
        image: null,
        source: "web-search-llm(no-price)",
        antiBotDetected: false,
      };
    }

    return null;
  } catch (err) {
    console.error("[WebSearch] LLM error:", String(err).slice(0, 150));
    return null;
  }
}

/**
 * Try to parse prices directly from search result snippets.
 * This avoids the cost of an LLM call and is often sufficient
 * because Google includes price info in Temu search snippets.
 */
function parsePriceFromSnippets(
  results: any[],
  goodsId: string | null,
): TemuProductData | null {
  // Look for Temu results that have price info in snippets
  for (const result of results) {
    if (!result.url?.includes("temu.com")) continue;
    if (!result.snippet) continue;

    const snippet = result.snippet;

    // Extract the goods_id from the URL if we don't have it
    let foundGoodsId = goodsId;
    if (!foundGoodsId) {
      const gMatch = result.url.match(/-g-(\d{10,})/);
      if (gMatch) foundGoodsId = gMatch[1];
    }

    // Extract product name from search result
    const productName = result.name
      ?.replace(/\s*[-|]\s*Temu\s*$/i, "")
      .replace(/\s*[-|]\s*(Mauritius|Oman|Bahrain|Ecuador|Pakistan|Algeria|Morocco|Tunisia).*$/i, "")
      .trim() || null;

    // Determine the local currency from the Temu URL locale prefix
    // e.g. /mu/ → MUR, /pk-en/ → PKR, /om-en/ → OMR, /bh/ → BHD, etc.
    let localCurrency = "USD";
    const localeMatch = result.url.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i);
    if (localeMatch) {
      const locale = localeMatch[1].toLowerCase();
      const localeToCurrency: Record<string, string> = {
        mu: "MUR",       // Mauritius
        pk: "PKR", "pk-en": "PKR", "pk-ur": "PKR", // Pakistan
        om: "OMR", "om-en": "OMR", "om-ar": "OMR", // Oman
        bh: "BHD", "bh-en": "BHD", "bh-ar": "BHD", // Bahrain
        sa: "SAR", "sa-en": "SAR", "sa-ar": "SAR", // Saudi Arabia
        ae: "AED", "ae-en": "AED", "ae-ar": "AED", // UAE
        eg: "EGP", "eg-en": "EGP", "eg-ar": "EGP", // Egypt
        ma: "MAD", "ma-en": "MAD", "ma-ar": "MAD", "ma-fr": "MAD", // Morocco
        tn: "TND", "tn-en": "TND", "tn-ar": "TND", "tn-fr": "TND", // Tunisia
        dz: "DZD", "dz-en": "DZD", "dz-ar": "DZD", "dz-fr": "DZD", // Algeria
        kw: "KWD", "kw-en": "KWD", "kw-ar": "KWD", // Kuwait
        qa: "QAR", "qa-en": "QAR", "qa-ar": "QAR", // Qatar
        jo: "JOD", "jo-en": "JOD", "jo-ar": "JOD", // Jordan
        ec: "USD", "ec-es": "USD", // Ecuador (uses USD)
        lk: "LKR", "lk-en": "LKR", "lk-si": "LKR", "lk-ta": "LKR", // Sri Lanka
        np: "NPR", "np-en": "NPR", // Nepal
        bd: "BDT", "bd-en": "BDT", // Bangladesh
        in: "INR", "in-en": "INR", "in-hi": "INR", // India
        ph: "PHP", "ph-en": "PHP", // Philippines
        br: "BRL", "br-pt": "BRL", // Brazil
        mx: "MXN", "mx-es": "MXN", // Mexico
      };
      const found = localeToCurrency[locale];
      if (found) localCurrency = found;
    }

    // Try to find a price in the snippet
    // We'll use the URL locale to determine the correct currency for "Rs" amounts
    // Common patterns:
    //   "Rs 157.77 35% OFF"     → Rs means local rupee based on locale
    //   "$6.99"                  → USD
    //   "OMR 1.200"             → Omani Rial
    //   "6,399 Rs.2,612 59% OFF" → number Rs. = sale price in local rupee
    //   "€5.99"                  → EUR
    //   "£4.99"                  → GBP

    // Determine if this locale uses European comma format (comma = decimal separator)
    // e.g., Ecuador (ec), Spain (es), Mexico (mx), Brazil (br), France (ma-fr, tn-fr)
    const europeanCommaLocales = new Set([
      "ec", "ec-es", "mx", "mx-es", "br", "br-pt",
      "ma-fr", "tn-fr", // French-speaking locales
    ]);
    const usesEuropeanComma = europeanCommaLocales.has(localCurrency === "USD" && localeMatch ? localeMatch[1].toLowerCase() : "") ||
      (result.url.match(/temu\.com\/(ec|mx|br)\b/i) != null);

    // Helper: parse price string respecting locale format
    // European format: "5,22" = 5.22, "1.234,56" = 1234.56
    // English format:  "5.22" = 5.22, "1,234.56" = 1234.56
    const parsePriceString = (priceStr: string, isEuropean: boolean): number => {
      if (isEuropean) {
        // European: remove dots (thousands), replace comma with dot (decimal)
        return parseFloat(priceStr.replace(/\./g, "").replace(",", "."));
      } else {
        // English: remove commas (thousands)
        return parseFloat(priceStr.replace(/,/g, ""));
      }
    };

    // First, try explicit currency patterns (most reliable)
    const explicitPatterns: { pattern: RegExp; currency: string }[] = [
      { pattern: /\$\s*([\d,]+(?:\.\d{1,2})?)/, currency: "USD" },
      { pattern: /€\s*([\d,]+(?:\.\d{1,2})?)/, currency: "EUR" },
      { pattern: /£\s*([\d,]+(?:\.\d{1,2})?)/, currency: "GBP" },
      { pattern: /OMR\s*([\d,]+(?:\.\d{1,3})?)/, currency: "OMR" },
      { pattern: /BHD\s*([\d,]+(?:\.\d{1,3})?)/, currency: "BHD" },
      { pattern: /SAR\s*([\d,]+(?:\.\d{1,2})?)/, currency: "SAR" },
      { pattern: /AED\s*([\d,]+(?:\.\d{1,2})?)/, currency: "AED" },
      { pattern: /PKR\s*([\d,]+(?:\.\d{1,2})?)/, currency: "PKR" },
      { pattern: /EGP\s*([\d,]+(?:\.\d{1,2})?)/, currency: "EGP" },
      { pattern: /MAD\s*([\d,]+(?:\.\d{1,2})?)/, currency: "MAD" },
      { pattern: /TND\s*([\d,]+(?:\.\d{1,3})?)/, currency: "TND" },
      { pattern: /DZD\s*([\d,]+(?:\.\d{1,2})?)/, currency: "DZD" },
      { pattern: /KWD\s*([\d,]+(?:\.\d{1,3})?)/, currency: "KWD" },
      { pattern: /QAR\s*([\d,]+(?:\.\d{1,2})?)/, currency: "QAR" },
      { pattern: /JOD\s*([\d,]+(?:\.\d{1,3})?)/, currency: "JOD" },
      { pattern: /INR\s*([\d,]+(?:\.\d{1,2})?)/, currency: "INR" },
      { pattern: /BDT\s*([\d,]+(?:\.\d{1,2})?)/, currency: "BDT" },
      { pattern: /LKR\s*([\d,]+(?:\.\d{1,2})?)/, currency: "LKR" },
      { pattern: /NPR\s*([\d,]+(?:\.\d{1,2})?)/, currency: "NPR" },
      { pattern: /PHP\s*([\d,]+(?:\.\d{1,2})?)/, currency: "PHP" },
      { pattern: /BRL\s*([\d,]+(?:\.\d{1,2})?)/, currency: "BRL" },
      { pattern: /MXN\s*([\d,]+(?:\.\d{1,2})?)/, currency: "MXN" },
    ];

    for (const { pattern, currency } of explicitPatterns) {
      const match = snippet.match(pattern);
      if (match) {
        // For USD prices on European locale pages (like Ecuador), use comma-as-decimal parsing
        const isEuroPrice = currency === "USD" && usesEuropeanComma;
        const localPrice = parsePriceString(match[1], isEuroPrice);
        if (localPrice > 0 && localPrice < 10000000) {
          const rate = CURRENCY_TO_USD[currency];
          if (rate) {
            const usdPrice = Math.round(localPrice * rate * 100) / 100;
            if (usdPrice >= 0.10 && usdPrice <= 5000) {
              console.log(`[WebSearch] Found explicit price: ${localPrice} ${currency} (European format: ${isEuroPrice}) = $${usdPrice} USD`);
              return {
                price: usdPrice,
                currency: "USD",
                productName,
                productDescription: null,
                canonicalUrl: foundGoodsId ? `https://www.temu.com/-g-${foundGoodsId}.html` : null,
                originalPrice: null,
                image: null,
                source: `web-search-snippet(${currency})`,
                antiBotDetected: false,
              };
            }
          }
        }
      }
    }

    // Also try European comma format pattern for $ prices (e.g., "$5,22" on Ecuador page)
    // This catches prices where the comma is used as decimal separator
    if (usesEuropeanComma) {
      const euroPattern = /\$\s*(\d+,\d{1,2})\b/;
      const euroMatch = snippet.match(euroPattern);
      if (euroMatch) {
        const localPrice = parseFloat(euroMatch[1].replace(",", "."));
        if (localPrice > 0 && localPrice < 10000000) {
          const usdPrice = Math.round(localPrice * 100) / 100; // Already USD
          if (usdPrice >= 0.10 && usdPrice <= 5000) {
            console.log(`[WebSearch] Found European format price: ${euroMatch[0]} = $${usdPrice} USD`);
            return {
              price: usdPrice,
              currency: "USD",
              productName,
              productDescription: null,
              canonicalUrl: foundGoodsId ? `https://www.temu.com/-g-${foundGoodsId}.html` : null,
              originalPrice: null,
              image: null,
              source: "web-search-snippet(USD-european)",
              antiBotDetected: false,
            };
          }
        }
      }
    }

    // Second, try "Rs" pattern — use the URL locale to determine the currency
    // Rs could be MUR (Mauritius), PKR (Pakistan), LKR (Sri Lanka), NPR (Nepal)
    const rsMatch = snippet.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/);
    if (rsMatch) {
      const localPrice = parseFloat(rsMatch[1].replace(/,/g, ""));
      const rsCurrency = localCurrency; // Determined from URL locale above
      if (localPrice > 0 && localPrice < 10000000) {
        const rate = CURRENCY_TO_USD[rsCurrency];
        if (rate) {
          const usdPrice = Math.round(localPrice * rate * 100) / 100;
          if (usdPrice >= 0.10 && usdPrice <= 5000) {
            console.log(`[WebSearch] Found Rs price: ${localPrice} ${rsCurrency} (from locale) = $${usdPrice} USD`);
            return {
              price: usdPrice,
              currency: "USD",
              productName,
              productDescription: null,
              canonicalUrl: foundGoodsId ? `https://www.temu.com/-g-${foundGoodsId}.html` : null,
              originalPrice: null,
              image: null,
              source: `web-search-snippet(Rs→${rsCurrency})`,
              antiBotDetected: false,
            };
          }
        }
      }
    }

    // Third, try number followed by Rs (reverse pattern)
    const rsReverseMatch = snippet.match(/([\d,]+(?:\.\d{1,2})?)\s*Rs\.?/);
    if (rsReverseMatch) {
      const localPrice = parseFloat(rsReverseMatch[1].replace(/,/g, ""));
      const rsCurrency = localCurrency;
      if (localPrice > 0 && localPrice < 10000000) {
        const rate = CURRENCY_TO_USD[rsCurrency];
        if (rate) {
          const usdPrice = Math.round(localPrice * rate * 100) / 100;
          if (usdPrice >= 0.10 && usdPrice <= 5000) {
            console.log(`[WebSearch] Found Rs price (reverse): ${localPrice} ${rsCurrency} = $${usdPrice} USD`);
            return {
              price: usdPrice,
              currency: "USD",
              productName,
              productDescription: null,
              canonicalUrl: foundGoodsId ? `https://www.temu.com/-g-${foundGoodsId}.html` : null,
              originalPrice: null,
              image: null,
              source: `web-search-snippet(Rs→${rsCurrency})`,
              antiBotDetected: false,
            };
          }
        }
      }
    }
  }

  return null;
}

/* ───────────────────────────────────────────────────────────────────
 * Strategy 1 (FREE): direct fetch with browser-like headers.
 *
 * Many sites (including Temu) serve OG meta tags in the initial HTML
 * response without requiring JavaScript rendering. A direct fetch with
 * realistic headers often works — and it costs nothing.
 * ─────────────────────────────────────────────────────────────────── */
async function fetchDirect(url: string): Promise<TemuProductData | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif," +
          "image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`[Direct] HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    console.log(`[Direct] HTML length: ${html.length}`);

    if (html.length < 1000) return null; // Likely an error page

    const result = extractProductInfo(html, url);
    const isAntiBot = html.length < 450000 && (html.match(/verify/gi) || []).length > 100;

    if (result.productName || result.price) {
      return {
        ...result,
        antiBotDetected: isAntiBot,
        source: isAntiBot ? "direct-og" : "direct-full",
      };
    }
    return null;
  } catch (err) {
    console.log("[Direct] Error:", String(err).slice(0, 100));
    return null;
  }
}

/* ───────────────────────────────────────────────────────────────────
 * Strategy 2 (FREE): AllOrigins CORS proxy.
 * Public free proxy, no API key required.
 * https://api.allorigins.win/get?url=<encoded>
 * ─────────────────────────────────────────────────────────────────── */
async function fetchViaAllOrigins(url: string): Promise<TemuProductData | null> {
  try {
    // Try both /raw and /get endpoints — /raw returns HTML directly,
    // /get returns JSON with contents field. /raw is often more reliable.
    const proxyUrls = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    ];

    for (const proxyUrl of proxyUrls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const response = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) continue;

        const isRaw = proxyUrl.includes("/raw?");
        let html: string | null = null;

        if (isRaw) {
          html = await response.text();
          if (!html || html.length < 1000 || !html.includes("<")) continue;
        } else {
          const data = await response.json();
          html = typeof data === "string" ? data : data?.contents;
          if (!html || typeof html !== "string" || html.length < 1000) continue;
        }

        console.log(`[AllOrigins] HTML length: ${html.length} (via ${isRaw ? "/raw" : "/get"})`);
        const result = extractProductInfo(html, url);
        if (result.productName || result.price) {
          return { ...result, source: result.source || "allorigins" };
        }
      } catch { /* try next endpoint */ }
    }

    return null;
  } catch (err) {
    console.log("[AllOrigins] Error:", String(err).slice(0, 100));
    return null;
  }
}

/* ───────────────────────────────────────────────────────────────────
 * Strategy 3 (FREE): Multiple CORS proxies — try several in order.
 * corsproxy.io and corsproxy.org are public free proxies.
 * ─────────────────────────────────────────────────────────────────── */
async function fetchViaCorsProxy(url: string): Promise<TemuProductData | null> {
  const proxies = [
    { name: "corsproxy.io", url: `https://corsproxy.io/?url=${encodeURIComponent(url)}` },
    { name: "corsproxy.org", url: `https://corsproxy.org/?${encodeURIComponent(url)}` },
  ];

  for (const proxy of proxies) {
    try {
      console.log(`[CorsProxy] Trying ${proxy.name}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(proxy.url, {
        signal: controller.signal,
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.log(`[CorsProxy ${proxy.name}] HTTP ${response.status}`);
        continue;
      }

      const html = await response.text();
      if (html.length < 1000) continue;

      console.log(`[CorsProxy ${proxy.name}] HTML length: ${html.length}`);
      const result = extractProductInfo(html, url);
      if (result.productName || result.price) {
        return { ...result, source: result.source || `corsproxy-${proxy.name}` };
      }
    } catch (err) {
      console.log(`[CorsProxy ${proxy.name}] Error:`, String(err).slice(0, 80));
    }
  }
  return null;
}

/* ───────────────────────────────────────────────────────────────────
 * Strategy 0b (FREE): Temu BG API — fetch product JSON by goods_id.
 *
 * Temu's product pages use a backend API endpoint that returns product
 * details as JSON. By calling this API directly with a goods_id, we can
 * get accurate price, name, and image data without needing to parse HTML.
 * This is especially useful for:
 *   - share.temu.com short links (after resolving to get goods_id)
 *   - Item IDs like TV10922608 (treated as goods_id)
 *   - Any URL where we extracted a goods_id
 *
 * Endpoint: https://www.temu.com/bg/goods/api
 *   POST with JSON body: { goods_id: "<id>" }
 *   Returns: { result: { goods: { price: ..., minPrice: ..., name: ..., thumbUrl: ... } } }
 * ─────────────────────────────────────────────────────────────────── */
async function fetchTemuBgApi(goodsId: string): Promise<TemuProductData | null> {
  // Try multiple Temu API endpoints for product details
  const apiEndpoints = [
    { url: "https://www.temu.com/bg/goods/api", body: { goods_id: goodsId } },
    { url: "https://www.temu.com/api/ego/product/detail", body: { goods_id: goodsId, _x_sessn: "us" } },
  ];

  for (const endpoint of apiEndpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(endpoint.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Origin: "https://www.temu.com",
          Referer: `https://www.temu.com/-g-${goodsId}.html`,
        },
        body: JSON.stringify(endpoint.body),
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.log(`[BG API ${endpoint.url}] HTTP ${response.status}`);
        continue;
      }

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        // Not JSON — skip this endpoint
        console.log(`[BG API ${endpoint.url}] Non-JSON response`);
        continue;
      }

      const goods = data?.result?.goods || data?.result?.data;
      if (!goods) {
        console.log(`[BG API ${endpoint.url}] No goods data in response`);
        continue;
      }

      console.log(`[BG API ${endpoint.url}] Got product data: name="${(goods.name || "").slice(0, 50)}", price=${goods.minPrice || goods.price}`);

      // Extract price — Temu API returns prices in cents (minor units)
      let price: number | null = null;
      let currency = "USD";
      let originalPrice: number | null = null;

      // Try minPrice first (usually the sale price)
      if (goods.minPrice !== undefined && goods.minPrice !== null) {
        const raw = typeof goods.minPrice === "string" ? parseFloat(goods.minPrice) : goods.minPrice;
        if (raw > 0) {
          price = raw > 100 ? raw / 100 : raw;
        }
      }
      // Fallback to price field
      if (!price && goods.price !== undefined && goods.price !== null) {
        const raw = typeof goods.price === "string" ? parseFloat(goods.price) : goods.price;
        if (raw > 0) {
          price = raw > 100 ? raw / 100 : raw;
        }
      }
      // Try marketPrice for original price
      if (goods.marketPrice !== undefined && goods.marketPrice !== null) {
        const raw = typeof goods.marketPrice === "string" ? parseFloat(goods.marketPrice) : goods.marketPrice;
        if (raw > 0) {
          originalPrice = raw > 100 ? raw / 100 : raw;
        }
      }

      // Extract product name
      const productName = goods.name || goods.goodsName || goods.title || null;

      // Extract image
      const image = goods.thumbUrl || goods.imageUrl || goods.picUrl || null;

      return {
        price,
        currency,
        productName,
        productDescription: goods.desc || goods.description || null,
        canonicalUrl: `https://www.temu.com/-g-${goodsId}.html`,
        originalPrice,
        image,
        source: "temu-bg-api",
      };
    } catch (err) {
      console.log(`[BG API ${endpoint.url}] Error:`, String(err).slice(0, 80));
    }
  }
  return null;
}

/* ───────────────────────────────────────────────────────────────────
 * Strategy 0b-2: Fetch product by Item ID (like TV10922608)
 *
 * Temu supports Item IDs in the URL format /-i-<itemId>.html
 * We try to fetch this URL and extract the goods_id from the redirect
 * or HTML content, then use the goods_id to get the product data.
 * ─────────────────────────────────────────────────────────────────── */
async function fetchTemuByItemId(itemId: string): Promise<(TemuProductData & { foundGoodsId?: string }) | null> {
  try {
    // Try direct fetch of the Item ID URL
    const itemUrl = `https://www.temu.com/-i-${itemId}.html?_x_sessn=us&currency=USD`;
    console.log(`[ItemId] Fetching: ${itemUrl}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(itemUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`[ItemId] HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    console.log(`[ItemId] HTML length: ${html.length}`);

    if (html.length < 1000) return null;

    // Extract goods_id from the response URL or HTML
    let foundGoodsId: string | null = null;
    const finalResponseUrl = response.url || "";
    const gMatch = finalResponseUrl.match(/-g-(\d{10,})/);
    if (gMatch) {
      foundGoodsId = gMatch[1];
    }
    if (!foundGoodsId) {
      const gMatch2 = html.match(/-g-(\d{10,})/);
      if (gMatch2) foundGoodsId = gMatch2[1];
    }
    if (!foundGoodsId) {
      const gidMatch = html.match(/"goods_id"\s*:\s*"?(\d{10,})"?/);
      if (gidMatch) foundGoodsId = gidMatch[1];
    }

    if (foundGoodsId) {
      console.log(`[ItemId] Found goods_id: ${foundGoodsId}`);
      // Now use the BG API to get accurate price data
      const apiResult = await fetchTemuBgApi(foundGoodsId);
      if (apiResult) {
        return { ...apiResult, foundGoodsId };
      }

      // If BG API failed, try extracting from HTML
      const htmlResult = extractProductInfo(html, itemUrl);
      if (htmlResult.price || htmlResult.productName) {
        return { ...htmlResult, foundGoodsId, source: htmlResult.source || "itemid-html" };
      }
    }

    // No goods_id found, try extracting product info directly from HTML
    const result = extractProductInfo(html, itemUrl);
    if (result.price || result.productName) {
      return { ...result, source: result.source || "itemid-direct" };
    }

    return null;
  } catch (err) {
    console.log("[ItemId] Error:", String(err).slice(0, 100));
    return null;
  }
}

/* ───────────────────────────────────────────────────────────────────
 * Strategy 4 (LAST RESORT, PAID): ScrapingBee.
 * Only used when free strategies fail AND SCRAPINGBEE_API_KEY is set.
 * To run in 100% free mode, simply remove the env var.
 * ─────────────────────────────────────────────────────────────────── */
async function fetchWithScrapingBee(url: string): Promise<TemuProductData | null> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) return null;

  // Always add ?_x_sessn=us&currency=USD to force US site (gives cleaner data)
  let fetchUrl = url;
  try {
    const parsed = new URL(fetchUrl);
    if (!parsed.searchParams.has("_x_sessn")) {
      parsed.searchParams.set("_x_sessn", "us");
      parsed.searchParams.set("currency", "USD");
      fetchUrl = parsed.toString();
    }
  } catch { /* not a parseable URL, use as-is */ }

  // Retry up to 3 times - Temu's anti-bot is probabilistic, sometimes we get the real page
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const apiUrl = new URL("https://app.scrapingbee.com/api/v1/");
      apiUrl.searchParams.set("api_key", apiKey);
      apiUrl.searchParams.set("url", fetchUrl);
      apiUrl.searchParams.set("render_js", "true");
      apiUrl.searchParams.set("premium_proxy", "true");
      apiUrl.searchParams.set("country_code", "us");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(apiUrl.toString(), {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        lastError = `ScrapingBee HTTP ${response.status}`;
        console.error(`[ScrapingBee attempt ${attempt}] ${lastError}`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const html = await response.text();
      console.log(`[ScrapingBee attempt ${attempt}] HTML length: ${html.length}, cost: ${response.headers.get("Spb-cost")} credits`);

      const result = extractProductInfo(html, url);

      // If we got the real product page (not anti-bot), use it
      // Heuristic: anti-bot page is ~310-325KB and has many "verify" mentions
      const isAntiBot = html.length < 450000 && (html.match(/verify/gi) || []).length > 100;

      if (result.productName || result.price) {
        return {
          ...result,
          antiBotDetected: isAntiBot,
          source: isAntiBot ? "scrapingbee-og" : "scrapingbee-full",
        };
      }

      // Got a page but no useful data — retry
      lastError = "Page returned but no product info extracted";
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      lastError = String(err).slice(0, 150);
      console.error(`[ScrapingBee attempt ${attempt}] Error:`, lastError);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.error("[ScrapingBee] All attempts failed. Last error:", lastError);
  return null;
}

/* ─── Extraction: focus on OG meta tags (always work) + JSON price fields ─── */
function extractProductInfo(html: string, originalUrl: string): TemuProductData {
  // 1. OG meta tags (work even on anti-bot page)
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
  const ogDescription = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
  const ogUrl = html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] || ogUrl;

  // Decode HTML entities in title
  const productName = ogTitle ? decodeHtmlEntities(ogTitle).replace(/\s*[-|]\s*Temu\s*$/i, "").trim() : null;
  const productDescription = ogDescription ? decodeHtmlEntities(ogDescription) : null;

  // 2. Try to find price (rarely works due to Temu anti-bot, but try anyway)
  let price: number | null = null;
  let currency = "USD";
  let originalPrice: number | null = null;
  let priceSource = "";

  // ─────────────────────────────────────────────────────────────
  // 2-preferred. URL-embedded price hint.
  // Temu product URLs often include `_oak_rec_ext_1=<base64>` which is
  // the base64-encoded price in MINOR UNITS (cents). E.g. "MTIz" → "123"
  // → 1.23 USD. This is the most reliable signal because it comes
  // straight from the share URL the user copied.
  // ─────────────────────────────────────────────────────────────
  try {
    const parsedUrl = new URL(originalUrl);
    const hint = parsedUrl.searchParams.get("_oak_rec_ext_1");
    if (hint) {
      // base64 decode (URL-safe variant — replace - with + and _ with /)
      const b64 = hint.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = Buffer.from(b64, "base64").toString("utf-8").trim();
      // Strip non-digits
      const cents = parseInt(decoded.replace(/\D/g, ""), 10);
      if (cents > 0 && cents < 10000000) {
        // Heuristic: if the decoded value looks like cents (>= 10), divide by 100.
        // If it already looks like a dollar amount (>= 1000 → assume already in cents).
        const usd = cents / 100;
        if (usd >= 0.01 && usd < 100000) {
          price = usd;
          currency = "USD";
          priceSource = "url-hint";
        }
      }
    }
  } catch { /* not a parseable URL */ }

  // 2a. JSON-LD structured data
  if (!price) {
    const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      try {
        const data = JSON.parse(match[1]);
        const schemas = Array.isArray(data) ? data : [data];
        for (const schema of schemas) {
          if (schema["@type"] === "Product" && schema.offers) {
            const offers = Array.isArray(schema.offers) ? schema.offers : [schema.offers];
            for (const offer of offers) {
              if (offer.price !== undefined) {
                price = parseFloat(offer.price);
                currency = offer.priceCurrency || "USD";
                priceSource = "json-ld";
                break;
              }
            }
          }
        }
      } catch { /* skip */ }
      if (price) break;
    }
  }

  // 2b. OG product:price:amount meta
  if (!price) {
    const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
    if (ogPrice) {
      const p = parseFloat(ogPrice[1]);
      if (p > 0) {
        price = p;
        const ogCur = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
        currency = ogCur?.[1] || "USD";
        priceSource = "og-meta";
      }
    }
  }

  // 2c. Embedded JSON priceInfo blocks (this is what Temu uses)
  //     IMPORTANT: Temu pages contain many priceInfo blocks (one per variant,
  //     one per "similar product", one per cross-sell, etc.). The previous
  //     implementation picked the FIRST match, which often returned a
  //     cross-sell product's price (e.g. $30) instead of the actual
  //     product's price (e.g. $1.23). We now collect ALL matches and
  //     pick the LOWEST plausible one, since the actual product the user
  //     is viewing is almost always the cheapest among the rendered
  //     priceInfo blocks.
  if (!price) {
    type Candidate = { usd: number; currency: string; marketUsd?: number };
    const candidates: Candidate[] = [];

    // priceInfo with explicit priceStr (most reliable)
    const priceInfosWithStr = [...html.matchAll(
      /"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"[^}]*?"priceStr"\s*:\s*"([^"]+)"/g
    )];
    for (const pi of priceInfosWithStr) {
      const cents = parseInt(pi[1]);
      const cur = pi[2];
      const priceStr = pi[3];
      // Skip i18n placeholder strings
      if (/OK|Btn|Label|Placeholder/i.test(priceStr)) continue;
      if (cents <= 0 || cents >= 100000000) continue;
      const usd = cents / 100;
      if (usd < 0.01 || usd > 100000) continue;
      const marketPriceMatch = pi[0].match(/"marketPrice"\s*:\s*(\d+)/);
      const marketUsd = marketPriceMatch ? parseInt(marketPriceMatch[1]) / 100 : undefined;
      candidates.push({ usd, currency: cur, marketUsd });
    }

    // priceInfo without priceStr (broader fallback)
    if (candidates.length === 0) {
      const priceInfosAll = [...html.matchAll(
        /"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g
      )];
      for (const pi of priceInfosAll) {
        const cents = parseInt(pi[1]);
        const cur = pi[2];
        if (cents <= 50 || cents >= 100000000) continue;
        const usd = cents / 100;
        if (usd < 0.50 || usd > 100000) continue;
        candidates.push({ usd, currency: cur });
      }
    }

    if (candidates.length > 0) {
      // Pick the LOWEST price — the user is always viewing the cheapest
      // variant of the actual product, not the cross-sells.
      candidates.sort((a, b) => a.usd - b.usd);
      const best = candidates[0];
      price = best.usd;
      currency = best.currency;
      if (best.marketUsd && best.marketUsd > best.usd) {
        originalPrice = best.marketUsd;
      }
      priceSource = `priceInfo(lowest of ${candidates.length})`;
    }
  }

  // 2d. Embedded JSON price fields (broad regex sweep)
  if (!price) {
    const fields = ["salePrice", "minPrice", "minAppPrice", "appPrice", "displayPrice", "normalPrice"];
    const found: { value: number; field: string }[] = [];
    for (const f of fields) {
      const re = new RegExp(`"${f}"\\s*:\\s*"?([\\d.]+)"?`, "g");
      for (const m of html.matchAll(re)) {
        const v = parseFloat(m[1]);
        if (v > 0 && v < 100000) {
          found.push({ value: v, field: f });
        }
      }
    }
    if (found.length > 0) {
      // Sort and pick lowest (likely sale price)
      found.sort((a, b) => a.value - b.value);
      const best = found[0];
      // Heuristic: if value > 100, probably in cents → divide by 100
      price = best.value > 100 ? best.value / 100 : best.value;
      priceSource = `embedded-${best.field}`;
    }
  }

  // 2e. Dollar/£/€ text (last resort — but only use prices > $1 to avoid UI elements)
  if (!price) {
    const text = html.replace(/<[^>]*>/g, " ");
    const matches = [...text.matchAll(/[£€$]\s*(\d{1,4}(?:[.,]\d{1,2})?)/g)];
    const prices: { value: number; currency: string }[] = [];
    for (const m of matches) {
      const raw = m[1].replace(/,/g, "");
      const v = parseFloat(raw);
      if (v > 1.5 && v < 5000) {
        const cur = m[0].includes("£") ? "GBP" : m[0].includes("€") ? "EUR" : "USD";
        prices.push({ value: v, currency: cur });
      }
    }
    if (prices.length > 0) {
      // Pick lowest non-suspicious price (avoid shipping credits like $5/$8/$13)
      const sorted = prices.sort((a, b) => a.value - b.value);
      // Skip the first if it's a suspicious "round" price (like $5.00, $8.00)
      const filtered = sorted.filter(p => !(p.value < 20 && p.value === Math.floor(p.value)));
      if (filtered.length > 0) {
        price = filtered[0].value;
        currency = filtered[0].currency;
        priceSource = "text";
      }
    }
  }

  return {
    price,
    currency,
    productName,
    productDescription,
    canonicalUrl: canonical,
    originalPrice,
    image: ogImage,
    source: priceSource || (productName ? "og-only" : "none"),
  };
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

/* ─── Helper: Extract product name from URL slug ─── */
function extractProductNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const slug = segments.find((s) => s.includes("-g-")) || segments[segments.length - 1] || "";
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

/* ───────────────────────────────────────────────────────────────────
 * Strategy -2: ZAI LLM Direct Price Query (MOST RELIABLE for share URLs)
 *
 * Temu aggressively blocks all server-side scraping with anti-bot
 * challenges. Even the page_reader gets the login page instead of
 * the product page. This strategy uses the ZAI LLM with web search
 * to directly find the product price.
 *
 * How it works:
 * 1. Search the web for the product (by goods_id or Item ID)
 * 2. Extract prices from search result snippets (in various currencies)
 * 3. Use the LLM to interpret and convert prices to USD
 *
 * This is the most reliable strategy because:
 * - It doesn't depend on scraping (which Temu blocks)
 * - Search engines have already indexed Temu pages with prices
 * - The LLM can handle different currencies and formats
 * ─────────────────────────────────────────────────────────────────── */
async function fetchPriceWithLLMDirect(
  goodsId: string | null,
  itemId: string | null,
  productNameHint: string | null,
  userLocale: string | null = null,
): Promise<TemuProductData | null> {
  try {
    const zai = await createZAI();

    // Step 1: Web search to find the product with prices
    // Try multiple search queries to maximize the chance of finding a price
    const searchQueries: string[] = [];

    if (itemId && /^[A-Z]{2}\d+/i.test(itemId)) {
      // Item ID search
      searchQueries.push(`temu "${itemId}" price`);
      searchQueries.push(`site:temu.com ${itemId}`);
    }
    if (goodsId && /^\d{10,}$/.test(goodsId)) {
      // Goods ID search - include "OFF" to find pages with discount prices
      searchQueries.push(`site:temu.com ${goodsId}`);
      // Also search with product name hint if available
      if (productNameHint) {
        const shortName = productNameHint.replace(/\s+/g, " ").trim().slice(0, 60);
        searchQueries.push(`temu ${shortName} price`);
      }
    }

    if (searchQueries.length === 0) return null;

    // Collect search results from multiple queries
    const allResults: { name: string; url: string; snippet: string }[] = [];
    const seenUrls = new Set<string>();

    for (const query of searchQueries) {
      try {
        console.log(`[LLM-Direct] Searching: ${query}`);
        const results = await (zai as any).invokeFunction("web_search", {
          query,
          num: 8,
        });

        if (Array.isArray(results)) {
          for (const r of results) {
            if (r.url && !seenUrls.has(r.url)) {
              seenUrls.add(r.url);
              allResults.push({
                name: r.name || "",
                url: r.url,
                snippet: r.snippet || "",
              });
            }
          }
        }
      } catch (err) {
        console.log(`[LLM-Direct] Search error:`, String(err).slice(0, 80));
      }
    }

    if (allResults.length === 0) {
      console.log("[LLM-Direct] No search results found");
      return null;
    }

    console.log(`[LLM-Direct] Collected ${allResults.length} search results`);

    // Step 2: Try to extract prices directly from snippets first (fast, no LLM cost)
    // But ONLY if the price comes from a locale that matches the user's locale,
    // or if we don't have a locale hint (in which case USD prices are preferred).
    const snippetPrices = extractPricesFromSnippets(allResults, goodsId);
    if (snippetPrices.length > 0) {
      // If we know the user's locale, strongly prefer prices from that locale
      // because Temu shows different prices in different regions.
      snippetPrices.sort((a, b) => {
        // If user locale is known, strongly prefer matching locale prices
        if (userLocale) {
          const aLocale = allResults.find(r => {
            const m = r.url.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i);
            return m && m[1].toLowerCase() === userLocale.toLowerCase();
          });
          // Prefer results from the user's locale region
          const userRegionPrefix = userLocale.split("-")[0].toLowerCase();
          const aUrlLocale = allResults.find(r => r.url.includes(`/${userLocale}/`) || r.url.includes(`/${userRegionPrefix}/`));
          
          // Strong preference for matching locale prices
          if (aUrlLocale) {
            const aIsUserLocale = a.currency === getCurrencyForLocale(userLocale);
            const bIsUserLocale = b.currency === getCurrencyForLocale(userLocale);
            if (aIsUserLocale && !bIsUserLocale) return -1;
            if (bIsUserLocale && !aIsUserLocale) return 1;
          }
        }
        // Prefer USD
        if (a.currency === "USD" && b.currency !== "USD") return -1;
        if (b.currency === "USD" && a.currency !== "USD") return 1;
        // Prefer results from temu.com
        if (a.fromTemu && !b.fromTemu) return -1;
        if (b.fromTemu && !a.fromTemu) return 1;
        // Prefer lower prices (likely sale price, not original)
        return a.usd - b.usd;
      });

      const best = snippetPrices[0];
      // If we have a user locale and the best price is from a different locale,
      // skip snippet extraction and try the LLM instead — it might find a better price
      const userCurrency = userLocale ? getCurrencyForLocale(userLocale) : null;
      const shouldSkipSnippet = userCurrency && best.currency !== userCurrency && snippetPrices.every(s => s.currency !== userCurrency);
      
      if (shouldSkipSnippet) {
        console.log(`[LLM-Direct] Best snippet price is ${best.originalAmount} ${best.currency} ($${best.usd}) but user locale is ${userLocale} (${userCurrency}) — trying LLM for better price`);
      } else if (best.usd > 0.5 && best.usd < 500) {
        if (!isSuspiciousPrice(best.usd, `llm-direct-snippet(${best.currency})`)) {
          console.log(`[LLM-Direct] ✓ Found price from snippet: ${best.originalAmount} ${best.currency} = $${best.usd} USD`);
          return {
            price: best.usd,
            currency: "USD",
            productName: best.productName || productNameHint,
            productDescription: null,
            canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
            originalPrice: best.originalPriceUSD || null,
            image: null,
            source: `llm-direct-snippet(${best.currency})`,
            antiBotDetected: false,
          };
        }
      }
    }

    // Step 3: Use LLM to extract price from search results
    const searchContext = allResults
      .slice(0, 8)
      .map((r, i) => `${i + 1}. ${r.name}\n   URL: ${r.url}\n   Snippet: ${r.snippet}`)
      .join("\n\n");

    console.log(`[LLM-Direct] Using LLM on ${Math.min(allResults.length, 8)} search results...`);

    // Build locale-specific instruction for the LLM
    const localeInstruction = userLocale
      ? `\n10. IMPORTANT: The user is viewing this product from the "${userLocale}" locale on Temu. The price may vary by region. Try to find the price that would be shown in this locale, or estimate it based on prices from other locales. For ${userLocale}, the currency is ${getCurrencyForLocale(userLocale)}.`
      : "";

    const completion = await (zai as any).createChatCompletion({
      messages: [
        {
          role: "system",
          content:
            "You are a price extraction assistant for Temu products. " +
            "You will be given web search results for a Temu product. " +
            "Extract the SALE PRICE of the product from the search results.\n\n" +
            "IMPORTANT RULES:\n" +
            "1. The search results show the same product on different Temu locale pages (Oman, Bahrain, Mauritius, US, etc.)\n" +
            "2. Each locale shows the price in its local currency. Convert to USD using these rates:\n" +
            "   - OMR → USD: ×2.60 (e.g., OMR 3.56 = $9.26)\n" +
            "   - BHD → USD: ×2.65 (e.g., BHD 1.23 = $3.26)\n" +
            "   - MUR (Rs) → USD: ×0.022 (e.g., Rs 451 = $9.92)\n" +
            "   - SAR → USD: ×0.27 (e.g., SAR 12 = $3.24)\n" +
            "   - AED → USD: ×0.27 (e.g., AED 15 = $4.05)\n" +
            "   - EUR → USD: ×1.08\n" +
            "   - GBP → USD: ×1.27\n" +
            "   - DZD → USD: ×0.00333 (e.g., 2100 DA = $7.00)\n" +
            "3. Look for prices in snippet text like: OMR3.56, Rs 451, $7.01, BHD 1.23, 67% OFF\n" +
            "4. The price shown is the SALE price (after discount), not the original price before discount.\n" +
            "5. Do NOT confuse discount percentages (67% OFF) or sold counts (55K+ sold) with the price.\n" +
            "6. If you find prices in multiple currencies, average the USD conversions for accuracy.\n" +
            "7. ⚠️ NEVER return a price of exactly $30.00 — this is a 'delivery guarantee' amount, not the product price.\n" +
            "8. Return ONLY a JSON object: {\"price_usd\": <number>, \"name\": \"<product_name>\", \"confidence\": \"<high|medium|low>\"}\n" +
            "9. If you cannot find a clear price, return {\"price_usd\": null, \"confidence\": \"low\"}" +
            localeInstruction,
        },
        {
          role: "user",
          content:
            `Product goods_id: ${goodsId || "unknown"}\n` +
            `Item ID: ${itemId || "unknown"}\n` +
            `Product name hint: ${productNameHint || "unknown"}\n\n` +
            `Search Results:\n${searchContext}\n\n` +
            `Extract the product price in USD from these results. Return JSON only.`,
        },
      ],
    });

    const aiResponse = completion.choices?.[0]?.message?.content || "";
    console.log(`[LLM-Direct] LLM response:`, aiResponse.slice(0, 300));

    const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const priceUSD = typeof parsed.price_usd === "number"
          ? parsed.price_usd
          : parseFloat(String(parsed.price_usd));

        if (priceUSD && priceUSD > 0 && priceUSD < 500) {
          if (isSuspiciousPrice(priceUSD, "llm-direct-llm")) {
            console.log(`[LLM-Direct] ⚠️ Skipping suspicious $${priceUSD} from LLM`);
          } else {
            console.log(`[LLM-Direct] ✓ LLM found price: $${priceUSD} (confidence: ${parsed.confidence})`);
            return {
              price: priceUSD,
              currency: "USD",
              productName: parsed.name || productNameHint,
              productDescription: null,
              canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
              originalPrice: null,
              image: null,
              source: `llm-direct-llm(${parsed.confidence})`,
              antiBotDetected: false,
            };
          }
        }
      } catch { /* JSON parse error */ }
    }

    return null;
  } catch (err) {
    console.error("[LLM-Direct] Error:", String(err).slice(0, 200));
    return null;
  }
}

/**
 * Get the currency code for a Temu locale (e.g., "dz-en" → "DZD")
 */
function getCurrencyForLocale(locale: string): string {
  const localeToCurrency: Record<string, string> = {
    mu: "MUR", pk: "PKR", "pk-en": "PKR", "pk-ur": "PKR",
    om: "OMR", "om-en": "OMR", "om-ar": "OMR",
    bh: "BHD", "bh-en": "BHD", "bh-ar": "BHD",
    sa: "SAR", "sa-en": "SAR", "sa-ar": "SAR",
    ae: "AED", "ae-en": "AED", "ae-ar": "AED",
    eg: "EGP", "eg-en": "EGP", "eg-ar": "EGP",
    ma: "MAD", "ma-en": "MAD", "ma-fr": "MAD",
    tn: "TND", "tn-en": "TND", "tn-fr": "TND",
    dz: "DZD", "dz-en": "DZD", "dz-fr": "DZD", "dz-ar": "DZD",
    kw: "KWD", "kw-en": "KWD",
    qa: "QAR", "qa-en": "QAR",
    jo: "JOD", "jo-en": "JOD",
    in: "INR", "in-en": "INR",
    ph: "PHP", "ph-en": "PHP",
    br: "BRL", "br-pt": "BRL",
    mx: "MXN", "mx-es": "MXN",
    ec: "USD", sv: "USD",
    lk: "LKR", np: "NPR", bd: "BDT",
  };
  return localeToCurrency[locale.toLowerCase()] || "USD";
}

/**
 * Extract prices from search result snippets.
 * Returns an array of price candidates with USD conversion.
 */
function extractPricesFromSnippets(
  results: { name: string; url: string; snippet: string }[],
  goodsId: string | null,
): { usd: number; currency: string; originalAmount: number; originalPriceUSD?: number; productName: string | null; fromTemu: boolean }[] {
  const candidates: { usd: number; currency: string; originalAmount: number; originalPriceUSD?: number; productName: string | null; fromTemu: boolean }[] = [];

  for (const result of results) {
    if (!result.snippet) continue;
    const isTemuUrl = result.url?.includes("temu.com");
    const snippet = result.snippet;

    // Extract product name from search result
    const productName = result.name
      ?.replace(/\s*[-|]\s*Temu\s*$/i, "")
      .replace(/\s*[-|]\s*(Mauritius|Oman|Bahrain|Ecuador|Pakistan|Algeria|Morocco|Tunisia).*$/i, "")
      .trim() || null;

    // Determine the local currency from the Temu URL locale prefix
    let localCurrency = "USD";
    const localeMatch = result.url.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i);
    if (localeMatch) {
      const locale = localeMatch[1].toLowerCase();
      const localeToCurrency: Record<string, string> = {
        mu: "MUR", pk: "PKR", "pk-en": "PKR", "pk-ur": "PKR",
        om: "OMR", "om-en": "OMR", "om-ar": "OMR",
        bh: "BHD", "bh-en": "BHD", "bh-ar": "BHD",
        sa: "SAR", "sa-en": "SAR", "sa-ar": "SAR",
        ae: "AED", "ae-en": "AED", "ae-ar": "AED",
        eg: "EGP", "eg-en": "EGP", "eg-ar": "EGP",
        ma: "MAD", "ma-en": "MAD", "ma-fr": "MAD",
        tn: "TND", "tn-en": "TND", "tn-fr": "TND",
        dz: "DZD", "dz-en": "DZD", "dz-fr": "DZD",
        kw: "KWD", "kw-en": "KWD",
        qa: "QAR", "qa-en": "QAR",
        jo: "JOD", "jo-en": "JOD",
        in: "INR", "in-en": "INR",
        ph: "PHP", "ph-en": "PHP",
        br: "BRL", "br-pt": "BRL",
        mx: "MXN", "mx-es": "MXN",
        ec: "USD", sv: "USD",
        lk: "LKR", np: "NPR", bd: "BDT",
      };
      const found = localeToCurrency[locale];
      if (found) localCurrency = found;
    }

    // Pattern 1: Explicit currency patterns (e.g., "OMR3.56", "$7.01", "Rs 451")
    const explicitPatterns: { pattern: RegExp; currency: string }[] = [
      { pattern: /\$\s*([\d,]+(?:\.\d{1,2})?)/, currency: "USD" },
      { pattern: /OMR\s*([\d,]+(?:\.\d{1,3})?)/, currency: "OMR" },
      { pattern: /BHD\s*([\d,]+(?:\.\d{1,3})?)/, currency: "BHD" },
      { pattern: /SAR\s*([\d,]+(?:\.\d{1,2})?)/, currency: "SAR" },
      { pattern: /AED\s*([\d,]+(?:\.\d{1,2})?)/, currency: "AED" },
      { pattern: /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/, currency: localCurrency === "MUR" ? "MUR" : "PKR" },
      { pattern: /€\s*([\d,]+(?:\.\d{1,2})?)/, currency: "EUR" },
      { pattern: /£\s*([\d,]+(?:\.\d{1,2})?)/, currency: "GBP" },
      { pattern: /DZD\s*([\d,]+(?:\.\d{1,2})?)/, currency: "DZD" },
      { pattern: /([\d,]+(?:\.\d{1,2})?)\s*DA\b/, currency: "DZD" },
    ];

    for (const { pattern, currency } of explicitPatterns) {
      const match = snippet.match(pattern);
      if (match) {
        const localPrice = parseFloat(match[1].replace(/,/g, ""));
        if (localPrice > 0 && localPrice < 10000000) {
          const rate = CURRENCY_TO_USD[currency];
          if (rate) {
            const usdPrice = Math.round(localPrice * rate * 100) / 100;
            if (usdPrice >= 0.10 && usdPrice <= 5000) {
              candidates.push({
                usd: usdPrice,
                currency,
                originalAmount: localPrice,
                productName,
                fromTemu: isTemuUrl,
              });
            }
          }
        }
      }
    }

    // Pattern 2: Number followed by "% OFF" with preceding price
    // Temu shows: "OMR3.56. 67% OFF" or "10.95. OMR3.56. 67% OFF"
    const offPattern = snippet.match(/([\d,]+(?:\.\d{1,3})?)\.\s*\d+\s*%\s*OFF/i);
    if (offPattern) {
      const priceBeforeOff = parseFloat(offPattern[1].replace(/,/g, ""));
      // This is the sale price before the "% OFF" discount label
      const currency = localCurrency;
      const rate = CURRENCY_TO_USD[currency];
      if (rate && priceBeforeOff > 0 && priceBeforeOff < 100000) {
        const usdPrice = Math.round(priceBeforeOff * rate * 100) / 100;
        if (usdPrice >= 0.10 && usdPrice <= 5000) {
          // Check if we already have this candidate (avoid duplicates)
          const isDuplicate = candidates.some(c => Math.abs(c.usd - usdPrice) < 0.01 && c.currency === currency);
          if (!isDuplicate) {
            candidates.push({
              usd: usdPrice,
              currency,
              originalAmount: priceBeforeOff,
              productName,
              fromTemu: isTemuUrl,
            });
          }
        }
      }
    }

    // Pattern 3: Original price + sale price pattern
    // "10.95. OMR3.56. 67% OFF" → original=10.95, sale=3.56
    const origSalePattern = snippet.match(/([\d,]+(?:\.\d{1,3})?)\.\s*([A-Z]{3})\s*([\d,]+(?:\.\d{1,3})?)\.\s*\d+\s*%\s*OFF/i);
    if (origSalePattern) {
      const originalPrice = parseFloat(origSalePattern[1].replace(/,/g, ""));
      const saleCurrency = origSalePattern[2];
      const salePrice = parseFloat(origSalePattern[3].replace(/,/g, ""));

      const saleRate = CURRENCY_TO_USD[saleCurrency];
      const origRate = CURRENCY_TO_USD[localCurrency]; // Original price is in local currency

      if (saleRate && salePrice > 0) {
        const saleUSD = Math.round(salePrice * saleRate * 100) / 100;
        const origUSD = origRate ? Math.round(originalPrice * origRate * 100) / 100 : undefined;

        if (saleUSD >= 0.10 && saleUSD <= 5000) {
          candidates.push({
            usd: saleUSD,
            currency: saleCurrency,
            originalAmount: salePrice,
            originalPriceUSD: origUSD,
            productName,
            fromTemu: isTemuUrl,
          });
        }
      }
    }
  }

  // Deduplicate candidates that are very close in USD value
  const unique: typeof candidates = [];
  for (const c of candidates) {
    const isDuplicate = unique.some(u => Math.abs(u.usd - c.usd) < 0.50);
    if (!isDuplicate) {
      unique.push(c);
    }
  }

  return unique;
}

function cleanProductName(name: string | null): string | null {
  if (!name) return null;
  let cleaned = name
    .replace(/\s*[-|]\s*(Temu|AliExpress)\s*/gi, "")
    .replace(/\s*[-|]\s*(Login|Sign In|Register)\s*/gi, "")
    // Remove Temu locale suffixes like "Algeria", "Mauritius", "Oman", etc.
    .replace(/\s*(Algeria|Mauritius|Oman|Bahrain|Ecuador|Pakistan|Morocco|Tunisia|Kuwait|Qatar|Jordan|Egypt|Saudi Arabia|UAE|India|Philippines|Brazil|Mexico|Sri Lanka|Nepal|Bangladesh|China|Japan|Korea)$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length > 100) cleaned = cleaned.slice(0, 97) + "...";
  return cleaned || null;
}

/* ─── Main API Handler ─── */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, manualPrice } = body;

    // ─── Manual price entry ───
    if (manualPrice !== undefined && manualPrice !== null && manualPrice !== "") {
      const price = parseFloat(String(manualPrice).replace(/[^\d.]/g, ""));
      if (price > 0 && price < 100000) {
        // Detect currency from the input string
        const priceStr = String(manualPrice);
        const isDZD = /DA|dzd|DZD|دينار/i.test(priceStr);
        const isGBP = /£|GBP/i.test(priceStr);
        const isEUR = /€|EUR/i.test(priceStr);

        let priceUSD = price;
        if (isDZD) {
          const rate = await getUsdToDzdRate();
          priceUSD = price / rate.rate;
        } else if (isGBP) {
          priceUSD = price * 1.27;
        } else if (isEUR) {
          priceUSD = price * 1.08;
        }

        const breakdown = calculateAlgeriaPrice(priceUSD);
        return NextResponse.json({
          success: true,
          price: breakdown.basePriceUSD,
          dzd: breakdown.totalDZD,
          breakdown,
          productName: body.productName || null,
          productImage: body.productImage || null,
          productUrl: url || null,
          estimated: false,
          manual: true,
        });
      }
    }

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Veuillez fournir un lien produit Temu valide / يرجى توفير رابط منتج Temu صالح",
          allowManual: true,
        },
        { status: 400 }
      );
    }

    // Parse URL / detect Temu product ID
    const trimmedUrl = url.trim();
    const isTemuProductId = /^[a-zA-Z0-9]{6,30}$/.test(trimmedUrl);
    let isTemu = isTemuProductId || trimmedUrl.includes("temu.com");
    let finalUrl = trimmedUrl;
    let goodsId = "";
    let shareImage: string | null = null; // Image extracted from share URL redirect
    let originalShareUrl: string | null = null; // Original share URL for page_reader
    let shareUrlPriceUSD: number | null = null; // Pre-extracted price from share URL's _oak_rec_ext_1
    let shareUrlPriceSource = ""; // Source label for the pre-extracted price
    let shareHtmlBody: string | null = null; // HTML body from share URL redirect response
    let resolvedShareUrl: string | null = null; // The resolved share URL (before reconstruction)
    let localizedShareUrl: string | null = null; // Localized share URL for AllOrigins (e.g., /dz-en/goods.html?goods_id=...)
    let shareLocale: string | null = null; // Locale from resolved share URL (e.g., "dz-en")

    if (isTemuProductId) {
      // Check if it's an Item ID (like TV10922608) vs a numeric goods_id
      if (/^[A-Z]{2}\d+/i.test(trimmedUrl)) {
        // Item ID format (e.g. TV10922608) — NOT a goods_id
        // Don't construct a -g- URL because Item IDs don't work in that format
        // The web search strategy will handle finding the product
        console.log(`[Item ID] Detected Item ID format: ${trimmedUrl}`);
        goodsId = ""; // No goods_id yet — will be found by web search
        finalUrl = trimmedUrl; // Pass the raw Item ID, web search will handle it
      } else {
        // Numeric goods_id — construct the URL
        goodsId = trimmedUrl;
        finalUrl = `https://www.temu.com/-g-${trimmedUrl}.html?_x_sessn=us&currency=USD`;
      }
    } else {
      try {
        const parsed = new URL(finalUrl);

        // ── Resolve share.temu.com short links ──
        // When a user taps "Partager" in the Temu app, they get a short
        // redirect URL like https://share.temu.com/7d4cdBt01yB which
        // 302-redirects to the full product page. We MUST follow that
        // redirect first, otherwise none of our extraction strategies
        // can find the price or product name.
        if (parsed.hostname === "share.temu.com" || parsed.hostname === "s.temu.com") {
          console.log(`[Share URL] Resolving short link: ${finalUrl}`);
          originalShareUrl = finalUrl; // Save for page_reader strategy
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 10000);
            const shareRes = await fetch(finalUrl, {
              signal: ctrl.signal,
              redirect: "follow",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 " +
                  "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
                Accept: "text/html,application/xhtml+xml",
              },
            });
            clearTimeout(timer);

            // The redirected URL is in the response's url property
            const resolvedUrl = shareRes.url || shareRes.headers.get("location") || "";

            // Also try to read the HTML body for redirect info and product data
            try {
              shareHtmlBody = await shareRes.text();
            } catch { /* can't read body */ }

            if (resolvedUrl && resolvedUrl !== finalUrl) {
              console.log(`[Share URL] Resolved to: ${resolvedUrl}`);
              resolvedShareUrl = resolvedUrl; // Save for page_reader
              finalUrl = resolvedUrl;

              // Extract locale from the resolved URL for localized fetching
              try {
                const resolvedParsed = new URL(resolvedUrl);
                const localeMatch = resolvedParsed.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);
                if (localeMatch) {
                  shareLocale = localeMatch[1];
                  console.log(`[Share URL] Detected locale: ${shareLocale}`);
                }
              } catch { /* skip */ }
            } else {
              // Try to find redirect URL from HTML (meta refresh, JS redirect, etc.)
              let htmlRedirect: string | null = null;
              if (shareHtmlBody) {
                // <meta http-equiv="refresh" content="0;url=...">
                const metaRefresh = shareHtmlBody.match(/content=["']?\d+;\s*url=([^"'\s>]+)/i);
                if (metaRefresh) htmlRedirect = metaRefresh[1];
                // window.location = "..." or window.location.href = "..."
                if (!htmlRedirect) {
                  const jsRedirect = shareHtmlBody.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
                  if (jsRedirect) htmlRedirect = jsRedirect[1];
                }
                // <a href="..." id="redirect" or class="redirect">
                if (!htmlRedirect) {
                  const linkRedirect = shareHtmlBody.match(/<a[^>]+(?:id|class)=["']?redirect["']?[^>]*href=["']([^"']+)["']/i);
                  if (linkRedirect) htmlRedirect = linkRedirect[1];
                }
              }

              if (htmlRedirect) {
                console.log(`[Share URL] HTML redirect to: ${htmlRedirect}`);
                finalUrl = htmlRedirect;
              } else {
                // Try manual HEAD request with redirect:"manual"
                try {
                  const headCtrl = new AbortController();
                  const headTimer = setTimeout(() => headCtrl.abort(), 8000);
                  const headRes = await fetch(finalUrl, {
                    method: "HEAD",
                    signal: headCtrl.signal,
                    redirect: "manual",
                    headers: {
                      "User-Agent":
                        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 " +
                        "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
                    },
                  });
                  clearTimeout(headTimer);
                  const location = headRes.headers.get("location");
                  if (location) {
                    console.log(`[Share URL] Manual redirect to: ${location}`);
                    finalUrl = location;
                  }
                } catch { /* manual redirect failed */ }
              }
            }
          } catch (err) {
            console.log("[Share URL] Resolution failed:", String(err).slice(0, 100));
          }
        }

        // Re-parse with potentially-resolved URL
        const resolved = new URL(finalUrl);

        // Extract product image from share URL params (available even without price)
        const topGallery = resolved.searchParams.get("top_gallery_url");
        const shareImg = resolved.searchParams.get("share_img");
        if (topGallery) shareImage = topGallery;
        else if (shareImg) shareImage = shareImg;

        // Extract goods_id from -g- pattern in pathname OR from goods_id query param
        const gMatch = resolved.pathname.match(/-g-([a-zA-Z0-9]+)/);
        if (gMatch) {
          goodsId = gMatch[1];
        } else {
          const gidParam = resolved.searchParams.get("goods_id");
          if (gidParam) {
            goodsId = gidParam;
          } else {
            const numMatch = resolved.pathname.match(/(\d{10,})/);
            if (numMatch) goodsId = numMatch[1];
          }
        }

        // ── Extract price from _oak_rec_ext_1 BEFORE URL reconstruction ──
        // The resolved share URL includes _oak_rec_ext_1 which encodes the price
        // in the LOCAL currency (determined by the locale prefix like /dz-en/).
        // We must extract and convert BEFORE reconstructing the URL (which removes
        // this parameter), because this is the most reliable source of price data.
        {
          const hint = resolved.searchParams.get("_oak_rec_ext_1");
          if (hint) {
            try {
              const b64 = hint.replace(/-/g, "+").replace(/_/g, "/");
              const decoded = Buffer.from(b64, "base64").toString("utf-8").trim();
              const cents = parseInt(decoded.replace(/\D/g, ""), 10);
              if (cents > 0 && cents < 10000000) {
                const localPrice = cents / 100;

                // Determine currency from the URL locale prefix
                const localePrefix = resolved.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);
                const locale = localePrefix ? localePrefix[1].toLowerCase() : "";
                const LOCALE_TO_CURRENCY: Record<string, string> = {
                  mu: "MUR", "pk-en": "PKR", "pk-ur": "PKR", pk: "PKR",
                  "om-en": "OMR", "om-ar": "OMR", om: "OMR",
                  "bh-en": "BHD", "bh-ar": "BHD", bh: "BHD",
                  "sa-en": "SAR", "sa-ar": "SAR", sa: "SAR",
                  "ae-en": "AED", "ae-ar": "AED", ae: "AED",
                  "eg-en": "EGP", "eg-ar": "EGP", eg: "EGP",
                  "ma-en": "MAD", "ma-fr": "MAD", "ma-ar": "MAD", ma: "MAD",
                  "tn-en": "TND", "tn-fr": "TND", "tn-ar": "TND", tn: "TND",
                  "dz-en": "DZD", "dz-fr": "DZD", "dz-ar": "DZD", dz: "DZD",
                  "kw-en": "KWD", "kw-ar": "KWD", kw: "KWD",
                  "qa-en": "QAR", "qa-ar": "QAR", qa: "QAR",
                  "jo-en": "JOD", "jo-ar": "JOD", jo: "JOD",
                  "ec-es": "USD", ec: "USD",
                  "lk-en": "LKR", "lk-si": "LKR", "lk-ta": "LKR", lk: "LKR",
                  "np-en": "NPR", np: "NPR",
                  "bd-en": "BDT", bd: "BDT",
                  "in-en": "INR", "in-hi": "INR", in: "INR",
                  "ph-en": "PHP", ph: "PHP",
                  "br-pt": "BRL", br: "BRL",
                  "mx-es": "MXN", mx: "MXN",
                };
                const localCurrency = LOCALE_TO_CURRENCY[locale] || "USD";

                if (localCurrency === "USD") {
                  shareUrlPriceUSD = localPrice;
                } else {
                  const rate = CURRENCY_TO_USD[localCurrency];
                  if (rate) {
                    shareUrlPriceUSD = Math.round(localPrice * rate * 100) / 100;
                  }
                }

                if (shareUrlPriceUSD && shareUrlPriceUSD >= 0.01 && shareUrlPriceUSD < 100000) {
                  shareUrlPriceSource = `share-url-${localCurrency}`;
                  console.log(`[Share URL] ✓ Extracted price from _oak_rec_ext_1: ${localPrice} ${localCurrency} = $${shareUrlPriceUSD} USD`);
                } else {
                  shareUrlPriceUSD = null;
                }
              }
            } catch {
              /* not valid base64 */
            }
          }

          // ── Fallback: Extract price from share redirect HTML ──
          // If _oak_rec_ext_1 wasn't available, try extracting the price from
          // the HTML content of the redirect response. This works when the share
          // URL redirects to the product page via HTTP redirect.
          if (!shareUrlPriceUSD && shareHtmlBody && shareHtmlBody.length > 2000) {
            try {
              const htmlResult = extractProductInfo(shareHtmlBody, resolved.toString());
              if (htmlResult.price && htmlResult.price > 0) {
                // Determine the locale currency from the resolved URL
                const localePrefix = resolved.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);
                const locale = localePrefix ? localePrefix[1].toLowerCase() : "";
                const LOCALE_TO_CURRENCY2: Record<string, string> = {
                  "dz-en": "DZD", "dz-fr": "DZD", "dz-ar": "DZD", dz: "DZD",
                  "ma-en": "MAD", "ma-fr": "MAD", "ma-ar": "MAD", ma: "MAD",
                  "tn-en": "TND", "tn-fr": "TND", "tn-ar": "TND", tn: "TND",
                  "pk-en": "PKR", "pk-ur": "PKR", pk: "PKR",
                  "om-en": "OMR", "om-ar": "OMR", om: "OMR",
                  "bh-en": "BHD", "bh-ar": "BHD", bh: "BHD",
                  "sa-en": "SAR", "sa-ar": "SAR", sa: "SAR",
                  "ae-en": "AED", "ae-ar": "AED", ae: "AED",
                  "eg-en": "EGP", "eg-ar": "EGP", eg: "EGP",
                  "kw-en": "KWD", "kw-ar": "KWD", kw: "KWD",
                  "qa-en": "QAR", "qa-ar": "QAR", qa: "QAR",
                  "jo-en": "JOD", "jo-ar": "JOD", jo: "JOD",
                };
                const localCurrency = LOCALE_TO_CURRENCY2[locale] || "USD";

                if (localCurrency !== "USD" && htmlResult.currency === "USD") {
                  // The HTML extraction thought it was USD, but it's actually local currency
                  const rate = CURRENCY_TO_USD[localCurrency];
                  if (rate) {
                    shareUrlPriceUSD = Math.round(htmlResult.price * rate * 100) / 100;
                  }
                } else if (htmlResult.currency !== "USD") {
                  const rate = CURRENCY_TO_USD[htmlResult.currency.toUpperCase()];
                  if (rate) {
                    shareUrlPriceUSD = Math.round(htmlResult.price * rate * 100) / 100;
                  }
                } else {
                  shareUrlPriceUSD = htmlResult.price;
                }

                if (shareUrlPriceUSD && shareUrlPriceUSD >= 0.01 && shareUrlPriceUSD < 100000) {
                  shareUrlPriceSource = `share-html-${htmlResult.source}`;
                  console.log(`[Share URL] ✓ Extracted price from redirect HTML: ${htmlResult.price} ${htmlResult.currency} (locale: ${localCurrency}) = $${shareUrlPriceUSD} USD`);
                } else {
                  shareUrlPriceUSD = null;
                }
              }
            } catch (e) {
              console.log("[Share URL] HTML price extraction failed:", String(e).slice(0, 100));
            }
          }
        }

        // ── Reconstruct clean URL for reliable price extraction ──
        // When a share.temu.com link resolves to a localized URL (e.g. /dz-en/),
        // the page shows prices in the LOCAL currency (DZD), not USD.
        // Also, the _oak_rec_ext_1 param (if present) encodes the price in
        // the local currency, which Strategy 0 would wrongly treat as USD.
        //
        // FIX: Reconstruct the URL with ONLY the goods_id and US session params.
        // This removes _oak_rec_ext_1 (wrong currency) and the locale prefix
        // (which would show prices in local currency), ensuring all strategies
        // get the US version of the page with USD prices.
        //
        // HOWEVER: We also keep the LOCALIZED URL for AllOrigins and page_reader
        // strategies, because the localized version sometimes bypasses anti-bot
        // and actually returns the product page with OG tags including price.
        if (goodsId) {
          // Save the localized URL BEFORE reconstructing (for AllOrigins strategy)
          if (shareLocale && resolvedShareUrl) {
            try {
              const locParsed = new URL(resolvedShareUrl);
              locParsed.searchParams.delete("refer_share_id");
              locParsed.searchParams.delete("refer_share_channel");
              locParsed.searchParams.delete("refer_share_suin");
              locParsed.searchParams.delete("_oak_page_source");
              locParsed.searchParams.delete("_oak_region");
              locParsed.searchParams.delete("_bg_fs");
              locParsed.searchParams.delete("locale_override");
              localizedShareUrl = locParsed.toString();
              console.log(`[URL] Saved localized URL for AllOrigins: ${localizedShareUrl}`);
            } catch { /* skip */ }
          }
          finalUrl = `https://www.temu.com/-g-${goodsId}.html?_x_sessn=us&currency=USD`;
          console.log(`[URL] Reconstructed clean URL (no locale, no _oak_rec_ext_1): ${finalUrl}`);
        } else {
          // No goods_id found — strip _oak_rec_ext_1 and locale from the URL
          resolved.searchParams.delete("_oak_rec_ext_1");
          if (!resolved.searchParams.has("_x_sessn")) {
            resolved.searchParams.set("_x_sessn", "us");
            resolved.searchParams.set("currency", "USD");
          }
          // Remove locale prefix like /dz-en/ from pathname
          resolved.pathname = resolved.pathname.replace(/^\/[a-z]{2}-[a-z]{2}\//i, "/");
          finalUrl = resolved.toString();
          console.log(`[URL] Cleaned URL (no _oak_rec_ext_1, no locale): ${finalUrl}`);
        }
      } catch {
        return NextResponse.json(
          {
            success: false,
            error: "Format de lien invalide / صيغة الرابط غير صالحة",
            allowManual: true,
          },
          { status: 400 }
        );
      }
    }

    const urlProductName = extractProductNameFromUrl(finalUrl);

    // ────────────────────────────────────────────────────────────────
    // STRATEGY CHAIN (most reliable first):
    //  -1. Pre-extracted price  (FREE, 0 network) — _oak_rec_ext_1 from share URL
    //   0. URL params          (FREE, 0 network) — _oak_rec_ext_1 + top_gallery_url + slug
    //   0.5 AllOrigins+retries (FREE)            — CORS proxy with retries (best for share URLs)
    //   0-C. Page Reader+LLM  (ZAI SDK)          — reads the rendered product page
    //   0-AI. Web Search+LLM  (ZAI SDK)          — searches Google-indexed Temu pages
    //   0b. Temu BG API        (FREE)            — /bg/goods/api endpoint with goods_id
    //   1. Direct fetch        (FREE)            — realistic browser headers
    //   2. AllOrigins          (FREE)            — public CORS proxy (single attempt)
    //   3. CorsProxy.io        (FREE)            — another public CORS proxy
    //   4. ScrapingBee         (PAID, last)      — only if SCRAPINGBEE_API_KEY set
    // ────────────────────────────────────────────────────────────────

    // Determine if this is an Item ID (like TV10922608) vs a goods_id (like 601101613236742)
    const isItemId = isTemuProductId && /^[A-Z]{2}\d+/i.test(trimmedUrl);

    // Strategy -1: Pre-extracted price from share URL (most reliable for share.temu.com)
    // This price was extracted from _oak_rec_ext_1 in the resolved share URL,
    // with proper currency detection from the URL locale and conversion to USD.
    // It's the most reliable price source because it comes directly from Temu's
    // share URL parameters — no scraping or LLM interpretation needed.
    if (shareUrlPriceUSD && shareUrlPriceUSD > 0) {
      // Check for suspicious $30.00 price — Temu share URLs from the Algerian market
      // often encode the "delivery guarantee" / "delay credit" amount (9,000 DZD = $30.00)
      // in _oak_rec_ext_1 instead of the actual product price.
      if (isSuspiciousPrice(shareUrlPriceUSD, shareUrlPriceSource)) {
        console.log(`[Strategy -1] ⚠️ Skipping suspicious $${shareUrlPriceUSD} price from share URL — this is likely a "delivery guarantee" amount (9,000 DA), not the product price. Trying next strategy...`);
      } else {
        console.log(`[Strategy -1] ✓ Using pre-extracted price from share URL: $${shareUrlPriceUSD} (${shareUrlPriceSource})`);
        return await buildSuccessResponse({
          price: shareUrlPriceUSD,
          currency: "USD",
          productName: null,
          productDescription: null,
          canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
          originalPrice: null,
          image: shareImage,
          source: shareUrlPriceSource,
          antiBotDetected: false,
        }, urlProductName, shareImage, goodsId);
      }
    }

    // ─── BING SEARCH PATH: Works from Vercel (public internet API) ───
    // ZAI SDK's internal-api.z.ai is NOT accessible from Vercel servers.
    // Bing search IS accessible and returns Temu product results with prices.
    if (isTemu && (goodsId || isItemId)) {
      console.log(`[Bing] Trying Bing search for price (goodsId=${goodsId}, itemId=${isItemId ? trimmedUrl : "none"})...`);
      try {
        const searchQuery = isItemId
          ? `temu "${trimmedUrl}" price`
          : `site:temu.com ${goodsId} price`;
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}&count=10`;

        const bingController = new AbortController();
        const bingTimeout = setTimeout(() => bingController.abort(), 8000);
        const bingRes = await fetch(bingUrl, {
          signal: bingController.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
        clearTimeout(bingTimeout);

        if (bingRes.ok) {
          const bingHtml = await bingRes.text();
          console.log(`[Bing] Got ${bingHtml.length} chars from Bing`);

          // Extract Temu URLs from Bing results
          const temuResultUrls: { url: string; locale: string }[] = [];
          // Bing uses various URL formats - try multiple patterns
          const temuUrlPatterns = [
            /href="(https?:\/\/(?:www\.)?temu\.com\/([^"']+))"/gi,
            /<cite[^>]*>(https?:\/\/(?:www\.)?temu\.com\/[^<]+)<\/cite>/gi,
            /url\?(?:q|v)=((?:https?:\/\/)?(?:www\.)?temu\.com\/[^&"']+)/gi,
          ];
          for (const pattern of temuUrlPatterns) {
            pattern.lastIndex = 0;
            const temuUrlMatches = [...bingHtml.matchAll(pattern)];
            for (const m of temuUrlMatches) {
              let url = (m[1] || m[0]).replace(/&amp;/g, "&");
              if (!url.startsWith("http")) url = "https://" + url;
              const urlPath = url.replace(/https?:\/\/(?:www\.)?temu\.com\//i, "");
              const locale = urlPath.split("/")[0]?.split("?")[0]?.toLowerCase() || "us";
              if (url.includes("-g-") || url.includes("goods.html") || url.includes(goodsId || "")) {
                temuResultUrls.push({ url, locale });
              }
            }
          }
          // Deduplicate
          const seenUrls = new Set<string>();
          const uniqueUrls = temuResultUrls.filter(r => {
            const key = r.url.split("?")[0];
            if (seenUrls.has(key)) return false;
            seenUrls.add(key);
            return true;
          });
          console.log(`[Bing] Found ${uniqueUrls.length} Temu product URLs`);

          // Extract prices from the Bing search result HTML
          // Prices appear in snippets like: "AU$1.67", "Rs 37.42", "$7.01", etc.
          const pricePatterns: { regex: RegExp; currency: string; toUSD: number }[] = [
            { regex: /AU\$\s*(\d+\.?\d*)/gi, currency: "AUD", toUSD: 0.65 },
            { regex: /OMR\s*(\d+\.?\d*)/gi, currency: "OMR", toUSD: 2.60 },
            { regex: /BHD\s*(\d+\.?\d*)/gi, currency: "BHD", toUSD: 2.65 },
            { regex: /SAR\s*(\d+\.?\d*)/gi, currency: "SAR", toUSD: 0.27 },
            { regex: /AED\s*(\d+\.?\d*)/gi, currency: "AED", toUSD: 0.27 },
            { regex: /PKR\s*(\d+\.?\d*)/gi, currency: "PKR", toUSD: 0.0036 },
            { regex: /Rs\.?\s*(\d+\.?\d*)/gi, currency: "MUR", toUSD: 0.022 },
            { regex: /€\s*(\d+\.?\d*)/gi, currency: "EUR", toUSD: 1.08 },
            { regex: /£\s*(\d+\.?\d*)/gi, currency: "GBP", toUSD: 1.27 },
            { regex: /\$\s*(\d+\.?\d*)/gi, currency: "USD", toUSD: 1.0 },
          ];

          const foundPrices: { usd: number; currency: string; amount: number }[] = [];
          for (const { regex, currency, toUSD } of pricePatterns) {
            regex.lastIndex = 0; // Reset regex for reuse
            const matches = [...bingHtml.matchAll(regex)];
            for (const m of matches) {
              const amount = parseFloat(m[1]);
              const usd = Math.round(amount * toUSD * 100) / 100;
              // Filter: skip $1 (too common/false positive), very low amounts, and high amounts
              if (currency === "USD" && amount <= 1) continue; // $1 is almost always a false positive
              if (usd > 0.3 && usd < 500 && !isSuspiciousPrice(usd, `bing-${currency}`)) {
                foundPrices.push({ usd, currency, amount });
              }
            }
          }

          // Sort by reliability: prefer AUD/OMR/BHD (most common for Temu non-US locales)
          const currencyPriority: Record<string, number> = {
            AUD: 1, OMR: 1, BHD: 1, MUR: 2, PKR: 2, SAR: 2, AED: 2, USD: 3, EUR: 3, GBP: 3,
          };
          foundPrices.sort((a, b) => {
            const pa = currencyPriority[a.currency] || 99;
            const pb = currencyPriority[b.currency] || 99;
            if (pa !== pb) return pa - pb;
            return a.usd - b.usd;
          });

          if (foundPrices.length > 0) {
            // Take the most reliable price (or median of the top group)
            const topCurrency = foundPrices[0].currency;
            const sameCurrencyPrices = foundPrices.filter(p => p.currency === topCurrency);
            // Use the lowest price from the most reliable currency group
            const best = sameCurrencyPrices[0];
            console.log(`[Bing] ✓ Found price: ${best.amount} ${best.currency} = $${best.usd} USD (${sameCurrencyPrices.length} results)`);
            return await buildSuccessResponse({
              price: best.usd,
              currency: "USD",
              productName: urlProductName,
              productDescription: null,
              canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
              originalPrice: null,
              image: shareImage,
              source: `bing-search(${best.currency})`,
              antiBotDetected: false,
            }, urlProductName, shareImage, goodsId);
          }

          // No price found in Bing results - try AllOrigins on the found Temu URLs
          if (uniqueUrls.length > 0) {
            console.log(`[Bing] Trying AllOrigins on ${uniqueUrls.length} found URLs...`);
            for (const { url: temuUrl, locale } of uniqueUrls.slice(0, 3)) {
              try {
                const aoProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(temuUrl)}`;
                const aoController = new AbortController();
                const aoTimeout = setTimeout(() => aoController.abort(), 5000);
                const aoRes = await fetch(aoProxyUrl, { signal: aoController.signal });
                clearTimeout(aoTimeout);

                if (!aoRes.ok) continue;
                const aoHtml = await aoRes.text();
                if (!aoHtml || aoHtml.length < 3000) continue;

                // Try OG price
                const ogPriceMatch = aoHtml.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
                const ogCurrencyMatch = aoHtml.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);

                if (ogPriceMatch) {
                  const priceVal = parseFloat(ogPriceMatch[1]);
                  let cur = ogCurrencyMatch?.[1] || "USD";

                  // Handle locale-based currency
                  const LOCALE_TO_CUR: Record<string, string> = {
                    "dz-en": "DZD", "dz-fr": "DZD", dz: "DZD",
                    "ma-en": "MAD", ma: "MAD", "tn-en": "TND", tn: "TND",
                    "pk-en": "PKR", pk: "PKR", "om-en": "OMR", om: "OMR",
                    "bh-en": "BHD", bh: "BHD", "sa-en": "SAR", sa: "SAR",
                    "ae-en": "AED", ae: "AED", "eg-en": "EGP", eg: "EGP",
                    au: "AUD", mu: "MUR",
                  };
                  const localCur = LOCALE_TO_CUR[locale];
                  if (localCur && cur === "USD") cur = localCur;

                  let priceUSD = priceVal;
                  if (cur !== "USD" && CURRENCY_TO_USD[cur]) {
                    priceUSD = Math.round(priceVal * CURRENCY_TO_USD[cur] * 100) / 100;
                  }

                  if (priceUSD > 0 && priceUSD < 500 && !isSuspiciousPrice(priceUSD, `bing-ao-og(${cur})`)) {
                    console.log(`[Bing] ✓ Found OG price ${priceVal} ${cur} = $${priceUSD} via AllOrigins`);
                    const ogTitle = aoHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
                    const ogImage = aoHtml.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
                    return await buildSuccessResponse({
                      price: priceUSD,
                      currency: "USD",
                      productName: ogTitle ? decodeHtmlEntities(ogTitle).replace(/\s*[-|]\s*Temu\s*$/i, "").trim() : urlProductName,
                      productDescription: null,
                      canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
                      originalPrice: null,
                      image: ogImage || shareImage,
                      source: `bing-ao-og(${cur})`,
                      antiBotDetected: false,
                    }, urlProductName, ogImage || shareImage, goodsId);
                  }
                }
              } catch { /* try next URL */ }
            }
          }

          console.log("[Bing] No price found via Bing search");
        }
      } catch (err) {
        console.log(`[Bing] Error: ${String(err).slice(0, 150)}`);
      }
    }

    // ─── FAST PATH: ZAI Web Search snippet extraction (2-3 seconds) ───
    // This is the fastest strategy that actually works on Vercel (Hobby plan = 10s limit).
    // AllOrigins, page_reader, and direct fetch are too slow or blocked by Temu anti-bot.
    // The web search returns price snippets from various Temu locale pages.
    if (isTemu && (goodsId || isItemId)) {
      console.log(`[Fast Path] Trying ZAI web search snippet extraction (goodsId=${goodsId}, itemId=${isItemId ? trimmedUrl : "none"})...`);
      try {
        const zai = await createZAI();
        const searchQueries: string[] = [];
        if (isItemId) {
          searchQueries.push(`temu "${trimmedUrl}"`);
        }
        if (goodsId && /^\d{10,}$/.test(goodsId)) {
          searchQueries.push(`site:temu.com ${goodsId}`);
        }

        for (const query of searchQueries) {
          try {
            console.log(`[Fast Path] Searching: ${query}`);
            const searchResults = await (zai as any).invokeFunction("web_search", {
              query,
              num: 5,
            });

            if (!Array.isArray(searchResults) || searchResults.length === 0) continue;

            // Extract prices from search result snippets
            const snippetPrices = extractPricesFromSnippets(
              searchResults.filter((r: any) => r.url?.includes("temu.com")),
              goodsId
            );
            const validPrices = snippetPrices.filter(
              (p: any) => !isSuspiciousPrice(p.usd, `fast-path(${p.currency})`)
            );

            if (validPrices.length > 0) {
              // Prefer USD, then lowest price
              validPrices.sort((a: any, b: any) => {
                if (a.currency === "USD" && b.currency !== "USD") return -1;
                if (b.currency === "USD" && a.currency !== "USD") return 1;
                return a.usd - b.usd;
              });
              const best = validPrices[0];
              if (best.usd > 0.5 && best.usd < 500) {
                console.log(`[Fast Path] ✓ Found price from snippet: ${best.originalAmount} ${best.currency} = $${best.usd} USD`);
                return await buildSuccessResponse({
                  price: best.usd,
                  currency: "USD",
                  productName: best.productName || urlProductName,
                  productDescription: null,
                  canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
                  originalPrice: best.originalPriceUSD || null,
                  image: shareImage,
                  source: `fast-path-snippet(${best.currency})`,
                  antiBotDetected: false,
                }, urlProductName, shareImage, goodsId);
              }
            }

            // If no price in snippets, try extracting from search result names
            for (const result of searchResults.filter((r: any) => r.url?.includes("temu.com"))) {
              const nameMatch = result.name || "";
              const snippetMatch = result.snippet || "";
              const combined = `${nameMatch} ${snippetMatch}`;

              // Look for price patterns in the combined text
              // Australian prices: AU$X.XX
              const auPrice = combined.match(/AU\$(\d+\.?\d*)/i);
              if (auPrice) {
                const audPrice = parseFloat(auPrice[1]);
                const usdPrice = Math.round(audPrice * 0.65 * 100) / 100; // AUD → USD
                if (usdPrice > 0.5 && usdPrice < 500 && !isSuspiciousPrice(usdPrice, "fast-path-AU")) {
                  console.log(`[Fast Path] ✓ Found AU$${audPrice} = $${usdPrice} USD from search result`);
                  return await buildSuccessResponse({
                    price: usdPrice,
                    currency: "USD",
                    productName: nameMatch.replace(/\s*[-|]\s*Temu\s*$/i, "").trim() || urlProductName,
                    productDescription: null,
                    canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
                    originalPrice: null,
                    image: shareImage,
                    source: "fast-path-AUD",
                    antiBotDetected: false,
                  }, urlProductName, shareImage, goodsId);
                }
              }

              // Mauritius prices: Rs X.XX or MUR X.XX
              const muPrice = combined.match(/Rs\s*(\d+\.?\d*)/i) || combined.match(/(\d+\.?\d*)\s*Rs/i);
              if (muPrice) {
                const murPrice = parseFloat(muPrice[1]);
                const usdPrice = Math.round(murPrice * 0.022 * 100) / 100; // MUR → USD
                if (usdPrice > 0.5 && usdPrice < 500 && !isSuspiciousPrice(usdPrice, "fast-path-MUR")) {
                  console.log(`[Fast Path] ✓ Found Rs${murPrice} = $${usdPrice} USD from search result`);
                  return await buildSuccessResponse({
                    price: usdPrice,
                    currency: "USD",
                    productName: nameMatch.replace(/\s*[-|]\s*Temu\s*$/i, "").trim() || urlProductName,
                    productDescription: null,
                    canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
                    originalPrice: null,
                    image: shareImage,
                    source: "fast-path-MUR",
                    antiBotDetected: false,
                  }, urlProductName, shareImage, goodsId);
                }
              }

              // PKR prices: Rs X.XX (Pakistan)
              const pkMatch = result.url.match(/temu\.com\/pk/i);
              if (pkMatch) {
                const pkrPrice = combined.match(/Rs\s*(\d+\.?\d*)/i) || combined.match(/(\d+\.?\d*)\s*Rs/i);
                if (pkrPrice) {
                  const pkrVal = parseFloat(pkrPrice[1]);
                  const usdPrice = Math.round(pkrVal * 0.0036 * 100) / 100; // PKR → USD
                  if (usdPrice > 0.5 && usdPrice < 500 && !isSuspiciousPrice(usdPrice, "fast-path-PKR")) {
                    console.log(`[Fast Path] ✓ Found PKR Rs${pkrVal} = $${usdPrice} USD from search result`);
                    return await buildSuccessResponse({
                      price: usdPrice,
                      currency: "USD",
                      productName: nameMatch.replace(/\s*[-|]\s*Temu\s*$/i, "").trim() || urlProductName,
                      productDescription: null,
                      canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
                      originalPrice: null,
                      image: shareImage,
                      source: "fast-path-PKR",
                      antiBotDetected: false,
                    }, urlProductName, shareImage, goodsId);
                  }
                }
              }

              // OMR prices: OMR X.XX or ر.ع.
              const omrPrice = combined.match(/OMR\s*(\d+\.?\d*)/i);
              if (omrPrice) {
                const omrVal = parseFloat(omrPrice[1]);
                const usdPrice = Math.round(omrVal * 2.60 * 100) / 100; // OMR → USD
                if (usdPrice > 0.5 && usdPrice < 500 && !isSuspiciousPrice(usdPrice, "fast-path-OMR")) {
                  console.log(`[Fast Path] ✓ Found OMR${omrVal} = $${usdPrice} USD from search result`);
                  return await buildSuccessResponse({
                    price: usdPrice,
                    currency: "USD",
                    productName: nameMatch.replace(/\s*[-|]\s*Temu\s*$/i, "").trim() || urlProductName,
                    productDescription: null,
                    canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
                    originalPrice: null,
                    image: shareImage,
                    source: "fast-path-OMR",
                    antiBotDetected: false,
                  }, urlProductName, shareImage, goodsId);
                }
              }

              // Generic $X.XX price (likely USD from US/UK Temu pages)
              const usdPrice = combined.match(/\$\s*(\d+\.?\d*)/);
              if (usdPrice) {
                const val = parseFloat(usdPrice[1]);
                if (val > 0.5 && val < 500 && !isSuspiciousPrice(val, "fast-path-USD")) {
                  console.log(`[Fast Path] ✓ Found $${val} USD from search result`);
                  return await buildSuccessResponse({
                    price: val,
                    currency: "USD",
                    productName: nameMatch.replace(/\s*[-|]\s*Temu\s*$/i, "").trim() || urlProductName,
                    productDescription: null,
                    canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
                    originalPrice: null,
                    image: shareImage,
                    source: "fast-path-USD",
                    antiBotDetected: false,
                  }, urlProductName, shareImage, goodsId);
                }
              }
            }
          } catch (err) {
            console.log(`[Fast Path] Search error: ${String(err).slice(0, 100)}`);
          }
        }
        console.log("[Fast Path] No price found in search snippets");
      } catch (err) {
        console.log(`[Fast Path] Error: ${String(err).slice(0, 150)}`);
      }
    }

    // ─── Strategy -0.5: Web Search → AllOrigins (MOST RELIABLE for share URLs) ───
    // For share URLs that have a goods_id, search for the product on different Temu locale
    // pages (pk-en, om-en, bh, mu, etc.). These locale pages often have OG price meta tags
    // that are accessible via AllOrigins, even when the US/dz-en pages are blocked.
    // This is the KEY fix for share.temu.com links from the Algerian market.
    if (isTemu && (goodsId || isItemId)) {
      const searchGoodsId = isItemId ? null : (goodsId || null);
      const searchItemId = isItemId ? trimmedUrl : null;
      console.log(`[Strategy -0.5] Trying Web Search → AllOrigins (goodsId=${searchGoodsId}, itemId=${searchItemId})...`);

      try {
        const zai = await createZAI();

        // Step 1: Search for the product
        const searchQueries: string[] = [];
        if (searchItemId) {
          searchQueries.push(`temu "${searchItemId}"`);
          searchQueries.push(`site:temu.com ${searchItemId}`);
        }
        if (searchGoodsId && /^\d{10,}$/.test(searchGoodsId)) {
          searchQueries.push(`site:temu.com ${searchGoodsId}`);
          // Also search with the -g- pattern which finds different locale pages
          searchQueries.push(`temu -g-${searchGoodsId}`);
        }

        const allSearchResults: { name: string; url: string; snippet: string }[] = [];
        const seenUrls = new Set<string>();

        for (const query of searchQueries) {
          try {
            console.log(`[Strategy -0.5] Searching: ${query}`);
            const results = await (zai as any).invokeFunction("web_search", { query, num: 8 });
            if (Array.isArray(results)) {
              for (const r of results) {
                if (r.url?.includes("temu.com") && !seenUrls.has(r.url)) {
                  seenUrls.add(r.url);
                  allSearchResults.push({ name: r.name || "", url: r.url, snippet: r.snippet || "" });
                }
              }
            }
          } catch { /* search error */ }
        }

        // Step 2: Try to extract prices from search result snippets first
        if (allSearchResults.length > 0) {
          const snippetPrices = extractPricesFromSnippets(allSearchResults, searchGoodsId);
          // Filter out suspicious prices
          const validSnippetPrices = snippetPrices.filter(p => !isSuspiciousPrice(p.usd, `strategy-0.5-snippet(${p.currency})`));
          if (validSnippetPrices.length > 0) {
            // Prefer USD, then lowest price
            validSnippetPrices.sort((a, b) => {
              if (a.currency === "USD" && b.currency !== "USD") return -1;
              if (b.currency === "USD" && a.currency !== "USD") return 1;
              return a.usd - b.usd;
            });
            const best = validSnippetPrices[0];
            if (best.usd > 0.5 && best.usd < 500) {
              console.log(`[Strategy -0.5] ✓ Found price from snippet: ${best.originalAmount} ${best.currency} = $${best.usd} USD`);
              return await buildSuccessResponse({
                price: best.usd,
                currency: "USD",
                productName: best.productName || urlProductName,
                productDescription: null,
                canonicalUrl: searchGoodsId ? `https://www.temu.com/-g-${searchGoodsId}.html` : null,
                originalPrice: best.originalPriceUSD || null,
                image: shareImage,
                source: `search-snippet(${best.currency})`,
                antiBotDetected: false,
              }, urlProductName, shareImage, searchGoodsId || goodsId);
            }
          }
        }

        // Step 3: Try AllOrigins on search result URLs to get OG price
        // Prioritize non-US locale URLs (pk-en, om-en, bh, mu) which often have OG prices
        const localeUrls = allSearchResults
          .filter(r => r.url.includes("-g-") || r.url.includes("goods.html"))
          .sort((a, b) => {
            // Prefer non-US locale pages (they tend to have OG price tags)
            const aLocale = a.url.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i)?.[1] || "us";
            const bLocale = b.url.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i)?.[1] || "us";
            const aIsUS = aLocale === "us" || !a.url.match(/temu\.com\/[a-z]{2}/i);
            const bIsUS = bLocale === "us" || !b.url.match(/temu\.com\/[a-z]{2}/i);
            if (aIsUS && !bIsUS) return 1;
            if (!aIsUS && bIsUS) return -1;
            return 0;
          });

        for (const result of localeUrls.slice(0, 5)) {
          try {
            // Try AllOrigins on this search result URL
            const targetUrl = result.url;
            const proxyUrls = [
              `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
              `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
            ];

            for (const proxyUrl of proxyUrls) {
              try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 12000);
                const proxyRes = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeout);

                if (!proxyRes.ok) continue;

                const isRaw = proxyUrl.includes("/raw?");
                let html: string | null = null;
                if (isRaw) {
                  html = await proxyRes.text();
                  if (!html || html.length < 3000) continue;
                } else {
                  const data = await proxyRes.json();
                  html = typeof data === "string" ? data : data?.contents;
                  if (!html || typeof html !== "string" || html.length < 3000) continue;
                }

                // Check for OG price meta tag
                const ogPriceMatch = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
                const ogCurrencyMatch = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
                const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
                const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);

                if (ogPriceMatch) {
                  const priceVal = parseFloat(ogPriceMatch[1]);
                  let cur = ogCurrencyMatch?.[1] || "USD";

                  // Determine real currency from the URL locale
                  const urlLocale = targetUrl.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i)?.[1]?.toLowerCase();
                  if (urlLocale && cur === "USD") {
                    const LOCALE_TO_CUR: Record<string, string> = {
                      "dz-en": "DZD", "dz-fr": "DZD", "dz-ar": "DZD", dz: "DZD",
                      "ma-en": "MAD", "ma-fr": "MAD", ma: "MAD",
                      "tn-en": "TND", tn: "TND",
                      "pk-en": "PKR", "pk-ur": "PKR", pk: "PKR",
                      "om-en": "OMR", om: "OMR",
                      "bh-en": "BHD", bh: "BHD",
                      "sa-en": "SAR", sa: "SAR",
                      "ae-en": "AED", ae: "AED",
                      "eg-en": "EGP", eg: "EGP",
                      mu: "MUR",
                    };
                    const localCur = LOCALE_TO_CUR[urlLocale];
                    if (localCur && localCur !== "USD") cur = localCur;
                  }

                  // Convert to USD
                  let priceUSD = priceVal;
                  if (cur !== "USD" && CURRENCY_TO_USD[cur]) {
                    priceUSD = Math.round(priceVal * CURRENCY_TO_USD[cur] * 100) / 100;
                  }

                  if (priceUSD > 0 && priceUSD < 100000 && !isSuspiciousPrice(priceUSD, `search-allorigins-og(${cur})`)) {
                    const productName = ogTitleMatch ? decodeHtmlEntities(ogTitleMatch).replace(/\s*[-|]\s*Temu\s*$/i, "").trim() : null;
                    const productImage = ogImageMatch || shareImage;
                    const foundGoodsId = targetUrl.match(/-g-(\d{10,})/)?.[1] || searchGoodsId || goodsId;

                    console.log(`[Strategy -0.5] ✓ Found OG price ${priceVal} ${cur} = $${priceUSD} from ${targetUrl.substring(0, 60)}`);
                    return await buildSuccessResponse({
                      price: priceUSD,
                      currency: "USD",
                      productName,
                      productDescription: null,
                      canonicalUrl: foundGoodsId ? `https://www.temu.com/-g-${foundGoodsId}.html` : null,
                      originalPrice: null,
                      image: productImage,
                      source: `search-allorigins-og(${cur})`,
                      antiBotDetected: false,
                    }, urlProductName, productImage || shareImage, foundGoodsId || goodsId);
                  }
                }

                // Also try priceInfo extraction from the HTML
                const aoResult = extractProductInfo(html, targetUrl);
                if (aoResult.price && aoResult.price > 0) {
                  let priceUSD = aoResult.price;
                  const urlLocale = targetUrl.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i)?.[1]?.toLowerCase();
                  if (aoResult.currency !== "USD" && CURRENCY_TO_USD[aoResult.currency]) {
                    priceUSD = Math.round(aoResult.price * CURRENCY_TO_USD[aoResult.currency] * 100) / 100;
                  } else if (urlLocale && aoResult.currency === "USD") {
                    const LOCALE_TO_CUR: Record<string, string> = {
                      "dz-en": "DZD", "dz-fr": "DZD", dz: "DZD",
                      "ma-en": "MAD", ma: "MAD", "pk-en": "PKR", pk: "PKR",
                      "om-en": "OMR", om: "OMR", "bh-en": "BHD", bh: "BHD",
                      "sa-en": "SAR", sa: "SAR", "ae-en": "AED", ae: "AED",
                    };
                    const localCur = LOCALE_TO_CUR[urlLocale];
                    if (localCur && localCur !== "USD" && CURRENCY_TO_USD[localCur]) {
                      priceUSD = Math.round(aoResult.price * CURRENCY_TO_USD[localCur] * 100) / 100;
                    }
                  }

                  if (!isSuspiciousPrice(priceUSD, `search-allorigins-html(${aoResult.currency})`)) {
                    console.log(`[Strategy -0.5] ✓ Found HTML price ${aoResult.price} ${aoResult.currency} = $${priceUSD} from ${targetUrl.substring(0, 60)}`);
                    const foundGoodsId = targetUrl.match(/-g-(\d{10,})/)?.[1] || searchGoodsId || goodsId;
                    return await buildSuccessResponse({
                      ...aoResult,
                      price: priceUSD,
                      currency: "USD",
                      image: aoResult.image || shareImage,
                    }, urlProductName, aoResult.image || shareImage, foundGoodsId || goodsId);
                  }
                }
              } catch { /* proxy error, try next */ }
            }
          } catch { /* try next URL */ }
        }

        // Step 4: Use LLM on search results as fallback
        if (allSearchResults.length > 0) {
          const searchContext = allSearchResults.slice(0, 8)
            .map((r, i) => `${i + 1}. ${r.name}\n   URL: ${r.url}\n   Snippet: ${r.snippet}`)
            .join("\n\n");

          const completion = await (zai as any).createChatCompletion({
            messages: [
              {
                role: "system",
                content:
                  "You are a price extraction assistant for Temu products. " +
                  "Extract the SALE PRICE from the search results.\n" +
                  "IMPORTANT RULES:\n" +
                  "1. Convert all prices to USD. Common rates: OMR→USD ×2.60, BHD→USD ×2.65, MUR(Rs)→USD ×0.022, PKR→USD ×0.0036, EUR→USD ×1.08, DZD→USD ×0.00333, SAR→USD ×0.27, AED→USD ×0.27.\n" +
                  "2. Look for prices in snippets like: OMR3.56, Rs 2612, $7.01, BHD 1.23, 59% OFF\n" +
                  "3. Do NOT confuse discount percentages with the product price.\n" +
                  "4. NEVER return $30.00 — this is a delivery guarantee amount, NOT the product price.\n" +
                  "5. Return ONLY JSON: {\"price_usd\": <number>, \"name\": \"<product_name>\", \"confidence\": \"<high|medium|low>\"}\n" +
                  "6. If no clear price found, return {\"price_usd\": null, \"confidence\": \"low\"}",
              },
              {
                role: "user",
                content: `Product goods_id: ${searchGoodsId || "unknown"}\nItem ID: ${searchItemId || "unknown"}\n\nSearch Results:\n${searchContext}\n\nExtract price in USD. Return JSON only.`,
              },
            ],
          });

          const aiResponse = completion.choices?.[0]?.message?.content || "";
          const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              const priceUSD = typeof parsed.price_usd === "number" ? parsed.price_usd : parseFloat(String(parsed.price_usd));
              if (priceUSD && priceUSD > 0 && priceUSD < 500 && !isSuspiciousPrice(priceUSD, "search-llm")) {
                console.log(`[Strategy -0.5] ✓ LLM found price: $${priceUSD} (confidence: ${parsed.confidence})`);
                return await buildSuccessResponse({
                  price: priceUSD,
                  currency: "USD",
                  productName: parsed.name || urlProductName,
                  productDescription: null,
                  canonicalUrl: searchGoodsId ? `https://www.temu.com/-g-${searchGoodsId}.html` : null,
                  originalPrice: null,
                  image: shareImage,
                  source: `search-llm(${parsed.confidence})`,
                  antiBotDetected: false,
                }, urlProductName, shareImage, searchGoodsId || goodsId);
              }
            } catch { /* JSON parse error */ }
          }
        }

        // If we found a goods_id from the search but no price, save it for later strategies
        const foundGoodsIdFromSearch = allSearchResults
          .map(r => r.url.match(/-g-(\d{10,})/)?.[1])
          .find(id => id && id !== goodsId);
        if (foundGoodsIdFromSearch && !goodsId) {
          goodsId = foundGoodsIdFromSearch;
          console.log(`[Strategy -0.5] Found goods_id from search: ${goodsId}`);
        }
      } catch (err) {
        console.log(`[Strategy -0.5] Error: ${String(err).slice(0, 150)}`);
      }
    }

    // Strategy 0: URL params (the cheapest & most reliable for share URLs with _oak_rec_ext_1)
    console.log("[Strategy 0] Trying URL params extraction (FREE)...");
    const urlResult = extractFromUrlParams(finalUrl);
    if (urlResult?.price && urlResult.price > 0) {
      if (isSuspiciousPrice(urlResult.price, urlResult.source || "url-params")) {
        console.log(`[Strategy 0] ⚠️ Skipping suspicious $${urlResult.price} price from URL params — trying next strategy`);
      } else {
        console.log(`[Strategy 0] ✓ Got price $${urlResult.price} from URL hint`);
        return await buildSuccessResponse(urlResult, urlProductName, shareImage, goodsId);
      }
    }

    // ─── Strategy -2: ZAI LLM Direct Price Query (MOST RELIABLE for share URLs) ───
    // When we have a goods_id from a share URL redirect (or an Item ID),
    // and the pre-extracted price isn't available, use the ZAI LLM with
    // web search to find the product price. This is the most reliable
    // strategy because Temu blocks all other approaches (anti-bot).
    // The web search finds indexed Temu pages with price snippets in
    // various currencies, and the LLM converts them to USD.
    if (isTemu && (goodsId || isItemId)) {
      const llmGoodsId = isItemId ? null : (goodsId || null);
      const llmItemId = isItemId ? trimmedUrl : null;
      console.log(`[Strategy -2] Trying ZAI LLM Direct (goodsId=${llmGoodsId}, itemId=${llmItemId}, locale=${shareLocale || "none"})...`);
      const llmDirectResult = await fetchPriceWithLLMDirect(llmGoodsId, llmItemId, urlProductName, shareLocale);
      if (llmDirectResult) {
        if (llmDirectResult.price && llmDirectResult.price > 0) {
          if (isSuspiciousPrice(llmDirectResult.price, llmDirectResult.source)) {
            console.log(`[Strategy -2] Skipping suspicious $${llmDirectResult.price} from LLM Direct — trying next strategy`);
          } else {
            console.log(`[Strategy -2] ✓ Got price $${llmDirectResult.price} from LLM Direct`);
            const bestImage = shareImage || llmDirectResult.image;
            const bestGoodsId = goodsId || llmDirectResult.canonicalUrl?.match(/-g-(\d{10,})/)?.[1] || "";
            return await buildSuccessResponse(llmDirectResult, urlProductName, bestImage, bestGoodsId);
          }
        }
        // LLM Direct found product name but no price — save the goods_id if found
        if (llmDirectResult.productName && !urlProductName) {
          // Continue to next strategies — we have the product name
        }
        // If LLM Direct found a goods_id from Item ID search, save it
        const foundGoodsId = llmDirectResult.canonicalUrl?.match(/-g-(\d{10,})/)?.[1];
        if (foundGoodsId && !goodsId) {
          goodsId = foundGoodsId;
          console.log(`[Strategy -2] Found goods_id from LLM Direct: ${goodsId}`);
        }
      }
    }

    // Strategy 0b-EARLY: Temu BG API — try early when we have a goods_id from share URL
    // This is the most reliable way to get the CORRECT price when _oak_rec_ext_1
    // encodes the wrong amount (e.g., delivery guarantee $30.00 instead of actual price).
    // The BG API returns product data directly from Temu's backend.
    if (goodsId && /^\d{10,}$/.test(goodsId)) {
      console.log(`[Strategy 0b-EARLY] Trying Temu BG API with goods_id=${goodsId}...`);
      const earlyApiResult = await fetchTemuBgApi(goodsId);
      if (earlyApiResult) {
        if (earlyApiResult.price && earlyApiResult.price > 0) {
          if (isSuspiciousPrice(earlyApiResult.price, earlyApiResult.source || "bg-api-early")) {
            console.log(`[Strategy 0b-EARLY] Skipping suspicious $${earlyApiResult.price} price from BG API — trying next strategy`);
          } else {
            console.log(`[Strategy 0b-EARLY] ✓ Got price $${earlyApiResult.price} from Temu BG API`);
            return await buildSuccessResponse(earlyApiResult, urlProductName, shareImage, goodsId);
          }
        }
      }
    }

    // ─── Strategy 0.5: AllOrigins with retries (BEST for share URLs) ───
    // Temu blocks direct access but AllOrigins proxy sometimes bypasses the
    // anti-bot and returns the full product page with OG meta tags including
    // the price. We try multiple URL formats and retry up to 3 times.
    // This is moved before the expensive ZAI strategies because it's FREE
    // and has a good success rate for Temu products.
    if (isTemu) {
      console.log("[Strategy 0.5] Trying AllOrigins with retries...");
      const aoUrls: string[] = [];
      // Try the reconstructed clean URL first
      if (goodsId) {
        aoUrls.push(`https://www.temu.com/-g-${goodsId}.html?_x_sessn=us&currency=USD`);
      }
      // Try the resolved share URL (may have locale that shows OG tags)
      if (resolvedShareUrl) {
        // Strip _oak_rec_ext_1 from the resolved URL to avoid wrong price
        try {
          const aoParsed = new URL(resolvedShareUrl);
          aoParsed.searchParams.delete("_oak_rec_ext_1");
          if (!aoParsed.searchParams.has("_x_sessn")) {
            aoParsed.searchParams.set("_x_sessn", "us");
            aoParsed.searchParams.set("currency", "USD");
          }
          aoUrls.push(aoParsed.toString());
        } catch { /* skip */ }
      }
      // Try the plain product URL without extra params
      if (goodsId) {
        aoUrls.push(`https://www.temu.com/-g-${goodsId}.html`);
      }
      // Also try with the goods.html format
      if (goodsId && /^\d{10,}$/.test(goodsId)) {
        aoUrls.push(`https://www.temu.com/goods.html?goods_id=${goodsId}&_x_sessn=us&currency=USD`);
      }
      // IMPORTANT: Try the LOCALIZED URL — this often bypasses anti-bot!
      // The localized URL (e.g., /dz-en/goods.html?goods_id=...) sometimes returns
      // the full product page with OG tags including price, while the US URL gets
      // blocked. This is the KEY fix for share.temu.com links.
      if (localizedShareUrl) {
        aoUrls.unshift(localizedShareUrl); // Put FIRST — highest success rate
        console.log(`[Strategy 0.5] Added localized URL: ${localizedShareUrl}`);
      }
      // Also try localized goods.html with the locale from share URL
      if (shareLocale && goodsId && /^\d{10,}$/.test(goodsId)) {
        // Try with USD currency forced — more reliable for price extraction
        aoUrls.unshift(`https://www.temu.com/${shareLocale}/goods.html?goods_id=${goodsId}&currency=USD`);
      }

      for (const aoUrl of aoUrls) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.log(`[Strategy 0.5] Attempt ${attempt}/3 for ${aoUrl.slice(0, 80)}...`);
            // Try both /raw and /get endpoints for reliability
            const proxyUrls = [
              `https://api.allorigins.win/raw?url=${encodeURIComponent(aoUrl)}`,
              `https://api.allorigins.win/get?url=${encodeURIComponent(aoUrl)}`,
            ];
            
            let aoHtml: string | null = null;
            let usedProxyUrl = "";
            
            for (const proxyUrl of proxyUrls) {
              try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 20000);
                const aoResponse = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeout);

                if (!aoResponse.ok) continue;

                const isRawEndpoint = proxyUrl.includes("/raw?");
                if (isRawEndpoint) {
                  // /raw endpoint returns HTML directly
                  const text = await aoResponse.text();
                  if (text && text.length > 5000 && text.includes("<")) {
                    aoHtml = text;
                    usedProxyUrl = proxyUrl;
                    break;
                  }
                } else {
                  // /get endpoint returns JSON with contents field
                  const aoData = await aoResponse.json();
                  const contents = typeof aoData === "string" ? aoData : aoData?.contents;
                  if (contents && typeof contents === "string" && contents.length > 5000) {
                    aoHtml = contents;
                    usedProxyUrl = proxyUrl;
                    break;
                  }
                }
              } catch { /* try next proxy endpoint */ }
            }
            
            if (!aoHtml || aoHtml.length < 5000) {
              console.log(`[Strategy 0.5] HTML too short (${aoHtml?.length || 0}), retrying...`);
              if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
              continue;
            }

            console.log(`[Strategy 0.5] Got HTML: ${aoHtml.length} chars`);

            // Extract price using the comprehensive extractProductInfo function
            const aoResult = extractProductInfo(aoHtml, aoUrl);

            // Validate: check if we actually got the product page (not anti-bot)
            const hasOgbTitle = /<meta[^>]*property=["']og:title["'][^>]*content=["']([^'"]+)["']/i.test(aoHtml);
            const isAntiBot = !hasOgbTitle && aoHtml.length < 450000 && (aoHtml.match(/verify/gi) || []).length > 50;

            if (aoResult.price && aoResult.price > 0 && !isAntiBot) {
              // Convert price to USD — handle both localized currency and explicit non-USD currencies
              let priceUSD = aoResult.price;
              let priceCurrency = aoResult.currency;
              const aoUrlLocale = aoUrl.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i)?.[1]?.toLowerCase();

              // Case 1: Price is in a non-USD currency (e.g., EUR from JSON-LD) — convert to USD
              if (priceCurrency !== "USD" && CURRENCY_TO_USD[priceCurrency]) {
                priceUSD = Math.round(aoResult.price * CURRENCY_TO_USD[priceCurrency] * 100) / 100;
                console.log(`[Strategy 0.5] Converting ${aoResult.price} ${priceCurrency} → $${priceUSD} USD`);
              }

              // Case 2: Price is labeled as USD but the URL has a locale prefix — the price
              // is actually in the LOCAL currency, not USD. Re-convert.
              if (aoUrlLocale && priceCurrency === "USD") {
                const LOCALE_TO_CURRENCY: Record<string, string> = {
                  "dz-en": "DZD", "dz-fr": "DZD", "dz-ar": "DZD", dz: "DZD",
                  "ma-en": "MAD", "ma-fr": "MAD", "ma-ar": "MAD", ma: "MAD",
                  "tn-en": "TND", "tn-fr": "TND", "tn-ar": "TND", tn: "TND",
                  "pk-en": "PKR", "pk-ur": "PKR", pk: "PKR",
                  "om-en": "OMR", "om-ar": "OMR", om: "OMR",
                  "bh-en": "BHD", "bh-ar": "BHD", bh: "BHD",
                  "sa-en": "SAR", "sa-ar": "SAR", sa: "SAR",
                  "ae-en": "AED", "ae-ar": "AED", ae: "AED",
                  "eg-en": "EGP", "eg-ar": "EGP", eg: "EGP",
                  "kw-en": "KWD", "kw-ar": "KWD", kw: "KWD",
                  "qa-en": "QAR", "qa-ar": "QAR", qa: "QAR",
                  "jo-en": "JOD", "jo-ar": "JOD", jo: "JOD",
                  "in-en": "INR", "in-hi": "INR", in: "INR",
                  "ph-en": "PHP", ph: "PHP",
                  "br-pt": "BRL", br: "BRL",
                  "mx-es": "MXN", mx: "MXN",
                  mu: "MUR", ec: "USD", lk: "LKR", np: "NPR", bd: "BDT",
                };
                const localCur = LOCALE_TO_CURRENCY[aoUrlLocale];
                if (localCur && localCur !== "USD" && CURRENCY_TO_USD[localCur]) {
                  // The price is actually in local currency, not USD — convert!
                  priceUSD = Math.round(aoResult.price * CURRENCY_TO_USD[localCur] * 100) / 100;
                  priceCurrency = localCur;
                  console.log(`[Strategy 0.5] Locale ${aoUrlLocale} detected — converting ${aoResult.price} ${localCur} → $${priceUSD} USD`);
                }
              }
              // Check for suspicious $30.00 price (delivery guarantee)
              if (isSuspiciousPrice(priceUSD, aoResult.source || "allorigins")) {
                console.log(`[Strategy 0.5] ⚠️ Skipping suspicious $${priceUSD} price from AllOrigins — likely delivery guarantee amount. Trying next URL...`);
                if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
                continue; // Skip this attempt, try next
              }
              console.log(`[Strategy 0.5] ✓ Got price $${priceUSD} from AllOrigins (attempt ${attempt}, source: ${aoResult.source}, original currency: ${priceCurrency})`);
              const convertedResult = { ...aoResult, price: priceUSD, currency: "USD" };
              return await buildSuccessResponse(convertedResult, urlProductName, shareImage, goodsId);
            }

            if (hasOgbTitle) {
              // We got the real product page but no price in extractProductInfo
              // Try to extract OG price directly
              const ogPriceMatch = aoHtml.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^'"]+)["']/i);
              const ogCurrencyMatch = aoHtml.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^'"]+)["']/i);
              if (ogPriceMatch) {
                const priceVal = parseFloat(ogPriceMatch[1]);
                let cur = ogCurrencyMatch?.[1] || "USD";
                // For localized URLs, if the OG currency is missing or USD, check if it's actually local currency
                const aoUrlLocale2 = aoUrl.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i)?.[1]?.toLowerCase();
                if (aoUrlLocale2 && (!ogCurrencyMatch || cur === "USD")) {
                  const LOCALE_TO_CUR: Record<string, string> = {
                    "dz-en": "DZD", "dz-fr": "DZD", "dz-ar": "DZD", dz: "DZD",
                    "ma-en": "MAD", "ma-fr": "MAD", "ma-ar": "MAD", ma: "MAD",
                    "tn-en": "TND", "tn-fr": "TND", "tn-ar": "TND", tn: "TND",
                    "pk-en": "PKR", "pk-ur": "PKR", pk: "PKR",
                    "om-en": "OMR", "om-ar": "OMR", om: "OMR",
                    "bh-en": "BHD", "bh-ar": "BHD", bh: "BHD",
                    "sa-en": "SAR", "sa-ar": "SAR", sa: "SAR",
                    "ae-en": "AED", "ae-ar": "AED", ae: "AED",
                    "eg-en": "EGP", "eg-ar": "EGP", eg: "EGP",
                  };
                  const localCur = LOCALE_TO_CUR[aoUrlLocale2];
                  if (localCur && localCur !== "USD") {
                    cur = localCur;
                    console.log(`[Strategy 0.5] OG price locale override: ${aoUrlLocale2} → ${cur}`);
                  }
                }
                if (priceVal > 0 && priceVal < 100000) {
                  let priceUSD = priceVal;
                  if (cur !== "USD" && CURRENCY_TO_USD[cur]) {
                    priceUSD = Math.round(priceVal * CURRENCY_TO_USD[cur] * 100) / 100;
                  }
                  // Check for suspicious $30.00 price (delivery guarantee)
                  if (isSuspiciousPrice(priceUSD, `allorigins-og-price(${cur})`)) {
                    console.log(`[Strategy 0.5] ⚠️ Skipping suspicious $${priceUSD} OG price — likely delivery guarantee amount`);
                    if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
                    continue; // Skip this attempt, try next
                  }
                  console.log(`[Strategy 0.5] ✓ Got OG price ${priceVal} ${cur} = $${priceUSD} USD`);
                  const ogTitle = aoHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^'"]+)["']/i)?.[1];
                  const ogImage = aoHtml.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^'"]+)["']/i)?.[1];
                  return await buildSuccessResponse({
                    price: priceUSD,
                    currency: "USD",
                    productName: ogTitle ? decodeHtmlEntities(ogTitle).replace(/\s*[-|]\s*Temu\s*$/i, "").trim() : null,
                    productDescription: null,
                    canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
                    originalPrice: null,
                    image: ogImage || shareImage,
                    source: `allorigins-og-price(${cur})`,
                    antiBotDetected: false,
                  }, urlProductName, ogImage || shareImage, goodsId);
                }
              }

              // Got the real page but no price — extract product name and continue
              if (aoResult.productName && !urlProductName) {
                // Save for later
              }
            }

            // Anti-bot page or no price — retry with next attempt
            if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
          } catch (err) {
            console.log(`[Strategy 0.5] Attempt ${attempt} error:`, String(err).slice(0, 80));
            if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
      console.log("[Strategy 0.5] AllOrigins with retries failed for all URLs");
    }

    // Strategy 0-B: Web Search → Page Reader (BEST for share URLs)
    // When we have a goods_id from a share URL redirect, we first use web_search
    // to find the product on Temu (different locales show up in search results),
    // then use page_reader to read the actual product page from the search result URL.
    // This is more reliable than reading the share URL directly because:
    // 1. Search result URLs have the full product slug + -g- format (better for page_reader)
    // 2. Different locale pages might have better anti-bot bypass
    // 3. We can try multiple locale URLs from the search results
    if (isTemu && (goodsId || isItemId)) {
      console.log(`[Strategy 0-B] Trying Web Search → Page Reader...`);
      try {
        const zai = await createZAI();
        const searchQuery = isItemId
          ? `temu "${trimmedUrl}" product`
          : `site:temu.com ${goodsId}`;
        console.log(`[Strategy 0-B] Searching: ${searchQuery}`);

        const searchResults = await (zai as any).invokeFunction("web_search", {
          query: searchQuery,
          num: 10,
        });

        if (Array.isArray(searchResults) && searchResults.length > 0) {
          // Collect product URLs from search results, prioritizing -g- format URLs
          const productUrls: { url: string; locale: string }[] = [];
          for (const r of searchResults) {
            if (!r.url?.includes("temu.com")) continue;
            // For goods_id, must have the ID in the URL; for Item IDs, any Temu product URL is OK
            if (goodsId && !isItemId && !r.url.includes(goodsId) && !r.url.includes(`-g-${goodsId}`)) continue;
            // Extract locale from URL
            const localeMatch = r.url.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i);
            const locale = localeMatch?.[1] || "us";
            productUrls.push({ url: r.url, locale });
          }

          // Sort: prefer US locale, then English locales, then others
          productUrls.sort((a, b) => {
            const aScore = a.locale === "us" ? 0 : a.locale.includes("-en") ? 1 : 2;
            const bScore = b.locale === "us" ? 0 : b.locale.includes("-en") ? 1 : 2;
            return aScore - bScore;
          });

          console.log(`[Strategy 0-B] Found ${productUrls.length} product URLs from search`);

          // Try reading each product URL with page_reader
          for (const { url: productUrl, locale } of productUrls.slice(0, 3)) {
            try {
              console.log(`[Strategy 0-B] Reading product page (${locale}): ${productUrl.slice(0, 80)}...`);
              const pageResult = await (zai as any).invokeFunction("page_reader", {
                url: productUrl,
              });

              const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
              const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;

              if (!content || content.length < 5000) {
                console.log(`[Strategy 0-B] Content too short (${content?.length || 0}), skipping`);
                continue;
              }

              console.log(`[Strategy 0-B] Got content: ${content.length} chars`);

              // Extract price using the comprehensive extractProductInfo
              const extractResult = extractProductInfo(content, productUrl);

              if (extractResult.price && extractResult.price > 0) {
                // Handle currency conversion for localized pages
                let priceUSD = extractResult.price;
                const urlLocale = productUrl.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i)?.[1]?.toLowerCase();
                const LOCALE_TO_CUR: Record<string, string> = {
                  "dz-en": "DZD", "dz-fr": "DZD", "dz-ar": "DZD", dz: "DZD",
                  "ma-en": "MAD", "ma-fr": "MAD", ma: "MAD",
                  "tn-en": "TND", "tn-fr": "TND", tn: "TND",
                  "pk-en": "PKR", pk: "PKR",
                  "om-en": "OMR", om: "OMR",
                  "bh-en": "BHD", bh: "BHD",
                  "sa-en": "SAR", sa: "SAR",
                  "ae-en": "AED", ae: "AED",
                  "eg-en": "EGP", eg: "EGP",
                  "kw-en": "KWD", kw: "KWD",
                  "qa-en": "QAR", qa: "QAR",
                  "jo-en": "JOD", jo: "JOD",
                  "in-en": "INR", in: "INR",
                  "ph-en": "PHP", ph: "PHP",
                  mu: "MUR", om: "OMR",
                };

                // If the page is from a non-US locale and price is labeled as USD,
                // the price might actually be in the local currency
                if (urlLocale && extractResult.currency === "USD") {
                  const localCur = LOCALE_TO_CUR[urlLocale];
                  if (localCur && localCur !== "USD" && CURRENCY_TO_USD[localCur]) {
                    priceUSD = Math.round(extractResult.price * CURRENCY_TO_USD[localCur] * 100) / 100;
                    console.log(`[Strategy 0-B] Locale ${urlLocale} → converting ${extractResult.price} ${localCur} → $${priceUSD} USD`);
                  }
                } else if (extractResult.currency !== "USD" && CURRENCY_TO_USD[extractResult.currency.toUpperCase()]) {
                  priceUSD = Math.round(extractResult.price * CURRENCY_TO_USD[extractResult.currency.toUpperCase()] * 100) / 100;
                }

                if (isSuspiciousPrice(priceUSD, `search-pagereader(${locale})`)) {
                  console.log(`[Strategy 0-B] ⚠️ Skipping suspicious $${priceUSD} from search page reader — trying next URL`);
                  continue;
                }

                console.log(`[Strategy 0-B] ✓ Got price $${priceUSD} from search → page reader (${locale})`);
                const bestImage = shareImage || extractResult.image;
                return await buildSuccessResponse(
                  { ...extractResult, price: priceUSD, currency: "USD" },
                  urlProductName, bestImage, goodsId
                );
              }

              // Also try extracting from rawData in the content
              const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
              if (rawDataMatch && goodsId) {
                const rawDataStr = rawDataMatch[1];
                // Broader search for price — don't require goods_id match in rawData
                // because the page_reader might render the page differently
                const allPriceMatches = [...rawDataStr.matchAll(/"(minPrice|salePrice|price)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
                if (allPriceMatches.length > 0) {
                  // Collect all prices and find the lowest non-suspicious one
                  const priceCandidates: { value: number; field: string }[] = [];
                  for (const m of allPriceMatches) {
                    const val = parseFloat(m[2]);
                    if (val > 0 && val < 100000) {
                      priceCandidates.push({ value: val, field: m[1] });
                    }
                  }

                  if (priceCandidates.length > 0) {
                    // Sort by value and try each one
                    priceCandidates.sort((a, b) => a.value - b.value);
                    const currencyMatch = rawDataStr.match(/"currency"\s*:\s*"([^"]+)"/);
                    const rawCurrency = currencyMatch?.[1] || "USD";

                    for (const candidate of priceCandidates) {
                      const actualPrice = candidate.value > 100 ? candidate.value / 100 : candidate.value;
                      let priceUSD = actualPrice;

                      // Handle locale-based currency
                      if (rawCurrency !== "USD" && CURRENCY_TO_USD[rawCurrency]) {
                        priceUSD = Math.round(actualPrice * CURRENCY_TO_USD[rawCurrency] * 100) / 100;
                      } else if (urlLocale) {
                        const localCur = LOCALE_TO_CUR[urlLocale];
                        if (localCur && localCur !== "USD" && CURRENCY_TO_USD[localCur]) {
                          priceUSD = Math.round(actualPrice * CURRENCY_TO_USD[localCur] * 100) / 100;
                        }
                      }

                      if (!isSuspiciousPrice(priceUSD, `search-pagereader-rawdata(${locale})`)) {
                        console.log(`[Strategy 0-B] ✓ Got price $${priceUSD} from rawData (${candidate.field}: ${candidate.value}, locale: ${locale})`);
                        return await buildSuccessResponse({
                          price: priceUSD,
                          currency: "USD",
                          productName: extractResult.productName,
                          productDescription: null,
                          canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
                          originalPrice: null,
                          image: shareImage || extractResult.image,
                          source: `search-pagereader-rawdata(${locale})`,
                          antiBotDetected: false,
                        }, urlProductName, shareImage || extractResult.image, goodsId);
                      }
                    }
                  }
                }
              }

              // Try LLM extraction as last resort within this strategy
              console.log(`[Strategy 0-B] Trying LLM on page content...`);
              const contentForLLM = content.slice(0, Math.min(content.length, 40000));
              const completion = await (zai as any).createChatCompletion({
                messages: [
                  {
                    role: "system",
                    content:
                      "You are a price extraction assistant for Temu products. " +
                      "You MUST find the SALE PRICE of the MAIN product on this page. " +
                      "CRITICAL RULES:\n" +
                      "1. The product price is shown near the TOP of the page, usually in a large font.\n" +
                      "2. IGNORE any price that is exactly $30.00 or 9,000 DA — this is a 'delivery guarantee' amount, NOT the product price.\n" +
                      "3. IGNORE prices from 'recommended', 'similar', 'you may also like', or 'bought together' sections.\n" +
                      "4. Look for the MAIN product price — it could be shown as $X.XX, DA X,XXX, or in a priceInfo/minPrice field.\n" +
                      "5. If the page is from a non-US locale (e.g., /dz-en/, /bh/, /om-en/), the price shown is in the LOCAL currency, not USD.\n" +
                      "6. Common Temu product prices range from $1-$100 USD (or 300-30,000 DZD).\n" +
                      "7. Return ONLY JSON: {\"price_usd\": <number_in_USD>, \"price_local\": \"<amount> <currency>\", \"product_name\": \"<name>\", \"confidence\": \"<high|medium|low>\"}\n" +
                      "8. If you cannot find the product price, return {\"price_usd\": null, \"confidence\": \"low\"}",
                  },
                  {
                    role: "user",
                    content: `Product goods_id: ${goodsId || "unknown"}\nLocale: ${locale}\n\nPage content:\n${contentForLLM}`,
                  },
                ],
              });

              const aiResponse = completion.choices?.[0]?.message?.content || "";
              const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
              if (jsonMatch) {
                try {
                  const parsed = JSON.parse(jsonMatch[0]);
                  const priceUSD = typeof parsed.price_usd === "number" ? parsed.price_usd : parseFloat(String(parsed.price_usd));
                  if (priceUSD && priceUSD > 0 && priceUSD < 100000) {
                    if (isSuspiciousPrice(priceUSD, `search-pagereader-llm(${locale})`)) {
                      console.log(`[Strategy 0-B] ⚠️ LLM returned suspicious $${priceUSD} — skipping`);
                    } else {
                      console.log(`[Strategy 0-B] ✓ LLM found price $${priceUSD} (${locale})`);
                      return await buildSuccessResponse({
                        price: priceUSD,
                        currency: "USD",
                        productName: parsed.product_name || extractResult.productName,
                        productDescription: null,
                        canonicalUrl: goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null,
                        originalPrice: null,
                        image: shareImage || extractResult.image,
                        source: `search-pagereader-llm(${locale},${parsed.confidence})`,
                        antiBotDetected: false,
                      }, urlProductName, shareImage || extractResult.image, goodsId);
                    }
                  }
                } catch { /* JSON parse error */ }
              }
            } catch (err) {
              console.log(`[Strategy 0-B] Error reading product URL: ${String(err).slice(0, 80)}`);
              continue;
            }
          }
        }
      } catch (err) {
        console.log(`[Strategy 0-B] Error: ${String(err).slice(0, 100)}`);
      }
      console.log("[Strategy 0-B] Web Search → Page Reader failed");
    }

    // Strategy 0-C: Page Reader + LLM (reads the rendered Temu product page)
    // This is the most reliable strategy for share URLs because:
    // - page_reader renders JavaScript and gets the full page content
    // - The LLM can extract the product name and price from the rendered HTML
    // - For share URLs, it follows the redirect and reads the product page
    // - For Item IDs, it reads the Temu search page
    {
      const prGoodsId = isItemId ? null : (goodsId || null);
      const prItemId = isItemId ? trimmedUrl : null;
      const prShareUrl = originalShareUrl; // Only set for share.temu.com URLs
      console.log(`[Strategy 0-C] Trying Page Reader (goodsId=${prGoodsId}, itemId=${prItemId}, shareUrl=${prShareUrl ? "yes" : "no"})...`);
      const pageReaderResult = await fetchPriceWithPageReader(prGoodsId, prItemId, prShareUrl, resolvedShareUrl, shareLocale);
      if (pageReaderResult) {
        if (pageReaderResult.price && pageReaderResult.price > 0) {
          // Check for suspicious $30 price (delivery guarantee amount)
          if (isSuspiciousPrice(pageReaderResult.price, pageReaderResult.source)) {
            console.log(`[Strategy 0-C] Skipping suspicious $30.00 price from page reader — trying next strategy`);
          } else {
            console.log(`[Strategy 0-C] ✓ Got price $${pageReaderResult.price} from page reader`);
            const bestImage = shareImage || pageReaderResult.image;
            const bestGoodsId = goodsId || pageReaderResult.canonicalUrl?.match(/-g-(\d{10,})/)?.[1] || "";
            return await buildSuccessResponse(pageReaderResult, urlProductName, bestImage, bestGoodsId);
          }
        }
        // Page reader found product name but no price — still useful
        if (pageReaderResult.productName && !urlProductName) {
          // Continue to next strategies — we have the product name
        }
        // If page reader found a goods_id from Item ID search, save it
        const foundGoodsId = pageReaderResult.canonicalUrl?.match(/-g-(\d{10,})/)?.[1];
        if (foundGoodsId && !goodsId) {
          goodsId = foundGoodsId;
          console.log(`[Strategy 0-C] Found goods_id from page reader: ${goodsId}`);
        }
      }
    }

    // Strategy 0-AI: ZAI Web Search + LLM (most reliable for Temu since anti-bot blocks all scraping)
    // This searches Google-indexed Temu pages and extracts prices from search snippets or uses LLM.
    // It's especially effective for:
    //   - Share URLs: we have the goods_id, search finds the product on various Temu locales
    //   - Item IDs (TV10922608): search finds the product page with the goods_id
    {
      const searchGoodsId = isItemId ? null : (goodsId || null);
      const searchItemId = isItemId ? trimmedUrl : null;
      console.log(`[Strategy 0-AI] Trying ZAI Web Search (goodsId=${searchGoodsId}, itemId=${searchItemId})...`);
      const webSearchResult = await fetchPriceWithWebSearch(searchGoodsId, searchItemId, finalUrl);
      if (webSearchResult) {
        if (webSearchResult.price && webSearchResult.price > 0) {
          // Check for suspicious $30 price (delivery guarantee amount)
          if (isSuspiciousPrice(webSearchResult.price, webSearchResult.source)) {
            console.log(`[Strategy 0-AI] Skipping suspicious $30.00 price from web search — trying next strategy`);
          } else {
            console.log(`[Strategy 0-AI] ✓ Got price $${webSearchResult.price} from web search`);
            // Use the image from share URL params (more reliable) if available
            const bestImage = shareImage || webSearchResult.image;
            // Use the goods_id from the web search result if we didn't have one (e.g. from Item ID search)
            const bestGoodsId = goodsId || webSearchResult.canonicalUrl?.match(/-g-(\d{10,})/)?.[1] || "";
            return await buildSuccessResponse(webSearchResult, urlProductName, bestImage, bestGoodsId);
          }
        }
        // Web search found the product but no price — still useful for product name and image
        if (webSearchResult.productName) {
          // If we also found a goods_id from the search, try the BG API with it
          const foundGoodsId = webSearchResult.canonicalUrl?.match(/-g-(\d{10,})/)?.[1];
          if (foundGoodsId && !goodsId) {
            goodsId = foundGoodsId;
            console.log(`[Strategy 0-AI] Found goods_id from web search: ${goodsId}`);
          }
          // Continue to next strategies — we have the product name
        }
      }
    }

    // Strategy 0b: Temu BG API (try fetching product JSON directly)
    // When we have a goods_id, we can call Temu's internal API endpoint
    // which returns product details as JSON, including price, name, and image.
    // This is more reliable than scraping HTML pages.
    // For Item IDs (like TV10922608), first try to resolve them via the Item ID URL.
    if (isItemId) {
      console.log(`[Strategy 0b-2] Trying Item ID resolution for ${trimmedUrl}...`);
      const itemIdResult = await fetchTemuByItemId(trimmedUrl);
      if (itemIdResult) {
        if (itemIdResult.foundGoodsId && !goodsId) {
          goodsId = itemIdResult.foundGoodsId;
          console.log(`[Strategy 0b-2] Found goods_id: ${goodsId}`);
        }
        if (itemIdResult.price && itemIdResult.price > 0) {
          if (isSuspiciousPrice(itemIdResult.price, itemIdResult.source || "itemid-resolution")) {
            console.log(`[Strategy 0b-2] Skipping suspicious $${itemIdResult.price} price from Item ID resolution — trying next strategy`);
          } else {
            console.log(`[Strategy 0b-2] ✓ Got price $${itemIdResult.price} from Item ID resolution`);
            return await buildSuccessResponse(itemIdResult, urlProductName, shareImage, goodsId || itemIdResult.foundGoodsId);
          }
        }
        if (itemIdResult.productName) {
          // Found the product but no price — prompt for manual entry
          return NextResponse.json({
            success: true,
            price: null,
            requiresManualPrice: true,
            productName: cleanProductName(itemIdResult.productName) || urlProductName,
            productDescription: itemIdResult.productDescription,
            productImage: itemIdResult.image || shareImage,
            productUrl: itemIdResult.canonicalUrl || finalUrl,
            itemId: itemIdResult.foundGoodsId || trimmedUrl,
            source: itemIdResult.source,
            message: "Produit trouvé. Veuillez saisir le prix affiché على Temu. / تم العثور على المنتج. يرجى إدخال السعر المعروض على Temu.",
          });
        }
      }
    }

    if (goodsId && /^\d{10,}$/.test(goodsId)) {
      console.log(`[Strategy 0b] Trying Temu BG API with goods_id=${goodsId}...`);
      const apiResult = await fetchTemuBgApi(goodsId);
      if (apiResult) {
        if (apiResult.price && apiResult.price > 0) {
          if (isSuspiciousPrice(apiResult.price, apiResult.source || "bg-api")) {
            console.log(`[Strategy 0b] Skipping suspicious $${apiResult.price} price from BG API — trying next strategy`);
          } else {
            console.log(`[Strategy 0b] ✓ Got price $${apiResult.price} from Temu BG API`);
            return await buildSuccessResponse(apiResult, urlProductName, shareImage, goodsId);
          }
        }
        if (apiResult.productName) {
          return NextResponse.json({
            success: true,
            price: null,
            requiresManualPrice: true,
            productName: cleanProductName(apiResult.productName) || urlProductName,
            productDescription: apiResult.productDescription,
            productImage: apiResult.image || shareImage,
            productUrl: apiResult.canonicalUrl || finalUrl,
            itemId: goodsId,
            source: apiResult.source,
            message: "Produit trouvé. Veuillez saisir le prix affiché على Temu. / تم العثور على المنتج. يرجى إدخال السعر المعروض على Temu.",
          });
        }
      }
    }

    // Strategies 1-3: free HTTP-based extraction
    const freeStrategies = [
      { name: "Direct", fn: fetchDirect },
      { name: "AllOrigins", fn: fetchViaAllOrigins },
      { name: "CorsProxy", fn: fetchViaCorsProxy },
    ];

    for (const strat of freeStrategies) {
      console.log(`[Strategy] Trying ${strat.name} (FREE)...`);
      const result = await strat.fn(finalUrl);
      if (result) {
        // If we got a price, return full success
        if (result.price && result.price > 0) {
          if (isSuspiciousPrice(result.price, result.source || strat.name)) {
            console.log(`[Strategy ${strat.name}] Skipping suspicious $${result.price} price — trying next strategy`);
          } else {
            console.log(`[Strategy ${strat.name}] ✓ Got price $${result.price}`);
            return await buildSuccessResponse(result, urlProductName, shareImage, goodsId);
          }
        }
        // If we got a product name (from OG), prompt for manual price entry
        if (result.productName) {
          return NextResponse.json({
            success: true,
            price: null,
            requiresManualPrice: true,
            productName: cleanProductName(result.productName) || urlProductName,
            productDescription: result.productDescription,
            productImage: result.image || shareImage,
            productUrl: result.canonicalUrl || finalUrl,
            itemId: goodsId || undefined,
            antiBotDetected: result.antiBotDetected,
            source: result.source,
            message: result.antiBotDetected
              ? "Produit trouvé. Temu bloque l'extraction automatique du prix — veuillez le saisir manuellement. / تم العثور على المنتج. تم حظر استخراج السعر التلقائي من Temu — يرجى إدخاله يدويًا."
              : "Produit trouvé. Veuillez saisir le prix affiché sur Temu. / تم العثور على المنتج. يرجى إدخال السعر المعروض على Temu.",
          });
        }
      }
    }

    // Strategy 4: ScrapingBee (paid, last resort — only if env var set)
    if (process.env.SCRAPINGBEE_API_KEY) {
      console.log("[Strategy 4] All free strategies failed. Trying ScrapingBee (PAID)...");
      const result = await fetchWithScrapingBee(finalUrl);
      if (result) {
        if (result.price && result.price > 0) {
          if (isSuspiciousPrice(result.price, result.source || "scrapingbee")) {
            console.log(`[Strategy 4] Skipping suspicious $${result.price} price from ScrapingBee`);
          } else {
            return await buildSuccessResponse(result, urlProductName, shareImage, goodsId);
          }
        }
        if (result.productName) {
          return NextResponse.json({
            success: true,
            price: null,
            requiresManualPrice: true,
            productName: cleanProductName(result.productName) || urlProductName,
            productDescription: result.productDescription,
            productImage: result.image || shareImage,
            productUrl: result.canonicalUrl || finalUrl,
            itemId: goodsId || undefined,
            antiBotDetected: result.antiBotDetected,
            source: result.source,
            message: result.antiBotDetected
              ? "Produit trouvé. Temu bloque l'extraction automatique du prix — veuillez le saisir manuellement. / تم العثور على المنتج. تم حظر استخراج السعر التلقائي من Temu — يرجى إدخاله يدويًا."
              : "Produit trouvé. Veuillez saisir le prix affiché sur Temu. / تم العثور على المنتج. يرجى إدخال السعر المعروض على Temu.",
          });
        }
      }
    }

    // ─── All strategies failed ───
    return NextResponse.json({
      success: false,
      error: "Impossible d'extraire les infos produit. Veuillez saisir le prix manuellement. / تعذّر استخراج معلومات المنتج. يرجى إدخال السعر يدويًا.",
      allowManual: true,
      productName: urlProductName,
      productImage: shareImage,
      productUrl: finalUrl,
      itemId: goodsId || undefined,
    });
  } catch (error) {
    console.error("[scrape-price] Fatal error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          "Une erreur est survenue. Veuillez entrer le prix manuellement. / حدث خطأ. يرجى إدخال السعر يدويًا.",
        allowManual: true,
      },
      { status: 500 }
    );
  }
}

/* ─── Helper: Check if a price is suspicious (likely a delivery guarantee / coupon amount) ─── */
function isSuspiciousPrice(priceUSD: number, source: string): boolean {
  // Temu's "delivery guarantee" / "delay credit" is exactly $30.00 (or 9,000 DZD)
  // This is NOT the product price — it's a promotional amount that appears on many Temu pages
  if (priceUSD === 30.00 || priceUSD === 30) {
    console.log(`[PriceCheck] ⚠️ SUSPICIOUS: $30.00 from ${source} — likely "delivery guarantee" amount, not product price`);
    return true;
  }
  // Also check for $30.xx variations
  if (priceUSD >= 29.90 && priceUSD <= 30.10) {
    console.log(`[PriceCheck] ⚠️ SUSPICIOUS: $${priceUSD} from ${source} — close to $30.00 "delivery guarantee" amount`);
    return true;
  }
  // Also check for common delivery guarantee amounts in other currencies
  // Only flag EXACT round dollar amounts from priceInfo (like $5.00, $10.00, $30.00)
  // NOT prices like $4.99, $9.99 etc. which are common product prices
  const exactRoundSuspicious = [5, 8, 10, 13, 15, 20, 30, 50];
  if (exactRoundSuspicious.includes(priceUSD) && source.includes("priceInfo")) {
    // Only flag exact round prices from priceInfo extraction (not from more reliable sources)
    // This catches prices like $5.00, $10.00, $30.00 from priceInfo which are often promos
    // but allows $4.99, $9.99 etc. which are real product prices
    console.log(`[PriceCheck] ⚠️ SUSPICIOUS: $${priceUSD} from ${source} — exact round number from priceInfo, possibly not product price`);
    return true;
  }
  return false;
}

/* ─── Build success response with Algeria pricing ─── */
async function buildSuccessResponse(
  result: TemuProductData,
  urlProductName: string | null,
  shareImage: string | null = null,
  itemId: string | null = null
) {
  let priceUSD = result.price!;

  // Convert to USD if in different currency
  if (result.currency?.toUpperCase() !== "USD") {
    const rates: Record<string, number> = {
      EUR: 1.08,
      GBP: 1.27,
      CNY: 0.14,
      DZD: 0.00333,
    };
    const rate = rates[result.currency.toUpperCase()];
    if (rate) priceUSD = result.price! * rate;
  }

  // FINAL SAFEGUARD: Never return the $30.00 delivery guarantee price
  // This catches any $30.00 that slips through the strategy-level checks
  if (isSuspiciousPrice(priceUSD, "buildSuccessResponse-final-check")) {
    console.log(`[buildSuccessResponse] ⛔ BLOCKED suspicious price $${priceUSD} from source "${result.source}" — returning requiresManualPrice instead`);
    return NextResponse.json({
      success: true,
      price: null,
      requiresManualPrice: true,
      productName: cleanProductName(result.productName) || urlProductName,
      productDescription: result.productDescription,
      productImage: result.image || shareImage,
      productUrl: result.canonicalUrl || itemId ? `https://www.temu.com/-g-${itemId}.html` : null,
      itemId: itemId || undefined,
      source: result.source,
      message: "Le prix extrait semble incorrect (montant de garantie de livraison). Veuillez saisir le prix manuellement. / يبدو أن السعر المستخرج غير صحيح (مبلغ ضمان التوصيل). يرجى إدخال السعر يدويًا.",
    });
  }

  // Ensure we have a fresh exchange rate
  await getUsdToDzdRate();

  // Calculate Algeria price with all fees
  const breakdown = calculateAlgeriaPrice(priceUSD);

  return NextResponse.json({
    success: true,
    price: breakdown.basePriceUSD,
    dzd: breakdown.totalDZD,
    breakdown,
    productName: cleanProductName(result.productName) || urlProductName,
    productDescription: result.productDescription,
    productImage: result.image || shareImage,
    productUrl: result.canonicalUrl,
    originalPrice: result.originalPrice ? Math.round(result.originalPrice * 100) / 100 : null,
    estimated: false,
    manual: false,
    source: result.source,
    itemId: itemId || undefined,
  });
}
