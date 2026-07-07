import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const SHEIN_COOKIES = "_twpid=tw.1783373277498.327604763536648714; _cfuvid=hWhBmvalpuLUgYz1pO09Ewa2tBhvfK8Ka_2EAhau9k4-1783371930.597719-1.0.1.1-3GvdUFC0mbp_R8oEVTksfxKBeG1sXDNFGSw56M; AT=MDEwMDE.eyJiIjo3LCJnIjoxNzgzMzcyMDI5LCJyIjoib3FuaDhtIiwidCI6MiwibSI6NjQ0NzI2NzMwMCwibCI6MTc4MzM3MjAyOX0.4c56089d09d07609.ac001a1b261952665e4c0f7f9022b82362c3e10ec400a08e1e33ed2228352610; memberId=6447267300; sessionID_shein=s%3A0cbHi-oQWkzbYRugpcWDtYvyFtrL1NC5.GYRPAkPB%2FRKvGnHyZQfv5eQAfqloySYNFSDaotjHe0g";

/**
 * Extract goods_id from SHEIN URL
 */
function extractGoodsId(url: string): string | null {
  const m1 = url.match(/-p-(\d+)/i);
  if (m1) return m1[1];
  const m2 = url.match(/goods_id=(\d+)/i);
  if (m2) return m2[1];
  return null;
}

/**
 * Use SHEIN's own API to get product details.
 * SHEIN has a JSON API that returns product info including prices.
 * We call it through Bright Data proxy to bypass geo-restrictions.
 */
async function scrapeSheinViaAPI(goodsId: string, productUrl: string) {
  const brdUser = process.env.BRD_USER || "brd-customer-hl_e4276258-zone-residential_proxy1";
  const brdPass = process.env.BRD_PASS || "e3trwtkjfmx9";
  const proxyUrl = `http://${brdUser}-country-us:${brdPass}@brd.superproxy.io:33335`;
  
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const undici = require("undici");
  const dispatcher = new undici.ProxyAgent({
    uri: proxyUrl,
    connect: { rejectUnauthorized: false },
  });

  // SHEIN's product detail API
  const apiUrls = [
    `https://www.shein.com/operation/api/goods/detail?goods_id=${goodsId}&country=US&currency=USD&language=en`,
    `https://us.shein.com/operation/api/goods/detail?goods_id=${goodsId}&country=US&currency=USD&language=en`,
    `https://m.shein.com/us/operation/api/goods/detail?goods_id=${goodsId}&country=US&currency=USD&language=en`,
  ];

  for (const apiUrl of apiUrls) {
    console.log(`[SHEIN-API] Trying: ${apiUrl.substring(0, 80)}...`);
    try {
      const res = await (undici.fetch as any)(apiUrl, {
        dispatcher,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Cookie": SHEIN_COOKIES,
          "Referer": "https://www.shein.com/",
          "Origin": "https://www.shein.com",
        },
        signal: AbortSignal.timeout(15000),
      });

      console.log(`[SHEIN-API] Response: ${res.status}`);
      if (!res.ok) continue;

      const text = await res.text();
      if (!text || text.length < 10) continue;

      const data = JSON.parse(text);
      console.log(`[SHEIN-API] Keys: ${Object.keys(data).join(", ")}`);

      // Try to find product data in the response
      const productData = data?.data?.product || data?.data?.goods || data?.data?.info || data?.product || data?.goods;
      if (productData) {
        const salePrice = productData.salePrice || productData.sale_price;
        const retailPrice = productData.retailPrice || productData.retail_price;
        const name = productData.goods_name || productData.goodsName || productData.name || productData.title;
        const image = productData.goods_img || productData.goodsImg || productData.image;

        let price = null;
        if (salePrice) {
          price = typeof salePrice === "object" ? parseFloat(salePrice.usdAmount || salePrice.amount || "0") : parseFloat(salePrice);
        }
        if (!price && retailPrice) {
          price = typeof retailPrice === "object" ? parseFloat(retailPrice.usdAmount || retailPrice.amount || "0") : parseFloat(retailPrice);
        }

        if (price && price > 0 && price < 10000) {
          console.log(`[SHEIN-API] ✓ Found price: ${price}`);
          return {
            status: "success",
            price: Math.round(price * 100) / 100,
            currency: "USD",
            productName: name || null,
            productImage: image || null,
            productUrl: productUrl,
          };
        }
      }
    } catch (e) {
      console.log(`[SHEIN-API] Error: ${String(e).slice(0, 100)}`);
    }
  }

  return null;
}

/**
 * Use Puppeteer with Bright Data proxy to scrape SHEIN.
 * Tries multiple domains and extracts price from page + embedded JSON.
 */
