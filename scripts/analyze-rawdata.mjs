import fs from 'fs';

// Analyze the page reader content for rawData
const files = [
  { path: '/home/z/my-project/download/page-reader-us-product-page.html', label: 'us-product-page' },
  { path: '/home/z/my-project/download/page-reader-goods-api-us.html', label: 'goods-api-us' },
  { path: '/home/z/my-project/download/page-reader-share-url.html', label: 'share-url' },
];

for (const { path, label } of files) {
  console.log(`\n=== Analyzing ${label} ===`);
  const content = fs.readFileSync(path, 'utf-8');
  
  // Find window.rawData
  const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
  if (rawDataMatch) {
    console.log('rawData found, length:', rawDataMatch[1].length);
    
    // Try to find price fields near goods_id
    const goodsId = '601105214745191';
    const gidIdx = rawDataMatch[1].indexOf(goodsId);
    if (gidIdx >= 0) {
      console.log(`goods_id found at index ${gidIdx}`);
      const window = rawDataMatch[1].slice(Math.max(0, gidIdx - 2000), Math.min(rawDataMatch[1].length, gidIdx + 10000));
      
      const priceMatches = [...window.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice|priceNum|displayPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
      for (const m of priceMatches) {
        console.log(`  ${m[1]}: ${m[2]}`);
      }
    } else {
      console.log('goods_id NOT found in rawData');
    }

    // Try a broader search for price patterns
    const broadPriceMatches = [...rawDataMatch[1].matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
    console.log(`\nAll price fields in rawData (first 30):`);
    for (const m of broadPriceMatches.slice(0, 30)) {
      console.log(`  ${m[1]}: ${m[2]}`);
    }
  } else {
    console.log('No rawData found');
  }

  // Search for priceInfo with priceStr
  const priceInfoWithStr = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"priceStr"\s*:\s*"([^"]+)"[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
  console.log(`\npriceInfo with priceStr: ${priceInfoWithStr.length}`);
  for (const pi of priceInfoWithStr.slice(0, 20)) {
    console.log(`  ${pi[3]} ${pi[1]} cents = ${parseInt(pi[1])/100} ${pi[3]} (priceStr: "${pi[2]}")`);
  }

  // Search for any JSON block containing the goods_id and price info
  const gidContexts = [...content.matchAll(new RegExp(`601105214745191[\\s\\S]{0,500}`, 'g'))];
  console.log(`\nContexts containing goods_id (first 5):`);
  for (const ctx of gidContexts.slice(0, 5)) {
    console.log(`  ${ctx[0].slice(0, 300)}`);
  }
}
