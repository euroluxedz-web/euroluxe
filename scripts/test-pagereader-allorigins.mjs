import ZAI from 'z-ai-web-dev-sdk';

const GOODS_ID = '601105214745191';

async function test() {
  const zai = await ZAI.create();
  
  // Try page_reader with the AllOrigins proxy URL
  const urls = [
    // AllOrigins raw proxy
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`)}`,
    // Resolved share URL through AllOrigins
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.temu.com/dz-en/goods.html?_bg_fs=1&goods_id=${GOODS_ID}&_x_sessn=us&currency=USD`)}`,
    // Try the share URL directly (page_reader follows redirects)
    `https://share.temu.com/GLv19JAELgB`,
  ];
  
  for (const url of urls) {
    console.log(`\n--- Reading: ${url.slice(0, 100)}... ---`);
    try {
      const result = await zai.invokeFunction('page_reader', { url });
      const data = typeof result === 'string' ? JSON.parse(result) : result;
      const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
      
      if (!content || content.length < 100) {
        console.log('No content, result keys:', Object.keys(data || {}));
        if (data?.data) console.log('Data keys:', Object.keys(data.data));
        console.log('Sample:', JSON.stringify(data).slice(0, 300));
        continue;
      }
      
      console.log('Content length:', content.length);
      
      // OG tags
      const ogTitle = content.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogCurrency = content.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
      console.log('OG title:', ogTitle || 'none');
      console.log('OG price:', ogPrice || 'none');
      console.log('OG currency:', ogCurrency || 'none');
      
      // priceInfo
      const pi = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      console.log('priceInfo blocks:', pi.length);
      for (const p of pi.slice(0, 5)) {
        console.log(`  ${p[2]} ${parseInt(p[1])/100}`);
      }
      
      // $ prices
      const text = content.replace(/<[^>]*>/g, ' ');
      const dollarPrices = [...text.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)].map(m => m[0]);
      console.log('$ prices:', [...new Set(dollarPrices)].slice(0, 10).join(', '));
      
    } catch (err) {
      console.log('Error:', err.message);
    }
  }
}

test();
