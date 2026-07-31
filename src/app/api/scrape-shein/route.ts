import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SEARCHAPI_KEY = process.env.SEARCHAPI_KEY || "";
const SHEIN_COOKIES = "_twpid=tw.1783373277498.327604763536648714; _cfuvid=hWhBmvalpuLUgYz1pO09Ewa2tBhvfK8Ka_2EAhau9k4-1783371930.597719-1.0.1.1-3GvdUFC0mbp_R8oEVTksfxKBeG1sXDNFGSw56M; AT=MDEwMDE.eyJiIjo3LCJnIjoxNzgzMzcyMDI5LCJyIjoib3FuaDhtIiwidCI6MiwibSI6NjQ0NzI2NzMwMCwibCI6MTc4MzM3MjAyOX0.4c56089d09d07609.ac001a1b261952665e4c0f7f9022b82362c3e10ec400a08e1e33ed2228352610; memberId=6447267300; sessionID_shein=s%3A0cbHi-oQWkzbYRugpcWDtYvyFtrL1NC5.GYRPAkPB%2FRKvGnHyZQfv5eQAfqloySYNFSDaotjHe0g";

function extractProductId(url: string): string | null {
  const m = url.match(/-p-(\d+)/i);
  return m ? m[1] : null;
}

function extractSearchTerms(url: string): string {
  const match = url.match(/\/([^\/]+?)-p-\d+/);
  if (match) {
    return match[1].replace(/-/g, " ").replace(/\bWomen\b/gi, "").replace(/\bMen\b/gi, "").replace(/\bCasual\b/gi, "").trim().split(/\s+/).filter(w => w.length > 1).slice(0, 6).join(" ");
  }
  return "";
}

/**
 * Strategy 1: Puppeteer + Bright Data (tries to load the EXACT product page)
 * Uses the user's SHEIN cookies. If SHEIN shows the page without CAPTCHA,
 * we get the exact price.
 */
async function scrapeWithBrowser(url: string, productId: string) {
  console.log("[SHEIN] Strategy 1: Puppeteer + Bright Data...");
  const puppeteer = await import("puppeteer").catch(() => null);
  if (!puppeteer?.default) return null;

  const brdUser = process.env.BRD_USER || "brd-customer-hl_e4276258-zone-residential_proxy1";
  const brdPass = process.env.BRD_PASS || "e3trwtkjfmx9";

  const browser = await puppeteer.default.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-blink-features=AutomationControlled", "--window-size=1920,1080", "--proxy-server=http://brd.superproxy.io:33335", "--ignore-certificate-errors"],
  });

  const page = await browser.newPage();
  await page.authenticate({ username: `${brdUser}-country-us`, password: brdPass });
  
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [{ name: "Chrome PDF Plugin" }, { name: "Chrome PDF Viewer" }, { name: "Native Client" }] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    (window as any).chrome = { runtime: {} };
  });

  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36");
  await page.setViewport({ width: 1920, height: 1080 });

  // Set cookies
  try {
    const cookiePairs = SHEIN_COOKIES.split(";").map(c => c.trim()).filter(Boolean);
    const cookieObjects = cookiePairs.map(pair => {
      const [name, ...v] = pair.split("=");
      return { name: name.trim(), value: v.join("=").trim(), domain: ".shein.com", path: "/", secure: true, httpOnly: false };
    });
    await page.setCookie(...cookieObjects);
  } catch {}

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await new Promise(r => setTimeout(r, 8000));

    // Check for CAPTCHA
    const currentUrl = page.url();
    if (currentUrl.includes("risk/challenge") || currentUrl.includes("captcha")) {
      console.log("[SHEIN] CAPTCHA detected, Puppeteer failed");
      await browser.close();
      return null;
    }

    // Extract price from the page
    const result = await page.evaluate(() => {
      let productName = document.querySelector('meta[property="og:title"]')?.getAttribute("content") || document.querySelector("h1")?.textContent || "";
      let productImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";
      let price = null;

      // JSON-LD
      document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
        try { const d = JSON.parse(s.textContent || ""); if (d?.offers?.price) price = parseFloat(d.offers.price); } catch {}
      });

      // Meta tags
      if (!price) {
        const m = document.querySelector('meta[property="product:price:amount"]')?.getAttribute("content");
        if (m) price = parseFloat(m);
      }

      // Page text (filter shipping credits)
      if (!price) {
        const credits = [1.01, 5, 8, 13];
        const matches = (document.body.textContent || "").match(/\$\s*(\d+\.\d{2})/g);
        if (matches) {
          const prices = matches.map(m => parseFloat(m.match(/\$(\d+\.\d{2})/)[1])).filter(p => p > 0 && p < 10000 && !credits.includes(p));
          if (prices.length > 0) { prices.sort((a, b) => a - b); price = prices[0]; }
        }
      }

      // Embedded JSON
      if (!price) {
        document.querySelectorAll("script").forEach(s => {
          const t = s.textContent || "";
          const m1 = t.match(/"salePrice"\s*:\s*\{[^}]*"usdAmount"\s*:\s*"(\d+\.?\d*)"/);
          if (m1) { price = parseFloat(m1[1]); }
          const m2 = t.match(/"sale_price"\s*:\s*(\d+\.?\d*)/);
          if (m2 && !price) { price = parseFloat(m2[1]); }
        });
      }

      return { productName, productImage, price };
    });

    await browser.close();

    if (result.price && result.price > 0) {
      console.log(`[SHEIN] ✓ Puppeteer found exact price: $${result.price}`);
      return {
        status: "success", price: Math.round(result.price * 100) / 100, currency: "USD",
        productName: result.productName || null, productImage: result.productImage || null,
        productUrl: url, exact: true,
      };
    }
  } catch (e) {
    await browser.close();
  }
  return null;
}

