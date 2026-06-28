import ZAI from 'z-ai-web-dev-sdk';

const GOODS_ID = '601105214745191';

async function test() {
  const zai = await ZAI.create();

  // Try reading different locale versions of the product page
  const urls = [
    `https://www.temu.com/de-en/random-12pcs-10pcs-7pcs-simple-old-money-style-vintage-elegant-irregular-pattern-bow-twist-leopard-print-bracelet-set-for-women-for-dates-vacations-daily-wear-parties-and-anniversary-gifts-g-${GOODS_ID}.html`,
    `https://www.temu.com/uk/random-12pcs-10pcs-7pcs-simple-old-money-style-vintage-elegant-irregular-pattern-bow-twist-leopard-print-bracelet-set-for-women-for-dates-vacations-daily-wear-parties-and-anniversary-gifts-g-${GOODS_ID}.html`,
    `https://www.temu.com/random-12pcs-10pcs-7pcs-simple-old-money-style-vintage-elegant-irregular-pattern-bow-twist-leopard-print-bracelet-set-for-women-for-dates-vacations-daily-wear-parties-and-anniversary-gifts-g-${GOODS_ID}.html`,
  ];

  for (const url of urls) {
    console.log(`\n--- Reading: ${url.slice(0, 100)}... ---`);
    try {
      const result = await zai.invokeFunction('page_reader', { url });
      const data = typeof result === 'string' ? JSON.parse(result) : result;
      const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;

      if (!content || content.length < 1000) {
        console.log('No content or too short:', content?.length || 0);
        continue;
      }

      console.log('Content length:', content.length);
      
      // Check page title
      const title = content.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
      console.log('Title:', title || 'none');

      // Check OG tags
      const ogTitle = content.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogCurrency = content.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
      console.log('OG title:', ogTitle || 'none');
      console.log('OG price:', ogPrice || 'none');
      console.log('OG currency:', ogCurrency || 'none');

      // Check for priceInfo
      const pi = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      console.log('priceInfo blocks:', pi.length);
      for (const p of pi.slice(0, 10)) {
        const priceStrMatch = p[0].match(/"priceStr"\s*:\s*"([^"]+)"/);
        console.log(`  ${p[2]} ${parseInt(p[1])/100}${priceStrMatch ? ` (priceStr: "${priceStrMatch[1]}")` : ''}`);
      }

      // Check for rawData
      const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      if (rawDataMatch) {
        const rawData = rawDataMatch[1];
        console.log('rawData length:', rawData.length);
        
        // Search for ALL price-related fields in rawData
        const priceFields = [...rawData.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice|displayPrice|normalPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
        if (priceFields.length > 0) {
          console.log('Price fields in rawData:');
          for (const m of priceFields.slice(0, 20)) {
            console.log(`  ${m[1]}: ${m[2]}`);
          }
        }
        
        // Search for the goods_id and its context
        const gidIdx = rawData.indexOf(GOODS_ID);
        if (gidIdx >= 0) {
          console.log('goods_id found in rawData at index', gidIdx);
          const window = rawData.slice(Math.max(0, gidIdx - 1000), Math.min(rawData.length, gidIdx + 5000));
          const nearbyPrices = [...window.matchAll(/"(minPrice|salePrice|price|marketPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
          if (nearbyPrices.length > 0) {
            console.log('Nearby price fields:');
            for (const m of nearbyPrices) {
              console.log(`  ${m[1]}: ${m[2]}`);
            }
          }
        }
      }

      // Check for $ prices in text
      const text = content.replace(/<[^>]*>/g, ' ');
      const dollarPrices = [...text.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)].map(m => m[0]);
      const uniqueDollar = [...new Set(dollarPrices)];
      console.log('Dollar prices in text:', uniqueDollar.slice(0, 20).join(', '));
      
      // Check for € prices
      const euroPrices = [...text.matchAll(/€\s*([\d,]+(?:\.\d{1,2})?)/g)].map(m => m[0]);
      console.log('Euro prices in text:', [...new Set(euroPrices)].slice(0, 20).join(', '));

      // If we have content, try extracting with LLM for a quick check
      if (content.length > 10000) {
        console.log('\nTrying LLM extraction...');
        const contentForLLM = content.slice(0, 30000);
        const completion = await zai.createChatCompletion({
          messages: [
            {
              role: 'system',
              content: 'Extract the main product price from this Temu page HTML. Return ONLY JSON: {"price_usd": <number or null>, "currency": "<original currency>", "price_local": "<original price string>", "product_name": "<name>"}'
            },
            {
              role: 'user',
              content: contentForLLM
            }
          ]
        });
        const response = completion.choices?.[0]?.message?.content || '';
        console.log('LLM:', response.slice(0, 300));
      }
    } catch (err) {
      console.log('Error:', err.message);
    }
  }
}

test();
