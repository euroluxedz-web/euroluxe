import ZAI from 'z-ai-web-dev-sdk';

const GOODS_ID = '601105214745191';

async function testPageReader() {
  console.log('=== Testing ZAI Page Reader ===\n');

  const zai = await ZAI.create();

  const urls = [
    { url: `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`, label: 'us-product-page' },
    { url: `https://www.temu.com/goods.html?goods_id=${GOODS_ID}&_x_sessn=us&currency=USD`, label: 'goods-api-us' },
    { url: 'https://share.temu.com/GLv19JAELgB', label: 'share-url' },
  ];

  for (const { url, label } of urls) {
    console.log(`\n--- Reading ${label}: ${url} ---`);
    try {
      const result = await zai.invokeFunction('page_reader', { url });

      const data = typeof result === 'string' ? JSON.parse(result) : result;
      const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;

      if (!content || content.length < 100) {
        console.log('No content or too short');
        console.log('Raw result keys:', Object.keys(data || {}));
        console.log('Data keys:', Object.keys(data?.data || {}));
        console.log('Result sample:', JSON.stringify(data).slice(0, 500));
        continue;
      }

      console.log(`Content length: ${content.length}`);

      // Save to file for analysis
      const fs = await import('fs');
      fs.writeFileSync(`/home/z/my-project/download/page-reader-${label}.html`, content);
      console.log(`Saved to /home/z/my-project/download/page-reader-${label}.html`);

      // Search for priceInfo blocks
      const priceInfoMatches = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      console.log(`priceInfo blocks: ${priceInfoMatches.length}`);
      for (const pi of priceInfoMatches.slice(0, 15)) {
        const cents = parseInt(pi[1]);
        const cur = pi[2];
        const fullMatch = pi[0];
        // Also try to get priceStr
        const priceStrMatch = fullMatch.match(/"priceStr"\s*:\s*"([^"]+)"/);
        const marketPriceMatch = fullMatch.match(/"marketPrice"\s*:\s*(\d+)/);
        console.log(`  ${cur} ${cents} cents = ${cents/100} ${cur}${priceStrMatch ? ` (priceStr: ${priceStrMatch[1]})` : ''}${marketPriceMatch ? ` (market: ${parseInt(marketPriceMatch[1])/100})` : ''}`);
      }

      // Search for window.rawData
      const rawDataMatch = content.match(/window\.rawData\s*=/);
      console.log(`window.rawData: ${rawDataMatch ? 'present' : 'absent'}`);

      // Search for OG tags
      const ogTitle = content.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogImage = content.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
      console.log(`OG title: ${ogTitle || 'none'}`);
      console.log(`OG price: ${ogPrice || 'none'}`);
      console.log(`OG image: ${ogImage ? ogImage.slice(0, 100) + '...' : 'none'}`);

      // Search for minPrice/salePrice in JSON
      const priceFields = ['minPrice', 'salePrice', 'price', 'marketPrice', 'appPrice', 'displayPrice', 'priceNum'];
      for (const field of priceFields) {
        const matches = [...content.matchAll(new RegExp(`"${field}"\\s*:\\s*"?([\\d.]+)"?`, 'g'))];
        if (matches.length > 0) {
          console.log(`${field}: ${matches.map(m => m[1]).slice(0, 10).join(', ')}`);
        }
      }

      // Search for dollar prices in visible text
      const textContent = content.replace(/<[^>]*>/g, ' ');
      const dollarPrices = [...textContent.matchAll(/\$\s*(\d{1,4}(?:\.\d{1,2})?)/g)].map(m => parseFloat(m[1]));
      console.log(`Dollar prices in text: ${dollarPrices.slice(0, 20).join(', ')}`);

      // Search for DZD/DA prices
      const dzdPrices = [...textContent.matchAll(/([\d,]+)\s*(?:DA|DZD|دج)/gi)].map(m => m[1]);
      console.log(`DZD prices in text: ${dzdPrices.slice(0, 20).join(', ')}`);

    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }
}

testPageReader();
