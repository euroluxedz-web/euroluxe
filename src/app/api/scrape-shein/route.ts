import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * SHEIN Product Price Extraction API
 *
 * Accepts a SHEIN product URL, launches Puppeteer with Bright Data proxy,
 * navigates to the page, and extracts the price, product name, and image.
 *
 * SHEIN is generally easier to scrape than Temu - prices are visible
 * without login, and there's no CAPTCHA for most product pages.
 */

interface SheinResult {
  status: "success" | "failed";
  price?: number | null;
  currency?: string | null;
  productName?: string | null;
  productImage?: string | null;
  productUrl?: string | null;
  message?: string;
}

/**
 * Extract SHEIN product ID from URL.
 * SHEIN URLs look like:
 *   https://www.shein.com/ProductName-p-12345678.html
 *   https://www.shein.com/ProductName-p-12345678-cat-1234.html
 *   https://www.shein.com/...?goods_id=12345678
 */
function extractSheinGoodsId(url: string): string | null {
  // Pattern 1: -p-XXXXX.html
  const m1 = url.match(/-p-(\d+)\.html/i);
  if (m1) return m1[1];
  // Pattern 2: goods_id=XXXXX
  const m2 = url.match(/goods_id=(\d+)/i);
  if (m2) return m2[1];
  // Pattern 3: /p/XXXXX
  const m3 = url.match(/\/p\/(\d+)/i);
  if (m3) return m3[1];
  return null;
}

