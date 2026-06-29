/**
 * Quick test: Try Temu's bgapi and AllOrigins for ONE goods_id
 */

async function main() {
  const goodsId = "601102757183337"; // iEXtmO1ZX5B

  // Test 1: BG API
  console.log("=== BG API Test ===");
  try {
    const url = `https://www.temu.com/bg/goods/api?goodsId=${goodsId}&_x_sessn=us&currency=USD`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Length: ${text.length}`);
    console.log(`Body (first 500): ${text.slice(0, 500)}`);
    
    // Find prices
    const prices = [...text.matchAll(/"(minPrice|salePrice|price|marketPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
    for (const m of prices) console.log(`  ${m[1]}: ${m[2]}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  // Test 2: AllOrigins on US page
  console.log("\n=== AllOrigins US Test ===");
  try {
    const productUrl = `https://www.temu.com/-g-${goodsId}.html`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(productUrl)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timer);
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Length: ${text.length}`);
    
    const ogPrice = text.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
    const ogCurrency = text.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
    const ogTitle = text.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    console.log(`OG price: ${ogPrice?.[1] || "none"}`);
    console.log(`OG currency: ${ogCurrency?.[1] || "none"}`);
    console.log(`OG title: ${ogTitle?.[1]?.slice(0, 80) || "none"}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  // Test 3: AllOrigins on pk-en page
  console.log("\n=== AllOrigins pk-en Test ===");
  try {
    const productUrl = `https://www.temu.com/pk-en/-g-${goodsId}.html`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(productUrl)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timer);
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Length: ${text.length}`);
    
    const ogPrice = text.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
    const ogCurrency = text.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
    const ogTitle = text.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    console.log(`OG price: ${ogPrice?.[1] || "none"}`);
    console.log(`OG currency: ${ogCurrency?.[1] || "none"}`);
    console.log(`OG title: ${ogTitle?.[1]?.slice(0, 80) || "none"}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  // Test 4: Show actual HTML from share URL
  console.log("\n=== Share URL HTML ===");
  try {
    const res = await fetch("https://share.temu.com/iEXtmO1ZX5B", {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });
    console.log(`Status: ${res.status}, URL: ${res.url.slice(0, 80)}`);
    const text = await res.text();
    console.log(`HTML (${text.length} chars):`);
    console.log(text.slice(0, 2000));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

main().catch(console.error);
