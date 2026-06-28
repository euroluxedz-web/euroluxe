import fs from 'fs';

const content = fs.readFileSync('/home/z/my-project/download/page-reader-share-url.html', 'utf-8');
console.log('Content length:', content.length);

// 1. Search for ALL "price" fields broadly
console.log('\n=== All "price" fields in share-url ===');
const priceFields = [...content.matchAll(/"price"\s*:\s*"?(\d+\.?\d*)"?/g)];
console.log(`Total "price" fields: ${priceFields.length}`);
const priceValues = priceFields.map(m => parseFloat(m[1]));
const uniquePrices = [...new Set(priceValues)].sort((a, b) => a - b);
console.log(`Unique price values: ${uniquePrices.slice(0, 50).join(', ')}`);

// Show context for each unique price
for (const price of uniquePrices.slice(0, 30)) {
  const match = priceFields.find(m => parseFloat(m[1]) === price);
  if (match) {
    const ctx = content.slice(Math.max(0, match.index - 150), Math.min(content.length, match.index + 150));
    const cleanCtx = ctx.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    console.log(`  price=${price}: ...${cleanCtx}...`);
  }
}

// 2. Search for "skuList" or "sku" price data
console.log('\n=== SKU/variant data ===');
const skuMatches = [...content.matchAll(/"skuList"\s*:\s*\[/g)];
console.log(`skuList found: ${skuMatches.length}`);
if (skuMatches.length > 0) {
  for (const m of skuMatches.slice(0, 1)) {
    const chunk = content.slice(m.index, m.index + 500);
    console.log(`  Context: ${chunk.slice(0, 500)}`);
  }
}

// 3. Search for "amount" field which Temu sometimes uses
console.log('\n=== "amount" fields ===');
const amountMatches = [...content.matchAll(/"amount"\s*:\s*"?(\d+\.?\d*)"?/g)];
console.log(`Total "amount" fields: ${amountMatches.length}`);
const uniqueAmounts = [...new Set(amountMatches.map(m => parseFloat(m[1])))].sort((a, b) => a - b);
console.log(`Unique amount values (first 30): ${uniqueAmounts.slice(0, 30).join(', ')}`);

// 4. Search for "goods_id" nearby values
const goodsId = '601105214745191';
const gidIdx = content.indexOf(goodsId);
if (gidIdx >= 0) {
  console.log(`\n=== Extended context around goods_id at index ${gidIdx} ===`);
  const after = content.slice(gidIdx, Math.min(content.length, gidIdx + 5000));
  console.log(after.slice(0, 2000));
}

// 5. Look for OG description which sometimes has price
const ogDesc = content.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
if (ogDesc) {
  console.log(`\n=== OG description ===`);
  console.log(ogDesc[1]);
}

// 6. Look for the Temu page title
const title = content.match(/<title[^>]*>([^<]+)<\/title>/i);
if (title) {
  console.log(`\n=== Page title ===`);
  console.log(title[1]);
}

// 7. Look for __INITIAL_STATE__ or similar
console.log('\n=== Initial state / hydration data ===');
const initStatePatterns = [
  /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/,
  /window\.__NEXT_DATA__\s*=\s*(\{[\s\S]*?\})\s*;/,
  /window\.rawData\s*=\s*(\{[\s\S]*?\})\s*;/,
];
for (const pattern of initStatePatterns) {
  const match = content.match(pattern);
  if (match) {
    console.log(`Pattern matched: ${pattern.source.slice(0, 30)}`);
    console.log(`Length: ${match[1].length}`);
    // Search for price in this data
    const prices = [...match[1].matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
    console.log(`Price fields found: ${prices.length}`);
    for (const p of prices.slice(0, 20)) {
      console.log(`  ${p[1]}: ${p[2]}`);
    }
    
    // Also search for "price" more broadly
    const broadPrices = [...match[1].matchAll(/"price"\s*:\s*"?(\d+\.?\d*)"?/g)];
    console.log(`All "price" fields: ${broadPrices.length}`);
    const vals = [...new Set(broadPrices.map(m => parseFloat(m[1])))].sort((a, b) => a - b);
    console.log(`Unique values: ${vals.slice(0, 30).join(', ')}`);
  }
}

