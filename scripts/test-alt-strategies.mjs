import ZAI from "z-ai-web-dev-sdk";

const goodsId = "601102757183337";
const shareUrl = "https://share.temu.com/iEXtmO1ZX5B";

console.log("=== Testing Alternative Strategies ===\n");

// Strategy 1: Try Temu API endpoints directly
console.log("--- Strategy 1: Temu API endpoints ---");
const apiEndpoints = [
  `https://www.temu.com/api/ego/product/detail?goods_id=${goodsId}`,
  `https://api.temu.com/proxy/api/ego/product/detail?goods_id=${goodsId}`,
  `https://www.temu.com/bg/goods/api?goods_id=${goodsId}`,
  `https://api.temu.com/bg/goods/api?goods_id=${goodsId}`,
  // Mobile API
  `https://api.temu.com/api/ego/product/detail?goods_id=${goodsId}&region=4&locale=en`,
];

for (const endpoint of apiEndpoints) {
  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://www.temu.com/",
      },
    });
    const text = await res.text();
    console.log(`${endpoint.slice(0, 70)}...`);
    console.log(`  Status: ${res.status}, Length: ${text.length}`);
    if (text.length > 0 && text.length < 50000) {
      try {
        const json = JSON.parse(text);
        if (json.result?.goods) {
          const g = json.result.goods;
          console.log(`  ✓ Product: ${g.name?.slice(0, 50)}`);
          console.log(`  ✓ minPrice: ${g.minPrice}, price: ${g.price}, marketPrice: ${g.marketPrice}`);
        } else {
          console.log(`  Response keys: ${Object.keys(json).join(", ")}`);
          if (json.result) console.log(`  result keys: ${Object.keys(json.result).join(", ")}`);
        }
      } catch {
        console.log(`  Non-JSON (first 200): ${text.slice(0, 200)}`);
      }
    }
  } catch (err) {
    console.log(`${endpoint.slice(0, 70)}... ERROR: ${err.message}`);
  }
}

// Strategy 2: Try AllOrigins with localized URL
console.log("\n--- Strategy 2: AllOrigins with localized URLs ---");
const aoUrls = [
  `https://www.temu.com/dz-en/goods.html?goods_id=${goodsId}`,
  `https://www.temu.com/dz-en/goods.html?goods_id=${goodsId}&currency=USD`,
  `https://www.temu.com/goods.html?goods_id=${goodsId}&_x_sessn=us&currency=USD`,
  `https://www.temu.com/-g-${goodsId}.html`,
  `https://www.temu.com/bh/8pcs-womens-glasses-classic-fashion-mixed-shape-small-frame-color-set-glasses-minimalist-casual-fashion-trendy-decorative--additions-lightweight-glasses-durable-pc-material-unisex-eyewear-suitable-for--camping-beach-g-${goodsId}.html`,
];

for (const url of aoUrls) {
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
    const html = await res.text();
    console.log(`\n${url.slice(0, 80)}...`);
    console.log(`  HTML length: ${html.length}`);
    
    if (html.length > 1000) {
      // Check for OG price
      const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
      const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
      const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      
      console.log(`  og:title: ${ogTitle?.[1]?.slice(0, 60) || "NOT FOUND"}`);
      console.log(`  og:price:amount: ${ogPrice?.[1] || "NOT FOUND"}`);
      console.log(`  og:price:currency: ${ogCurrency?.[1] || "NOT FOUND"}`);
      console.log(`  og:image: ${ogImage?.[1] ? "FOUND" : "NOT FOUND"}`);
      
      // Check for JSON-LD
      const jsonLd = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (jsonLd) {
        try {
          const ldData = JSON.parse(jsonLd[1]);
          const product = Array.isArray(ldData) ? ldData.find(d => d["@type"] === "Product") : ldData;
          if (product?.offers) {
            const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
            console.log(`  JSON-LD price: ${offer.price} ${offer.priceCurrency}`);
          }
        } catch {}
      }
      
      // Check for priceInfo
      const priceInfos = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      if (priceInfos.length > 0) {
        console.log(`  priceInfo blocks:`);
        for (const pi of priceInfos.slice(0, 5)) {
          console.log(`    price: ${parseInt(pi[1])/100} ${pi[2]}`);
        }
      }
      
      // Check if it's an anti-bot page
      const isAntiBot = html.length < 450000 && (html.match(/verify/gi) || []).length > 50;
      console.log(`  Anti-bot: ${isAntiBot}`);
    }
  } catch (err) {
    console.log(`${url.slice(0, 80)}... ERROR: ${err.message}`);
  }
}

// Strategy 3: Use ZAI web_reader instead of page_reader
console.log("\n--- Strategy 3: ZAI web_reader ---");
try {
  const zai = await ZAI.create();
  const readerResult = await zai.invokeFunction("web_reader", {
    url: shareUrl,
  });
  
  console.log("web_reader result type:", typeof readerResult);
  const resultStr = typeof readerResult === "string" ? readerResult : JSON.stringify(readerResult);
  console.log("Result length:", resultStr.length);
  console.log("First 500 chars:", resultStr.slice(0, 500));
  
  // Search for prices
  const prices = resultStr.match(/\$?\d{1,5}[.,]?\d{0,2}\s*(?:DA|DZD|USD|\$|€)/g);
  console.log("\nPrice patterns:", prices?.slice(0, 20));
} catch (err) {
  console.log("web_reader error:", err.message);
}

// Strategy 4: Use web_search with "price" query
console.log("\n--- Strategy 4: Web search with price query ---");
try {
  const zai = await ZAI.create();
  const searchResults = await zai.invokeFunction("web_search", {
    query: `temu 601102757183337 price USD`,
    num: 5,
  });
  
  if (Array.isArray(searchResults)) {
    for (const r of searchResults) {
      console.log(`\n${r.name?.slice(0, 60)}`);
      console.log(`  URL: ${r.url?.slice(0, 80)}`);
      console.log(`  Snippet: ${r.snippet?.slice(0, 200)}`);
    }
  }
} catch (err) {
  console.log("Search error:", err.message);
}

