#!/usr/bin/env node
/**
 * Comprehensive Temu scraping test - try multiple strategies
 */

const TEST_GOODS_ID = "301005094120953001"; // sample goods ID
const TEST_URL = `https://www.temu.com/-g-${TEST_GOODS_ID}.html`;

// Strategy 1: Mobile user agent
async function tryMobileUA(url) {
  console.log("\n--- Strategy 1: Mobile User Agent ---");
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);
    const html = await res.text();
    console.log(`Status: ${res.status}, HTML length: ${html.length}`);
    console.log("First 300 chars:", html.slice(0, 300));
    return html;
  } catch (e) {
    console.log("Error:", e.message);
    return null;
  }
}

// Strategy 2: Try Temu's internal API endpoints
async function tryTemuAPI(goodsId) {
  console.log("\n--- Strategy 2: Temu Internal API ---");
  const endpoints = [
    `https://www.temu.com/api/oak/integration/render?goods_id=${goodsId}`,
    `https://www.temu.com/api/bsc/goods/detail?goods_id=${goodsId}`,
    `https://www.temu.com/api/ttg/goods/detail?goods_id=${goodsId}`,
    `https://api.temu.com/api/oak/integration/render?goods_id=${goodsId}`,
  ];
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Origin: "https://www.temu.com",
    Referer: "https://www.temu.com/",
  };
  for (const ep of endpoints) {
    try {
      console.log(`\nTrying: ${ep}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(ep, { headers, signal: controller.signal });
      clearTimeout(timeout);
      console.log(`  Status: ${res.status}`);
      const text = await res.text();
      console.log(`  Response (first 300): ${text.slice(0, 300)}`);
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
}

// Strategy 3: Try Google's cached version
async function tryGoogleCache(url) {
  console.log("\n--- Strategy 3: Google Cache ---");
  const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
  };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(cacheUrl, { headers, signal: controller.signal });
    clearTimeout(timeout);
    console.log(`Status: ${res.status}`);
    const html = await res.text();
    console.log(`HTML length: ${html.length}`);
    console.log("First 300 chars:", html.slice(0, 300));
  } catch (e) {
    console.log("Error:", e.message);
  }
}

// Strategy 4: Try with cookies from env
async function tryWithCookies(url) {
  console.log("\n--- Strategy 4: With TEMU_COOKIES env ---");
  const cookies = process.env.TEMU_COOKIES || "";
  if (!cookies) {
    console.log("No TEMU_COOKIES set, skipping");
    return;
  }
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: cookies,
  };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);
    console.log(`Status: ${res.status}`);
    const html = await res.text();
    console.log(`HTML length: ${html.length}`);
    console.log("First 500 chars:", html.slice(0, 500));
    // Check for price patterns
    const priceMatch = html.match(/\$\s*(\d{1,5}\.?\d{0,2})/);
    if (priceMatch) console.log("Found dollar price:", priceMatch[1]);
  } catch (e) {
    console.log("Error:", e.message);
  }
}

// Strategy 5: Try a public scraping proxy
async function tryScrapingProxy(url) {
  console.log("\n--- Strategy 5: AllOrigins proxy ---");
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeout);
    console.log(`Status: ${res.status}`);
    const html = await res.text();
    console.log(`HTML length: ${html.length}`);
    console.log("First 500 chars:", html.slice(0, 500));
    // Check for price patterns
    const priceMatch = html.match(/\$\s*(\d{1,5}\.?\d{0,2})/);
    if (priceMatch) console.log("Found dollar price:", priceMatch[1]);
  } catch (e) {
    console.log("Error:", e.message);
  }
}

// Strategy 6: Try corsproxy.io
async function tryCorsProxy(url) {
  console.log("\n--- Strategy 6: CORS Proxy ---");
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeout);
    console.log(`Status: ${res.status}`);
    const html = await res.text();
    console.log(`HTML length: ${html.length}`);
    console.log("First 500 chars:", html.slice(0, 500));
  } catch (e) {
    console.log("Error:", e.message);
  }
}

(async () => {
  console.log(`Testing with URL: ${TEST_URL}`);
  await tryMobileUA(TEST_URL);
  await tryTemuAPI(TEST_GOODS_ID);
  await tryGoogleCache(TEST_URL);
  await tryWithCookies(TEST_URL);
  await tryScrapingProxy(TEST_URL);
  await tryCorsProxy(TEST_URL);
})();
