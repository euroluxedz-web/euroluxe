#!/usr/bin/env node
/**
 * Deep inspect Temu page HTML to find price location
 */

const { chromium } = require("playwright");

async function inspectTemu(url) {
  console.log(`\nInspecting: ${url}`);
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1920, height: 1080 },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(5000);

    const html = await page.content();
    console.log(`HTML length: ${html.length}`);

    // Search for ALL price-related patterns in raw HTML
    console.log("\n--- Searching for price patterns in HTML ---");
    const allPatterns = [
      { name: "minPrice", regex: /"minPrice"\s*:\s*"?(\d+\.?\d*)"?/g },
      { name: "salePrice", regex: /"salePrice"\s*:\s*"?(\d+\.?\d*)"?/g },
      { name: "priceStr", regex: /"priceStr"\s*:\s*"([^"]+)"/g },
      { name: "displayPrice", regex: /"displayPrice"\s*:\s*"?(\d+\.?\d*)"?/g },
      { name: "origPrice", regex: /"origPrice"\s*:\s*"?(\d+\.?\d*)"?/g },
      { name: "minOrigPrice", regex: /"minOrigPrice"\s*:\s*"?(\d+\.?\d*)"?/g },
      { name: "price (generic)", regex: /"price"\s*:\s*"?(\d+\.?\d*)"?/g },
      { name: "goodsName", regex: /"goodsName"\s*:\s*"([^"]+)"/g },
      { name: "title field", regex: /"title"\s*:\s*"([^"]+)"/g },
      { name: "skuList", regex: /"skuList"\s*:/g },
      { name: "goods_id", regex: /"goods_id"\s*:\s*"?(\d+)"?/g },
      { name: "goodsSn", regex: /"goodsSn"\s*:\s*"([^"]+)"/g },
      { name: "$ in text", regex: /\$\s*(\d{1,5}\.?\d{0,2})/g },
      { name: "USD", regex: /USD\s*(\d+\.?\d*)/g },
      { name: "priceNum", regex: /"priceNum"\s*:\s*"?(\d+\.?\d*)"?/g },
      { name: "appPrice", regex: /"appPrice"\s*:\s*"?(\d+\.?\d*)"?/g },
      { name: "normalPrice", regex: /"normalPrice"\s*:\s*"?(\d+\.?\d*)"?/g },
      { name: "marketPrice", regex: /"marketPrice"\s*:\s*"?(\d+\.?\d*)"?/g },
      { name: "discountPrice", regex: /"discountPrice"\s*:\s*"?(\d+\.?\d*)"?/g },
    ];

    for (const { name, regex } of allPatterns) {
      const matches = [...html.matchAll(regex)];
      if (matches.length > 0) {
        console.log(`\n  ✓ ${name}: ${matches.length} matches`);
        matches.slice(0, 3).forEach((m) => {
          console.log(`    → ${m[1] || m[0]}`);
        });
      }
    }

    // Try evaluating JS to find product data in window object
    console.log("\n--- Checking window object for product data ---");
    const windowData = await page.evaluate(() => {
      const result = {};
      // Check common Temu data locations
      try {
        if (window.__INITIAL_STATE__) result.__INITIAL_STATE__ = Object.keys(window.__INITIAL_STATE__);
      } catch {}
      try {
        if (window.__PRELOADED_STATE__) result.__PRELOADED_STATE__ = Object.keys(window.__PRELOADED_STATE__);
      } catch {}
      try {
        if (window.__NEXT_DATA__) result.__NEXT_DATA__ = "exists";
      } catch {}
      try {
        if (window.rawData) result.rawData = typeof window.rawData;
      } catch {}
      try {
        if (window.pageData) result.pageData = typeof window.pageData;
      } catch {}
      // Search all window keys for "price"
      try {
        const priceKeys = Object.keys(window).filter(k =>
          k.toLowerCase().includes("price") ||
          k.toLowerCase().includes("product") ||
          k.toLowerCase().includes("goods") ||
          k.toLowerCase().includes("detail")
        );
        if (priceKeys.length > 0) result.priceRelatedKeys = priceKeys;
      } catch {}
      return result;
    });
    console.log("  Window data:", JSON.stringify(windowData, null, 2));

    // Check for "not found" or error indicators
    console.log("\n--- Page Status Indicators ---");
    const statusIndicators = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasNotFound: /not found|doesn't exist|unavailable|no longer available/i.test(text),
        hasCaptcha: /captcha|verify|robot/i.test(text),
        hasLogin: /sign in|log in|create account/i.test(text),
        title: document.title,
        h1: document.querySelector("h1")?.textContent?.slice(0, 200) || null,
        bodyTextStart: text.slice(0, 500),
      };
    });
    console.log("  Status:", JSON.stringify(statusIndicators, null, 2));

    // Save full HTML for inspection
    const fs = require("fs");
    fs.writeFileSync("/tmp/temu-page-full.html", html);
    console.log("\n  Full HTML saved to /tmp/temu-page-full.html");

    // Search for any $ amount in the HTML (not just text)
    const dollarInHtml = html.match(/\$\s*\d{1,5}\.?\d{0,2}/g);
    if (dollarInHtml) {
      console.log(`\n  Dollar amounts in HTML: ${dollarInHtml.slice(0, 10)}`);
    }

    // Look for JSON-LD
    const jsonLdMatches = html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );
    for (const m of jsonLdMatches) {
      console.log(`\n  JSON-LD: ${m[1].slice(0, 400)}`);
    }

  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }
}

// Try with a real-looking Temu URL
inspectTemu("https://www.temu.com/some-product-g-301005094120953001.html");
