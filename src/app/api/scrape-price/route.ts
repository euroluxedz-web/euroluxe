import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const RATE = 300;

// Temu cookies from the user's account - stored in environment variable
function getTemuCookies(): string {
  return process.env.TEMU_COOKIES || "";
}

// Build headers that mimic a real Temu browser session
function buildTemuHeaders(): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
    "Content-Type": "application/json",
    Origin: "https://www.temu.com",
    Referer: "https://www.temu.com/",
    "Sec-Ch-Ua":
      '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
}

interface TemuProductData {
  price: number | null;
  currency: string;
  productName: string | null;
  originalPrice: number | null;
  image: string | null;
}

// Strategy 1: Call Temu's internal API with user's cookies
async function fetchFromTemuAPI(
  goodsId: string,
  cookies: string
): Promise<TemuProductData | null> {
  if (!cookies) return null;

  const headers = buildTemuHeaders();
  headers["Cookie"] = cookies;

  // Try the primary product detail API
  const apiUrls = [
    `https://www.temu.com/api/oak/integration/render?goods_id=${encodeURIComponent(goodsId)}`,
    `https://www.temu.com/api/oak/integration/render?subject_id=${encodeURIComponent(goodsId)}`,
  ];

  for (const apiUrl of apiUrls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(apiUrl, {
        headers,
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`[Temu API] ${apiUrl} returned ${response.status}`);
        continue;
      }

      const data = await response.json();
      console.log("[Temu API] Response keys:", Object.keys(data).join(", "));

      // Try to extract price from the response
      const result = extractPriceFromTemuResponse(data);
      if (result?.price && result.price > 0) {
        return result;
      }
    } catch (err) {
      console.error("[Temu API] Error:", String(err).slice(0, 150));
    }
  }

  return null;
}

// Strategy 2: Fetch the Temu product page with cookies and extract price from HTML
async function fetchFromTemuPage(
  url: string,
  cookies: string
): Promise<TemuProductData | null> {
  if (!cookies) return null;

  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: cookies,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();
    return extractPriceFromHtml(html);
  } catch (err) {
    console.error("[Temu Page] Error:", String(err).slice(0, 150));
    return null;
  }
}

// Strategy 3: Fetch AliExpress with cookies
async function fetchFromAliExpress(
  url: string
): Promise<TemuProductData | null> {
  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();
    return extractPriceFromHtml(html);
  } catch {
    return null;
  }
}

// ─── Price Extraction Functions ───

function extractPriceFromTemuResponse(data: any): TemuProductData | null {
  // The API response structure varies, try multiple paths
  const paths = [
    // Direct goods data
    data?.data?.goodsDetail?.goods,
    data?.data?.goods,
    data?.data?.detail,
    data?.result?.goods,
    data?.data,
    data?.result,
  ];

  for (const obj of paths) {
    if (!obj) continue;

    // Try various price field names
    const priceFields = [
      "minPrice",
      "salePrice",
      "price",
      "displayPrice",
      "minOrigPrice",
      "origPrice",
    ];

    for (const field of priceFields) {
      const val = obj[field];
      if (val !== undefined && val !== null) {
        const price = typeof val === "string" ? parseFloat(val) : typeof val === "number" ? val : null;
        if (price && price > 0 && price < 100000) {
          // Try to find product name
          const name =
            obj.goodsName || obj.title || obj.name || obj.productName || null;
          const image = obj.thumbUrl || obj.imageUrl || obj.picUrl || null;
          const origPrice = obj.minOrigPrice || obj.origPrice || null;

          return {
            price,
            currency: obj.currency || "USD",
            productName: name,
            originalPrice: origPrice ? parseFloat(String(origPrice)) : null,
            image,
          };
        }
      }
    }

    // Try priceStr field
    if (obj.priceStr) {
      const match = String(obj.priceStr).match(/[\d,]+\.?\d{0,2}/);
      if (match) {
        const price = parseFloat(match[0].replace(/,/g, ""));
        if (price > 0 && price < 100000) {
          return {
            price,
            currency: "USD",
            productName: obj.goodsName || obj.title || null,
            originalPrice: null,
            image: null,
          };
        }
      }
    }

    // Try skuList for prices
    if (obj.skuList && Array.isArray(obj.skuList) && obj.skuList.length > 0) {
      const prices = obj.skuList
        .map((sku: any) => parseFloat(sku.price || sku.salePrice || sku.minPrice || 0))
        .filter((p: number) => p > 0 && p < 100000);
      if (prices.length > 0) {
        prices.sort((a: number, b: number) => a - b);
        return {
          price: prices[0],
          currency: "USD",
          productName: obj.goodsName || obj.title || null,
          originalPrice: null,
          image: null,
        };
      }
    }
  }

  // Deep search for any price field in the entire response
  const jsonStr = JSON.stringify(data);
  const pricePatterns = [
    /"minPrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"salePrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"price"\s*:\s*"?(\d+\.?\d*)"?/,
    /"displayPrice"\s*:\s*"?(\d+\.?\d*)"?/,
  ];

  const foundPrices: number[] = [];
  for (const pattern of pricePatterns) {
    const match = jsonStr.match(pattern);
    if (match) {
      const p = parseFloat(match[1]);
      if (p > 0 && p < 10000) foundPrices.push(p);
    }
  }

  if (foundPrices.length > 0) {
    foundPrices.sort((a, b) => a - b);
    const nameMatch = jsonStr.match(/"goodsName"\s*:\s*"([^"]+)"/) || jsonStr.match(/"title"\s*:\s*"([^"]+)"/);
    return {
      price: foundPrices[0],
      currency: "USD",
      productName: nameMatch ? nameMatch[1] : null,
      originalPrice: null,
      image: null,
    };
  }

  return null;
}

