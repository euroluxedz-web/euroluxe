#!/usr/bin/env node
/**
 * Advanced Playwright test with stealth techniques
 * - Use new headless mode (harder to detect)
 * - Spoool fingerprint
 * - Realistic mouse movements
 */

const { chromium } = require("playwright");

async function stealthTest(url) {
  console.log(`\n=== Stealth Test: ${url} ===`);
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-infobars",
        "--window-position=0,0",
        "--ignore-certifcate-errors",
        "--ignore-certifcate-errors-spki-list",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });

    // Use persistent context with realistic settings
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "en-US",
      timezoneId: "America/New_York",
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      javaScriptEnabled: true,
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
      },
    });

    // Comprehensive stealth scripts
    await context.addInitScript(() => {
      // Hide webdriver
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      delete navigator.__proto__.webdriver;

      // Fake plugins
      Object.defineProperty(navigator, "plugins", {
        get: () => {
          const plugins = [
            { name: "Chrome PDF Plugin" },
            { name: "Chrome PDF Viewer" },
            { name: "Native Client" },
          ];
          plugins.length = 3;
          return plugins;
        },
      });

      // Fake languages
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });

      // Chrome runtime
      window.chrome = { runtime: {} };

      // Permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);

      // WebGL vendor
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) return "Intel Inc.";
        if (parameter === 37446) return "Intel Iris OpenGL Engine";
        return getParameter.call(this, parameter);
      };
    });

    const page = await context.newPage();

    // Set realistic mouse behavior
    await page.mouse.move(100, 100);
    await page.mouse.move(200, 200);
    await page.mouse.move(300, 300);

    console.log("Navigating...");
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    console.log(`Status: ${response?.status()}`);

    // Wait for page to settle
    await page.waitForTimeout(8000);

    const title = await page.title();
    console.log(`Title: ${title}`);

    // Check if we're on captcha page
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
    console.log(`Body text start: ${bodyText.replace(/\n/g, " | ")}`);

    const isCaptcha = /security verification|slide to complete|captcha|robot/i.test(bodyText);
    console.log(`Is captcha page: ${isCaptcha}`);

    if (!isCaptcha) {
      // Try to extract price
      const html = await page.content();
      console.log(`HTML length: ${html.length}`);

      // Look for prices
      const dollarMatches = html.match(/\$\s*(\d{1,5}\.?\d{0,2})/g);
      if (dollarMatches) {
        console.log(`Dollar amounts: ${[...new Set(dollarMatches)].slice(0, 10)}`);
      }

      // Look for product-specific data
      const productData = await page.evaluate(() => {
        // Try to find product title
        const h1 = document.querySelector("h1");
        const title = h1 ? h1.textContent?.trim() : null;

        // Try various price selectors
        const priceSelectors = [
          "[class*='price' i]",
          "[class*='Price']",
          "[data-price]",
          "[itemprop='price']",
          ".product-price",
          ".sale-price",
          ".current-price",
        ];

        const prices = [];
        for (const sel of priceSelectors) {
          const els = document.querySelectorAll(sel);
          els.forEach((el) => {
            const text = el.textContent?.trim();
            if (text && text.length < 50 && /\d/.test(text)) {
              prices.push({ selector: sel, text });
            }
          });
          if (prices.length > 10) break;
        }

        return { title, prices: prices.slice(0, 10) };
      });
      console.log(`Product data: ${JSON.stringify(productData, null, 2)}`);
    } else {
      console.log("Captcha detected - trying to wait and reload...");
      await page.waitForTimeout(5000);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(8000);
      const bodyText2 = await page.evaluate(() => document.body.innerText.slice(0, 300));
      console.log(`After reload: ${bodyText2.replace(/\n/g, " | ")}`);
    }

  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }
}

stealthTest("https://www.temu.com/some-product-g-301005094120953001.html");
