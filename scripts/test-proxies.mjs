// Test the proxy-based strategies
const GOODS_ID = '601105214745191';
const URL = `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`;

async function testAllOrigins() {
  console.log('=== Testing AllOrigins ===');
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(URL)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) {
      console.log('HTTP', res.status);
      return;
    }
    const data = await res.json();
    const html = typeof data === 'string' ? data : data?.contents;
    if (!html || typeof html !== 'string') {
      console.log('No HTML content');
      return;
    }
    console.log('HTML length:', html.length);
    
    // Check for price data
    const priceInfo = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
    console.log('priceInfo blocks:', priceInfo.length);
    for (const pi of priceInfo.slice(0, 10)) {
      console.log(`  ${pi[2]} ${parseInt(pi[1])/100}`);
    }

    // Check for OG tags
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
    console.log('OG title:', ogTitle || 'none');
    console.log('OG price:', ogPrice || 'none');

    // Check for price fields
    const fields = ['salePrice', 'minPrice', 'price', 'marketPrice', 'appPrice', 'displayPrice'];
    for (const f of fields) {
      const matches = [...html.matchAll(new RegExp(`"${f}"\\s*:\\s*"?([\\d.]+)"?`, 'g'))];
      if (matches.length > 0) {
        console.log(`${f}:`, matches.map(m => m[1]).slice(0, 5).join(', '));
      }
    }

    // Check for $ prices in text
    const text = html.replace(/<[^>]*>/g, ' ');
    const dollarPrices = [...text.matchAll(/\$\s*(\d{1,4}(?:\.\d{1,2})?)/g)].map(m => m[1]);
    const uniqueDollar = [...new Set(dollarPrices)].sort((a, b) => parseFloat(a) - parseFloat(b));
    console.log('Dollar prices:', uniqueDollar.slice(0, 20).join(', '));
    
    // Check for DA prices
    const daPrices = [...text.matchAll(/([\d,]+)\s*(?:DA|DZD|دج)/gi)].map(m => m[1]);
    console.log('DA prices:', daPrices.slice(0, 20).join(', '));

    // Check for embedded priceInfo with cents
    const priceInfoAll = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
    console.log('All priceInfo:', priceInfoAll.length);

    // 2d pattern
    const embeddedPrices = [];
    for (const f of ['salePrice', 'minPrice', 'minAppPrice', 'appPrice', 'displayPrice', 'normalPrice']) {
      const re = new RegExp(`"${f}"\\s*:\\s*"?([\\d.]+)"?`, 'g');
      for (const m of html.matchAll(re)) {
        const v = parseFloat(m[1]);
        if (v > 0 && v < 100000) embeddedPrices.push({ field: f, value: v, raw: m[1] });
      }
    }
    if (embeddedPrices.length > 0) {
      embeddedPrices.sort((a, b) => a.value - b.value);
      console.log('Embedded price fields:');
      for (const p of embeddedPrices.slice(0, 20)) {
        const price = p.value > 100 ? p.value / 100 : p.value;
        console.log(`  ${p.field}: ${p.raw} → ${price} USD`);
      }
    }

    // 2e pattern - text prices
    const textPrices = [...text.matchAll(/[£€$]\s*(\d{1,4}(?:[.,]\d{1,2})?)/g)];
    const prices = [];
    for (const m of textPrices) {
      const raw = m[1].replace(/,/g, '');
      const v = parseFloat(raw);
      if (v > 1.5 && v < 5000) {
        const cur = m[0].includes('£') ? 'GBP' : m[0].includes('€') ? 'EUR' : 'USD';
        prices.push({ value: v, currency: cur, original: m[0] });
      }
    }
    if (prices.length > 0) {
      prices.sort((a, b) => a.value - b.value);
      console.log('Text prices:');
      for (const p of prices) {
        console.log(`  ${p.original} (${p.currency})`);
      }
    }

  } catch (err) {
    console.log('Error:', err.message);
  }
}

async function testCorsProxy() {
  console.log('\n=== Testing CorsProxy ===');
  try {
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(URL)}`;
    const res = await fetch(proxyUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) {
      console.log('HTTP', res.status);
      return;
    }
    const html = await res.text();
    console.log('HTML length:', html.length);

    // Quick checks
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    console.log('OG title:', ogTitle || 'none');
    
    const text = html.replace(/<[^>]*>/g, ' ');
    const dollarPrices = [...text.matchAll(/\$\s*(\d{1,4}(?:\.\d{1,2})?)/g)].map(m => m[1]);
    console.log('Dollar prices:', [...new Set(dollarPrices)].join(', '));
  } catch (err) {
    console.log('Error:', err.message);
  }
}

await testAllOrigins();
await testCorsProxy();
