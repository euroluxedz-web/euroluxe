#!/usr/bin/env node
/**
 * Test Temu BG API directly with the goods_id from the share URL
 */

const GOODS_ID = process.argv[2] || "601101613236742";

async function test() {
  console.log("=== Temu BG API Test ===\n");
  console.log("goods_id:", GOODS_ID);

  // Test 1: BG API endpoint
  console.log("\n--- Test 1: BG API (POST) ---");
  try {
    const res = await fetch("https://www.temu.com/bg/goods/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: "https://www.temu.com",
        Referer: `https://www.temu.com/-g-${GOODS_ID}.html`,
      },
      body: JSON.stringify({ goods_id: GOODS_ID }),
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response (first 1000 chars):", text.slice(0, 1000));
    
    // Try to parse
    try {
      const data = JSON.parse(text);
      const goods = data?.result?.goods;
      if (goods) {
        console.log("\n--- Parsed goods data ---");
        console.log("Name:", goods.name || goods.goodsName);
        console.log("minPrice:", goods.minPrice);
        console.log("price:", goods.price);
        console.log("marketPrice:", goods.marketPrice);
        console.log("thumbUrl:", goods.thumbUrl || goods.imageUrl);
        console.log("All keys:", Object.keys(goods).join(", "));
        
        // Print all price-related fields
        for (const [key, value] of Object.entries(goods)) {
          if (key.toLowerCase().includes('price') || key.toLowerCase().includes('cost') || key.toLowerCase().includes('amount')) {
            console.log(`  ${key}: ${JSON.stringify(value)}`);
          }
        }
      }
    } catch (e) {
      console.log("Not valid JSON");
    }
  } catch (err) {
    console.log("Error:", err.message);
  }

  // Test 2: Ego API endpoint
  console.log("\n--- Test 2: Ego API (POST) ---");
  try {
    const res = await fetch("https://www.temu.com/api/ego/product/detail", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: "https://www.temu.com",
        Referer: `https://www.temu.com/-g-${GOODS_ID}.html`,
      },
      body: JSON.stringify({ goods_id: GOODS_ID, _x_sessn: "us" }),
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response (first 1000 chars):", text.slice(0, 1000));
  } catch (err) {
    console.log("Error:", err.message);
  }

  // Test 3: Direct page fetch with US locale
  console.log("\n--- Test 3: Direct page fetch (US locale) ---");
  try {
    const res = await fetch(`https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    console.log("Status:", res.status);
    console.log("URL:", res.url);
    const html = await res.text();
    console.log("HTML length:", html.length);

    // Search for price in HTML
    const priceMatches = html.match(/"minPrice"\s*:\s*"?(\d+\.?\d*)"?/g);
    if (priceMatches) {
      console.log("minPrice matches:", priceMatches.slice(0, 5));
    }

    const priceMatches2 = html.match(/"price"\s*:\s*"?(\d+\.?\d*)"?/g);
    if (priceMatches2) {
      console.log("price matches:", priceMatches2.slice(0, 5));
    }

    // Check for __INITIAL_STATE__
    const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
    if (stateMatch) {
      console.log("__INITIAL_STATE__ found, length:", stateMatch[1].length);
      try {
        const state = JSON.parse(stateMatch[1]);
        const goodsDetail = state?.goodsDetail || state?.productDetail;
        if (goodsDetail) {
          const goods = goodsDetail.goods || goodsDetail;
          console.log("Name:", (goods.name || "").slice(0, 80));
          console.log("minPrice:", goods.minPrice);
          console.log("price:", goods.price);
        }
      } catch (e) {
        console.log("State parse error:", e.message.slice(0, 80));
      }
    }

    // Check for any price in meta tags
    const metaPrice = html.match(/product:price:amount[^>]*content="([^"]+)"/);
    if (metaPrice) console.log("Meta price:", metaPrice[1]);

  } catch (err) {
    console.log("Error:", err.message);
  }

  // Test 4: DZ locale page fetch (to see local price)
  console.log("\n--- Test 4: DZ locale page fetch ---");
  try {
    const res = await fetch(`https://www.temu.com/dz-en/goods.html?goods_id=${GOODS_ID}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-DZ,en;q=0.9",
      },
    });
    console.log("Status:", res.status);
    console.log("URL:", res.url);
    const html = await res.text();
    console.log("HTML length:", html.length);
    
    // Search for price
    const priceMatches = html.match(/"minPrice"\s*:\s*"?(\d+\.?\d*)"?/g);
    if (priceMatches) console.log("minPrice matches:", priceMatches.slice(0, 5));

  } catch (err) {
    console.log("Error:", err.message);
  }
}

test().catch(console.error);
