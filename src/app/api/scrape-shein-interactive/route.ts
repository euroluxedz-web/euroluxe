import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Global session store for SHEIN
interface SheinSession {
  browser: any;
  page: any;
  createdAt: number;
  lastActivity: number;
  productUrl: string;
  cookies: string;
  status: "loading" | "captcha" | "solved" | "failed" | "done";
}

const sessions = new Map<string, SheinSession>();

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity > 5 * 60 * 1000) {
      try { session.browser?.close(); } catch {}
      sessions.delete(id);
    }
  }
}

const SHEIN_COOKIES = "_twpid=tw.1783373277498.327604763536648714; _cfuvid=hWhBmvalpuLUgYz1pO09Ewa2tBhvfK8Ka_2EAhau9k4-1783371930.597719-1.0.1.1-3GvdUFC0mbp_R8oEVTksfxKBeG1sXDNFGSw56M; AT=MDEwMDE.eyJiIjo3LCJnIjoxNzgzMzcyMDI5LCJyIjoib3FuaDhtIiwidCI6MiwibSI6NjQ0NzI2NzMwMCwibCI6MTc4MzM3MjAyOX0.4c56089d09d07609.ac001a1b261952665e4c0f7f9022b82362c3e10ec400a08e1e33ed2228352610; memberId=6447267300; sessionID_shein=s%3A0cbHi-oQWkzbYRugpcWDtYvyFtrL1NC5.GYRPAkPB%2FRKvGnHyZQfv5eQAfqloySYNFSDaotjHe0g";

async function startSheinSession(productUrl: string) {
  const puppeteer = await import("puppeteer").catch(() => null);
  if (!puppeteer || !puppeteer.default) {
    return { status: "failed", message: "Puppeteer not available" };
  }

  const brdUser = process.env.BRD_USER || "brd-customer-hl_e4276258-zone-residential_proxy1";
  const brdPass = process.env.BRD_PASS || "e3trwtkjfmx9";

  console.log("[SHEIN-Interactive] Launching browser...");
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

  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36");
  await page.setViewport({ width: 1920, height: 1080 });

  // Set cookies
  try {
    const cookiePairs = SHEIN_COOKIES.split(";").map((c) => c.trim()).filter(Boolean);
    const cookieObjects = cookiePairs.map((pair) => {
      const [name, ...valueParts] = pair.split("=");
      return { name: name.trim(), value: valueParts.join("=").trim(), domain: ".shein.com", path: "/", secure: true, httpOnly: false };
    });
    await page.setCookie(...cookieObjects);
  } catch (e) {}

  console.log(`[SHEIN-Interactive] Navigating to: ${productUrl.substring(0, 80)}...`);
  try {
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (navErr) {
    console.log("[SHEIN-Interactive] Navigation error:", String(navErr).slice(0, 100));
  }

  await new Promise((r) => setTimeout(r, 5000));

  // Try to extract price first
  const priceResult = await extractSheinPrice(page);
  if (priceResult.price !== null && priceResult.price > 0) {
    console.log(`[SHEIN-Interactive] ✓ Price found: ${priceResult.price}`);
    await browser.close();
    return { status: "success", ...priceResult };
  }

  // No price - take screenshot for CAPTCHA solving
  const screenshotBuffer = await page.screenshot({ type: "png", fullPage: false });
  const screenshot = screenshotBuffer.toString("base64");
  const pageTitle = await page.title().catch(() => "");

  const sessionId = `shein_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  sessions.set(sessionId, {
    browser, page,
    createdAt: Date.now(), lastActivity: Date.now(),
    productUrl, cookies: SHEIN_COOKIES,
    status: "captcha",
  });
  cleanupSessions();

  console.log("[SHEIN-Interactive] ⚠️ CAPTCHA detected - waiting for user to solve");
  return {
    status: "captcha",
    sessionId,
    screenshot,
    pageTitle,
    message: "SHEIN requires verification. Please click the verify button in the screenshot below.",
  };
}

async function extractSheinPrice(page: any) {
  const productData = await page.evaluate(() => {
    let productName = document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
                      document.querySelector("h1")?.textContent || document.querySelector("title")?.textContent || "";
    let productImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";

    const shippingCredits = [1.01, 5.00, 8.00, 13.00];
    let foundPrices: any[] = [];

    const allElements = document.querySelectorAll("body *");
    for (const el of allElements) {
      const text = (el.textContent || "").trim();
      if (text.length > 100) continue;
      const match = text.match(/(?:USD\s*)?[$€£]\s*(\d+(?:\.\d{1,2})?)/i);
      if (match) {
        const price = parseFloat(match[1]);
        if (price > 0 && price < 10000 && !shippingCredits.includes(price)) {
          foundPrices.push({ price, text });
        }
      }
    }

    let price = null;
    if (foundPrices.length > 0) {
      foundPrices.sort((a, b) => a.price - b.price);
      price = foundPrices[0].price;
    }

    return { productName, productImage, price, currency: "USD" };
  });

  return productData;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, action, sessionId, x, y } = body;

    if (action === "click" && sessionId) {
      // Handle click on CAPTCHA
      const session = sessions.get(sessionId);
      if (!session) {
        return NextResponse.json({ status: "failed", message: "Session expired" });
      }

      session.lastActivity = Date.now();
      const { page, browser } = session;

      if (typeof x === "number" && typeof y === "number") {
        console.log(`[SHEIN-Click] Clicking at (${x}, ${y})`);
        await page.mouse.click(x, y);
        await new Promise((r) => setTimeout(r, 8000));

        // Try to extract price
        const priceResult = await extractSheinPrice(page);
        if (priceResult.price !== null && priceResult.price > 0) {
          await browser.close();
          sessions.delete(sessionId);
          return { status: "success", ...priceResult };
        }

        // Take new screenshot
        const screenshotBuffer = await page.screenshot({ type: "png", fullPage: false });
        const screenshot = screenshotBuffer.toString("base64");
        const pageTitle = await page.title().catch(() => "");

        return {
          status: "captcha",
          sessionId,
          screenshot,
          pageTitle,
          message: "Still waiting. Click again or refresh.",
        };
      }

      if (action === "refresh") {
        await new Promise((r) => setTimeout(r, 3000));
        const priceResult = await extractSheinPrice(page);
        if (priceResult.price !== null && priceResult.price > 0) {
          await browser.close();
          sessions.delete(sessionId);
          return { status: "success", ...priceResult };
        }
        const screenshotBuffer = await page.screenshot({ type: "png", fullPage: false });
        return {
          status: "captcha",
          sessionId,
          screenshot: screenshotBuffer.toString("base64"),
          message: "Refreshed. Click verify or try again.",
        };
      }
    }

    // Start new session
    if (!url || !url.includes("shein.com")) {
      return NextResponse.json({ status: "failed", message: "SHEIN URL required" });
    }

    const result = await startSheinSession(url.trim());
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[SHEIN-Interactive] Error:", e);
    return NextResponse.json({ status: "failed", message: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function GET() {
  cleanupSessions();
  return NextResponse.json({
    ok: true,
    activeSessions: sessions.size,
    usage: "POST { url: 'https://www.shein.com/...' } or { action: 'click', sessionId, x, y }",
  });
}
