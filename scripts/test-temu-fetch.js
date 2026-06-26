#!/usr/bin/env node
/**
 * Test what Temu returns when we fetch a product page server-side.
 * Try multiple strategies to extract price.
 */

const TEST_URLS = [
  // A few sample Temu product URLs (public)
  "https://www.temu.com/some-product-g-301005094120953001.html",
  "https://www.temu.com/-g-301005039021953001.html",
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Ch-Ua":
    '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

async function testFetch(url) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Testing URL: ${url}`);
  console.log("=".repeat(80));

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      headers: HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Final URL: ${response.url}`);
    console.log(`Content-Type: ${response.headers.get("content-type")}`);

    const html = await response.text();
    console.log(`HTML length: ${html.length} chars`);

    // Check for common price patterns
    const patterns = {
      "JSON-LD Product":
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i,
      "og:price": /property=["']product:price:amount["']/i,
      "minPrice field": /"minPrice"\s*:/,
      "salePrice field": /"salePrice"\s*:/,
      "priceStr field": /"priceStr"\s*:/,
      "displayPrice field": /"displayPrice"\s*:/,
      "goods_id field": /"goods_id"\s*:/,
      "goodsName field": /"goodsName"\s*:/,
      "$ price text": /\$\s*\d{1,5}\.?\d{0,2}/,
      "Temu title": /<title>[^<]*temu/i,
      "Captcha/block": /captcha|blocked|verify you are human|access denied/i,
      "Login redirect": /login|sign in|create account/i,
    };

    console.log("\n--- Pattern Detection ---");
    for (const [name, pattern] of Object.entries(patterns)) {
      const match = html.match(pattern);
      console.log(`  ${match ? "✓" : "✗"} ${name}`);
    }

    // Try to extract actual price
    console.log("\n--- Price Extraction Attempts ---");

    // 1. JSON-LD
    const jsonLdMatch = html.match(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
    );
    if (jsonLdMatch) {
      try {
        const data = JSON.parse(jsonLdMatch[1]);
        console.log(
          "  JSON-LD found:",
          JSON.stringify(data).slice(0, 300)
        );
      } catch (e) {
        console.log("  JSON-LD parse error:", e.message);
      }
    }

    // 2. Embedded price patterns
    const priceMatches = html.matchAll(
      /"(minPrice|salePrice|price|displayPrice|priceStr)"\s*:\s*"?(\d+\.?\d*)"?/g
    );
    const prices = [];
    for (const m of priceMatches) {
      prices.push({ field: m[1], value: parseFloat(m[2]) });
    }
    if (prices.length > 0) {
      console.log("  Embedded prices found:", prices.slice(0, 5));
    }

    // 3. Dollar prices in text
    const dollarMatches = [
      ...html.matchAll(/\$\s*(\d{1,5}\.?\d{0,2})/g),
    ].slice(0, 5);
    if (dollarMatches.length > 0) {
      console.log(
        "  Dollar prices in text:",
        dollarMatches.map((m) => m[1])
      );
    }

    // 4. Show first 500 chars to see what we got
    console.log("\n--- HTML Preview (first 800 chars) ---");
    console.log(html.slice(0, 800));

    // 5. Check title
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    if (titleMatch) {
      console.log("\n--- Page Title ---");
      console.log(titleMatch[1]);
    }
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  }
}

(async () => {
  for (const url of TEST_URLS) {
    await testFetch(url);
  }
})();
