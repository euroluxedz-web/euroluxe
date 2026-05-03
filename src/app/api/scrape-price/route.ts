import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

const RATE = 300;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,fr;q=0.8,ar;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Sec-Ch-Ua:
    '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

async function fetchPage(
  url: string
): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const finalUrl = response.url || url;
    return { html, finalUrl };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

interface PriceResult {
  price: number | null;
  currency: string;
  productName: string | null;
  source: string;
}

function extractFromJsonLd($: cheerio.CheerioAPI): PriceResult | null {
  const jsonLdScripts = $('script[type="application/ld+json"]');
  for (const el of jsonLdScripts.toArray()) {
    try {
      const content = $(el).html();
      if (!content) continue;
      const data = JSON.parse(content);

      const schemas = Array.isArray(data) ? data : [data];
      for (const schema of schemas) {
        // Check for Product schema
        if (
          schema["@type"] === "Product" ||
          (Array.isArray(schema["@type"]) &&
            schema["@type"].includes("Product"))
        ) {
          const offers = schema.offers;
          if (offers) {
            const offerList = Array.isArray(offers) ? offers : [offers];
            for (const offer of offerList) {
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
                  source: "jsonld-low",
                };
              }
            }
          }
        }
      }
    } catch {
      // Skip invalid JSON-LD
    }
  }
  return null;
}

function extractFromMetaTags($: cheerio.CheerioAPI): PriceResult | null {
  // Open Graph product price
  const ogPriceAmount = $('meta[property="product:price:amount"]').attr(
    "content"
  );
  const ogPriceCurrency = $('meta[property="product:price:currency"]').attr(
    "content"
  );
  if (ogPriceAmount) {
    const price = parseFloat(ogPriceAmount);
    if (price > 0) {
      return {
        price,
        currency: ogPriceCurrency || "USD",
        productName:
          $('meta[property="og:title"]').attr("content") ||
          $("title").text() ||
          null,
        source: "meta-og",
      };
    }
  }

  // Twitter price meta
  const twPrice = $('meta[name="twitter:data1"]').attr("content");
  if (twPrice) {
    const price = parseFloat(twPrice.replace(/[^0-9.]/g, ""));
    if (price > 0) {
      return {
        price,
        currency: "USD",
        productName: null,
        source: "meta-tw",
      };
    }
  }

  // Generic price meta tags
  const metaSelectors = [
    'meta[itemprop="price"]',
    'meta[name="price"]',
    'meta[property="price"]',
  ];
  for (const selector of metaSelectors) {
    const content = $(selector).attr("content");
    if (content) {
      const price = parseFloat(content.replace(/[^0-9.]/g, ""));
      if (price > 0) {
        const currency =
          $('meta[itemprop="priceCurrency"]').attr("content") || "USD";
        return { price, currency, productName: null, source: "meta-generic" };
      }
    }
  }

  return null;
}

function extractFromHtml($: cheerio.CheerioAPI): PriceResult | null {
  const productName =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text() ||
    null;

  // AliExpress specific selectors
  const aliexpressSelectors = [
    ".product-price-current",
    ".product-price-value",
    "[data-spm='price']",
    ".price-current",
    ".uniform-banner-price",
    ".product-price",
    ".sku-item-price",
    ".price-wrap .price",
  ];

  for (const selector of aliexpressSelectors) {
    const el = $(selector).first();
    if (el.length) {
      const text = el.text().trim();
      const priceMatch = text.match(/[\d,]+\.?\d{0,2}/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[0].replace(/,/g, ""));
        if (price > 0 && price < 100000) {
          return {
            price,
            currency: "USD",
            productName,
            source: "html-ali",
          };
        }
      }
    }
  }

  // Temu specific selectors
  const temuSelectors = [
    "[data-testid='product-price']",
    ".product-price",
    ".price-display",
    ".goods-price",
    ".product-detail-price",
  ];

  for (const selector of temuSelectors) {
    const el = $(selector).first();
    if (el.length) {
      const text = el.text().trim();
      const priceMatch = text.match(/[\d,]+\.?\d{0,2}/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[0].replace(/,/g, ""));
        if (price > 0 && price < 100000) {
          return {
            price,
            currency: "USD",
            productName,
            source: "html-temu",
          };
        }
      }
    }
  }

  // Generic price patterns in the page text
  const bodyText = $("body").text();
  const pricePatterns = [
    /\$\s*(\d{1,5}\.?\d{0,2})/g,
    /(\d{1,5}\.?\d{0,2})\s*USD/gi,
    /price[^:]*[:\s]+\$?\s*(\d{1,5}\.?\d{0,2})/gi,
  ];

  const foundPrices: number[] = [];
  for (const pattern of pricePatterns) {
    let match;
    while ((match = pattern.exec(bodyText)) !== null) {
      const price = parseFloat(match[1]);
      if (price > 0.5 && price < 10000) {
        foundPrices.push(price);
      }
    }
  }

  if (foundPrices.length > 0) {
    // Return the lowest reasonable price (likely the sale price)
    foundPrices.sort((a, b) => a - b);
    return {
      price: foundPrices[0],
      currency: "USD",
      productName,
      source: "html-generic",
    };
  }

  return null;
}

