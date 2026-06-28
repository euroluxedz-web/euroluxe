import ZAI from "z-ai-web-dev-sdk";

const shareUrl = "https://share.temu.com/iEXtmO1ZX5B";
const goodsId = "601102757183337";

console.log("=== Searching for price in rendered page content ===\n");

const zai = await ZAI.create();

// Page Reader on share URL
const pageResult = await zai.invokeFunction("page_reader", {
  url: shareUrl,
});

const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;

if (!content) {
  console.log("No content from page reader!");
  process.exit(1);
}

console.log("Content length:", content.length);

// Search for specific price-related patterns more aggressively
// The product should cost around $7 or 2100 DA

// 1. Search for "7.01" or "7,01" 
const price701 = content.match(/7[.,]01/g);
console.log("\n'7.01' or '7,01' matches:", price701?.length || 0);

// 2. Search for "2103" or "2,103" or "2.103"  
const price2103 = content.match(/2[,.]?1[,.]?0[,.]?3/g);
console.log("'2103' matches:", price2103?.length || 0);

// 3. Search for "DA" near numbers (Algerian Dinar)
const daPrices = [...content.matchAll(/(\d{1,5}[,.]?\d{0,2})\s*DA/g)];
console.log("\nPrices with 'DA' suffix:");
for (const m of daPrices.slice(0, 20)) {
  console.log(`  ${m[1]} DA`);
}

// 4. Search for "DZD" near numbers
const dzdPrices = [...content.matchAll(/(\d{1,5}[,.]?\d{0,2})\s*DZD/gi)];
console.log("\nPrices with 'DZD':");
for (const m of dzdPrices.slice(0, 20)) {
  console.log(`  ${m[1]} DZD`);
}

// 5. Search for "$7" or "$7." patterns
const dollar7 = [...content.matchAll(/\$\s*7[.,]\d{1,2}/g)];
console.log("\n'$7.xx' matches:");
for (const m of dollar7.slice(0, 10)) {
  console.log(`  ${m[0]}`);
}

// 6. Search for "minPrice" with context
const minPriceCtx = [...content.matchAll(/minPrice.{0,100}/gi)];
console.log("\n'minPrice' contexts:");
for (const m of minPriceCtx.slice(0, 5)) {
  console.log(`  ${m[0].slice(0, 120)}`);
}

// 7. Search for "sale" or "price" near numbers
const salePrices = [...content.matchAll(/(?:sale|price)[^<]{0,30}(\d+[.,]\d{1,2})/gi)];
console.log("\n'sale/price' near numbers:");
for (const m of salePrices.slice(0, 20)) {
  console.log(`  ${m[0].slice(0, 80)}`);
}

// 8. Look for JSON with price data - broader search
const jsonPrices = [...content.matchAll(/"price"\s*:\s*"?(\d+)"?/g)];
console.log("\n'\"price\": <number>' matches:");
for (const m of jsonPrices.slice(0, 30)) {
  const val = parseInt(m[1]);
  const usd = val > 100 ? val/100 : val;
  console.log(`  price: ${m[1]} (= $${usd} if cents)`);
}

// 9. Look for skuPrice or similar fields
const skuPrices = [...content.matchAll(/(?:skuPrice|sku_price|itemPrice|item_price|goodsPrice|goods_price)\s*[:=]\s*"?(\d+\.?\d*)"?/gi)];
console.log("\nSKU/item/goods price fields:");
for (const m of skuPrices.slice(0, 10)) {
  console.log(`  ${m[0].slice(0, 80)}`);
}

// 10. Search for "30" specifically with context (the wrong price)
const thirtyMatches = [...content.matchAll(/30(?:\.0{1,2})?\s*(?:DA|DZD|\$|USD)/gi)];
console.log("\n'30' with currency (the wrong price):");
for (const m of thirtyMatches.slice(0, 10)) {
  console.log(`  ${m[0]}`);
}

// 11. Search for "guarantee" or "delivery" near price
const guaranteePrices = [...content.matchAll(/(?:guarantee|delivery|credit|delay).{0,50}(\d+[.,]\d{1,2})/gi)];
console.log("\n'guarantee/delivery/credit/delay' near numbers:");
for (const m of guaranteePrices.slice(0, 10)) {
  console.log(`  ${m[0].slice(0, 100)}`);
}

// 12. Look for the actual rendered price element - usually has class containing "price"
const priceClassMatches = [...content.matchAll(/class="[^"]*price[^"]*"[^>]*>([^<]+)/gi)];
console.log("\nElements with 'price' class:");
for (const m of priceClassMatches.slice(0, 20)) {
  console.log(`  ${m[1].trim()} (class: ${m[0].match(/class="([^"]*)"/)?.[1]?.slice(0, 50)})`);
}

// 13. Try to find the price in the first 50000 chars (near top of page)
const topContent = content.slice(0, 50000);
const topDollarPrices = [...topContent.matchAll(/\$\s*(\d{1,4}(?:[.,]\d{1,2})?)/g)];
console.log("\nDollar prices in first 50000 chars:");
const uniquePrices = [...new Set(topDollarPrices.map(m => m[0]))];
for (const p of uniquePrices.slice(0, 30)) {
  console.log(`  ${p}`);
}

