import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const RATE = 300;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

interface ExtractionResult {
  price: number | null;
  currency: string;
  productName: string | null;
  source: string;
}

function extractFromRawHtml(html: string): ExtractionResult | null {
  // ─── Try JSON-LD ───
  const jsonLdMatches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const schemas = Array.isArray(data) ? data : [data];
      for (const schema of schemas) {
        const type = schema["@type"];
        if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
          if (schema.offers) {
            const offers = Array.isArray(schema.offers) ? schema.offers : [schema.offers];
            for (const offer of offers) {
              if (offer.price !== undefined) {
                return {
                  price: parseFloat(offer.price),
                  currency: offer.priceCurrency || "USD",
                  productName: schema.name || null,
                  source: "jsonld",
                };
              }
              if (offer.lowPrice !== undefined) {
                return {
                  price: parseFloat(offer.lowPrice),
                  currency: offer.priceCurrency || "USD",
                  productName: schema.name || null,
                  source: "jsonld",
                };
              }
            }
          }
        }
      }
    } catch { /* skip */ }
  }

  // ─── Try OG product meta ───
  const ogPriceMatch = html.match(
    /<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i
  ) ||
  html.match(
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']product:price:amount["']/i
  );
  if (ogPriceMatch) {
    const price = parseFloat(ogPriceMatch[1]);
    if (price > 0) {
      const ogNameMatch = html.match(
        /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
      ) ||
      html.match(
        /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i
      );
      const ogCurrencyMatch = html.match(
        /<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i
      );
      return {
        price,
        currency: ogCurrencyMatch ? ogCurrencyMatch[1] : "USD",
        productName: ogNameMatch ? ogNameMatch[1] : null,
        source: "meta-og",
      };
    }
  }

  // ─── Try itemprop price ───
  const itempropMatch = html.match(
    /<meta[^>]*itemprop=["']price["'][^>]*content=["']([^"']+)["']/i
  );
  if (itempropMatch) {
    const price = parseFloat(itempropMatch[1]);
    if (price > 0) {
      return { price, currency: "USD", productName: null, source: "itemprop" };
    }
  }

  // ─── Try Temu embedded data ───
  const temuPatterns = [
    /"minPrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"salePrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"price"\s*:\s*"?(\d+\.?\d*)"?/,
    /"priceStr"\s*:\s*"\$?(\d+\.?\d*)"/,
    /"displayPrice"\s*:\s*"?(\d+\.?\d*)"?/,
  ];
  const temuPrices: number[] = [];
  for (const pattern of temuPatterns) {
    const m = html.match(pattern);
    if (m) {
      const p = parseFloat(m[1]);
      if (p > 0 && p < 10000) temuPrices.push(p);
    }
  }
  if (temuPrices.length > 0) {
    temuPrices.sort((a, b) => a - b);
    const nameM =
      html.match(/"goodsName"\s*:\s*"([^"]+)"/) ||
      html.match(/"title"\s*:\s*"([^"]+)"/);
    return {
      price: temuPrices[0],
      currency: "USD",
      productName: nameM ? nameM[1] : null,
      source: "embedded-temu",
    };
  }

  // ─── Try AliExpress embedded data ───
  const aliPatterns = [
    /"minAmount"\s*:\s*"?(\d+\.?\d*)"?/,
    /"saleAmount"\s*:\s*"?(\d+\.?\d*)"?/,
    /"actMinPrice"\s*:\s*"?(\d+\.?\d*)"?/,
  ];
  for (const pattern of aliPatterns) {
    const m = html.match(pattern);
    if (m) {
      const p = parseFloat(m[1]);
      if (p > 0 && p < 10000) {
        const nameM =
          html.match(/"title"\s*:\s*"([^"]+)"/) ||
          html.match(/"subject"\s*:\s*"([^"]+)"/);
        return { price: p, currency: "USD", productName: nameM ? nameM[1] : null, source: "embedded-ali" };
      }
    }
  }

  // ─── Try generic $ patterns in text (last resort) ───
  // Strip HTML tags first
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  const priceMatches = text.matchAll(/\$\s*(\d{1,5}\.?\d{0,2})/g);
  const prices: number[] = [];
  for (const m of priceMatches) {
    const p = parseFloat(m[1]);
    if (p > 0.5 && p < 10000) prices.push(p);
  }
  if (prices.length > 0) {
    prices.sort((a, b) => a - b);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return {
      price: prices[0],
      currency: "USD",
      productName: titleMatch ? titleMatch[1].trim() : null,
      source: "html-generic",
    };
  }

  return null;
}

function extractProductNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const slug = segments.find((s) => s.includes("-") && s.length > 10) || segments[segments.length - 1] || "";
    const name = slug
      .replace(/\.html?$/i, "")
      .replace(/-/g, " ")
      .replace(/\.\w+$/, "")
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
    .replace(/\s*[-|]\s*(Temu|AliExpress|Aliexpress)\s*/gi, "")
    .replace(/\s*[-|]\s*(Login|Sign In|Register)\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length > 60) cleaned = cleaned.slice(0, 57) + "...";
  cleaned = cleaned.replace(/\b\w/g, (l) => l.toUpperCase());
  return cleaned || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, manualPrice } = body;

    // ─── Manual price entry ───
    if (manualPrice) {
      const price = parseFloat(String(manualPrice).replace(/[^\d.]/g, ""));
      if (price > 0 && price < 100000) {
        const isDZD = /DA|dzd|DZD|دينار/i.test(String(manualPrice));
        const priceUSD = isDZD ? price / RATE : price;
        return NextResponse.json({
          price: Math.round(priceUSD * 100) / 100,
          dzd: Math.round(priceUSD * RATE * 100) / 100,
          productName: null,
          estimated: false,
          manual: true,
        });
      }
    }

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Veuillez fournir un lien ou un code produit valide", allowManual: true },
        { status: 400 }
      );
    }

    // Check if it's a Temu product ID
    const isTemuProductId = /^[a-zA-Z0-9]{6,15}$/.test(url.trim());
    let finalUrl = url.trim();
    if (isTemuProductId) {
      finalUrl = `https://www.temu.com/${url.trim()}.html`;
    } else {
      try {
        new URL(finalUrl);
      } catch {
        return NextResponse.json(
          { error: "Le format du lien est invalide", allowManual: true },
          { status: 400 }
        );
      }
    }

    const parsedUrl = new URL(finalUrl);
    const domain = parsedUrl.hostname;
    const isTemu = domain.includes("temu");
    const isAliExpress = domain.includes("aliexpress");

    // Also accept other URLs for manual calculation
    const urlProductName = extractProductNameFromUrl(finalUrl);

    // ─── Try fetching and extracting price ───
    let html = "";
    let fetchSuccess = false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(finalUrl, {
        headers: BROWSER_HEADERS,
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);

      if (response.ok) {
        html = await response.text();
        fetchSuccess = true;
      }
    } catch (err) {
      console.error("[scrape-price] fetch failed:", String(err).slice(0, 150));
    }

    // If we got HTML, try to extract price
    if (fetchSuccess && html.length > 100) {
      try {
        const result = extractFromRawHtml(html);
        if (result?.price && result.price > 0) {
          let priceUSD = result.price;
          // Convert from non-USD currencies
          if (result.currency?.toUpperCase() !== "USD") {
            const rates: Record<string, number> = {
              EUR: 1.08, GBP: 1.27, CNY: 0.14, JPY: 0.0067,
              CAD: 0.74, AUD: 0.65, DZD: 0.0075, MAD: 0.1, AED: 0.27,
            };
            const rate = rates[result.currency.toUpperCase()];
            if (rate) priceUSD = result.price * rate;
          }
          return NextResponse.json({
            price: Math.round(priceUSD * 100) / 100,
            dzd: Math.round(priceUSD * RATE * 100) / 100,
            productName: cleanProductName(result.productName) || urlProductName,
            estimated: result.source !== "jsonld" && result.source !== "meta-og",
          });
        }
      } catch (err) {
        console.error("[scrape-price] extraction failed:", String(err).slice(0, 100));
      }
    }

    // ─── Try mobile version for Temu ───
    if (isTemu && fetchSuccess) {
      try {
        const mobileUrl = finalUrl.replace("www.temu.com", "m.temu.com");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const mobileResponse = await fetch(mobileUrl, {
          headers: BROWSER_HEADERS,
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timeout);

        if (mobileResponse.ok) {
          const mobileHtml = await mobileResponse.text();
          const mobileResult = extractFromRawHtml(mobileHtml);
          if (mobileResult?.price && mobileResult.price > 0) {
            return NextResponse.json({
              price: Math.round(mobileResult.price * 100) / 100,
              dzd: Math.round(mobileResult.price * RATE * 100) / 100,
              productName: cleanProductName(mobileResult.productName) || urlProductName,
              estimated: true,
            });
          }
        }
      } catch { /* skip mobile */ }
    }

    // ─── All auto-extraction failed — return allowManual with product name ───
    return NextResponse.json({
      error: isTemu || isAliExpress
        ? "Nous n'avons pas pu extraire automatiquement le prix. Veuillez entrer le prix manuellement."
        : "Veuillez entrer le prix manuellement.",
      allowManual: true,
      productName: urlProductName,
    });
  } catch (error) {
    console.error("[scrape-price] Fatal error:", error);
    return NextResponse.json(
      {
        error: "Une erreur est survenue. Veuillez entrer le prix manuellement.",
        allowManual: true,
      },
      { status: 500 }
    );
  }
}
