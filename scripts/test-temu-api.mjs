// Test Temu BG API and other strategies
const GOODS_ID = '601105214745191';
const ITEM_ID = ''; // We'll try to find it

async function testBgApi() {
  console.log('=== Testing Temu BG API for goods_id:', GOODS_ID, '===\n');

  const endpoints = [
    { url: 'https://www.temu.com/bg/goods/api', body: { goods_id: GOODS_ID } },
    { url: 'https://www.temu.com/api/ego/product/detail', body: { goods_id: GOODS_ID, _x_sessn: 'us' } },
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing: ${endpoint.url}`);
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Origin': 'https://www.temu.com',
          'Referer': `https://www.temu.com/-g-${GOODS_ID}.html`,
        },
        body: JSON.stringify(endpoint.body),
      });

      console.log(`  Status: ${res.status}`);
      const text = await res.text();
      console.log(`  Response length: ${text.length}`);
      
      if (text.length < 5000) {
        console.log(`  Full response: ${text}`);
      } else {
        console.log(`  First 2000 chars: ${text.slice(0, 2000)}`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
    console.log();
  }
}

async function testDirectFetch() {
  console.log('=== Testing Direct Fetch ===\n');

  const urls = [
    `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`,
    `https://www.temu.com/goods.html?goods_id=${GOODS_ID}&_x_sessn=us&currency=USD`,
  ];

  for (const url of urls) {
    try {
      console.log(`Fetching: ${url}`);
      const res = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      console.log(`  Status: ${res.status}`);
      console.log(`  Final URL: ${res.url}`);
      const html = await res.text();
      console.log(`  HTML length: ${html.length}`);

      // Check for priceInfo
      const priceInfoMatches = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      console.log(`  priceInfo blocks: ${priceInfoMatches.length}`);
      for (const pi of priceInfoMatches.slice(0, 10)) {
        console.log(`    ${pi[2]} ${parseInt(pi[1])/100} (${pi[1]} cents)`);
      }

      // Check for OG meta
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      console.log(`  OG title: ${ogTitle || 'none'}`);
      console.log(`  OG price: ${ogPrice || 'none'}`);

      // Check for minPrice/salePrice
      const priceFields = ['minPrice', 'salePrice', 'price', 'marketPrice', 'appPrice'];
      for (const field of priceFields) {
        const matches = [...html.matchAll(new RegExp(`"${field}"\\s*:\\s*"?([\\d.]+)"?`, 'g'))];
        if (matches.length > 0) {
          console.log(`  ${field}: ${matches.map(m => m[1]).slice(0, 5).join(', ')}`);
        }
      }

      // Check for window.rawData
      const rawDataMatch = html.match(/window\.rawData\s*=/);
      console.log(`  window.rawData: ${rawDataMatch ? 'present' : 'absent'}`);

      // Anti-bot detection
      const isAntiBot = html.length < 450000 && (html.match(/verify/gi) || []).length > 100;
      console.log(`  Anti-bot detected: ${isAntiBot}`);

    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
    console.log();
  }
}

await testBgApi();
await testDirectFetch();
