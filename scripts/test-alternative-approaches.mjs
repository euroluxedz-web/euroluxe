#!/usr/bin/env node
/**
 * Test alternative approaches to get Temu product price:
 * 1. Mobile API endpoints
 * 2. AllOrigins with different URLs
 * 3. Web search with price-specific queries
 */

const GOODS_IDS = ['601101613236742', '601105214745191'];

async function testAllOriginsRobust(goodsId) {
  console.log(`\n--- AllOrigins with multiple URLs for ${goodsId} ---`);
  
  const urls = [
    // Localized URLs (often bypass anti-bot)
    `https://www.temu.com/dz-en/goods.html?goods_id=${goodsId}`,
    `https://www.temu.com/dz-fr/goods.html?goods_id=${goodsId}`,
    // Other locale pages that might be indexed
    `https://www.temu.com/om-en/-g-${goodsId}.html`,
    `https://www.temu.com/bh-en/-g-${goodsId}.html`,
    `https://www.temu.com/mu/-g-${goodsId}.html`,
    // US page
    `https://www.temu.com/-g-${goodsId}.html`,
    // Goods page with USD
    `https://www.temu.com/goods.html?goods_id=${goodsId}&_x_sessn=us&currency=USD`,
  ];
  
  for (const url of urls) {
    for (const endpoint of ['/raw', '/get']) {
      try {
        const proxyUrl = `https://api.allorigins.win${endpoint}?url=${encodeURIComponent(url)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeout);
        
        if (!res.ok) continue;
        
        let html;
        if (endpoint === '/raw') {
          html = await res.text();
        } else {
          const data = await res.json();
          html = typeof data === 'string' ? data : data?.contents;
        }
        
        if (!html || html.length < 3000) continue;
        
        // Extract OG price
        const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
        const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
        const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
        
        if (ogPrice || ogTitle) {
          console.log(`  ✓ ${endpoint} ${url.substring(0, 60)}...`);
          console.log(`    Length: ${html.length}, OG Title: ${ogTitle?.substring(0, 50) || 'N/A'}`);
          console.log(`    OG Price: ${ogPrice || 'N/A'} ${ogCurrency || ''}`);
          
          // Check for priceInfo blocks
          const priceInfoMatches = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
          if (priceInfoMatches.length > 0) {
            const prices = priceInfoMatches.map(pi => `${parseInt(pi[1])/100} ${pi[2]}`);
            console.log(`    priceInfo: ${prices.join(', ')}`);
          }
          
          // Search for "$30" or "9000"
          const has30 = html.match(/30\.00/g);
          const has9000 = html.match(/\b9[\s,.]*000\b/g);
          console.log(`    Has "30.00": ${has30?.length || 0}, Has "9000": ${has9000?.length || 0}`);
          
          if (ogPrice) break; // Found the price, no need to try other endpoints
        }
      } catch (err) {
        // Timeout or error, try next
      }
    }
  }
}

async function testTemuMobileApi(goodsId) {
  console.log(`\n--- Temu Mobile API for ${goodsId} ---`);
  
  // Try the Temu app API endpoints
  const apiUrls = [
    {
      url: 'https://api.temu.com/api/sg/goods/detail',
      body: { goods_id: goodsId, _x_sessn: 'us' },
    },
    {
      url: 'https://api.temu.com/bg/goods/api',
      body: { goods_id: goodsId },
    },
    {
      url: 'https://www.temu.com/bg/goods/api',
      body: { goods_id: goodsId },
      headers: {
        'X-Device-Type': '2', // Mobile
        'X-App-Version': '2.97.0',
        'X-Platform': 'android',
      },
    },
  ];
  
  for (const api of apiUrls) {
    console.log(`  Trying: ${api.url}`);
    try {
      const res = await fetch(api.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Temu/2.97.0 (Android 14; Pixel 8)',
          'Accept': 'application/json',
          ...api.headers,
        },
        body: JSON.stringify(api.body),
      });
      
      console.log(`    Status: ${res.status}`);
      const text = await res.text();
      
      if (text.startsWith('<')) {
        console.log(`    HTML response (anti-bot), skipping`);
        continue;
      }
      
      try {
        const data = JSON.parse(text);
        if (data?.result?.goods) {
          const goods = data.result.goods;
          console.log(`    ✓ Product found!`);
          console.log(`    Name: ${(goods.name || '').substring(0, 60)}`);
          console.log(`    minPrice: ${goods.minPrice}`);
          console.log(`    price: ${goods.price}`);
          console.log(`    marketPrice: ${goods.marketPrice}`);
        } else {
          console.log(`    No goods in response: ${text.substring(0, 200)}`);
        }
      } catch {
        console.log(`    Parse error: ${text.substring(0, 200)}`);
      }
    } catch (err) {
      console.log(`    Error: ${err.message}`);
    }
  }
}

async function testDirectFetch(goodsId) {
  console.log(`\n--- Direct fetch for ${goodsId} ---`);
  
  const urls = [
    `https://www.temu.com/-g-${goodsId}.html`,
    `https://www.temu.com/dz-en/goods.html?goods_id=${goodsId}`,
  ];
  
  for (const url of urls) {
    console.log(`  Fetching: ${url.substring(0, 60)}...`);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      
      console.log(`    Status: ${res.status}, URL: ${res.url?.substring(0, 60)}`);
      const html = await res.text();
      console.log(`    HTML length: ${html.length}`);
      
      // Check for OG price
      const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
      console.log(`    OG Price: ${ogPrice || 'N/A'} ${ogCurrency || ''}`);
      
      // Check for anti-bot
      const isAntiBot = html.length < 5000 || (html.match(/verify/gi) || []).length > 50;
      console.log(`    Anti-bot: ${isAntiBot}`);
    } catch (err) {
      console.log(`    Error: ${err.message}`);
    }
  }
}

async function main() {
  for (const goodsId of GOODS_IDS) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Testing goods_id: ${goodsId}`);
    console.log('='.repeat(70));
    
    await testAllOriginsRobust(goodsId);
    await testTemuMobileApi(goodsId);
    await testDirectFetch(goodsId);
  }
}

main().catch(console.error);
