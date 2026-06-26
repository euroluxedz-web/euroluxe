#!/usr/bin/env node
/**
 * Test if Playwright can render Temu pages and extract prices.
 * This bypasses JavaScript anti-bot challenges.
 */

const { chromium } = require("playwright");

async function testTemuWithPlaywright(url) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Testing with Playwright: ${url}`);
  console.log("=".repeat(70));

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      locale: "en-US",
      timezoneId: "America/New_York",
      viewport: { width: 1920, height: 1080 },
    });

    // Remove webdriver property to avoid detection
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      // Overwrite the `plugins` property to use a custom getter.
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
    });

    const page = await context.newPage();

    console.log("Navigating to Temu...");
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    console.log(`Response status: ${response?.status()}`);
    console.log(`Final URL: ${page.url()}`);

    // Wait a bit for any JS to execute
    await page.waitForTimeout(3000);

    const title = await page.title();
    console.log(`Page title: ${title}`);

    // Get the full HTML
    const html = await page.content();
    console.log(`HTML length: ${html.length}`);

    // Try to extract price using multiple strategies
    console.log("\n--- Price Extraction ---");

    // Strategy 1: Look for price in text content
    const priceSelectors = [
      '[data-testid="price"]',
      '[class*="price"]',
      '[class*="Price"]',
      '[class*="productPrice"]',
      '[class*="salePrice"]',
      '[class*="currentPrice"]',
      ".price",
      "#price",
    ];

    for (const sel of priceSelectors) {
      try {
        const elements = await page.$$(sel);
        if (elements.length > 0) {
          const texts = await Promise.all(
            elements.slice(0, 3).map((el) => el.textContent())
          );
          console.log(`  ${sel}: ${JSON.stringify(texts)}`);
        }
      } catch (e) {
        // skip
      }
    }

    // Strategy 2: Look for $ amounts in the page text
    const bodyText = await page.evaluate(() => document.body.innerText);
    const dollarMatches = bodyText.match(/\$\s*(\d{1,5}\.?\d{0,2})/g);
    if (dollarMatches) {
      console.log(`\n  Dollar prices found in text: ${dollarMatches.slice(0, 10)}`);
    }

    // Strategy 3: Look for JSON-LD
    const jsonLdData = await page.evaluate(() => {
      const scripts = document.querySelectorAll(
        'script[type="application/ld+json"]'
      );
      return Array.from(scripts).map((s) => s.textContent);
    });
    if (jsonLdData.length > 0) {
      console.log(`\n  JSON-LD scripts found: ${jsonLdData.length}`);
      for (const data of jsonLdData.slice(0, 2)) {
        console.log(`  ${data.slice(0, 300)}`);
      }
    }

    // Strategy 4: Look for meta tags
    const metaInfo = await page.evaluate(() => {
      const metas = {};
      document.querySelectorAll("meta").forEach((m) => {
        const prop = m.getAttribute("property") || m.getAttribute("name");
        if (prop && (prop.includes("price") || prop.includes("title") || prop.includes("image"))) {
          metas[prop] = m.getAttribute("content");
        }
      });
      return metas;
    });
    console.log(`\n  Meta tags: ${JSON.stringify(metaInfo)}`);

    // Strategy 5: Look for embedded data in scripts
    const scriptData = await page.evaluate(() => {
      const scripts = document.querySelectorAll("script");
      const results = [];
      for (const s of scripts) {
        const text = s.textContent || "";
        if (
          (text.includes("minPrice") || text.includes("salePrice") || text.includes("priceStr")) &&
          text.length < 50000
        ) {
          results.push(text.slice(0, 500));
        }
      }
      return results;
    });
    if (scriptData.length > 0) {
      console.log(`\n  Price data in scripts:`);
      scriptData.slice(0, 3).forEach((s, i) => {
        console.log(`  [${i}] ${s}`);
      });
    }

    // Strategy 6: Extract from raw HTML using regex
    const pricePatterns = [
      /"minPrice"\s*:\s*"?(\d+\.?\d*)"?/,
      /"salePrice"\s*:\s*"?(\d+\.?\d*)"?/,
      /"priceStr"\s*:\s*"\$?(\d+\.?\d*)"/,
      /"displayPrice"\s*:\s*"?(\d+\.?\d*)"?/,
      /"price"\s*:\s*"?(\d+\.?\d*)"?/,
    ];
    console.log("\n  Regex price extraction from HTML:");
    for (const pattern of pricePatterns) {
      const match = html.match(pattern);
      if (match) {
        console.log(`  ✓ Pattern ${pattern}: ${match[1]}`);
      }
    }

    // Strategy 7: Get product name
    const productName = await page
      .evaluate(() => {
        const h1 = document.querySelector("h1");
        return h1 ? h1.textContent : null;
      })
      .catch(() => null);
    if (productName) {
      console.log(`\n  Product name (h1): ${productName}`);
    }

    // Print first 1000 chars of HTML for debugging
    console.log("\n--- HTML Preview (first 1000 chars) ---");
    console.log(html.slice(0, 1000));
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }
}

// Test with a few Temu URLs
const testUrls = [
  "https://www.temu.com/some-product-g-301005094120953001.html",
  "https://www.temu.com/-g-301005039021953001.html",
];

(async () => {
  for (const url of testUrls) {
    await testTemuWithPlaywright(url);
  }
})();
