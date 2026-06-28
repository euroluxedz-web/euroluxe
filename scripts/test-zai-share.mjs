import ZAI from "z-ai-web-dev-sdk";

const shareUrl = "https://share.temu.com/iEXtmO1ZX5B";
const goodsId = "601102757183337";

console.log("=== Testing ZAI SDK strategies ===\n");

const zai = await ZAI.create();

// Test 1: Web Search
console.log("--- Test 1: ZAI Web Search ---");
try {
  const searchResults = await zai.invokeFunction("web_search", {
    query: `site:temu.com ${goodsId}`,
    num: 5,
  });
  
  if (Array.isArray(searchResults)) {
    for (const r of searchResults) {
      console.log(`\nResult: ${r.name?.slice(0, 80)}`);
      console.log(`  URL: ${r.url}`);
      console.log(`  Snippet: ${r.snippet?.slice(0, 200)}`);
    }
  } else {
    console.log("Search results:", JSON.stringify(searchResults)?.slice(0, 500));
  }
} catch (err) {
  console.error("Web search error:", err.message);
}

// Test 2: Page Reader on share URL
console.log("\n\n--- Test 2: ZAI Page Reader on share URL ---");
try {
  const pageResult = await zai.invokeFunction("page_reader", {
    url: shareUrl,
  });
  
  const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
  const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
  
  if (content) {
    console.log("Content length:", content.length);
    
    // Search for price in content
    const pricePatterns = content.match(/(\$[\d,.]+|[\d,.]+\s*(?:DA|DZD|USD|EUR))/g);
    console.log("Price patterns found:", pricePatterns?.slice(0, 20));
    
    // Search for rawData
    const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
    if (rawDataMatch) {
      const rawDataStr = rawDataMatch[1];
      const priceMatches = [...rawDataStr.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
      console.log("\nRawData prices:");
      for (const m of priceMatches) {
        console.log(`  ${m[1]}: ${m[2]}`);
      }
    } else {
      console.log("No rawData found");
    }
    
    // Search for priceInfo
    const priceInfoMatches = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
    if (priceInfoMatches.length > 0) {
      console.log("\nPriceInfo blocks:");
      for (const pi of priceInfoMatches) {
        console.log(`  price: ${parseInt(pi[1])/100} ${pi[2]}`);
      }
    }
    
    // Search for og:price
    const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
    const ogCurrency = content.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
    console.log("\nOG price:", ogPrice?.[1], ogCurrency?.[1]);
    
    // First 3000 chars
    console.log("\nFirst 3000 chars of content:");
    console.log(content.slice(0, 3000));
  } else {
    console.log("No content from page reader");
    console.log("Page result:", JSON.stringify(data)?.slice(0, 500));
  }
} catch (err) {
  console.error("Page reader error:", err.message);
}

// Test 3: Page Reader on US product URL
console.log("\n\n--- Test 3: ZAI Page Reader on US product URL ---");
try {
  const usUrl = `https://www.temu.com/-g-${goodsId}.html?_x_sessn=us&currency=USD`;
  const pageResult = await zai.invokeFunction("page_reader", {
    url: usUrl,
  });
  
  const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
  const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
  
  if (content) {
    console.log("Content length:", content.length);
    
    // Price patterns
    const pricePatterns = content.match(/(\$[\d,.]+|[\d,.]+\s*(?:DA|DZD|USD|EUR))/g);
    console.log("Price patterns:", pricePatterns?.slice(0, 20));
    
    // rawData
    const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
    if (rawDataMatch) {
      const rawDataStr = rawDataMatch[1];
      const priceMatches = [...rawDataStr.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
      console.log("\nRawData prices:");
      for (const m of priceMatches) {
        console.log(`  ${m[1]}: ${m[2]}`);
      }
    }
    
    // priceInfo
    const priceInfoMatches = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
    if (priceInfoMatches.length > 0) {
      console.log("\nPriceInfo blocks:");
      for (const pi of priceInfoMatches) {
        console.log(`  price: ${parseInt(pi[1])/100} ${pi[2]}`);
      }
    }
    
    // og:price
    const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
    console.log("\nOG price:", ogPrice?.[1]);
    
    // og:title
    const ogTitle = content.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    console.log("OG title:", ogTitle?.[1]?.slice(0, 100));
    
  } else {
    console.log("No content from page reader");
    console.log("Page result:", JSON.stringify(data)?.slice(0, 500));
  }
} catch (err) {
  console.error("Page reader error:", err.message);
}
