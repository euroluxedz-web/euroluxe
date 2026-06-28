// Test Temu BG API directly
const goodsId = "601102757183337";

console.log("=== Testing Temu BG API ===");
console.log("goods_id:", goodsId);

// Test 1: /bg/goods/api
try {
  const res = await fetch("https://www.temu.com/bg/goods/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Origin": "https://www.temu.com",
      "Referer": `https://www.temu.com/-g-${goodsId}.html`,
    },
    body: JSON.stringify({ goods_id: goodsId }),
  });

  console.log("\n--- /bg/goods/api ---");
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response length:", text.length);
  
  try {
    const data = JSON.parse(text);
    const goods = data?.result?.goods;
    if (goods) {
      console.log("Product name:", goods.name?.slice(0, 80));
      console.log("minPrice:", goods.minPrice);
      console.log("price:", goods.price);
      console.log("marketPrice:", goods.marketPrice);
      console.log("All keys:", Object.keys(goods).join(", "));
      
      // Look for all price-related fields
      for (const [key, val] of Object.entries(goods)) {
        if (typeof val === 'number' || (typeof val === 'string' && /^\d+\.?\d*$/.test(val))) {
          const numVal = parseFloat(val);
          if (numVal > 0 && numVal < 1000000) {
            console.log(`  ${key}: ${val}`);
          }
        }
      }
    } else {
      console.log("No goods in result. Keys:", Object.keys(data || {}).join(", "));
      if (data?.result) console.log("result keys:", Object.keys(data.result).join(", "));
      console.log("Response (first 500):", text.slice(0, 500));
    }
  } catch (e) {
    console.log("Non-JSON response:", text.slice(0, 300));
  }
} catch (err) {
  console.error("BG API error:", err.message);
}

// Test 2: Direct product page fetch
console.log("\n\n=== Testing Direct Product Page ===");
const productUrl = `https://www.temu.com/-g-${goodsId}.html?_x_sessn=us&currency=USD`;
console.log("URL:", productUrl);

try {
  const res = await fetch(productUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  console.log("Status:", res.status);
  console.log("Final URL:", res.url);
  const html = await res.text();
  console.log("HTML length:", html.length);
  
  // Check OG tags
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
  const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
  console.log("og:title:", ogTitle?.[1]?.slice(0, 80));
  console.log("og:price:amount:", ogPrice?.[1]);
  console.log("og:price:currency:", ogCurrency?.[1]);
  
} catch (err) {
  console.error("Direct fetch error:", err.message);
}
