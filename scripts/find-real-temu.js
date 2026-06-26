#!/usr/bin/env node
/**
 * Navigate Temu homepage, find real product links, then test price extraction
 */

const { chromium } = require("playwright");
const fs = require("fs");

async function findRealProducts() {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1920, height: 1080 },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const page = await context.newPage();

    // Go to Temu homepage
    console.log("Loading Temu homepage...");
    await page.goto("https://www.temu.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(8000);

    const title = await page.title();
    console.log(`Title: ${title}`);

    // Find product links
    const productLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="-g-"]'));
      return links
        .map((a) => ({
          href: a.href,
          text: a.textContent?.trim().slice(0, 80),
        }))
        .filter((l) => l.href.includes("temu.com"))
        .slice(0, 10);
    });

    console.log(`\nFound ${productLinks.length} product links:`);
    productLinks.forEach((l, i) => {
      console.log(`  [${i}] ${l.text} → ${l.href}`);
    });

    if (productLinks.length > 0) {
      // Test the first real product
      const testUrl = productLinks[0].href;
      console.log(`\n=== Testing real product: ${testUrl} ===`);

      await page.goto(testUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(8000);

      const realTitle = await page.title();
      console.log(`Product page title: ${realTitle}`);

      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
      console.log(`Body text: ${bodyText.replace(/\n/g, " | ").slice(0, 300)}`);

      const isCaptcha = /security verification|slide to complete|captcha/i.test(bodyText);
      console.log(`Is captcha: ${isCaptcha}`);

      if (!isCaptcha) {
        const html = await page.content();
        console.log(`HTML length: ${html.length}`);

        // Save for inspection
        fs.writeFileSync("/tmp/temu-real-product.html", html);

        // Extract prices
        const dollarMatches = html.match(/\$\s*(\d{1,5}\.?\d{0,2})/g);
        if (dollarMatches) {
          const unique = [...new Set(dollarMatches)];
          console.log(`\nDollar amounts found: ${unique.slice(0, 15)}`);
        }

        // Look for specific price patterns
        const pricePatterns = [
          /"minPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
          /"salePrice"\s*:\s*"?(\d+\.?\d*)"?/g,
          /"priceStr"\s*:\s*"([^"]+)"/g,
          /"displayPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
          /"origPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
          /"goodsName"\s*:\s*"([^"]+)"/g,
          /"title"\s*:\s*"([^"]{5,80})"/g,
        ];

        console.log("\n--- Price data in HTML ---");
        for (const p of pricePatterns) {
          const matches = [...html.matchAll(p)];
          if (matches.length > 0) {
            console.log(`  Pattern ${p.source.slice(0, 30)}: ${matches.length} matches`);
            matches.slice(0, 3).forEach((m) => {
              console.log(`    → ${m[1]}`);
            });
          }
        }

        // Try to get visible price elements
        const visiblePrices = await page.evaluate(() => {
          const elements = document.querySelectorAll("[class*='price' i], [class*='Price']");
          const results = [];
          elements.forEach((el) => {
            const text = el.textContent?.trim();
            const rect = el.getBoundingClientRect();
            if (text && text.length < 50 && rect.width > 0 && rect.height > 0 && /\d/.test(text)) {
              results.push({
                text,
                className: el.className?.slice(0, 80),
                x: Math.round(rect.x),
                y: Math.round(rect.y),
              });
            }
          });
          return results.slice(0, 15);
        });
        console.log(`\n--- Visible price elements ---`);
        visiblePrices.forEach((p) => {
          console.log(`  "${p.text}" class="${p.className}" at (${p.x}, ${p.y})`);
        });

        // Get product title
        const productTitle = await page.evaluate(() => {
          const h1 = document.querySelector("h1");
          const titleEl = document.querySelector("[class*='title' i], [class*='Title']");
          return {
            h1: h1?.textContent?.trim()?.slice(0, 200),
            titleEl: titleEl?.textContent?.trim()?.slice(0, 200),
            pageTitle: document.title,
          };
        });
        console.log(`\n--- Product title ---`);
        console.log(JSON.stringify(productTitle, null, 2));
      }
    }
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }
}

findRealProducts();