function extractPriceFromHtml(html: string): TemuProductData | null {
  // Try JSON-LD
  const jsonLdMatches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const schemas = Array.isArray(data) ? data : [data];
      for (const schema of schemas) {
        if (schema["@type"] === "Product" && schema.offers) {
          const offers = Array.isArray(schema.offers) ? schema.offers : [schema.offers];
          for (const offer of offers) {
            if (offer.price !== undefined) {
              return {
                price: parseFloat(offer.price),
                currency: offer.priceCurrency || "USD",
                productName: schema.name || null,
                originalPrice: null,
                image: schema.image || null,
              };
            }
          }
        }
      }
    } catch { /* skip */ }
  }

  // Try OG meta
  const ogPriceMatch = html.match(
    /<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i
  );
  if (ogPriceMatch) {
    const price = parseFloat(ogPriceMatch[1]);
    if (price > 0) {
      const nameMatch = html.match(
        /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
      );
      return {
        price,
        currency: "USD",
        productName: nameMatch ? nameMatch[1] : null,
        originalPrice: null,
        image: null,
      };
    }
  }

  // Try embedded data patterns
  const embeddedPatterns = [
    /"minPrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"salePrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"price"\s*:\s*"?(\d+\.?\d*)"?/,
    /"priceStr"\s*:\s*"\$?(\d+\.?\d*)"/,
    /"displayPrice"\s*:\s*"?(\d+\.?\d*)"?/,
    // AliExpress specific
    /"minAmount"\s*:\s*"?(\d+\.?\d*)"?/,
    /"saleAmount"\s*:\s*"?(\d+\.?\d*)"?/,
    /"actMinPrice"\s*:\s*"?(\d+\.?\d*)"?/,
  ];

  const foundPrices: number[] = [];
  for (const pattern of embeddedPatterns) {
    const m = html.match(pattern);
    if (m) {
      const p = parseFloat(m[1]);
      if (p > 0 && p < 10000) foundPrices.push(p);
    }
  }

  if (foundPrices.length > 0) {
    foundPrices.sort((a, b) => a - b);
    const nameMatch =
      html.match(/"goodsName"\s*:\s*"([^"]+)"/) ||
      html.match(/"title"\s*:\s*"([^"]+)"/) ||
      html.match(/"subject"\s*:\s*"([^"]+)"/);
    return {
      price: foundPrices[0],
      currency: "USD",
      productName: nameMatch ? nameMatch[1] : null,
      originalPrice: null,
      image: null,
    };
  }

  // Last resort: generic $ patterns
  const text = html.replace(/<[^>]*>/g, " ");
  const dollarMatches = text.matchAll(/\$\s*(\d{1,5}\.?\d{0,2})/g);
  const prices: number[] = [];
  for (const m of dollarMatches) {
    const p = parseFloat(m[1]);
    if (p > 0.5 && p < 10000) prices.push(p);
  }
  if (prices.length > 0) {
    prices.sort((a, b) => a - b);
    return { price: prices[0], currency: "USD", productName: null, originalPrice: null, image: null };
  }

  return null;
}

function extractProductNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const slug =
      segments.find((s) => s.includes("-") && s.length > 10) ||
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

    // Check if it's a Temu product ID (e.g., GW188941 or 601104094120953)
    const isTemuProductId = /^[a-zA-Z0-9]{6,20}$/.test(url.trim());
    let finalUrl = url.trim();
    let goodsId = "";

    if (isTemuProductId) {
      goodsId = url.trim();
      finalUrl = `https://www.temu.com/-g-${url.trim()}.html`;
    } else {
      try {
        const parsed = new URL(finalUrl);
        // Extract goods_id from URL patterns like /-g-GW188941.html or /goods-detail-601104094120953.html
        const gMatch = parsed.pathname.match(/-g-([a-zA-Z0-9]+)/);
        if (gMatch) goodsId = gMatch[1];
        else {
          const numMatch = parsed.pathname.match(/(\d{10,})/);
          if (numMatch) goodsId = numMatch[1];
        }
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
    const urlProductName = extractProductNameFromUrl(finalUrl);

    const cookies = getTemuCookies();

    // ─── Strategy 1: Temu Internal API with cookies ───
    if (isTemu && goodsId && cookies) {
      console.log("[Strategy 1] Trying Temu API with cookies for:", goodsId);
      const temuResult = await fetchFromTemuAPI(goodsId, cookies);
      if (temuResult?.price && temuResult.price > 0) {
        console.log("[Strategy 1] SUCCESS! Price:", temuResult.price);
        let priceUSD = temuResult.price;
        if (temuResult.currency?.toUpperCase() !== "USD") {
          const rates: Record<string, number> = {
            EUR: 1.08, GBP: 1.27, CNY: 0.14, DZD: 0.0075,
          };
          const rate = rates[temuResult.currency.toUpperCase()];
          if (rate) priceUSD = temuResult.price * rate;
        }
        return NextResponse.json({
          price: Math.round(priceUSD * 100) / 100,
          dzd: Math.round(priceUSD * RATE * 100) / 100,
          productName: cleanProductName(temuResult.productName) || urlProductName,
          originalPrice: temuResult.originalPrice
            ? Math.round(temuResult.originalPrice * 100) / 100
            : null,
          image: temuResult.image,
          estimated: false,
          source: "temu-api",
        });
      }
    }

    // ─── Strategy 2: Temu product page with cookies ───
    if (isTemu && cookies) {
      console.log("[Strategy 2] Trying Temu page with cookies for:", finalUrl);
      const pageResult = await fetchFromTemuPage(finalUrl, cookies);
      if (pageResult?.price && pageResult.price > 0) {
        console.log("[Strategy 2] SUCCESS! Price:", pageResult.price);
        return NextResponse.json({
          price: Math.round(pageResult.price * 100) / 100,
          dzd: Math.round(pageResult.price * RATE * 100) / 100,
          productName: cleanProductName(pageResult.productName) || urlProductName,
          image: pageResult.image,
          estimated: false,
          source: "temu-page",
        });
      }
    }

    // ─── Strategy 3: Temu without cookies (may not work for JS-rendered pages) ───
    if (isTemu && !cookies) {
      console.log("[Strategy 3] Trying Temu page WITHOUT cookies (limited)");
      const noCookieResult = await fetchFromTemuPage(finalUrl, "");
      if (noCookieResult?.price && noCookieResult.price > 0) {
        return NextResponse.json({
          price: Math.round(noCookieResult.price * 100) / 100,
          dzd: Math.round(noCookieResult.price * RATE * 100) / 100,
          productName: cleanProductName(noCookieResult.productName) || urlProductName,
          estimated: true,
          source: "temu-nocookie",
        });
      }
    }

    // ─── Strategy 4: AliExpress (works without cookies usually) ───
    if (isAliExpress) {
      console.log("[Strategy 4] Trying AliExpress for:", finalUrl);
      const aliResult = await fetchFromAliExpress(finalUrl);
      if (aliResult?.price && aliResult.price > 0) {
        return NextResponse.json({
          price: Math.round(aliResult.price * 100) / 100,
          dzd: Math.round(aliResult.price * RATE * 100) / 100,
          productName: cleanProductName(aliResult.productName) || urlProductName,
          estimated: false,
          source: "aliexpress",
        });
      }
    }

    // ─── All strategies failed ───
    const errorMsg = isTemu && !cookies
      ? "Cookies Temu non configurés. Veuillez les ajouter dans les paramètres du serveur, ou entrez le prix manuellement."
      : "Nous n'avons pas pu extraire le prix automatiquement. Veuillez l'entrer manuellement.";

    return NextResponse.json({
      error: errorMsg,
      allowManual: true,
      productName: urlProductName,
      needsCookies: isTemu && !cookies,
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
