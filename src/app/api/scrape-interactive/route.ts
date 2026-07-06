import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for interactive session
export const dynamic = "force-dynamic";

// Global session store (persists across requests within the same instance)
interface PuppeteerSession {
  browser: any;
  page: any;
  createdAt: number;
  lastActivity: number;
  goodsId: string;
  cookies: string;
  shareImage: string | null;
  status: "loading" | "captcha" | "solved" | "failed" | "done";
}

const sessions = new Map<string, PuppeteerSession>();

// Clean up sessions older than 5 minutes
function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity > 5 * 60 * 1000) {
      try {
        session.browser?.close();
      } catch {}
      sessions.delete(id);
    }
  }
}

interface InteractiveResult {
  status: "success" | "captcha" | "loading" | "failed";
  sessionId?: string;
  screenshot?: string; // base64 PNG
  price?: number | null;
  currency?: string | null;
  productName?: string | null;
  productImage?: string | null;
  message?: string;
  captchaType?: "click" | "recaptcha" | "unknown";
  pageTitle?: string;
}

/**
 * Launch Puppeteer, navigate to Temu product page, detect CAPTCHA.
 * If CAPTCHA found, take screenshot and return it for user to solve.
 */
async function startSession(
  goodsId: string,
  cookies: string,
  originalUrl: string,
  shareImage: string | null
): Promise<InteractiveResult> {
  const puppeteer = await import("puppeteer").catch(() => null);
  if (!puppeteer || !puppeteer.default) {
    return { status: "failed", message: "Puppeteer not available" };
  }

  const brdUser = process.env.BRD_USER || "brd-customer-hl_e4276258-zone-residential_proxy1";
  const brdPass = process.env.BRD_PASS || "e3trwtkjfmx9";

  console.log("[Interactive] Launching browser with proxy...");
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

  // Proxy auth
  await page.authenticate({
    username: `${brdUser}-country-dz`,
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

  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36");
  await page.setViewport({ width: 1920, height: 1080 });

  // Set cookies
  if (cookies) {
    const cookiePairs = cookies.split(";").map((c) => c.trim()).filter(Boolean);
    const cookieObjects = cookiePairs.map((pair) => {
      const [name, ...valueParts] = pair.split("=");
      return { name: name.trim(), value: valueParts.join("=").trim(), domain: ".temu.com", path: "/", secure: true, httpOnly: false };
    });
    try {
      await page.setCookie(...cookieObjects);
      console.log(`[Interactive] Set ${cookieObjects.length} cookies`);
    } catch (e) {
      console.log(`[Interactive] Cookie error: ${String(e).slice(0, 100)}`);
    }
  }

  // Use original URL (strip dz-en locale for USD)
  let productUrl = originalUrl || `https://www.temu.com/goods.html?goods_id=${goodsId}`;
  if (originalUrl && originalUrl.includes("/dz-en/")) {
    productUrl = originalUrl.replace("/dz-en/", "/");
  }

  console.log(`[Interactive] Navigating to: ${productUrl.substring(0, 100)}...`);
  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 30000 }),
    ]);
  } catch (navErr) {
    console.log("[Interactive] Navigation error (continuing):", String(navErr).slice(0, 100));
  }

  // Wait for page to load
  await new Promise((r) => setTimeout(r, 5000));

  let pageTitle = "";
  try {
    pageTitle = await page.title();
  } catch (e) {
    console.log("[Interactive] Title error:", String(e).slice(0, 100));
  }
  console.log(`[Interactive] Page title: "${pageTitle}"`);

  // Check for CAPTCHA
  let pageHtml = "";
  try {
    pageHtml = await page.content();
  } catch (e) {
    console.log("[Interactive] Content error:", String(e).slice(0, 100));
  }
  const htmlLower = pageHtml.toLowerCase();
  const hasCaptcha = htmlLower.includes("captcha") || htmlLower.includes("verify") || htmlLower.includes("challenge") || pageTitle === "Temu";

  // Take screenshot
  let screenshotBuffer = Buffer.alloc(0);
  try {
    screenshotBuffer = await page.screenshot({ type: "png", fullPage: false });
  } catch (e) {
    console.log("[Interactive] Screenshot error:", String(e).slice(0, 100));
  }
  const screenshot = screenshotBuffer.toString("base64");

  // Generate session ID
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Store session
  sessions.set(sessionId, {
    browser,
    page,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    goodsId,
    cookies,
    shareImage,
    status: hasCaptcha ? "captcha" : "solved",
  });

  // Clean up old sessions
  cleanupSessions();

  if (hasCaptcha) {
    console.log("[Interactive] ⚠️ CAPTCHA detected - waiting for user to solve");
    return {
      status: "captcha",
      sessionId,
      screenshot,
      pageTitle,
      captchaType: "click",
      message: "Temu requires verification. Please click the verify button in the screenshot below.",
    };
  }

  // No CAPTCHA - try to extract price directly
  const result = await extractPriceFromPage(page, goodsId, shareImage);
  if (result.price !== null) {
    // Close session
    try { await browser.close(); } catch {}
    sessions.delete(sessionId);
    return { status: "success", ...result };
  }

  // No price found but no CAPTCHA either
  try { await browser.close(); } catch {}
  sessions.delete(sessionId);
  return { status: "failed", message: "No price found on page" };
}