function extractFromTemuEmbeddedData(
  html: string
): PriceResult | null {
  // Temu often embeds product data in script tags
  const patterns = [
    /"minPrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"maxPrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"price"\s*:\s*"?(\d+\.?\d*)"?/,
    /"salePrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"origPrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"priceStr"\s*:\s*"\$?(\d+\.?\d*)"/,
    /"displayPrice"\s*:\s*"?(\d+\.?\d*)"?/,
  ];

  const prices: number[] = [];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const price = parseFloat(match[1]);
      if (price > 0 && price < 10000) {
        prices.push(price);
      }
    }
  }

  // Try to find product name in embedded data
  const nameMatch =
    html.match(/"goodsName"\s*:\s*"([^"]+)"/) ||
    html.match(/"title"\s*:\s*"([^"]+)"/) ||
    html.match(/"productName"\s*:\s*"([^"]+)"/);
  const productName = nameMatch ? nameMatch[1] : null;

  if (prices.length > 0) {
    prices.sort((a, b) => a - b);
    return {
      price: prices[0],
      currency: "USD",
      productName,
      source: "embedded-temu",
    };
  }

  return null;
}

function extractFromAliExpressEmbeddedData(
  html: string
): PriceResult | null {
  // AliExpress often has JSON data in script tags
  try {
    // Try to find the initData or pageData
    const dataMatch = html.match(
      /window\.__INIT_DATA__\s*=\s*({[\s\S]*?});/
    ) || html.match(/window\.runParams\s*=\s*({[\s\S]*?});/);

    if (dataMatch) {
      const data = JSON.parse(dataMatch[1]);
      const price =
        data?.data?.priceModule?.minAmount?.value ||
        data?.data?.priceModule?.saleAmount?.value ||
        data?.data?.priceInfoModule?.minAmount?.value;
      if (price) {
        return {
          price: parseFloat(price),
          currency: "USD",
          productName:
            data?.data?.titleModule?.title ||
            data?.data?.pageModule?.title ||
            null,
          source: "embedded-ali",
        };
      }
    }
  } catch {
    // Skip invalid data
  }

  // Try regex for AliExpress embedded price
  const priceMatch =
    html.match(/"minAmount"\s*:\s*"?(\d+\.?\d*)"?/) ||
    html.match(/"saleAmount"\s*:\s*"?(\d+\.?\d*)"?/) ||
    html.match(/"actMinPrice"\s*:\s*"?(\d+\.?\d*)"?/);

  if (priceMatch) {
    const nameMatch =
      html.match(/"title"\s*:\s*"([^"]+)"/) ||
      html.match(/"subject"\s*:\s*"([^"]+)"/);
    return {
      price: parseFloat(priceMatch[1]),
      currency: "USD",
      productName: nameMatch ? nameMatch[1] : null,
      source: "embedded-ali-regex",
    };
  }

  return null;
}

