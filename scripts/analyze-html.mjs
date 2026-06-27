/**
 * Test extracting price from the page_reader HTML output
 */
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/test-page-reader.json', 'utf-8'));
const html = data.data.html;

console.log('HTML length:', html.length);

// Extract key info
const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
const ogPriceCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
const ogUrl = html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;

console.log('\nOG Tags:');
console.log('  Title:', ogTitle);
console.log('  Image:', ogImage);
console.log('  Price:', ogPrice);
console.log('  Currency:', ogPriceCurrency);
console.log('  URL:', ogUrl);

// Extract priceInfo
const priceInfosWithStr = [...html.matchAll(
  /"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"[^}]*?"priceStr"\s*:\s*"([^"]+)"/g
)];
console.log('\nPriceInfo blocks (with priceStr):');
for (const pi of priceInfosWithStr.slice(0, 10)) {
  const cents = parseInt(pi[1]);
  const cur = pi[2];
  const priceStr = pi[3];
  const usd = cents / 100;
  console.log(`  ${usd} ${cur} (priceStr: ${priceStr})`);
}

// Extract minPrice, salePrice, etc.
const fields = ["salePrice", "minPrice", "minAppPrice", "appPrice", "displayPrice", "normalPrice"];
console.log('\nOther price fields:');
for (const f of fields) {
  const re = new RegExp(`"${f}"\\s*:\\s*"?([\\d.]+)"?`, 'g');
  const matches = [...html.matchAll(re)];
  if (matches.length > 0) {
    console.log(`  ${f}: ${matches.slice(0, 5).map(m => m[1]).join(', ')}`);
  }
}

// Look for goods_id patterns
const goodsIdMatches = [...html.matchAll(/goods[_-]?id["']?\s*[:=]\s*["']?(\d{10,})["']?/gi)];
console.log('\nGoods IDs found:', [...new Set(goodsIdMatches.map(m => m[1]))].slice(0, 5));

// Look for item_id / sku patterns
const itemIdMatches = [...html.matchAll(/"itemId"\s*:\s*"?([A-Z0-9]{6,20})"?/gi)];
console.log('Item IDs found:', [...new Set(itemIdMatches.map(m => m[1]))].slice(0, 5));

// Look for thumbUrl / imageUrl
const thumbUrlMatches = [...html.matchAll(/"thumbUrl"\s*:\s*"([^"]+)"/g)];
console.log('\nThumb URLs:', thumbUrlMatches.slice(0, 3).map(m => m[1].slice(0, 80)));

// Look for product name
const nameMatches = [...html.matchAll(/"name"\s*:\s*"([^"]{5,100})"/g)];
console.log('\nProduct names (first 5):');
for (const m of nameMatches.slice(0, 5)) {
  console.log(`  ${m[1]}`);
}

// Check for title tag
const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
console.log('\nPage title:', title);

// Try JSON-LD
const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
for (const match of jsonLdMatches) {
  try {
    const data = JSON.parse(match[1]);
    const schemas = Array.isArray(data) ? data : [data];
    for (const schema of schemas) {
      if (schema["@type"] === "Product") {
        console.log('\nJSON-LD Product:');
        console.log('  Name:', schema.name);
        console.log('  Offers:', JSON.stringify(schema.offers?.slice(0, 1)));
      }
    }
  } catch {}
}

// Check for anti-bot
const verifyCount = (html.match(/verify/gi) || []).length;
console.log(`\nAnti-bot check: verify count = ${verifyCount}, HTML length = ${html.length}`);
console.log('Is anti-bot page:', html.length < 450000 && verifyCount > 100);
