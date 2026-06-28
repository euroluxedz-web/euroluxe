import { Buffer } from 'buffer';

const CURRENCY_TO_USD = {
  USD: 1, EUR: 1.08, GBP: 1.27, DZD: 0.0075,
};

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function extractProductInfo(html, originalUrl) {
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
  const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;

  let price = null;
  let currency = 'USD';
  let priceSource = '';

  // 2b: OG price
  if (ogPrice) {
    const p = parseFloat(ogPrice);
    if (p > 0) {
      price = p;
      currency = ogCurrency || 'USD';
      priceSource = 'og-meta';
    }
  }

  return {
    price, currency,
    productName: ogTitle ? decodeHtmlEntities(ogTitle).replace(/\s*[-|]\s*Temu\s*$/i, '').trim() : null,
    image: ogImage,
    source: priceSource || 'none',
  };
}

async function testShareUrl() {
  console.log('=== Testing fixed share URL flow ===\n');
  
  const shareUrl = 'https://share.temu.com/GLv19JAELgB';
  
  // Step 1: Resolve share URL
  console.log('Step 1: Resolving share URL...');
  const res = await fetch(shareUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  
  const resolvedUrl = res.url;
  const html = await res.text();
  console.log('Resolved to:', resolvedUrl.slice(0, 100) + '...');
  
  const resolved = new URL(resolvedUrl);
  const goodsId = resolved.searchParams.get('goods_id') || resolved.pathname.match(/-g-([a-zA-Z0-9]+)/)?.[1] || '';
  const shareImage = resolved.searchParams.get('top_gallery_url');
  console.log('goods_id:', goodsId);
  console.log('shareImage:', !!shareImage);
  
  // Step 2: Strategy 0.5 - AllOrigins with retries
  console.log('\nStep 2: Strategy 0.5 - AllOrigins with retries...');
  const aoUrls = [
    `https://www.temu.com/-g-${goodsId}.html?_x_sessn=us&currency=USD`,
    `https://www.temu.com/-g-${goodsId}.html`,
  ];
  
  for (const aoUrl of aoUrls) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`  Attempt ${attempt}/3 for ${aoUrl.slice(0, 60)}...`);
        
        // Try /raw endpoint first (more reliable)
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(aoUrl)}`;
        const aoResponse = await fetch(proxyUrl, { signal: AbortSignal.timeout(20000) });
        
        if (!aoResponse.ok) {
          console.log(`  HTTP ${aoResponse.status}, retrying...`);
          if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        
        const aoHtml = await aoResponse.text();
        if (!aoHtml || aoHtml.length < 5000 || !aoHtml.includes('<')) {
          console.log(`  HTML too short (${aoHtml?.length || 0}), retrying...`);
          if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        
        console.log(`  Got HTML: ${aoHtml.length} chars`);
        
        // Check for OG title (real product page vs anti-bot)
        const hasOGTitle = /<meta[^>]*property=["']og:title["']/i.test(aoHtml);
        console.log(`  Has OG title: ${hasOGTitle}`);
        
        if (!hasOGTitle) {
          console.log('  Anti-bot page, retrying...');
          if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        
        // Extract price
        const aoResult = extractProductInfo(aoHtml, aoUrl);
        console.log('  extractProductInfo:', JSON.stringify(aoResult));
        
        if (aoResult.price && aoResult.price > 0) {
          console.log(`\n✓ SUCCESS! Price: ${aoResult.price} ${aoResult.currency} (source: ${aoResult.source})`);
          console.log(`  Product: ${aoResult.productName}`);
          
          // Convert to USD if needed
          let priceUSD = aoResult.price;
          if (aoResult.currency !== 'USD' && CURRENCY_TO_USD[aoResult.currency]) {
            priceUSD = Math.round(aoResult.price * CURRENCY_TO_USD[aoResult.currency] * 100) / 100;
          }
          console.log(`  Price in USD: $${priceUSD}`);
          console.log(`  Image: ${shareImage ? 'present from share URL' : 'none'}`);
          return { success: true, price: priceUSD, name: aoResult.productName, image: !!shareImage };
        }
        
        // Try OG price directly
        const ogPriceMatch = aoHtml.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
        const ogCurrencyMatch = aoHtml.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
        if (ogPriceMatch) {
          const priceVal = parseFloat(ogPriceMatch[1]);
          const cur = ogCurrencyMatch?.[1] || 'USD';
          let priceUSD = priceVal;
          if (cur !== 'USD' && CURRENCY_TO_USD[cur]) {
            priceUSD = Math.round(priceVal * CURRENCY_TO_USD[cur] * 100) / 100;
          }
          console.log(`\n✓ SUCCESS via OG! Price: ${priceVal} ${cur} = $${priceUSD} USD`);
          return { success: true, price: priceUSD, currency: cur, image: !!shareImage };
        }
        
        console.log('  No price found in product page, retrying...');
        if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        console.log(`  Error: ${err.message}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  
  console.log('\nAllOrigins strategy failed');
  return { success: false };
}

const result = await testShareUrl();
console.log('\n=== FINAL RESULT ===');
console.log(JSON.stringify(result, null, 2));
