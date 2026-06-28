import ZAI from "z-ai-web-dev-sdk";

const shareUrl = "https://share.temu.com/iEXtmO1ZX5B";
const goodsId = "601102757183337";

console.log("=== Deep Analysis of Page Reader Content ===\n");

const zai = await ZAI.create();

// Page Reader on share URL - search for actual price data
console.log("--- Analyzing share URL page content ---");
const pageResult = await zai.invokeFunction("page_reader", {
  url: shareUrl,
});

const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;

if (content) {
  console.log("Content length:", content.length);
  
  // Search for goods_id in content
  const gidMatches = [...content.matchAll(/goods_id[":\s]+(\d{10,})/g)];
  console.log("\ngoods_id mentions:", [...new Set(gidMatches.map(m => m[1]))]);
  
  // Search for all price-like numbers with context
  const priceContexts = [...content.matchAll(/[\$_€£]?\s*(\d{1,5}\.?\d{0,2})\s*(?:DA|DZD|USD|EUR|OMR|BHD)?/g)];
  const priceMap = {};
  for (const m of priceContexts) {
    const val = parseFloat(m[1]);
    if (val > 0.5 && val < 10000) {
      const ctx = m[0].trim();
      priceMap[ctx] = (priceMap[ctx] || 0) + 1;
    }
  }
  console.log("\nPrice-like patterns (with frequency):");
  const sorted = Object.entries(priceMap).sort((a, b) => b[1] - a[1]);
  for (const [pattern, count] of sorted.slice(0, 30)) {
    console.log(`  ${count}x: "${pattern}"`);
  }
  
  // Search for "minPrice" or "sale" with nearby numbers
  const saleMatches = [...content.matchAll(/(?:minPrice|salePrice|sale[_ ]?price)["\s:]+(\d+\.?\d*)/gi)];
  console.log("\nSale price matches:");
  for (const m of saleMatches) {
    console.log(`  ${m[0].slice(0, 80)}`);
  }
  
  // Look for "priceInfo" blocks  
  const priceInfoBlocks = [...content.matchAll(/"priceInfo"\s*:\s*\{([^}]{5,200})\}/g)];
  console.log("\npriceInfo blocks:");
  for (const m of priceInfoBlocks.slice(0, 10)) {
    console.log(`  ${m[1].slice(0, 150)}`);
  }
  
  // Search for "30" specifically (the wrong price)
  const thirtyContexts = [...content.matchAll(/.{30}30\.?0{0,2}.{30}/g)];
  console.log("\nContext around '30':");
  for (const m of thirtyContexts.slice(0, 5)) {
    console.log(`  ...${m[0]}...`);
  }
  
  // Search for "9000" specifically (9000 DA)  
  const nineThousandContexts = [...content.matchAll(/.{30}9[\s,.]?0{2,3}.{30}/g)];
  console.log("\nContext around '9000':");
  for (const m of nineThousandContexts.slice(0, 5)) {
    console.log(`  ...${m[0]}...`);
  }
  
  // Try to find window.rawData or any JSON with price
  const jsonPriceMatches = [...content.matchAll(/"price"\s*:\s*(\d+)/g)];
  console.log("\n\"price\" field matches:");
  for (const m of jsonPriceMatches.slice(0, 20)) {
    console.log(`  price: ${m[1]} (=${parseInt(m[1])/100} if cents)`);
  }
  
  // Search for "7" or "7.01" (the expected price)
  const expectedPriceContexts = [...content.matchAll(/7\.0?\d/g)];
  console.log("\n'7.0x' matches:", expectedPriceContexts.length);
  
  // Look for the specific DZD price around 2100-2200 (2,103 DA)
  const dzdMatches = [...content.matchAll(/2[\s,.]?1[\s,.]?0[\s,.]?3/g)];
  console.log("\n'2103' matches:", dzdMatches.length);
}

// Test the actual API
console.log("\n\n=== Testing Actual API Endpoint ===");
try {
  const apiRes = await fetch("http://localhost:3000/api/scrape-price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: shareUrl }),
  });
  
  const apiData = await apiRes.json();
  console.log("API response:");
  console.log(JSON.stringify(apiData, null, 2));
} catch (err) {
  console.log("API test error (server may not be running):", err.message);
}
