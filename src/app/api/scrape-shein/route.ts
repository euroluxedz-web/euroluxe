import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const SHEIN_COOKIES = "_twpid=tw.1783373277498.327604763536648714; _cfuvid=hWhBmvalpuLUgYz1pO09Ewa2tBhvfK8Ka_2EAhau9k4-1783371930.597719-1.0.1.1-3GvdUFC0mbp_R8oEVTksfxKBeG1sXDNFGSw56M; AT=MDEwMDE.eyJiIjo3LCJnIjoxNzgzMzcyMDI5LCJyIjoib3FuaDhtIiwidCI6MiwibSI6NjQ0NzI2NzMwMCwibCI6MTc4MzM3MjAyOX0.4c56089d09d07609.ac001a1b261952665e4c0f7f9022b82362c3e10ec400a08e1e33ed2228352610; memberId=6447267300; sessionID_shein=s%3A0cbHi-oQWkzbYRugpcWDtYvyFtrL1NC5.GYRPAkPB%2FRKvGnHyZQfv5eQAfqloySYNFSDaotjHe0g";

function extractSheinGoodsId(url: string): string | null {
  const m1 = url.match(/-p-(\d+)\.html/i);
  if (m1) return m1[1];
  const m2 = url.match(/goods_id=(\d+)/i);
  if (m2) return m2[1];
  return null;
}

/**
 * Use Puppeteer (real browser) with Bright Data proxy to scrape SHEIN.
 * Same approach that works for Temu - real browser bypasses anti-bot.
 */
async function scrapeSheinWithBrowser(productUrl: string) {
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

  await page.setUserAgent(UA);
  await page.setViewport({ width: 1920, height: 1080 });

  // Set cookies
  try {
    const cookiePairs = SHEIN_COOKIES.split(";").map((c) => c.trim()).filter(Boolean);
    const cookieObjects = cookiePairs.map((pair) => {
      const [name, ...valueParts] = pair.split("=");
      return { name: name.trim(), value: valueParts.join("=").trim(), domain: ".shein.com", path: "/", secure: true, httpOnly: false };
    });
    await page.setCookie(...cookieObjects);
    console.log(`[SHEIN] Set ${cookieObjects.length} cookies`);
  } catch (e) {
    console.log(`[SHEIN] Cookie error: ${String(e).slice(0, 100)}`);
  }

  console.log(`[SHEIN] Navigating to: ${productUrl.substring(0, 80)}...`);
  try {
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (navErr) {
    console.log("[SHEIN] Navigation error (continuing):", String(navErr).slice(0, 100));
  }

  // Wait for page to load
  console.log("[SHEIN] Waiting for page to load...");
  await new Promise((r) => setTimeout(r, 8000));

  let pageTitle = "";
  try { pageTitle = await page.title(); } catch (e) { console.log("[SHEIN] Title error:", String(e).slice(0, 100)); }
  console.log(`[SHEIN] Page title: "${pageTitle}"`);

  // Check if we were redirected to CAPTCHA
  const currentUrl = page.url();
  if (currentUrl.includes("risk/challenge") || currentUrl.includes("captcha")) {
    console.log("[SHEIN] ⚠️ Redirected to CAPTCHA challenge page");
    // Wait longer - sometimes CAPTCHA auto-resolves
    await new Promise((r) => setTimeout(r, 10000));
    const newUrl = page.url();
    if (newUrl.includes("risk/challenge") || newUrl.includes("captcha")) {
      console.log("[SHEIN] Still on CAPTCHA page after waiting");
      await browser.close();
      return { 
        status: "failed", 
        message: "SHEIN requires CAPTCHA verification. Please try again later.",
      };
    }
    console.log("[SHEIN] ✓ CAPTCHA resolved after waiting");
  }

  // Extract price and product info
  console.log("[SHEIN] Extracting price and product info...");
  const productData = await page.evaluate(() => {
    let productName = document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
                      document.querySelector("h1")?.textContent ||
                      document.querySelector("title")?.textContent || "";
    let productImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";

    const shippingCredits = [1.01, 5.00, 8.00, 13.00];
    
    // Look for price elements
    const priceSelectors = [
      '[class*="productPrice"]', '[class*="product-price"]', '[class*="PriceText"]',
      '[class*="price"] [class*="sale"]', '[class*="salePrice"]', '[data-price]',
      '.product-price', '[class*="price"]:not([class*="shipping"]):not([class*="credit"])',
    ];

    let foundPrices: any[] = [];
    for (const selector of priceSelectors) {
      const els = document.querySelectorAll(selector);
      for (const el of els) {
        const text = (el.textContent || "").trim();
        if (text.length > 100) continue;
        const match = text.match(/(?:USD\s*)?[$€£]\s*(\d+(?:\.\d{1,2})?)/i);
        if (match) {
          const price = parseFloat(match[1]);
          if (price > 0 && price < 10000 && !shippingCredits.includes(price)) {
            foundPrices.push({ price, text, selector });
          }
        }
      }
    }

    // Scan all elements
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

    let currency = "USD";
    const bodyText = document.body.textContent || "";
    if (bodyText.includes("€")) currency = "EUR";
    else if (bodyText.includes("£")) currency = "GBP";

    let price = null;
    if (foundPrices.length > 0) {
      foundPrices.sort((a, b) => a.price - b.price);
      price = foundPrices[0].price;
    }

    return { productName, productImage, price, currency, allPrices: foundPrices.map(p => p.price) };
  });

  console.log(`[SHEIN] Product: ${productData.productName?.substring(0, 50)}`);
  console.log(`[SHEIN] Price: ${productData.price} ${productData.currency}`);
  console.log(`[SHEIN] All prices: ${productData.allPrices?.join(", ") || "none"}`);

  // Try JSON-LD
  let jsonLdPrice: any = null;
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
    if (jsonLdPrice) console.log(`[SHEIN] JSON-LD price: ${jsonLdPrice.price} ${jsonLdPrice.currency}`);
  } catch (e) {
    console.log(`[SHEIN] JSON-LD error: ${String(e).slice(0, 100)}`);
  }

  await browser.close();
  console.log("[SHEIN] Browser closed");

  const finalPrice = productData.price || jsonLdPrice?.price || null;
  const finalCurrency = productData.currency || jsonLdPrice?.currency || "USD";

  if (finalPrice !== null && finalPrice > 0) {
    let priceUSD = finalPrice;
    if (finalCurrency === "EUR") priceUSD = finalPrice * 1.085;
    else if (finalCurrency === "GBP") priceUSD = finalPrice * 1.265;

    return {
      status: "success",
      price: Math.round(priceUSD * 100) / 100,
      currency: "USD",
      productName: productData.productName || null,
      productImage: productData.productImage || null,
      productUrl: productUrl,
    };
  }

  return {
    status: "failed",
    message: "Could not extract price from SHEIN page.",
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

    console.log(`\n=== [SHEIN] ${url.substring(0, 80)} ===`);
    const result = await scrapeSheinWithBrowser(url.trim());
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[SHEIN] Fatal error:", e);
    return NextResponse.json({ status: "failed", message: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST { url: 'https://www.shein.com/...' }",
    approach: "Puppeteer + Bright Data proxy (real browser, bypasses anti-bot)",
  });
}
