import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const SHEIN_COOKIES = "_twpid=tw.1783373277498.327604763536648714; _cfuvid=hWhBmvalpuLUgYz1pO09Ewa2tBhvfK8Ka_2EAhau9k4-1783371930.597719-1.0.1.1-3GvdUFC0mbp_R8oEVTksfxKBeG1sXDNFGSw56M; AT=MDEwMDE.eyJiIjo3LCJnIjoxNzgzMzcyMDI5LCJyIjoib3FuaDhtIiwidCI6MiwibSI6NjQ0NzI2NzMwMCwibCI6MTc4MzM3MjAyOX0.4c56089d09d07609.ac001a1b261952665e4c0f7f9022b82362c3e10ec400a08e1e33ed2228352610; memberId=6447267300; sessionID_shein=s%3A0cbHi-oQWkzbYRugpcWDtYvyFtrL1NC5.GYRPAkPB%2FRKvGnHyZQfv5eQAfqloySYNFSDaotjHe0g";

function extractGoodsId(url: string): string | null {
  const m = url.match(/-p-(\d+)/i);
  return m ? m[1] : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || !url.includes("shein.com")) {
      return NextResponse.json({ status: "failed", message: "SHEIN URL required" });
    }

    const goodsId = extractGoodsId(url);
    console.log(`[SHEIN] Starting for goods_id: ${goodsId}`);

    const puppeteer = await import("puppeteer").catch(() => null);
    if (!puppeteer?.default) {
      return NextResponse.json({ status: "failed", message: "Puppeteer not available" });
    }

    const brdUser = process.env.BRD_USER || "brd-customer-hl_e4276258-zone-residential_proxy1";
    const brdPass = process.env.BRD_PASS || "e3trwtkjfmx9";

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

    // Desktop UA (not mobile - some sites treat mobile differently)
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1920, height: 1080 });

    // Set cookies
    try {
      const cookiePairs = SHEIN_COOKIES.split(";").map(c => c.trim()).filter(Boolean);
      const cookieObjects = cookiePairs.map(pair => {
        const [name, ...valueParts] = pair.split("=");
        return { name: name.trim(), value: valueParts.join("=").trim(), domain: ".shein.com", path: "/", secure: true, httpOnly: false };
      });
      await page.setCookie(...cookieObjects);
    } catch {}

    // Navigate to the product page
    console.log("[SHEIN] Navigating to product page...");
    try {
      await page.goto(url.trim(), { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch {}

    // Wait for initial load
    await new Promise(r => setTimeout(r, 5000));

    // Check if we're on CAPTCHA page
    let currentUrl = page.url();
    console.log(`[SHEIN] Current URL: ${currentUrl.substring(0, 100)}`);

    if (currentUrl.includes("risk/challenge") || currentUrl.includes("captcha")) {
      console.log("[SHEIN] CAPTCHA detected - trying to auto-solve...");

      // Try to find and click the "Verify" button
      // SHEIN uses various CAPTCHA types - try common selectors
      const captchaSelectors = [
        'button[class*="verify"]',
        'div[class*="verify"]',
        'button[class*="captcha"]',
        'div[class*="captcha"]',
        'iframe[src*="captcha"]',
        'button:contains("Verify")',
        'span:contains("Verify")',
        '#verify-button',
        '.btn-verify',
      ];

      for (const selector of captchaSelectors) {
        try {
          const el = await page.$(selector);
          if (el) {
            console.log(`[SHEIN] Found CAPTCHA element: ${selector}`);
            await el.click();
            console.log("[SHEIN] Clicked CAPTCHA button, waiting...");
            await new Promise(r => setTimeout(r, 10000));
            break;
          }
        } catch {}
      }

      // Also try clicking at common CAPTCHA positions
      // Many CAPTCHAs have a button in the center of the page
      try {
        await page.mouse.click(960, 540); // Center of screen
        console.log("[SHEIN] Clicked center of screen");
        await new Promise(r => setTimeout(r, 8000));
      } catch {}

      // Check if CAPTCHA is resolved
      currentUrl = page.url();
      if (currentUrl.includes("risk/challenge") || currentUrl.includes("captcha")) {
        console.log("[SHEIN] CAPTCHA still present after auto-solve attempt");

        // Try waiting longer - some CAPTCHAs auto-resolve after 15s
        console.log("[SHEIN] Waiting 15 more seconds for auto-resolution...");
        await new Promise(r => setTimeout(r, 15000));
        currentUrl = page.url();
      }
    }

    // Check if we're now on the product page
    currentUrl = page.url();
    console.log(`[SHEIN] Final URL: ${currentUrl.substring(0, 100)}`);

    // Try to extract price regardless of URL (the page might have loaded
    // the product data even if URL still shows challenge)
    console.log("[SHEIN] Extracting product data...");
    const result = await page.evaluate(() => {
      let productName = document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
                       document.querySelector("h1")?.textContent || "";
      let productImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";

      let price = null;
      let currency = "USD";

      // JSON-LD
      document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
        try {
          const data = JSON.parse(s.textContent || "");
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (item?.offers?.price) { price = parseFloat(item.offers.price); currency = item.offers.priceCurrency || "USD"; }
          }
        } catch {}
      });

      // Meta tags
      if (!price) {
        const m = document.querySelector('meta[property="product:price:amount"]')?.getAttribute("content");
        if (m) price = parseFloat(m);
      }

      // Page text
      if (!price) {
        const credits = [1.01, 5.00, 8.00, 13.00];
        const matches = (document.body.textContent || "").match(/\$\s*(\d+\.\d{2})/g);
        if (matches) {
          const prices = matches.map(m => parseFloat(m.match(/\$(\d+\.\d{2})/)[1])).filter(p => p > 0 && p < 10000 && !credits.includes(p));
          if (prices.length > 0) { prices.sort((a, b) => a - b); price = prices[0]; }
        }
      }

      // Embedded JSON in script tags
      if (!price) {
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
          const text = s.textContent || "";
          const m1 = text.match(/"salePrice"\s*:\s*\{[^}]*"usdAmount"\s*:\s*"(\d+\.?\d*)"/);
          if (m1) { price = parseFloat(m1[1]); break; }
          const m2 = text.match(/"sale_price"\s*:\s*(\d+\.?\d*)/);
          if (m2) { price = parseFloat(m2[1]); break; }
          const m3 = text.match(/"price"\s*:\s*"?(\d+\.?\d*)"/);
          if (m3) { price = parseFloat(m3[1]); break; }
        }
      }

      return { productName, productImage, price, currency };
    });

    console.log(`[SHEIN] Product: ${result.productName?.substring(0, 50)}`);
    console.log(`[SHEIN] Price: ${result.price} ${result.currency}`);

    await browser.close();

    if (result.price && result.price > 0) {
      let priceUSD = result.price;
      if (result.currency === "EUR") priceUSD = result.price * 1.085;
      else if (result.currency === "GBP") priceUSD = result.price * 1.265;

      return NextResponse.json({
        status: "success",
        price: Math.round(priceUSD * 100) / 100,
        currency: "USD",
        productName: result.productName || null,
        productImage: result.productImage || null,
        productUrl: url.trim(),
      });
    }

    return NextResponse.json({
      status: "failed",
      message: "Could not extract price from SHEIN. Please try entering the price manually.",
      productUrl: url.trim(),
    });
  } catch (e: any) {
    console.error("[SHEIN] Fatal error:", e);
    return NextResponse.json({ status: "failed", message: e?.message || "Unknown error" });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, usage: "POST { url }" });
}