async function scrapeShein(
  productUrl: string,
  cookies: string
): Promise<SheinResult> {
  const puppeteer = await import("puppeteer").catch(() => null);
  if (!puppeteer || !puppeteer.default) {
    return { status: "failed", message: "Puppeteer not available" };
  }

  const brdUser = process.env.BRD_USER || "brd-customer-hl_e4276258-zone-residential_proxy1";
  const brdPass = process.env.BRD_PASS || "e3trwtkjfmx9";

  console.log("[SHEIN] Launching browser with proxy...");
  const browser = await puppeteer.default.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1920,1080",
      "--proxy-server=http://brd.superproxy.io:33335",
      "--ignore-certificate-errors",
    ],
  });

  const page = await browser.newPage();

  // Proxy auth (use US IP for USD prices, or Algeria for DZD)
  await page.authenticate({
    username: `${brdUser}-country-us`,
    password: brdPass,
  });

  // Stealth mode
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", {
      get: () => [{ name: "Chrome PDF Plugin" }, { name: "Chrome PDF Viewer" }, { name: "Native Client" }],
    });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    (window as any).chrome = { runtime: {} };
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1920, height: 1080 });

  // Set cookies if provided
  if (cookies) {
    try {
      const cookiePairs = cookies.split(";").map((c) => c.trim()).filter(Boolean);
      const cookieObjects = cookiePairs.map((pair) => {
        const [name, ...valueParts] = pair.split("=");
        return { name: name.trim(), value: valueParts.join("=").trim(), domain: ".shein.com", path: "/", secure: true, httpOnly: false };
      });
      await page.setCookie(...cookieObjects);
      console.log(`[SHEIN] Set ${cookieObjects.length} cookies`);
    } catch (e) {
      console.log(`[SHEIN] Cookie error: ${String(e).slice(0, 100)}`);
    }
  }

  console.log(`[SHEIN] Navigating to: ${productUrl.substring(0, 120)}...`);
  try {
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (navErr) {
    console.log("[SHEIN] Navigation error (continuing):", String(navErr).slice(0, 100));
  }

  // Wait for page to fully load
  console.log("[SHEIN] Waiting for page to load...");
  await new Promise((r) => setTimeout(r, 8000));

  let pageTitle = "";
  try { pageTitle = await page.title(); } catch (e) { console.log("[SHEIN] Title error:", String(e).slice(0, 100)); }
  console.log(`[SHEIN] Page title: "${pageTitle}"`);

  // Try to extract price and product info
  console.log("[SHEIN] Extracting price and product info...");
  const productData = await page.evaluate(() => {
    // Extract product name
    let productName = "";
    const nameEl = document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
                   document.querySelector("h1.product-intro__head-name")?.textContent ||
                   document.querySelector("h1[class*='product']")?.textContent ||
                   document.querySelector("title")?.textContent || "";
    productName = nameEl.trim();

    // Extract product image
    let productImage = "";
    const imgEl = document.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
                  document.querySelector("img[class*='product']")?.getAttribute("src") ||
                  document.querySelector("img[class*='goods']")?.getAttribute("src") || "";
    productImage = imgEl;

    // Extract price - SHEIN shows prices in various elements
    // Known shipping/credit prices to exclude
    const shippingCredits = [1.01, 5.00, 8.00, 13.00];

    // Strategy 1: Look for specific price elements
    const priceSelectors = [
      '.product-intro__head-price span',
      '[class*="productPrice"]',
      '[class*="product-price"]',
      '[class*="PriceText"]',
      '[class*="price"] [class*="sale"]',
      '[class*="salePrice"]',
      '[class*="original-price"]',
      '[data-price]',
      '.product-price',
    ];

    let foundPrices: any[] = [];

    // First try specific selectors
    for (const selector of priceSelectors) {
      const els = document.querySelectorAll(selector);
      for (const el of els) {
        const text = (el.textContent || "").trim();
        if (text.length > 100) continue;

        // Match various price formats: $X.XX, $X, USD X.XX, €X.XX, £X.XX
        const match = text.match(/(?:USD\s*)?[$€£]\s*(\d+(?:\.\d{1,2})?)/i);
        if (match) {
          const price = parseFloat(match[1]);
          if (price > 0 && price < 10000 && !shippingCredits.includes(price)) {
            foundPrices.push({ price, text, selector });
          }
        }
      }
    }

    // Strategy 2: Scan all elements for price-like text
    if (foundPrices.length === 0) {
      const allElements = document.querySelectorAll("body *");
      for (const el of allElements) {
        const text = (el.textContent || "").trim();
        if (text.length > 100) continue;

        const match = text.match(/(?:USD\s*)?[$€£]\s*(\d+(?:\.\d{1,2})?)/i);
        if (match) {
          const price = parseFloat(match[1]);
          if (price > 0 && price < 10000 && !shippingCredits.includes(price)) {
            foundPrices.push({ price, text, selector: "body-scan" });
          }
        }
      }
    }

    // Determine currency
    let currency = "USD";
    const bodyText = document.body.textContent || "";
    if (bodyText.includes("€")) currency = "EUR";
    else if (bodyText.includes("£")) currency = "GBP";
    else if (bodyText.match(/DZD|DA\b/i)) currency = "DZD";

    // Return the smallest price (sale price)
    let price = null;
    let priceText = "";
    if (foundPrices.length > 0) {
      foundPrices.sort((a, b) => a.price - b.price);
      price = foundPrices[0].price;
      priceText = foundPrices[0].text;
    }

    return {
      productName,
      productImage,
      price,
      priceText,
      currency,
      allPrices: foundPrices.map((p) => p.price),
    };
  });

  console.log(`[SHEIN] Product: ${productData.productName?.substring(0, 50)}`);
  console.log(`[SHEIN] Price: ${productData.price} ${productData.currency}`);
  console.log(`[SHEIN] All prices found: ${productData.allPrices?.join(", ") || "none"}`);

  // Also try to get price from JSON-LD structured data
  let jsonLdPrice: number | null = null;
  let jsonLdCurrency: string | null = null;
  try {
    jsonLdPrice = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent || "");
          const candidates = Array.isArray(data) ? data : [data];
          for (const c of candidates) {
            if (c?.offers?.price) return { price: parseFloat(c.offers.price), currency: c.offers.priceCurrency || "USD" };
            if (c?.offers?.lowPrice) return { price: parseFloat(c.offers.lowPrice), currency: c.offers.priceCurrency || "USD" };
          }
        } catch {}
      }
      return null;
    });
    if (jsonLdPrice) {
      console.log(`[SHEIN] JSON-LD price: ${jsonLdPrice.price} ${jsonLdPrice.currency}`);
    }
  } catch (e) {
    console.log(`[SHEIN] JSON-LD error: ${String(e).slice(0, 100)}`);
  }

  await browser.close();
  console.log("[SHEIN] Browser closed");

  const finalPrice = productData.price || jsonLdPrice?.price || null;
  const finalCurrency = productData.currency || jsonLdPrice?.currency || "USD";

  if (finalPrice !== null && finalPrice > 0) {
    // Convert to USD if needed
    let priceUSD = finalPrice;
    if (finalCurrency === "DZD") priceUSD = finalPrice / 240;
    else if (finalCurrency === "EUR") priceUSD = finalPrice * 1.085;
    else if (finalCurrency === "GBP") priceUSD = finalPrice * 1.265;

    return {
      status: "success",
      price: priceUSD,
      currency: "USD",
      productName: productData.productName || null,
      productImage: productData.productImage || null,
      productUrl: productUrl,
    };
  }

  return {
    status: "failed",
    message: "Could not extract price from SHEIN page. The page may require login or the product is unavailable.",
    productName: productData.productName || null,
    productImage: productData.productImage || null,
    productUrl: productUrl,
  };
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

    const cookies = body.cookies || process.env.SHEIN_COOKIES || "";
    const result = await scrapeShein(url.trim(), cookies);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[SHEIN] Error:", e);
    return NextResponse.json({ status: "failed", message: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST { url: 'https://www.shein.com/...' }",
    returns: "Extracted price + product info from SHEIN",
  });
}
