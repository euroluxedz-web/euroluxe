/**
 * Test: Get HTML from AllOrigins for a Temu product and look for price
 */

async function main() {
  const goodsId = "601102757183337";
  const productUrl = `https://www.temu.com/dz-en/goods.html?goods_id=${goodsId}`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(productUrl)}`;
  
  console.log("Fetching from AllOrigins...");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  
  try {
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    const html = data.contents;
    
    console.log(`HTML length: ${html?.length || 0}`);
    
    if (html && html.length > 5000) {
      // Check for OG tags
      const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
      const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
      const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      console.log(`OG price: ${ogPrice?.[1] || "none"}`);
      console.log(`OG currency: ${ogCurrency?.[1] || "none"}`);
      console.log(`OG title: ${ogTitle?.[1]?.slice(0, 80) || "none"}`);
      console.log(`OG image: ${ogImage?.[1]?.slice(0, 80) || "none"}`);
      
      // Check for JSON-LD
      const jsonLd = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (jsonLd) {
        console.log(`\nJSON-LD found:`);
        try {
          const ld = JSON.parse(jsonLd[1]);
          console.log(`Type: ${ld["@type"]}`);
          if (ld.offers) {
            console.log(`Offers price: ${ld.offers.price}`);
            console.log(`Offers currency: ${ld.offers.priceCurrency}`);
          }
          if (ld.name) console.log(`Name: ${ld.name}`);
          console.log(JSON.stringify(ld, null, 2).slice(0, 500));
        } catch(e) {
          console.log(`JSON-LD parse error: ${e.message}`);
          console.log(`Raw JSON-LD (first 300): ${jsonLd[1].slice(0, 300)}`);
        }
      }
      
      // Check for window.rawData
      const rawDataMatch = html.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      console.log(`\nwindow.rawData: ${rawDataMatch ? "YES" : "NO"}`);
      
      if (rawDataMatch) {
        const rawDataStr = rawDataMatch[1];
        // Search for price near goods_id
        const gidIdx = rawDataStr.indexOf(goodsId);
        if (gidIdx > 0) {
          const window_ = rawDataStr.slice(Math.max(0, gidIdx - 1000), Math.min(rawDataStr.length, gidIdx + 5000));
          const priceFields = [...window_.matchAll(/"(\w*[Pp]rice\w*)"\s*:\s*"?(\d+\.?\d*)"?/g)];
          for (const m of priceFields) {
            console.log(`  ${m[1]}: ${m[2]}`);
          }
        }
      }
      
      // Check for priceInfo
      const priceInfo = [...html.matchAll(/"priceInfo"\s*:\s*\{([^}]{10,300}?)\}/g)];
      if (priceInfo.length > 0) {
        console.log(`\npriceInfo blocks:`);
        for (const pi of priceInfo.slice(0, 5)) {
          console.log(`  ${pi[1].slice(0, 200)}`);
        }
      }

      // Check for structured data
      const structuredPrices = [...html.matchAll(/"price"\s*:\s*\{[^}]*"amount"\s*:\s*(\d+)/g)];
      if (structuredPrices.length > 0) {
        console.log(`\nStructured price patterns:`);
        for (const p of structuredPrices) {
          console.log(`  amount: ${p[1]} (${parseInt(p[1]) / 100})`);
        }
      }

      // Try: "minPrice": 701 pattern
      const minPrice = html.match(/"minPrice"\s*:\s*(\d+)/);
      const salePrice = html.match(/"salePrice"\s*:\s*(\d+)/);
      console.log(`\nminPrice: ${minPrice?.[1] || "none"}`);
      console.log(`salePrice: ${salePrice?.[1] || "none"}`);
    }
  } catch(e) {
    clearTimeout(timer);
    console.log(`Error: ${e.message}`);
  }
}

main();
