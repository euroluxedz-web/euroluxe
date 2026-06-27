import { NextRequest, NextResponse } from "next/server";
import { getUsdToDzdRate, calculateAlgeriaPrice } from "@/lib/exchange-rate";
import ZAI from "z-ai-web-dev-sdk";

export const maxDuration = 60;
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
): Promise<TemuProductData | null> {
  try {
    const zai = await ZAI.create();

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

        // Strategy B: Use LLM to extract price from the page content
        console.log(`[PageReader] Using LLM to extract price from ${label}...`);

        const contentForLLM = content.slice(0, Math.min(content.length, 60000));

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
                "9. Return ONLY a JSON object: {\"price_usd\": <number_in_USD>, \"price_local\": \"<amount> <currency>\", \"product_name\": \"<name>\", \"confidence\": \"<high|medium|low>\"}\n" +
                "10. If you cannot find a clear price for the main product, return {\"price_usd\": null, \"confidence\": \"low\"}\n" +
                "11. NEVER guess or estimate a price. Only return a price you actually found in the content.",
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
  DZD: 0.0075,  // Algerian Dinar
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
    const zai = await ZAI.create();

    // Build search query — try different strategies
    let searchQuery = "";
    if (itemId && /^[A-Z]{2}\d+/i.test(itemId)) {
      // Item ID like TV10922608 — search Temu specifically
      searchQuery = `site:temu.com "${itemId}"`;
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
    return extractPriceFromSearchResults(zai, searchResults, goodsId, itemId);
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
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`[AllOrigins] HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const html = typeof data === "string" ? data : data?.contents;
    if (!html || typeof html !== "string" || html.length < 1000) return null;

    console.log(`[AllOrigins] HTML length: ${html.length}`);
    const result = extractProductInfo(html, url);
    if (result.productName || result.price) {
      return { ...result, source: result.source || "allorigins" };
    }
    return null;
  } catch (err) {
    console.log("[AllOrigins] Error:", String(err).slice(0, 100));
    return null;
  }
}

/* ───────────────────────────────────────────────────────────────────
 * Strategy 3 (FREE): corsproxy.io — another public CORS proxy.
 * ─────────────────────────────────────────────────────────────────── */
async function fetchViaCorsProxy(url: string): Promise<TemuProductData | null> {
  try {
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(proxyUrl, {
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`[CorsProxy] HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    if (html.length < 1000) return null;

    console.log(`[CorsProxy] HTML length: ${html.length}`);
    const result = extractProductInfo(html, url);
    if (result.productName || result.price) {
      return { ...result, source: result.source || "corsproxy" };
    }
    return null;
  } catch (err) {
    console.log("[CorsProxy] Error:", String(err).slice(0, 100));
    return null;
  }
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

function cleanProductName(name: string | null): string | null {
  if (!name) return null;
  let cleaned = name
    .replace(/\s*[-|]\s*(Temu|AliExpress)\s*/gi, "")
    .replace(/\s*[-|]\s*(Login|Sign In|Register)\s*/gi, "")
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
    let finalUrl = trimmedUrl;
    let goodsId = "";
    let shareImage: string | null = null; // Image extracted from share URL redirect
    let originalShareUrl: string | null = null; // Original share URL for page_reader
    let shareUrlPriceUSD: number | null = null; // Pre-extracted price from share URL's _oak_rec_ext_1
    let shareUrlPriceSource = ""; // Source label for the pre-extracted price
    let shareHtmlBody: string | null = null; // HTML body from share URL redirect response
    let resolvedShareUrl: string | null = null; // The resolved share URL (before reconstruction)

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
        if (goodsId) {
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
    //   0. URL params       (FREE, 0 network) — _oak_rec_ext_1 + top_gallery_url + slug
    //   0-C. Page Reader+LLM (ZAI SDK)        — reads the rendered product page
    //   0-AI. Web Search+LLM (ZAI SDK)        — searches Google-indexed Temu pages
    //   0b. Temu BG API     (FREE)            — /bg/goods/api endpoint with goods_id
    //   1. Direct fetch     (FREE)            — realistic browser headers
    //   2. AllOrigins       (FREE)            — public CORS proxy
    //   3. CorsProxy.io     (FREE)            — another public CORS proxy
    //   4. ScrapingBee      (PAID, last)      — only if SCRAPINGBEE_API_KEY set
    // ────────────────────────────────────────────────────────────────

    // Determine if this is an Item ID (like TV10922608) vs a goods_id (like 601101613236742)
    const isItemId = isTemuProductId && /^[A-Z]{2}\d+/i.test(trimmedUrl);

    // Strategy -1: Pre-extracted price from share URL (most reliable for share.temu.com)
    // This price was extracted from _oak_rec_ext_1 in the resolved share URL,
    // with proper currency detection from the URL locale and conversion to USD.
    // It's the most reliable price source because it comes directly from Temu's
    // share URL parameters — no scraping or LLM interpretation needed.
    if (shareUrlPriceUSD && shareUrlPriceUSD > 0) {
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

    // Strategy 0: URL params (the cheapest & most reliable for share URLs with _oak_rec_ext_1)
    console.log("[Strategy 0] Trying URL params extraction (FREE)...");
    const urlResult = extractFromUrlParams(finalUrl);
    if (urlResult?.price && urlResult.price > 0) {
      console.log(`[Strategy 0] ✓ Got price $${urlResult.price} from URL hint`);
      return await buildSuccessResponse(urlResult, urlProductName, shareImage, goodsId);
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
      const pageReaderResult = await fetchPriceWithPageReader(prGoodsId, prItemId, prShareUrl, resolvedShareUrl);
      if (pageReaderResult) {
        if (pageReaderResult.price && pageReaderResult.price > 0) {
          console.log(`[Strategy 0-C] ✓ Got price $${pageReaderResult.price} from page reader`);
          const bestImage = shareImage || pageReaderResult.image;
          const bestGoodsId = goodsId || pageReaderResult.canonicalUrl?.match(/-g-(\d{10,})/)?.[1] || "";
          return await buildSuccessResponse(pageReaderResult, urlProductName, bestImage, bestGoodsId);
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
          console.log(`[Strategy 0-AI] ✓ Got price $${webSearchResult.price} from web search`);
          // Use the image from share URL params (more reliable) if available
          const bestImage = shareImage || webSearchResult.image;
          // Use the goods_id from the web search result if we didn't have one (e.g. from Item ID search)
          const bestGoodsId = goodsId || webSearchResult.canonicalUrl?.match(/-g-(\d{10,})/)?.[1] || "";
          return await buildSuccessResponse(webSearchResult, urlProductName, bestImage, bestGoodsId);
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
          console.log(`[Strategy 0b-2] ✓ Got price $${itemIdResult.price} from Item ID resolution`);
          return await buildSuccessResponse(itemIdResult, urlProductName, shareImage, goodsId || itemIdResult.foundGoodsId);
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
          console.log(`[Strategy 0b] ✓ Got price $${apiResult.price} from Temu BG API`);
          return await buildSuccessResponse(apiResult, urlProductName, shareImage, goodsId);
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
          console.log(`[Strategy ${strat.name}] ✓ Got price $${result.price}`);
          return await buildSuccessResponse(result, urlProductName, shareImage, goodsId);
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
          return await buildSuccessResponse(result, urlProductName, shareImage, goodsId);
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
      DZD: 0.0075,
    };
    const rate = rates[result.currency.toUpperCase()];
    if (rate) priceUSD = result.price! * rate;
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
