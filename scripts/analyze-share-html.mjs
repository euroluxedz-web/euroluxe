/**
 * Analyze the share URL HTML from page_reader
 * This is the most promising approach - page_reader got 867KB from the share URL
 */
import fs from 'fs';

// We need to re-run page_reader for the share URL since the previous test saved it
// Actually, we already have it from Test 4 in the advanced diagnostic
// Let me check if the file exists

const filePath = '/home/z/my-project/scripts/test-share-reader.json';
try {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const html = data.data?.html || '';
  console.log('HTML length:', html.length);
  
  // 1. Check page title
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  console.log('\n1. Page title:', title);
  
  // 2. OG tags
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogUrl = html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
  console.log('\n2. OG tags:');
  console.log('  og:title:', ogTitle);
  console.log('  og:image:', ogImage?.slice(0, 100));
  console.log('  og:url:', ogUrl);
  console.log('  product:price:amount:', ogPrice);

  // 3. Look for goods_id specifically
  const allGoodsIdPatterns = [
    ...html.matchAll(/goods[_\-]?id["']?\s*[:=]\s*["']?(\d{10,})["']?/gi),
    ...html.matchAll(/-g-(\d{10,})/g),
    ...html.matchAll(/"goodsId"\s*:\s*"?(\d{10,})"?/gi),
    ...html.matchAll(/"goods_id"\s*:\s*"?(\d{10,})"?/gi),
    ...html.matchAll(/goods_id=(\d{10,})/gi),
  ];
  const uniqueIds = [...new Set(allGoodsIdPatterns.map(m => m[1]))];
  console.log('\n3. Goods IDs found:', uniqueIds);

  // 4. Look for price data more broadly
  console.log('\n4. Price patterns:');
  
  // priceInfo blocks
  const priceInfoMatches = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
  console.log(`  priceInfo blocks: ${priceInfoMatches.length}`);
  for (const pi of priceInfoMatches.slice(0, 5)) {
    console.log(`    ${parseInt(pi[1])/100} ${pi[2]}`);
  }

  // minPrice
  const minPriceMatches = [...html.matchAll(/"minPrice"\s*:\s*"?([0-9.]+)"?/g)];
  console.log(`  minPrice values: ${[...new Set(minPriceMatches.map(m => m[1]))].slice(0, 5).join(', ')}`);
  
  // salePrice
  const salePriceMatches = [...html.matchAll(/"salePrice"\s*:\s*"?([0-9.]+)"?/g)];
  console.log(`  salePrice values: ${[...new Set(salePriceMatches.map(m => m[1]))].slice(0, 5).join(', ')}`);

  // price (exact field)
  const priceFieldMatches = [...html.matchAll(/"price"\s*:\s*"?([0-9.]+)"?/g)];
  const uniquePrices = [...new Set(priceFieldMatches.map(m => parseFloat(m[1])))].sort((a, b) => a - b);
  console.log(`  "price" field unique values (sorted): ${uniquePrices.slice(0, 20).join(', ')}`);

  // 5. Look for product name
  console.log('\n5. Product names:');
  const nameMatches = [...html.matchAll(/"name"\s*:\s*"([^"]{5,150})"/g)];
  for (const m of nameMatches.slice(0, 10)) {
    console.log(`  ${m[1]}`);
  }
  
  // 6. Look for thumbUrl / imageUrl
  console.log('\n6. Image URLs:');
  const thumbMatches = [...html.matchAll(/"thumbUrl"\s*:\s*"([^"]+)"/g)];
  const imageMatches = [...html.matchAll(/"imageUrl"\s*:\s*"([^"]+)"/g)];
  console.log(`  thumbUrl: ${thumbMatches.length} matches`);
  if (thumbMatches.length > 0) console.log(`  First: ${thumbMatches[0][1].slice(0, 100)}`);
  console.log(`  imageUrl: ${imageMatches.length} matches`);

  // 7. Look for Item ID (TV prefix)
  console.log('\n7. Item IDs:');
  const tvMatches = [...html.matchAll(/(TV[a-zA-Z0-9]{6,})/g)];
  console.log(`  ${[...new Set(tvMatches.map(m => m[1]))].slice(0, 10).join(', ') || 'none'}`);

  // 8. Look for currency info
  console.log('\n8. Currency patterns:');
  const currencyMatches = [...html.matchAll(/"currency"\s*:\s*"([A-Z]{3})"/g)];
  const uniqueCurrencies = [...new Set(currencyMatches.map(m => m[1]))];
  console.log(`  Currencies found: ${uniqueCurrencies.join(', ')}`);

  // 9. Look for __NEXT_DATA__ or similar embedded JSON
  console.log('\n9. Embedded JSON data:');
  const nextData = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextData) {
    try {
      const data = JSON.parse(nextData[1]);
      console.log('  Found __NEXT_DATA__, keys:', Object.keys(data).join(', '));
      // Try to find product data in it
      const str = JSON.stringify(data);
      const priceInNext = str.match(/"minPrice"\s*:\s*"?([0-9.]+)"?/);
      console.log('  minPrice in __NEXT_DATA__:', priceInNext?.[1] || 'not found');
    } catch {
      console.log('  __NEXT_DATA__ found but failed to parse');
    }
  } else {
    console.log('  No __NEXT_DATA__ found');
  }

  // 10. Look for window.__INITIAL_STATE__ or similar
  const initialState = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
  if (initialState) {
    console.log('  Found __INITIAL_STATE__, length:', initialState[1].length);
  }

  // 11. Search for dollar prices in text
  const text = html.replace(/<[^>]*>/g, ' ');
  const dollarPrices = [...text.matchAll(/\$\s*(\d{1,5}(?:\.\d{1,2})?)/g)].map(m => parseFloat(m[1])).filter(v => v > 0.5 && v < 10000);
  if (dollarPrices.length > 0) {
    const sorted = [...new Set(dollarPrices)].sort((a, b) => a - b);
    console.log('\n11. Dollar prices in text (unique, sorted):', sorted.slice(0, 20).join(', '));
  }

  // 12. Search for embedded product objects
  const productObj = html.match(/"goods"\s*:\s*\{/g);
  console.log('\n12. "goods" objects found:', productObj?.length || 0);

  // 13. Look for specific patterns around the goods_id
  for (const gid of uniqueIds.slice(0, 2)) {
    const idx = html.indexOf(gid);
    if (idx >= 0) {
      const context = html.slice(Math.max(0, idx - 200), idx + 200);
      console.log(`\n13. Context around goods_id ${gid}:`);
      console.log(context.replace(/\n/g, ' ').slice(0, 400));
    }
  }

} catch (err) {
  console.log('Error:', err.message);
  console.log('The file may not exist yet. Run the page_reader test first.');
}
