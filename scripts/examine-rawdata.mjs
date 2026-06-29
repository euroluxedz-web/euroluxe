/**
 * Examine the rawData structure from page_reader output
 * to understand why price extraction fails
 */

import ZAI from "z-ai-web-dev-sdk";

async function main() {
  const goodsId = "601102757183337";
  const zai = await ZAI.create();

  // Read US product page
  console.log("Reading US product page...");
  const pageResult = await zai.invokeFunction("page_reader", {
    url: `https://www.temu.com/-g-${goodsId}.html`,
  });
  const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
  const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;

  if (!content) {
    console.log("No content!");
    return;
  }

  // Extract rawData
  const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
  if (!rawDataMatch) {
    console.log("No rawData found");
    return;
  }

  const rawDataStr = rawDataMatch[1];
  console.log(`rawData length: ${rawDataStr.length}`);

  // Search near the goods_id
  const gidIdx = rawDataStr.indexOf(goodsId);
  console.log(`goods_id position in rawData: ${gidIdx}`);

  if (gidIdx > 0) {
    // Show context around goods_id
    const context = rawDataStr.slice(Math.max(0, gidIdx - 200), Math.min(rawDataStr.length, gidIdx + 2000));
    console.log(`\nContext around goods_id (first 2000 chars):`);
    console.log(context.slice(0, 2000));
  }

  // Look for ALL price-like fields in a broader window
  console.log("\n\n=== All price-like patterns near goods_id ===");
  if (gidIdx > 0) {
    const window_ = rawDataStr.slice(Math.max(0, gidIdx - 5000), Math.min(rawDataStr.length, gidIdx + 50000));
    
    // More flexible patterns
    const allPricePatterns = [
      // Standard patterns
      ...[...window_.matchAll(/"(\w*[Pp]rice\w*)"\s*:\s*"?(\d+\.?\d*)"?/g)].map(m => ({ key: m[1], val: m[2] })),
      // Number values near "price" keys
      ...[...window_.matchAll(/"(\w*cost\w*)"\s*:\s*"?(\d+\.?\d*)"?/gi)].map(m => ({ key: m[1], val: m[2] })),
      ...[...window_.matchAll(/"(\w*amount\w*)"\s*:\s*"?(\d+\.?\d*)"?/gi)].map(m => ({ key: m[1], val: m[2] })),
      ...[...window_.matchAll(/"(\w*discount\w*)"\s*:\s*"?(\d+\.?\d*)"?/gi)].map(m => ({ key: m[1], val: m[2] })),
    ];
    
    for (const p of allPricePatterns) {
      console.log(`  ${p.key}: ${p.val}`);
    }
  }

  // Also look for the goods_id in a specific object context
  console.log("\n\n=== Looking for goods_id object structure ===");
  if (gidIdx > 0) {
    // Find the start of the object containing goods_id
    let objStart = gidIdx;
    let braceCount = 0;
    for (let i = gidIdx; i >= Math.max(0, gidIdx - 5000); i--) {
      if (rawDataStr[i] === '}') braceCount++;
      if (rawDataStr[i] === '{') {
        braceCount--;
        if (braceCount < 0) {
          objStart = i;
          break;
        }
      }
    }
    const objContent = rawDataStr.slice(objStart, Math.min(rawDataStr.length, objStart + 3000));
    console.log(`Object starting at ${objStart}:`);
    console.log(objContent.slice(0, 2000));
  }

  // Try to find specific Temu price structures
  console.log("\n\n=== Searching for specific Temu structures ===");
  
  // priceInfo anywhere
  const priceInfoBlocks = [...content.matchAll(/"priceInfo"\s*:\s*\{([^}]{10,300}?)\}/g)];
  for (const b of priceInfoBlocks) {
    console.log(`priceInfo block: ${b[1].slice(0, 200)}`);
  }

  // "sale" or "min" with number
  const salePatterns = [...content.matchAll(/"(sale|min|orig|market|app|display)[^"]*"\s*:\s*[{"]?/gi)];
  console.log(`\nSale/min/orig patterns: ${salePatterns.length}`);
  for (const s of salePatterns.slice(0, 10)) {
    console.log(`  ${s[0]}`);
  }

  // Try finding price in the format Temu actually uses now
  // New Temu format might be: "price":{"amount":701,"currency":"USD"}
  const structuredPrices = [...content.matchAll(/"price"\s*:\s*\{[^}]*"amount"\s*:\s*(\d+)/g)];
  console.log(`\nStructured price patterns: ${structuredPrices.length}`);
  for (const p of structuredPrices) {
    console.log(`  amount: ${p[1]} (${parseInt(p[1]) / 100} USD)`);
  }

  // Try: "price":{"value":701} or "price":{"cent":701}
  const valuePrices = [...content.matchAll(/"price"\s*:\s*\{[^}]*"(value|cent|amount|cents)"\s*:\s*(\d+)/g)];
  console.log(`\nValue/cent/amount price patterns: ${valuePrices.length}`);
  for (const p of valuePrices) {
    console.log(`  ${p[1]}: ${p[2]} (${parseInt(p[2]) / 100})`);
  }
}

main().catch(console.error);