/**
 * Strategy 2: SearchAPI.io Google Shopping (fast, approximate)
 */
async function scrapeViaSearchAPI(searchTerms: string) {
  if (!searchTerms) return null;
  console.log(`[SHEIN] Strategy 2: SearchAPI.io for "${searchTerms}"...`);

  const searchUrl = `https://www.searchapi.io/api/v1/search?engine=google_shopping&q=shein+${encodeURIComponent(searchTerms)}&api_key=${SEARCHAPI_KEY}&gl=us&hl=en`;
  
  const res = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  
  const data = await res.json();
  const results = data.shopping_results || [];
  if (results.length === 0) return null;

  // Find the first SHEIN result
  const sheinResult = results.find((r: any) => 
    String(r.seller || "").toLowerCase().includes("shein") || 
    String(r.title || "").toLowerCase().includes("shein")
  ) || results[0];

  const price = sheinResult.extracted_price || parseFloat(String(sheinResult.price || "").replace(/[^\d.]/g, "")) || null;
  
  if (price && price > 0) {
    console.log(`[SHEIN] ✓ SearchAPI found price: $${price} (approximate)`);
    return {
      status: "success", price: Math.round(price * 100) / 100, currency: "USD",
      productName: sheinResult.title || null, productImage: sheinResult.thumbnail || null,
      productUrl: null, originalPrice: sheinResult.extracted_original_price || null,
      approximate: true,
    };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 10, 60_000);
  if (rateLimitResponse) return rateLimitResponse;
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || !url.includes("shein.com")) {
      return NextResponse.json({ status: "failed", message: "SHEIN URL required" });
    }

    const productId = extractProductId(url);
    const searchTerms = extractSearchTerms(url);
    console.log(`[SHEIN] Product ID: ${productId}, Search: "${searchTerms}"`);

    // Strategy 1: Puppeteer (exact, but may fail due to CAPTCHA)
    const browserResult = await scrapeWithBrowser(url.trim(), productId || "");
    if (browserResult) {
      return NextResponse.json(browserResult);
    }

    // Strategy 2: SearchAPI.io (fast, approximate)
    const searchResult = await scrapeViaSearchAPI(searchTerms);
    if (searchResult) {
      return NextResponse.json(searchResult);
    }

    return NextResponse.json({
      status: "failed",
      message: "Could not find this product. Please enter the price manually.",
      productUrl: url.trim(),
    });
  } catch (e: any) {
    return NextResponse.json({ status: "failed", message: e?.message || "Unknown error" });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, approach: "Puppeteer (exact) + SearchAPI.io (approximate fallback)" });
}
