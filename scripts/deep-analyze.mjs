import fs from 'fs';

// Focus on the share-url content which is 845KB
const content = fs.readFileSync('/home/z/my-project/download/page-reader-share-url.html', 'utf-8');
console.log('Content length:', content.length);

// 1. Search for ALL priceInfo blocks with different patterns
console.log('\n=== priceInfo patterns ===');

// Pattern with just price and currency
const pi1 = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)/g)];
console.log(`priceInfo with price: ${pi1.length}`);
for (const m of pi1.slice(0, 20)) {
  // Get surrounding context
  const start = Math.max(0, m.index - 50);
  const end = Math.min(content.length, m.index + m[0].length + 200);
  const ctx = content.slice(start, end);
  const currencyMatch = ctx.match(/"currency"\s*:\s*"([A-Z]{3})"/);
  const marketMatch = ctx.match(/"marketPrice"\s*:\s*(\d+)/);
  const priceStrMatch = ctx.match(/"priceStr"\s*:\s*"([^"]+)"/);
  console.log(`  price: ${m[1]} (${parseInt(m[1])/100} USD equiv)${currencyMatch ? ` cur: ${currencyMatch[1]}` : ''}${marketMatch ? ` market: ${parseInt(marketMatch[1])/100}` : ''}${priceStrMatch ? ` priceStr: "${priceStrMatch[1]}"` : ''}`);
}

// 2. Search for the DZD price 2103 or USD price 7.01
console.log('\n=== Specific price search ===');
// 2103 in cents would be 210300, or as plain value 2103
const search2103 = content.match(/2103/);
console.log('2103 found:', !!search2103);

// 7.01 could be 701 in cents
const search701 = content.match(/701/);
console.log('701 found:', !!search701);

// 3000 in cents = $30.00
const search3000 = [...content.matchAll(/\b3000\b/g)];
console.log(`3000 found: ${search3000.length} times`);
// Show context around 3000
for (const m of search3000.slice(0, 5)) {
  const start = Math.max(0, m.index - 100);
  const end = Math.min(content.length, m.index + 100);
  console.log(`  Context: ...${content.slice(start, end)}...`);
}

// 3. Search for "minPrice" pattern more broadly
console.log('\n=== minPrice search ===');
const minPriceMatches = [...content.matchAll(/"minPrice"\s*:\s*"?(\d+\.?\d*)"?/g)];
console.log(`minPrice found: ${minPriceMatches.length} times`);
for (const m of minPriceMatches.slice(0, 20)) {
  const start = Math.max(0, m.index - 100);
  const end = Math.min(content.length, m.index + 200);
  const ctx = content.slice(start, end);
  console.log(`  minPrice: ${m[1]} | context: ${ctx.replace(/\n/g, ' ').slice(0, 200)}`);
}

// 4. Search for "sale" price patterns
console.log('\n=== salePrice search ===');
const salePriceMatches = [...content.matchAll(/"salePrice"\s*:\s*"?(\d+\.?\d*)"?/g)];
console.log(`salePrice found: ${salePriceMatches.length} times`);
for (const m of salePriceMatches.slice(0, 10)) {
  console.log(`  salePrice: ${m[1]}`);
}

// 5. Search for visible price text patterns
console.log('\n=== Visible price text ===');
// Look for patterns like "7.01" or "$7.01" or "2,103 DA"
const dollarTextPrices = [...content.matchAll(/\$\s*([\d,.]+)/g)];
console.log(`$ prices in content: ${dollarTextPrices.length}`);
const uniqueDollarPrices = [...new Set(dollarTextPrices.map(m => m[1]))];
console.log(`Unique $ prices: ${uniqueDollarPrices.slice(0, 30).join(', ')}`);

// 6. Search for "sku" blocks that might contain pricing
console.log('\n=== SKU/variant price search ===');
const skuPriceMatches = [...content.matchAll(/"skuId"\s*:\s*"?(\d+)"?\s*[^}]{0,300}"price"\s*:\s*(\d+)/g)];
console.log(`SKU price blocks: ${skuPriceMatches.length}`);
for (const m of skuPriceMatches.slice(0, 10)) {
  console.log(`  skuId: ${m[1]}, price: ${m[2]} (${parseInt(m[2])/100} USD equiv)`);
}

