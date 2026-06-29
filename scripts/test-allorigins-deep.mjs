/**
 * Deep check: Look for JSON-LD in AllOrigins HTML
 * The previous test showed price from "json-ld" source ($13.18)
 * Let's find exactly where the price data is in the HTML
 */

async function main() {
  const goodsId = "601102757183337";
  
  // Try different AllOrigins URLs
  const urls = [
    `https://www.temu.com/dz-en/goods.html?goods_id=${goodsId}`,
    `https://www.temu.com/dz-en/goods.html?goods_id=${goodsId}&currency=USD`,
    `https://www.temu.com/-g-${goodsId}.html`,
  ];
  
  for (const productUrl of urls) {
    console.log(`\n=== Testing: ${productUrl.slice(0, 60)} ===`);
    
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(productUrl)}`;
    
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timer);
      
      const data = await res.json();
      const html = data.contents;
      
      if (!html || html.length < 1000) {
        console.log(`HTML too short: ${html?.length || 0}`);
        continue;
      }
      
      console.log(`HTML length: ${html.length}`);
      
      // Check for JSON-LD
      const jsonLdMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      console.log(`JSON-LD blocks: ${jsonLdMatches.length}`);
      
      for (let i = 0; i < jsonLdMatches.length; i++) {
        try {
          const ld = JSON.parse(jsonLdMatches[i][1]);
          console.log(`\n  JSON-LD #${i + 1}:`);
          console.log(`  Type: ${ld["@type"]}`);
          if (ld.offers) {
            console.log(`  Offers price: ${ld.offers.price}`);
            console.log(`  Offers currency: ${ld.offers.priceCurrency}`);
            if (ld.offers.lowPrice) console.log(`  Low price: ${ld.offers.lowPrice}`);
            if (ld.offers.highPrice) console.log(`  High price: ${ld.offers.highPrice}`);
          }
          if (ld.name) console.log(`  Name: ${ld.name?.slice(0, 80)}`);
          if (ld.image) console.log(`  Image: ${String(ld.image).slice(0, 80)}`);
        } catch(e) {
          console.log(`  Parse error: ${e.message?.slice(0, 50)}`);
          console.log(`  Raw (first 200): ${jsonLdMatches[i][1].slice(0, 200)}`);
        }
      }
      
      // Check for __NEXT_DATA__
      const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataMatch) {
        console.log(`\n__NEXT_DATA__ found (${nextDataMatch[1].length} chars)`);
        try {
          const nd = JSON.parse(nextDataMatch[1]);
          // Navigate to find price
          const goodsDetail = nd?.props?.pageProps?.goodsDetail;
          if (goodsDetail) {
            console.log(`  goodsDetail found!`);
            console.log(`  minPrice: ${goodsDetail.minPrice}`);
            console.log(`  salePrice: ${goodsDetail.salePrice}`);
            console.log(`  price: ${goodsDetail.price}`);
            console.log(`  currency: ${goodsDetail.currency}`);
          }
        } catch(e) {
          console.log(`  Parse error: ${e.message?.slice(0, 50)}`);
        }
      }
      
      // Broader search for price-like values
      const allPriceKeys = [...html.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice|displayPrice|lowPrice|highPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
      if (allPriceKeys.length > 0) {
        console.log(`\nAll price-like fields:`);
        for (const m of allPriceKeys) {
          console.log(`  ${m[1]}: ${m[2]}`);
        }
      }
      
      // Look for price in specific Temu formats
      const temuPrice = html.match(/"price"\s*:\s*\{[^}]*"amount"\s*:\s*(\d+)[^}]*"currency"\s*:\s*"([^"]+)"/);
      if (temuPrice) {
        console.log(`\nTemu structured price: ${parseInt(temuPrice[1]) / 100} ${temuPrice[2]}`);
      }
      
    } catch(e) {
      console.log(`Error: ${e.message?.slice(0, 80)}`);
    }
  }
}

main();
