// Test AllOrigins with different URL formats
const GOODS_ID = '601105214745191';

async function testAllOriginsUrl(url, label) {
  console.log(`\n=== Testing AllOrigins: ${label} ===`);
  console.log(`URL: ${url}`);
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) {
      console.log('HTTP', res.status);
      return null;
    }
    const data = await res.json();
    const html = typeof data === 'string' ? data : data?.contents;
    if (!html || typeof html !== 'string') {
      console.log('No HTML content');
      return null;
    }
    console.log('HTML length:', html.length);

    // OG tags
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1];
    
    console.log('OG title:', ogTitle || 'none');
    console.log('OG price:', ogPrice || 'none');
    console.log('OG currency:', ogCurrency || 'none');
    console.log('OG image:', ogImage ? ogImage.slice(0, 100) + '...' : 'none');
    console.log('OG description:', ogDesc || 'none');

    // priceInfo
    const priceInfo = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
    console.log('priceInfo blocks:', priceInfo.length);
    for (const pi of priceInfo.slice(0, 10)) {
      const ctx = pi[0];
      const priceStrMatch = ctx.match(/"priceStr"\s*:\s*"([^"]+)"/);
      const marketMatch = ctx.match(/"marketPrice"\s*:\s*(\d+)/);
      console.log(`  ${pi[2]} ${parseInt(pi[1])/100}${priceStrMatch ? ` ("${priceStrMatch[1]}")` : ''}${marketMatch ? ` market: ${parseInt(marketMatch[1])/100}` : ''}`);
    }

    // priceInfo with priceStr
    const priceInfoStr = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"[^}]*?"priceStr"\s*:\s*"([^"]+)"/g)];
    console.log('priceInfo with priceStr:', priceInfoStr.length);
    for (const pi of priceInfoStr.slice(0, 10)) {
      console.log(`  ${pi[2]} ${parseInt(pi[1])/100} (priceStr: "${pi[3]}")`);
    }

    // embedded JSON price fields
    const fields = ['salePrice', 'minPrice', 'price', 'marketPrice', 'appPrice', 'displayPrice'];
    for (const f of fields) {
      const matches = [...html.matchAll(new RegExp(`"${f}"\\s*:\\s*"?([\\d.]+)"?`, 'g'))];
      if (matches.length > 0) {
        console.log(`${f}:`, matches.map(m => m[1]).slice(0, 5).join(', '));
      }
    }

    // window.rawData
    const rawData = html.match(/window\.rawData\s*=/);
    console.log('rawData present:', !!rawData);

    return html;
  } catch (err) {
    console.log('Error:', err.message);
    return null;
  }
}

// Test different URL formats
await testAllOriginsUrl(
  `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`,
  'US product page'
);

await testAllOriginsUrl(
  `https://www.temu.com/dz-en/goods.html?goods_id=${GOODS_ID}&_x_sessn=us&currency=USD`,
  'DZ goods page'
);

await testAllOriginsUrl(
  `https://www.temu.com/-g-${GOODS_ID}.html`,
  'Default product page (no params)'
);

// Also try a different product to verify
const GOODS_ID_2 = '601101613236742'; // from previous test
await testAllOriginsUrl(
  `https://www.temu.com/-g-${GOODS_ID_2}.html?_x_sessn=us&currency=USD`,
  'Different product US page'
);
