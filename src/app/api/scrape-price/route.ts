import { NextRequest, NextResponse } from "next/server";
import { getUsdToDzdRate, calculateAlgeriaPrice } from "@/lib/exchange-rate";

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

/* ─── Strategy 1: ScrapingBee (the only working approach for Temu) ─── */
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

    if (isTemuProductId) {
      goodsId = trimmedUrl;
      finalUrl = `https://www.temu.com/-g-${trimmedUrl}.html`;
    } else {
      try {
        const parsed = new URL(finalUrl);
        const gMatch = parsed.pathname.match(/-g-([a-zA-Z0-9]+)/);
        if (gMatch) goodsId = gMatch[1];
        else {
          const numMatch = parsed.pathname.match(/(\d{10,})/);
          if (numMatch) goodsId = numMatch[1];
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

    // ─── Try ScrapingBee (the only working strategy for Temu) ───
    if (process.env.SCRAPINGBEE_API_KEY) {
      console.log("[Strategy] Trying ScrapingBee...");
      const result = await fetchWithScrapingBee(finalUrl);

      if (result) {
        // If we found a price, return full success
        if (result.price && result.price > 0) {
          return await buildSuccessResponse(result, urlProductName);
        }

        // If we found a product name (from OG), return it with manual price prompt
        if (result.productName) {
          return NextResponse.json({
            success: true,
            price: null,
            requiresManualPrice: true,
            productName: cleanProductName(result.productName) || urlProductName,
            productDescription: result.productDescription,
            productImage: result.image,
            productUrl: result.canonicalUrl || finalUrl,
            antiBotDetected: result.antiBotDetected,
            source: result.source,
            message: result.antiBotDetected
              ? "Produit trouvé. Temu bloque l'extraction automatique du prix — veuillez le saisir manuellement. / تم العثور على المنتج. تم حظر استخراج السعر التلقائي من Temu — يرجى إدخاله يدويًا."
              : "Produit trouvé. Veuillez saisir le prix affiché sur Temu. / تم العثور على المنتج. يرجى إدخال السعر المعروض على Temu.",
          });
        }
      }
    }

    // ─── All automatic strategies failed ───
    return NextResponse.json({
      success: false,
      error: process.env.SCRAPINGBEE_API_KEY
        ? "Impossible d'extraire les infos produit. Veuillez saisir le prix manuellement. / تعذّر استخراج معلومات المنتج. يرجى إدخال السعر يدويًا."
        : "Clé ScrapingBee API manquante. Veuillez saisir le prix manuellement. / مفتاح ScrapingBee API مفقود. يرجى إدخال السعر يدويًا.",
      allowManual: true,
      productName: urlProductName,
      productUrl: finalUrl,
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
  urlProductName: string | null
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
    productImage: result.image,
    productUrl: result.canonicalUrl,
    originalPrice: result.originalPrice ? Math.round(result.originalPrice * 100) / 100 : null,
    estimated: false,
    manual: false,
    source: result.source,
  });
}