async function scrapeSheinWithBrowser(productUrl: string, goodsId: string) {
  const puppeteer = await import("puppeteer").catch(() => null);
  if (!puppeteer || !puppeteer.default) {
    return { status: "failed", message: "Puppeteer not available" };
  }

  const brdUser = process.env.BRD_USER || "brd-customer-hl_e4276258-zone-residential_proxy1";
  const brdPass = process.env.BRD_PASS || "e3trwtkjfmx9";

  console.log("[SHEIN] Launching browser...");
  const browser = await puppeteer.default.launch({
    headless: "new",
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
      "--disable-gpu", "--disable-blink-features=AutomationControlled",
      "--window-size=1920,1080",
      "--proxy-server=http://brd.superproxy.io:33335",
      "--ignore-certificate-errors",
    ],
  });

  const page = await browser.newPage();
  await page.authenticate({ username: `${brdUser}-country-us`, password: brdPass });

  // Stealth mode
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", {
      get: () => [{ name: "Chrome PDF Plugin" }, { name: "Chrome PDF Viewer" }, { name: "Native Client" }],
    });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    (window as any).chrome = { runtime: {} };
  });

  // Use mobile UA (SHEIN mobile is less protected)
  await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  // Set cookies
  try {
    const cookiePairs = SHEIN_COOKIES.split(";").map((c) => c.trim()).filter(Boolean);
    const cookieObjects = cookiePairs.map((pair) => {
      const [name, ...valueParts] = pair.split("=");
      return { name: name.trim(), value: valueParts.join("=").trim(), domain: ".shein.com", path: "/", secure: true, httpOnly: false };
    });
    await page.setCookie(...cookieObjects);
  } catch {}

  // Try multiple URL formats
  const urls = [
    productUrl,
    `https://m.shein.com/us/-p-${goodsId}.html`,
    `https://us.shein.com/-p-${goodsId}.html`,
  ];

  for (const tryUrl of urls) {
    console.log(`[SHEIN] Trying: ${tryUrl.substring(0, 80)}...`);
    try {
      await page.goto(tryUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
      await new Promise((r) => setTimeout(r, 8000));

      // Check if we got redirected to CAPTCHA
      const currentUrl = page.url();
      if (currentUrl.includes("risk/challenge") || currentUrl.includes("captcha")) {
        console.log("[SHEIN] ⚠️ CAPTCHA detected, trying next URL...");
        continue;
      }

      // Try to extract price from the page
      const result = await page.evaluate(() => {
        // Get product name
        let productName = document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
                          document.querySelector("h1")?.textContent || "";

        // Get product image
        let productImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";

        // Get price from JSON-LD
        let price = null;
        let currency = "USD";
        document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
          try {
            const data = JSON.parse(s.textContent || "");
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if (item?.offers?.price) { price = parseFloat(item.offers.price); currency = item.offers.priceCurrency || "USD"; }
              if (!price && item?.offers?.lowPrice) { price = parseFloat(item.offers.lowPrice); currency = item.offers.priceCurrency || "USD"; }
            }
          } catch {}
        });

        // Get price from meta tags
        if (!price) {
          const m = document.querySelector('meta[property="product:price:amount"]')?.getAttribute("content");
          if (m) price = parseFloat(m);
        }

        // Get price from page text
        if (!price) {
          const credits = [1.01, 5.00, 8.00, 13.00];
          const matches = (document.body.textContent || "").match(/\$\s*(\d+\.\d{2})/g);
          if (matches) {
            const prices = matches.map(m => parseFloat(m.match(/\$(\d+\.\d{2})/)[1])).filter(p => p > 0 && p < 10000 && !credits.includes(p));
            if (prices.length > 0) { prices.sort((a, b) => a - b); price = prices[0]; }
          }
        }

        // Also try to find price in embedded JSON data
        if (!price) {
          const scripts = document.querySelectorAll('script');
          for (const s of scripts) {
            const text = s.textContent || "";
            // Look for salePrice or price in JSON
            const match = text.match(/"salePrice"\s*:\s*\{[^}]*"usdAmount"\s*:\s*"(\d+\.?\d*)"/);
            if (match) { price = parseFloat(match[1]); break; }
            const match2 = text.match(/"sale_price"\s*:\s*(\d+\.?\d*)/);
            if (match2) { price = parseFloat(match2[1]); break; }
          }
        }

        return { productName, productImage, price, currency };
      });

      console.log(`[SHEIN] Product: ${result.productName?.substring(0, 50)}`);
      console.log(`[SHEIN] Price: ${result.price} ${result.currency}`);

      if (result.price && result.price > 0) {
        await browser.close();
        return {
          status: "success",
          price: Math.round(result.price * 100) / 100,
          currency: "USD",
          productName: result.productName || null,
          productImage: result.productImage || null,
          productUrl: tryUrl,
        };
      }
    } catch (e) {
      console.log(`[SHEIN] Error: ${String(e).slice(0, 100)}`);
    }
  }

  await browser.close();
  return null;
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

    const goodsId = extractGoodsId(url);

    // Strategy 1: Try SHEIN API directly (fastest)
    if (goodsId) {
      console.log("[SHEIN] Strategy 1: SHEIN API...");
      const apiResult = await scrapeSheinViaAPI(goodsId, url.trim());
      if (apiResult) {
        console.log("[SHEIN] ✓ API succeeded");
        return NextResponse.json(apiResult);
      }
    }

    // Strategy 2: Puppeteer + Bright Data proxy (tries multiple URLs)
    console.log("[SHEIN] Strategy 2: Puppeteer + Bright Data...");
    const browserResult = await scrapeSheinWithBrowser(url.trim(), goodsId || "");
    if (browserResult) {
      console.log("[SHEIN] ✓ Browser succeeded");
      return NextResponse.json(browserResult);
    }

    return NextResponse.json({
      status: "failed",
      message: "Could not extract price from SHEIN. The product may require login or is unavailable.",
      productUrl: url.trim(),
    });
  } catch (e: any) {
    console.error("[SHEIN] Fatal error:", e);
    return NextResponse.json({ status: "failed", message: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST { url: 'https://www.shein.com/...' }",
    approach: "SHEIN API + Puppeteer fallback (multiple strategies)",
  });
}
