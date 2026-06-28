// Direct test of price extraction strategies for share.temu.com URLs
// This simulates what the API route does, without needing the Next.js server

const GOODS_ID = "601102757183337";
const SHARE_URL = "https://share.temu.com/iEXtmO1ZX5B";

async function testStrategies() {
  console.log("=== Testing Price Extraction Strategies ===\n");
  console.log(`Goods ID: ${GOODS_ID}`);
  console.log(`Share URL: ${SHARE_URL}\n`);

  // Strategy 0b-EARLY: Temu BG API
  console.log("--- Strategy 0b-EARLY: Temu BG API ---");
  const apiEndpoints = [
    { url: "https://www.temu.com/bg/goods/api", body: { goods_id: GOODS_ID } },
    { url: "https://www.temu.com/api/ego/product/detail", body: { goods_id: GOODS_ID, _x_sessn: "us" } },
  ];

  for (const endpoint of apiEndpoints) {
    try {
      console.log(`Trying: ${endpoint.url}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(endpoint.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Origin: "https://www.temu.com",
          Referer: `https://www.temu.com/-g-${GOODS_ID}.html`,
        },
        body: JSON.stringify(endpoint.body),
      });
      clearTimeout(timeout);
      
      console.log(`  Status: ${response.status}`);
      const text = await response.text();
      console.log(`  Response length: ${text.length}`);
      console.log(`  Response preview: ${text.slice(0, 500)}`);
      
      try {
        const data = JSON.parse(text);
        const goods = data?.result?.goods || data?.result?.data;
        if (goods) {
          console.log(`  Product name: ${goods.name || goods.goodsName || "N/A"}`);
          console.log(`  minPrice: ${goods.minPrice}`);
          console.log(`  price: ${goods.price}`);
          console.log(`  marketPrice: ${goods.marketPrice}`);
          console.log(`  thumbUrl: ${goods.thumbUrl || "N/A"}`);
          
          // Calculate the price the same way as the code
          let price = null;
          if (goods.minPrice !== undefined && goods.minPrice !== null) {
            const raw = typeof goods.minPrice === "string" ? parseFloat(goods.minPrice) : goods.minPrice;
            if (raw > 0) {
              price = raw > 100 ? raw / 100 : raw;
            }
          }
          if (!price && goods.price !== undefined && goods.price !== null) {
            const raw = typeof goods.price === "string" ? parseFloat(goods.price) : goods.price;
            if (raw > 0) {
              price = raw > 100 ? raw / 100 : raw;
            }
          }
          console.log(`  CALCULATED PRICE: $${price}`);
          if (price === 30.00 || (price >= 29.90 && price <= 30.10)) {
            console.log(`  ⚠️ SUSPICIOUS: $30.00 - likely delivery guarantee!`);
          }
        } else {
          console.log(`  No goods data found`);
        }
      } catch (e) {
        console.log(`  Not JSON`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message.slice(0, 100)}`);
    }
  }

  // Strategy 0.5: AllOrigins
  console.log("\n--- Strategy 0.5: AllOrigins ---");
  const aoUrls = [
    `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`,
    `https://www.temu.com/dz-en/goods.html?goods_id=${GOODS_ID}&currency=USD`,
    `https://www.temu.com/-g-${GOODS_ID}.html`,
  ];

  for (const aoUrl of aoUrls) {
    try {
      console.log(`\nTrying AllOrigins for: ${aoUrl.slice(0, 80)}...`);
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(aoUrl)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (!response.ok) {
        console.log(`  HTTP ${response.status}`);
        continue;
      }
      
      const html = await response.text();
      console.log(`  HTML length: ${html.length}`);
      
      if (html.length < 5000) {
        console.log(`  HTML too short, skipping`);
        continue;
      }
      
      // Check for OG tags
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
      
      console.log(`  og:title: ${ogTitle || "NOT FOUND"}`);
      console.log(`  product:price:amount: ${ogPrice || "NOT FOUND"}`);
      console.log(`  product:price:currency: ${ogCurrency || "NOT FOUND"}`);
      
      // Check priceInfo blocks
      const priceInfoMatches = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      console.log(`  priceInfo blocks: ${priceInfoMatches.length}`);
      for (let i = 0; i < Math.min(priceInfoMatches.length, 5); i++) {
        const cents = parseInt(priceInfoMatches[i][1]);
        const cur = priceInfoMatches[i][2];
        console.log(`    ${i + 1}. ${cents / 100} ${cur} (raw cents: ${cents})`);
      }
      
      // Check for $30 in the page
      const text = html.replace(/<[^>]*>/g, " ");
      const dollarMatches = [...text.matchAll(/\$\s*(\d{1,4}(?:[.,]\d{1,2})?)/g)];
      const uniquePrices = [...new Set(dollarMatches.map(m => m[1]))];
      console.log(`  Dollar prices in text: ${uniquePrices.join(", ") || "none"}`);
      
      // Check for rawData
      const rawDataMatch = html.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      if (rawDataMatch) {
        console.log(`  window.rawData found! Length: ${rawDataMatch[1].length}`);
        const rawData = rawDataMatch[1];
        const priceFields = ["minPrice", "salePrice", "price", "marketPrice"];
        for (const field of priceFields) {
          const re = new RegExp(`"${field}"\\s*:\\s*"?([\\d.]+)"?`, "g");
          const matches = [...rawData.matchAll(re)];
          if (matches.length > 0) {
            console.log(`    ${field}: ${matches.map(m => m[1]).join(", ")}`);
          }
        }
      }
      
    } catch (err) {
      console.log(`  Error: ${err.message.slice(0, 100)}`);
    }
  }

  // Also test: Direct fetch of the -g- URL
  console.log("\n--- Direct Fetch ---");
  try {
    const directUrl = `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`;
    console.log(`Fetching: ${directUrl}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(directUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeout);
    console.log(`  Status: ${response.status}`);
    console.log(`  Final URL: ${response.url}`);
    const html = await response.text();
    console.log(`  HTML length: ${html.length}`);
    
    // Check for OG tags
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    console.log(`  og:title: ${ogTitle || "NOT FOUND"}`);
  } catch (err) {
    console.log(`  Error: ${err.message.slice(0, 100)}`);
  }
}

testStrategies();