/**
 * Extract price from the current page state.
 */
async function extractPriceFromPage(page: any, goodsId: string, shareImage: string | null): Promise<{
  price: number | null;
  currency: string | null;
  productName: string | null;
  productImage: string | null;
}> {
  // Try to get price from page text - multiple strategies
  const priceData = await page.evaluate(() => {
    // Strategy 1: Look for elements with price-like content (US $X.XX)
    const allElements = document.querySelectorAll("body *");
    let foundPrices = [];
    
    for (const el of allElements) {
      const text = (el.textContent || "").trim();
      if (text.length > 100) continue; // Skip long text blocks
      
      // Match US $X.XX or $X.XX
      const match = text.match(/(?:US\s*)?\$\s*(\d+\.\d{2})/);
      if (match) {
        const price = parseFloat(match[1]);
        if (price > 0 && price < 10000) {
          foundPrices.push({ price, text, tag: el.tagName });
        }
      }
    }
    
    // Return the smallest price (usually the sale price)
    if (foundPrices.length > 0) {
      foundPrices.sort((a, b) => a.price - b.price);
      return { priceText: foundPrices[0].text, price: foundPrices[0].price, allPrices: foundPrices.map(p => p.price) };
    }
    
    // Strategy 2: Look in body text for any $X.XX
    const bodyText = document.body.textContent || "";
    const matches = bodyText.match(/(?:US\s*)?\$\s*(\d+\.\d{2})/g);
    if (matches && matches.length > 0) {
      const prices = matches.map(m => parseFloat(m.match(/\$\s*(\d+\.\d{2})/)[1])).filter(p => p > 0 && p < 10000);
      if (prices.length > 0) {
        prices.sort((a, b) => a - b);
        return { priceText: "$" + prices[0].toFixed(2), price: prices[0], allPrices: prices };
      }
    }
    
    return { priceText: "", price: null, allPrices: [] };
  });

  // Try rawData
  let rawDataPrice: number | null = null;
  try {
    rawDataPrice = await page.evaluate(() => {
      const raw = (window as any).rawData;
      if (raw?.store?.goods) {
        const goods = raw.store.goods;
        const fields = ["salePrice", "minSalePrice", "min", "price", "displayPrice", "lowPrice"];
        for (const f of fields) {
          const v = goods[f];
          if (typeof v === "number" && v > 0 && v < 10000) return v;
          if (typeof v === "object" && v !== null) {
            for (const k of ["min", "value", "amount"]) {
              if (typeof v[k] === "number" && v[k] > 0 && v[k] < 10000) return v[k];
            }
          }
        }
        // Check skuList
        for (const skuKey of ["skuList", "skus"]) {
          const skuList = goods[skuKey];
          if (Array.isArray(skuList)) {
            for (const sku of skuList) {
              for (const f of fields) {
                const v = sku?.[f];
                if (typeof v === "number" && v > 0 && v < 10000) return v;
              }
            }
          }
        }
      }
      return null;
    });
  } catch {}

  // Get product info
  const productInfo = await page.evaluate(() => {
    const title = document.querySelector('meta[property="og:title"]')?.getAttribute("content") || document.querySelector("title")?.textContent || null;
    const image = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;
    return { title, image };
  });

  const price = priceData.price || rawDataPrice;
  return {
    price,
    currency: "USD",
    productName: productInfo.title,
    productImage: productInfo.image || shareImage,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, goodsId, cookies, shareImage, finalUrl } = body;

    if (!goodsId) {
      return NextResponse.json({ status: "failed", message: "goodsId required" }, { status: 400 });
    }

    const userCookies = cookies || process.env.TEMU_COOKIES || "";
    const result = await startSession(goodsId, userCookies, finalUrl || url, shareImage);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[Interactive] Error:", e);
    return NextResponse.json({ status: "failed", message: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function GET() {
  // Also expose sessions count for debugging
  cleanupSessions();
  return NextResponse.json({
    ok: true,
    activeSessions: sessions.size,
    usage: "POST { goodsId, cookies, finalUrl, shareImage } → returns screenshot if CAPTCHA, or price if solved",
  });
}

// Export sessions map for the click endpoint to use
export { sessions };
