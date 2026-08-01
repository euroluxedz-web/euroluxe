import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/security";
import { sessions } from "../scrape-interactive/route";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Apply user's click on the page (to solve CAPTCHA), then check if price is available.
 * The frontend sends: { sessionId, x, y } where x,y are click coordinates on the screenshot.
 * We also support { sessionId, action: "refresh" } to just take a new screenshot.
 */
export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 10, 60_000);
  if (rateLimitResponse) return rateLimitResponse;
  
  // Require authentication
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { sessionId, x, y, action } = body;

    if (!sessionId) {
      return NextResponse.json({ status: "failed", message: "sessionId required" }, { status: 400 });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return NextResponse.json({ status: "failed", message: "Session expired or not found. Please restart." }, { status: 404 });
    }

    session.lastActivity = Date.now();
    const { page, browser, goodsId, shareImage } = session;

    // If action is refresh, just take a new screenshot
    if (action === "refresh") {
      console.log("[Click] Refresh screenshot requested");
      await new Promise((r) => setTimeout(r, 2000));
      const screenshotBuffer = await page.screenshot({ type: "png", fullPage: false });
      const screenshot = screenshotBuffer.toString("base64");

      // Try to extract price
      const priceData = await extractPrice(page, goodsId, shareImage);
      if (priceData.price !== null) {
        try { await browser.close(); } catch {}
        sessions.delete(sessionId);
        return NextResponse.json({ status: "success", ...priceData });
      }

      return NextResponse.json({
        status: "captcha",
        sessionId,
        screenshot,
        message: "Still waiting. Click verify or refresh.",
      });
    }

    // Apply click at coordinates
    if (typeof x === "number" && typeof y === "number") {
      console.log(`[Click] Applying click at (${x}, ${y})`);
      
      // The screenshot is 1920x1080 viewport, so coordinates map directly
      await page.mouse.click(x, y);
      
      // Wait for page to respond
      await new Promise((r) => setTimeout(r, 5000));

      // Take new screenshot
      const screenshotBuffer = await page.screenshot({ type: "png", fullPage: false });
      const screenshot = screenshotBuffer.toString("base64");

      // Check page title
      const pageTitle = await page.title();
      console.log(`[Click] Page title after click: "${pageTitle}"`);

      // Try to extract price
      const priceData = await extractPrice(page, goodsId, shareImage);
      if (priceData.price !== null) {
        console.log(`[Click] ✓ Price found: ${priceData.price}`);
        try { await browser.close(); } catch {}
        sessions.delete(sessionId);
        return NextResponse.json({ status: "success", ...priceData });
      }

      // Check if CAPTCHA is still present
      const pageHtml = await page.content();
      const htmlLower = pageHtml.toLowerCase();
      const stillCaptcha = htmlLower.includes("captcha") || htmlLower.includes("verify") || pageTitle === "Temu";

      if (stillCaptcha) {
        return NextResponse.json({
          status: "captcha",
          sessionId,
          screenshot,
          pageTitle,
          message: "CAPTCHA still present. Try clicking again or refresh.",
        });
      }

      // No CAPTCHA but no price either - wait more and retry
      await new Promise((r) => setTimeout(r, 3000));
      const retryPrice = await extractPrice(page, goodsId, shareImage);
      if (retryPrice.price !== null) {
        try { await browser.close(); } catch {}
        sessions.delete(sessionId);
        return NextResponse.json({ status: "success", ...retryPrice });
      }

      return NextResponse.json({
        status: "captcha",
        sessionId,
        screenshot,
        pageTitle,
        message: "Page loaded but price not found. Try scrolling or refresh.",
      });
    }

    return NextResponse.json({ status: "failed", message: "Provide x,y coordinates or action=refresh" }, { status: 400 });
  } catch (e: any) {
    console.error("[Click] Error:", e);
    return NextResponse.json({ status: "failed", message: e?.message || "Unknown error" }, { status: 500 });
  }
}

async function extractPrice(page: any, goodsId: string, shareImage: string | null) {
  // Try page text
  const priceData = await page.evaluate(() => {
    const allElements = document.querySelectorAll("body *");
    for (const el of allElements) {
      const text = el.textContent || "";
      const match = text.match(/US\s*\$\s*(\d+(?:\.\d{1,2})?)/);
      if (match && text.length < 50) return { priceText: match[0], price: parseFloat(match[1]) };
    }
    const bodyText = document.body.textContent || "";
    const match = bodyText.match(/US\s*\$\s*(\d+(?:\.\d{1,2})?)/);
    if (match) return { priceText: match[0], price: parseFloat(match[1]) };
    return { priceText: "", price: null };
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

  const productInfo = await page.evaluate(() => {
    const title = document.querySelector('meta[property="og:title"]')?.getAttribute("content") || document.querySelector("title")?.textContent || null;
    const image = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;
    return { title, image };
  });

  return {
    price: priceData.price || rawDataPrice,
    currency: "USD",
    productName: productInfo.title,
    productImage: productInfo.image || shareImage,
  };
}
