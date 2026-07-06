import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

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

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity > 5 * 60 * 1000) {
      try { session.browser?.close(); } catch {}
      sessions.delete(id);
    }
  }
}

async function extractPriceFromPage(page: any, goodsId: string, shareImage: string | null) {
  console.log("[Interactive] Extracting price from page...");
  
  // Strategy 1: Find all price-like elements
  const priceData = await page.evaluate(() => {
    const allElements = document.querySelectorAll("body *");
    let foundPrices: any[] = [];
    
    for (const el of allElements) {
      const text = (el.textContent || "").trim();
      if (text.length > 100) continue;
      
      const match = text.match(/(?:US\s*)?\$\s*(\d+\.\d{2})/);
      if (match) {
        const price = parseFloat(match[1]);
        if (price > 0 && price < 10000) {
          foundPrices.push({ price, text, tag: el.tagName });
        }
      }
    }
    
    if (foundPrices.length > 0) {
      foundPrices.sort((a, b) => a.price - b.price);
      return { priceText: foundPrices[0].text, price: foundPrices[0].price, allPrices: foundPrices.map(p => p.price) };
    }
    
    // Strategy 2: body text
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
  
  console.log(`[Interactive] Price from text: ${priceData.price}, all prices: ${priceData.allPrices?.join(', ') || 'none'}`);
  
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
    if (rawDataPrice) console.log(`[Interactive] Price from rawData: ${rawDataPrice}`);
  } catch (e) {
    console.log(`[Interactive] rawData error: ${String(e).slice(0, 100)}`);
  }
  
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

async function startSession(goodsId: string, cookies: string, originalUrl: string, shareImage: string | null) {
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
  await page.authenticate({ username: `${brdUser}-country-dz`, password: brdPass });

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

  console.log("[Interactive] Waiting for page to settle...");
  await new Promise((r) => setTimeout(r, 8000));

  let pageTitle = "";
  try { pageTitle = await page.title(); } catch (e) { console.log("[Interactive] Title error:", String(e).slice(0, 100)); }
  console.log(`[Interactive] Page title: "${pageTitle}"`);

  // TRY TO EXTRACT PRICE FIRST (before any CAPTCHA detection)
  console.log("[Interactive] Trying to extract price from page...");
  let result = await extractPriceFromPage(page, goodsId, shareImage);
  
  if (result.price !== null && result.price > 0) {
    console.log(`[Interactive] ✓ Price found immediately: ${result.price}`);
    try { await browser.close(); } catch {}
    return { status: "success", ...result };
  }

  // No price found - wait more and retry
  console.log("[Interactive] No price yet, waiting 5s and retrying...");
  await new Promise((r) => setTimeout(r, 5000));
  result = await extractPriceFromPage(page, goodsId, shareImage);
  
  if (result.price !== null && result.price > 0) {
    console.log(`[Interactive] ✓ Price found after retry: ${result.price}`);
    try { await browser.close(); } catch {}
    return { status: "success", ...result };
  }

  // Still no price - check for REAL CAPTCHA
  const hasRealCaptcha = await page.evaluate(() => {
    const captchaIframe = document.querySelector('iframe[src*="captcha"], iframe[src*="challenge"], iframe[src*="recaptcha"], iframe[title*="captcha" i]');
    if (captchaIframe) return true;
    
    const allText = document.querySelectorAll('div, span, p, h1, h2, h3');
    for (const el of allText) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      
      const text = el.textContent?.trim() || '';
      if (text.length < 100 && (text.toLowerCase().includes('are you a human') || 
          text.toLowerCase().includes('verify you are human') ||
          text.toLowerCase().includes('please verify') ||
          text.toLowerCase().includes('robot verification'))) {
        return true;
      }
    }
    return false;
  });

  let screenshotBuffer = Buffer.alloc(0);
  try { screenshotBuffer = await page.screenshot({ type: "png", fullPage: false }); } catch (e) { console.log("[Interactive] Screenshot error:", String(e).slice(0, 100)); }
  const screenshot = screenshotBuffer.toString("base64");

  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  if (hasRealCaptcha) {
    console.log("[Interactive] ⚠️ Real CAPTCHA detected - waiting for user to solve");
    sessions.set(sessionId, {
      browser, page,
      createdAt: Date.now(), lastActivity: Date.now(),
      goodsId, cookies, shareImage,
      status: "captcha",
    });
    cleanupSessions();
    return {
      status: "captcha", sessionId, screenshot, pageTitle,
      captchaType: "click",
      message: "Temu requires verification. Please click the verify button in the screenshot below.",
    };
  }

  console.log("[Interactive] No price found, no real CAPTCHA - returning screenshot for manual review");
  try { await browser.close(); } catch {}
  return { 
    status: "failed", 
    message: "Could not extract price automatically. The page loaded but price was not found.",
    screenshot, pageTitle,
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
  cleanupSessions();
  return NextResponse.json({
    ok: true,
    activeSessions: sessions.size,
    usage: "POST { goodsId, cookies, finalUrl, shareImage }",
  });
}

export { sessions };
