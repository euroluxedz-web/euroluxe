import ZAI from "z-ai-web-dev-sdk";

const goodsId = "601102757183337";

console.log("=== Targeted Search for Product Price ===\n");

const zai = await ZAI.create();

// Try different search queries
const queries = [
  `site:temu.com "601102757183337" price`,
  `temu 8pcs womens sunglasses UV400 price`,
  `"8pcs" "womens sunglasses" "small frame" temu`,
  `temu.com 8pcs sunglasses $7`,
];

for (const q of queries) {
  console.log(`\nQuery: ${q}`);
  try {
    const results = await zai.invokeFunction("web_search", {
      query: q,
      num: 5,
    });
    
    if (Array.isArray(results)) {
      for (const r of results) {
        const priceMatch = r.snippet?.match(/[\$€£]?\s*[\d,]+\.?\d{0,2}\s*(?:USD|DA|DZD|OMR|BHD|Rs|EUR)?/);
        console.log(`  ${r.name?.slice(0, 50)}`);
        console.log(`  Snippet: ${r.snippet?.slice(0, 200)}`);
        if (priceMatch) console.log(`  → Price hint: ${priceMatch[0]}`);
      }
    } else {
      console.log("  No results or unexpected format");
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
}

// Now try reading the Bahrain or Oman page via page_reader
console.log("\n\n=== Page Reader on localized search result URLs ===");
const localizedUrls = [
  "https://www.temu.com/bh/8pcs-womens-glasses-classic-fashion-mixed-shape-small-frame-color-set-glasses-minimalist-casual-fashion-trendy-decorative--additions-lightweight-glasses-durable-pc-material-unisex-eyewear-suitable-for--camping-beach-g-601102757183337.html",
  "https://www.temu.com/om-en/8pcs-classic-fashion-mixed-shape-small-frame-multi-color-set-glasses-simple-casual-fashion-trendy-decorative-glasses-fashion-accessories-lightweight-glasses-durable-pc-material-unisex-glasses-g-601102757183337.html",
];

for (const url of localizedUrls) {
  console.log(`\nReading: ${url.slice(0, 80)}...`);
  try {
    const pageResult = await zai.invokeFunction("page_reader", {
      url: url,
    });
    
    const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (content) {
      console.log(`Content length: ${content.length}`);
      
      // Check for OG price
      const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
      const ogCurrency = content.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
      const ogTitle = content.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
      console.log(`og:title: ${ogTitle?.[1]?.slice(0, 60) || "NOT FOUND"}`);
      console.log(`og:price:amount: ${ogPrice?.[1] || "NOT FOUND"}`);
      console.log(`og:price:currency: ${ogCurrency?.[1] || "NOT FOUND"}`);
      
      // Search for priceInfo
      const priceInfos = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      if (priceInfos.length > 0) {
        console.log("priceInfo blocks:");
        for (const pi of priceInfos.slice(0, 10)) {
          console.log(`  price: ${parseInt(pi[1])/100} ${pi[2]}`);
        }
      }
      
      // Search for JSON-LD
      const jsonLd = content.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (jsonLd) {
        try {
          const ldData = JSON.parse(jsonLd[1]);
          const product = Array.isArray(ldData) ? ldData.find(d => d["@type"] === "Product") : ldData;
          if (product?.offers) {
            const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
            console.log(`JSON-LD price: ${offer.price} ${offer.priceCurrency}`);
          }
        } catch {}
      }
      
      // Search for rawData
      const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      if (rawDataMatch) {
        const rawDataStr = rawDataMatch[1];
        const priceMatches = [...rawDataStr.matchAll(/"(minPrice|salePrice|price|marketPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
        console.log("rawData prices:");
        for (const m of priceMatches.slice(0, 10)) {
          console.log(`  ${m[1]}: ${m[2]}`);
        }
        const currencyMatch = rawDataStr.match(/"currency"\s*:\s*"([^"]+)"/);
        console.log(`currency: ${currencyMatch?.[1]}`);
      } else {
        console.log("No rawData found");
      }
      
      // Search for any dollar amount with context
      const dollarAmounts = [...content.matchAll(/\$\s*(\d{1,3}\.?\d{0,2})/g)];
      const uniqueDollars = {};
      for (const m of dollarAmounts) {
        const val = parseFloat(m[1]);
        if (val >= 1 && val <= 500) {
          uniqueDollars[m[0]] = (uniqueDollars[m[0]] || 0) + 1;
        }
      }
      console.log("Dollar amounts found:");
      for (const [pattern, count] of Object.entries(uniqueDollars).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
        console.log(`  ${count}x: ${pattern}`);
      }
      
      // Search for OMR amounts
      const omrAmounts = [...content.matchAll(/OMR\s*(\d+\.?\d{0,3})/gi)];
      console.log("OMR amounts:", [...new Set(omrAmounts.map(m => m[0]))].slice(0, 10));
    }
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}
