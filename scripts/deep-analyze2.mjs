import fs from 'fs';

// Focus on the goods-api-us content which is 263KB
const content = fs.readFileSync('/home/z/my-project/download/page-reader-goods-api-us.html', 'utf-8');
console.log('Content length:', content.length);

// Search for ALL numbers that could be prices
// The page might have JSON data embedded in script tags

// 1. Search for JSON script blocks
console.log('\n=== Script blocks with JSON data ===');
const scriptBlocks = [...content.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
console.log(`Total script blocks: ${scriptBlocks.length}`);

for (let i = 0; i < scriptBlocks.length; i++) {
  const block = scriptBlocks[i][1];
  if (block.length > 1000 && block.includes('{')) {
    console.log(`\nScript block ${i}: ${block.length} chars`);
    // Search for price patterns
    const priceFields = [...block.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice|displayPrice|normalPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
    for (const m of priceFields.slice(0, 10)) {
      console.log(`  ${m[1]}: ${m[2]}`);
    }
  }
}

// 2. Search for __NEXT_DATA__ or similar hydration data
console.log('\n=== Next.js data ===');
const nextData = content.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
if (nextData) {
  console.log('__NEXT_DATA__ found, length:', nextData[1].length);
  try {
    const data = JSON.parse(nextData[1]);
    console.log('Keys:', Object.keys(data));
    // Navigate to find price
    const props = data?.props?.pageProps;
    if (props) {
      console.log('pageProps keys:', Object.keys(props));
    }
  } catch (e) {
    console.log('Parse error, first 500 chars:', nextData[1].slice(0, 500));
  }
}

// 3. Search for goodsDetail or product data in JSON
console.log('\n=== Goods detail data ===');
const goodsDetailMatch = content.match(/"goodsDetail"\s*:\s*\{/);
if (goodsDetailMatch) {
  console.log('goodsDetail found at index:', goodsDetailMatch.index);
  const start = goodsDetailMatch.index;
  const chunk = content.slice(start, start + 500);
  console.log('Context:', chunk);
}

// 4. Search for any embedded product data
console.log('\n=== Product data search ===');
const productPatterns = ['"goods"', '"product"', '"item"', '"detail"'];
for (const pattern of productPatterns) {
  const matches = [...content.matchAll(new RegExp(`${pattern}\\s*:\\s*\\{`, 'g'))];
  if (matches.length > 0) {
    console.log(`\n${pattern} found: ${matches.length} times`);
    for (const m of matches.slice(0, 3)) {
      const chunk = content.slice(m.index, m.index + 300);
      console.log(`  Context: ${chunk.slice(0, 300)}`);
    }
  }
}

// 5. Search for all price-like numbers near the goods_id
const goodsId = '601105214745191';
const gidIdx = content.indexOf(goodsId);
if (gidIdx >= 0) {
  console.log(`\n=== Context around goods_id at index ${gidIdx} ===`);
  const before = content.slice(Math.max(0, gidIdx - 500), gidIdx);
  const after = content.slice(gidIdx, Math.min(content.length, gidIdx + 2000));
  console.log('Before:', before.slice(-200));
  console.log('After:', after.slice(0, 500));
}

// 6. Look for "7.01" or "701" pattern (the expected price)
console.log('\n=== Search for expected price patterns ===');
for (const pattern of [/[^\d]701[^\d]/g, /[^\d]7\.01/g, /"price"\s*:\s*701/g]) {
  const matches = [...content.matchAll(pattern)];
  console.log(`Pattern ${pattern}: ${matches.length} matches`);
  for (const m of matches.slice(0, 3)) {
    const ctx = content.slice(Math.max(0, m.index - 50), Math.min(content.length, m.index + 50));
    console.log(`  ...${ctx}...`);
  }
}

// 7. Broad "price" field search
console.log('\n=== All "price" fields ===');
const priceFields = [...content.matchAll(/"price"\s*:\s*"?(\d+\.?\d*)"?/g)];
console.log(`Total "price" fields: ${priceFields.length}`);
const priceValues = priceFields.map(m => parseFloat(m[1]));
const uniquePrices = [...new Set(priceValues)].sort((a, b) => a - b);
console.log(`Unique price values: ${uniquePrices.slice(0, 50).join(', ')}`);

// Show context for each unique price
for (const price of uniquePrices.slice(0, 20)) {
  const match = priceFields.find(m => parseFloat(m[1]) === price);
  if (match) {
    const ctx = content.slice(Math.max(0, match.index - 100), Math.min(content.length, match.index + 100));
    // Clean up for display
    const cleanCtx = ctx.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    console.log(`  price=${price}: ...${cleanCtx}...`);
  }
}