function cleanProductName(name: string | null): string | null {
  if (!name) return null;
  // Remove common suffixes/prefixes from titles
  let cleaned = name
    .replace(/\s*[-|]\s*(Temu|AliExpress|Aliexpress)\s*/gi, "")
    .replace(/\s*[-|]\s*(Login|Sign In|Register)\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Truncate long names
  if (cleaned.length > 60) {
    cleaned = cleaned.slice(0, 57) + "...";
  }

  // Capitalize first letter of each word
  cleaned = cleaned.replace(/\b\w/g, (l) => l.toUpperCase());

  return cleaned || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, productId, manualPrice } = body;

    // ─── Manual price entry fallback ───
    if (manualPrice) {
      const price = parseFloat(manualPrice);
      if (price > 0 && price < 100000) {
        // Detect currency from the input
        const isUSD = /[\$]|USD|usd/i.test(String(manualPrice));
        const isDZD = /DA|dzd|DZD/i.test(String(manualPrice));
        let priceUSD = price;
        if (isDZD) {
          priceUSD = price / RATE;
        } else if (!isUSD) {
          // Assume EUR if not specified
          priceUSD = price * 1.08;
        }
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
        { error: "Veuillez fournir un lien ou un code produit valide" },
        { status: 400 }
      );
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Le format du lien est invalide" },
        { status: 400 }
      );
    }

    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname;
    const isTemu = domain.includes("temu");
    const isAliExpress = domain.includes("aliexpress");

    if (!isTemu && !isAliExpress) {
      return NextResponse.json(
        {
          error:
            "Ce lien ne provient pas de Temu ou AliExpress. Veuillez fournir un lien valide.",
        },
        { status: 400 }
      );
    }

    // ─── Strategy 1: Direct page fetch + HTML parsing ───
    let html = "";
    try {
      const result = await fetchPage(url);
      html = result.html;
    } catch (err) {
      console.error("[fetch] failed:", String(err).slice(0, 200));
      return NextResponse.json(
        {
          error:
            "Impossible d'accéder à cette page. Veuillez vérifier le lien ou entrer le prix manuellement.",
          allowManual: true,
        },
        { status: 404 }
      );
    }

    if (html.length < 100) {
      return NextResponse.json(
        {
          error:
            "La page est vide ou inaccessible. Veuillez entrer le prix manuellement.",
          allowManual: true,
        },
        { status: 404 }
      );
    }

    const $ = cheerio.load(html);

    // ─── Strategy 2: Extract from structured data (JSON-LD) ───
    const jsonLdResult = extractFromJsonLd($);
    if (jsonLdResult?.price && jsonLdResult.price > 0) {
      let priceUSD = jsonLdResult.price;
      if (jsonLdResult.currency?.toUpperCase() !== "USD") {
        const rates: Record<string, number> = {
          EUR: 1.08,
          GBP: 1.27,
          CNY: 0.14,
          JPY: 0.0067,
          CAD: 0.74,
          AUD: 0.65,
          DZD: 0.0075,
          MAD: 0.1,
          AED: 0.27,
        };
        const rate = rates[jsonLdResult.currency.toUpperCase()];
        if (rate) priceUSD = jsonLdResult.price * rate;
      }
      return NextResponse.json({
        price: Math.round(priceUSD * 100) / 100,
        dzd: Math.round(priceUSD * RATE * 100) / 100,
        productName: cleanProductName(jsonLdResult.productName),
        estimated: false,
      });
    }

    // ─── Strategy 3: Extract from meta tags ───
    const metaResult = extractFromMetaTags($);
    if (metaResult?.price && metaResult.price > 0) {
      let priceUSD = metaResult.price;
      if (metaResult.currency?.toUpperCase() !== "USD") {
        const rates: Record<string, number> = {
          EUR: 1.08,
          GBP: 1.27,
          CNY: 0.14,
        };
        const rate = rates[metaResult.currency.toUpperCase()];
        if (rate) priceUSD = metaResult.price * rate;
      }
      return NextResponse.json({
        price: Math.round(priceUSD * 100) / 100,
        dzd: Math.round(priceUSD * RATE * 100) / 100,
        productName: cleanProductName(metaResult.productName),
        estimated: false,
      });
    }

    // ─── Strategy 4: Extract from embedded script data (site-specific) ───
    if (isTemu) {
      const temuResult = extractFromTemuEmbeddedData(html);
      if (temuResult?.price && temuResult.price > 0) {
        return NextResponse.json({
          price: Math.round(temuResult.price * 100) / 100,
          dzd: Math.round(temuResult.price * RATE * 100) / 100,
          productName: cleanProductName(temuResult.productName),
          estimated: temuResult.source === "embedded-temu",
        });
      }
    }

    if (isAliExpress) {
      const aliResult = extractFromAliExpressEmbeddedData(html);
      if (aliResult?.price && aliResult.price > 0) {
        return NextResponse.json({
          price: Math.round(aliResult.price * 100) / 100,
          dzd: Math.round(aliResult.price * RATE * 100) / 100,
          productName: cleanProductName(aliResult.productName),
          estimated: false,
        });
      }
    }

    // ─── Strategy 5: Extract from HTML content directly ───
    const htmlResult = extractFromHtml($);
    if (htmlResult?.price && htmlResult.price > 0) {
      return NextResponse.json({
        price: Math.round(htmlResult.price * 100) / 100,
        dzd: Math.round(htmlResult.price * RATE * 100) / 100,
        productName: cleanProductName(htmlResult.productName),
        estimated: htmlResult.source === "html-generic",
      });
    }

    // ─── Strategy 6: Try mobile version for Temu ───
    if (isTemu) {
      try {
        const mobileUrl = url.replace("www.temu.com", "m.temu.com");
        const mobileResult = await fetchPage(mobileUrl);
        const mobileHtml = mobileResult.html;
        const mobileData = extractFromTemuEmbeddedData(mobileHtml);
        if (mobileData?.price && mobileData.price > 0) {
          return NextResponse.json({
            price: Math.round(mobileData.price * 100) / 100,
            dzd: Math.round(mobileData.price * RATE * 100) / 100,
            productName: cleanProductName(mobileData.productName),
            estimated: true,
          });
        }
        // Also try HTML parsing on mobile version
        const $mobile = cheerio.load(mobileHtml);
        const mobileHtmlResult = extractFromHtml($mobile);
        if (mobileHtmlResult?.price && mobileHtmlResult.price > 0) {
          return NextResponse.json({
            price: Math.round(mobileHtmlResult.price * 100) / 100,
            dzd: Math.round(mobileHtmlResult.price * RATE * 100) / 100,
            productName: cleanProductName(mobileHtmlResult.productName),
            estimated: true,
          });
        }
      } catch {
        // Mobile fetch failed, continue
      }
    }

    // ─── Strategy 7: Try AliExpress API endpoint ───
    if (isAliExpress) {
      try {
        const itemId =
          parsedUrl.searchParams.get("item_id") ||
          parsedUrl.pathname.match(/(\d{8,})/)?.[1];
        if (itemId) {
          const apiUrl = `https://gpsfront.aliexpress.com/getRecommendingResults.do?widget_id=5547572&platform=pc&limit=1&pgEl=searchpro&postback=d4c0ce2f-6e22-4b40-9d7d-0f2d8e5c7a3b&SortType=bestmatch&keyword=${itemId}`;
          const apiResponse = await fetch(apiUrl, {
            headers: {
              ...BROWSER_HEADERS,
              Accept: "application/json",
            },
          });
          const apiData = await apiResponse.text();
          const priceMatch = apiData.match(
            /"price"\s*:\s*"?(\d+\.?\d*)"?/
          );
          if (priceMatch) {
            const price = parseFloat(priceMatch[1]);
            if (price > 0 && price < 10000) {
              const nameMatch = apiData.match(/"title"\s*:\s*"([^"]+)"/);
              return NextResponse.json({
                price: Math.round(price * 100) / 100,
                dzd: Math.round(price * RATE * 100) / 100,
                productName: cleanProductName(
                  nameMatch ? nameMatch[1] : null
                ),
                estimated: true,
              });
            }
          }
        }
      } catch {
        // API fetch failed, continue
      }
    }

    // ─── All strategies failed — return with allowManual flag ───
    // Try to at least extract a product name
    const fallbackName =
      cleanProductName($("title").text()) ||
      cleanProductName(
        $('meta[property="og:title"]').attr("content") || null
      );

    return NextResponse.json(
      {
        error:
          "Nous n'avons pas pu extraire automatiquement le prix de ce produit. Vous pouvez entrer le prix manuellement ci-dessous.",
        allowManual: true,
        productName: fallbackName,
      },
      { status: 404 }
    );
  } catch (error) {
    console.error("[scrape-price] Fatal error:", error);
    return NextResponse.json(
      {
        error:
          "Une erreur est survenue lors de l'analyse. Veuillez réessayer ou entrer le prix manuellement.",
        allowManual: true,
      },
      { status: 500 }
    );
  }
}
