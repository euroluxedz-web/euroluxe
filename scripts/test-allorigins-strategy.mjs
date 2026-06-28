import { Buffer } from 'buffer';

const GOODS_ID = '601105214745191';
const CURRENCY_TO_USD = {
  USD: 1, EUR: 1.08, GBP: 1.27, DZD: 0.0075, MUR: 0.022, OMR: 2.60,
  BHD: 2.65, PKR: 0.0036, INR: 0.012, SAR: 0.27, AED: 0.27,
};

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

function extractProductInfo(html, originalUrl) {
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
  const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
  
  let price = null;
  let currency = 'USD';
  let priceSource = '';

  // 2b: OG product:price:amount
  if (ogPrice) {
    const p = parseFloat(ogPrice);
    if (p > 0) {
      price = p;
      currency = ogCurrency || 'USD';
      priceSource = 'og-meta';
    }
  }

  return {
    price,
    currency,
    productName: ogTitle ? decodeHtmlEntities(ogTitle).replace(/\s*[-|]\s*Temu\s*$/i, '').trim() : null,
    image: ogImage,
    source: priceSource || 'none',
  };
}

async function testAllOriginsStrategy() {
  console.log('=== Testing Strategy 0.5: AllOrigins with retries ===\n');
  
  const aoUrls = [
    `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`,
    `https://www.temu.com/-g-${GOODS_ID}.html`,
    `https://www.temu.com/goods.html?goods_id=${GOODS_ID}&_x_sessn=us&currency=USD`,
  ];

  for (const aoUrl of aoUrls) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Attempt ${attempt}/3 for ${aoUrl.slice(0, 80)}...`);
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(aoUrl)}`;
        
        const aoResponse = await fetch(proxyUrl, { signal: AbortSignal.timeout(20000) });
        
        if (!aoResponse.ok) {
          console.log(`  HTTP ${aoResponse.status}, retrying...`);
          if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        
        const aoData = await aoResponse.json();
        const aoHtml = typeof aoData === 'string' ? aoData : aoData?.contents;
        if (!aoHtml || typeof aoHtml !== 'string' || aoHtml.length < 5000) {
          console.log(`  HTML too short (${aoHtml?.length || 0}), retrying...`);
          if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        
        console.log(`  Got HTML: ${aoHtml.length} chars`);
        
        // Check if we got the real product page
        const hasOGTitle = /<meta[^>]*property=["']og:title["']/i.test(aoHtml);
        console.log(`  Has OG title: ${hasOGTitle}`);
        
        if (!hasOGTitle) {
          console.log(`  Anti-bot page, retrying...`);
          if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        
        // Extract price
        const aoResult = extractProductInfo(aoHtml, aoUrl);
        console.log(`  extractProductInfo:`, JSON.stringify(aoResult));
        
        if (aoResult.price && aoResult.price > 0) {
          console.log(`\n✓ SUCCESS! Price: ${aoResult.price} ${aoResult.currency} (source: ${aoResult.source})`);
          console.log(`  Product: ${aoResult.productName}`);
          
          // Convert to USD if needed
          let priceUSD = aoResult.price;
          if (aoResult.currency !== 'USD' && CURRENCY_TO_USD[aoResult.currency]) {
            priceUSD = Math.round(aoResult.price * CURRENCY_TO_USD[aoResult.currency] * 100) / 100;
          }
          console.log(`  Price in USD: $${priceUSD}`);
          return;
        }
        
        // Try OG price directly
        const ogPriceMatch = aoHtml.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
        const ogCurrencyMatch = aoHtml.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
        if (ogPriceMatch) {
          const priceVal = parseFloat(ogPriceMatch[1]);
          const cur = ogCurrencyMatch?.[1] || 'USD';
          console.log(`  OG price: ${priceVal} ${cur}`);
          let priceUSD = priceVal;
          if (cur !== 'USD' && CURRENCY_TO_USD[cur]) {
            priceUSD = Math.round(priceVal * CURRENCY_TO_USD[cur] * 100) / 100;
          }
          console.log(`\n✓ SUCCESS via OG! Price: ${priceVal} ${cur} = $${priceUSD} USD`);
          return;
        }
        
        console.log(`  No price found, retrying...`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        console.log(`  Attempt ${attempt} error:`, err.message);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  
  console.log('\nAllOrigins strategy failed for all URLs');
}

testAllOriginsStrategy();
