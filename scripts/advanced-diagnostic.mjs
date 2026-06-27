/**
 * Advanced diagnostic: Try multiple approaches to get Temu product price
 */
import https from 'https';
import http from 'http';

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = mod.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body, url }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  const goodsId = '601101613236742';
  
  console.log('='.repeat(80));
  console.log('ADVANCED TEMU DIAGNOSTICS');
  console.log('='.repeat(80));

  // Test 1: Temu mobile app API
  console.log('\n--- Test 1: Temu Mobile API endpoints ---');
  const mobileApis = [
    {
      name: 'mms API',
      url: `https://mms.pinduoduo.com/mars/api/goods/detail?goods_id=${goodsId}`,
    },
    {
      name: 'Temu goods detail (mobile)',
      url: `https://api.temu.com/api/ego/product/detail?goods_id=${goodsId}&_x_sessn=us`,
    },
    {
      name: 'Temu search API',
      url: `https://api.temu.com/proxy/api/search?q=${goodsId}`,
    },
    {
      name: 'Temu product API v2',
      url: `https://www.temu.com/api/ego/product/detail?goods_id=${goodsId}`,
    },
    {
      name: 'Temu bg goods API with referer',
      url: `https://www.temu.com/bg/goods/api`,
      method: 'POST',
      body: JSON.stringify({ goods_id: goodsId, _x_sessn: 'us', currency: 'USD' }),
    },
  ];

  for (const api of mobileApis) {
    try {
      console.log(`\n  Trying: ${api.name} (${api.url})`);
      const headers = {
        'User-Agent': 'Temu/2.97.0 (Android 14; Pixel 8)',
        'Accept': 'application/json',
        'Accept-Language': 'en-US',
        'X-App-Version': '2.97.0',
        'X-Platform': 'android',
      };
      if (api.method === 'POST') {
        headers['Content-Type'] = 'application/json';
        headers['Origin'] = 'https://www.temu.com';
        headers['Referer'] = `https://www.temu.com/-g-${goodsId}.html`;
      }
      
      const res = await fetch(api.url, {
        method: api.method || 'GET',
        headers,
        body: api.body,
      });
      console.log(`  Status: ${res.status}, Length: ${res.body.length}`);
      
      if (res.body.length < 500) {
        console.log(`  Body: ${res.body.slice(0, 300)}`);
      } else {
        // Try to parse as JSON
        try {
          const data = JSON.parse(res.body);
          const goods = data?.result?.goods || data?.result?.data || data?.result;
          if (goods) {
            console.log(`  ✓ Got product data!`);
            console.log(`    name: ${goods.name || goods.goodsName || 'N/A'}`);
            console.log(`    minPrice: ${goods.minPrice}`);
            console.log(`    price: ${goods.price}`);
            console.log(`    marketPrice: ${goods.marketPrice}`);
            console.log(`    thumbUrl: ${(goods.thumbUrl || goods.imageUrl || 'N/A').slice(0, 80)}`);
          } else {
            const keys = Object.keys(data || {});
            console.log(`  Keys: ${keys.join(', ')}`);
            if (data?.error_code) console.log(`  Error: ${data.error_code} - ${data.error_msg}`);
          }
        } catch {
          console.log(`  First 200 chars: ${res.body.slice(0, 200)}`);
        }
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }

  // Test 2: Google cache
  console.log('\n--- Test 2: Google Cache ---');
  const productUrl = `https://www.temu.com/-g-${goodsId}.html`;
  try {
    const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(productUrl)}`;
    console.log(`  Trying: ${cacheUrl}`);
    const res = await fetch(cacheUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });
    console.log(`  Status: ${res.status}, Length: ${res.body.length}`);
    if (res.body.length > 1000) {
      // Look for price in the cached page
      const ogPrice = res.body.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
      const priceInfo = [...res.body.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      console.log(`  OG Price: ${ogPrice?.[1] || 'none'}`);
      console.log(`  PriceInfo matches: ${priceInfo.length}`);
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // Test 3: Try with cookies approach - fetch the page, get the cookies, then fetch again
  console.log('\n--- Test 3: Two-phase fetch with cookies ---');
  try {
    // Phase 1: Get initial page + cookies
    console.log('  Phase 1: Getting initial cookies...');
    const res1 = await fetch(`https://www.temu.com/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const cookies = res1.headers['set-cookie'];
    console.log(`  Phase 1: Status ${res1.status}, Set-Cookie: ${cookies ? cookies.length + ' cookies' : 'none'}`);
    
    if (cookies) {
      // Phase 2: Fetch product page with cookies
      const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
      console.log(`  Phase 2: Fetching product with cookies...`);
      const res2 = await fetch(`https://www.temu.com/-g-${goodsId}.html?_x_sessn=us&currency=USD`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': cookieStr,
        },
      });
      console.log(`  Phase 2: Status ${res2.status}, Length: ${res2.body.length}`);
      
      // Check for price
      const ogPrice = res2.body.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
      const priceInfo = [...res2.body.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      const title = res2.body.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
      console.log(`  Title: ${title}`);
      console.log(`  OG Price: ${ogPrice?.[1] || 'none'}`);
      console.log(`  PriceInfo matches: ${priceInfo.length}`);
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // Test 4: Try page_reader with the share URL directly
  console.log('\n--- Test 4: Check if page_reader works with share URL ---');
  try {
    const { execSync } = await import('child_process');
    const result = execSync(
      `z-ai function -n page_reader -a '{"url": "https://share.temu.com/7d4cdBt01yB"}' -o /home/z/my-project/scripts/test-share-reader.json`,
      { timeout: 30000 }
    );
    const data = JSON.parse(await import('fs').then(f => f.readFileSync('/home/z/my-project/scripts/test-share-reader.json', 'utf-8')));
    const html = data.data?.html || '';
    console.log(`  HTML length: ${html.length}`);
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    console.log(`  Title: ${title}`);
    
    // Extract goods_id and other info from the resolved page
    const goodsIdMatches = [...html.matchAll(/goods[_-]?id["']?\s*[:=]\s*["']?(\d{10,})["']?/gi)];
    console.log(`  Goods IDs: ${[...new Set(goodsIdMatches.map(m => m[1]))].slice(0, 3).join(', ') || 'none'}`);
    
    // Check for OG tags
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    console.log(`  OG Title: ${ogTitle || 'none'}`);
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // Test 5: Try AllOrigins proxy with different URL formats
  console.log('\n--- Test 5: AllOrigins proxy ---');
  const proxyUrls = [
    `https://www.temu.com/-g-${goodsId}.html?_x_sessn=us&currency=USD`,
    `https://www.temu.com/goods.html?goods_id=${goodsId}&_x_sessn=us&currency=USD`,
  ];
  
  for (const pUrl of proxyUrls) {
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(pUrl)}`;
      console.log(`\n  Trying AllOrigins with: ${pUrl.slice(0, 80)}...`);
      const res = await fetch(proxyUrl, {
        headers: { 'Accept': 'application/json' },
      });
      console.log(`  Status: ${res.status}, Length: ${res.body.length}`);
      
      try {
        const data = JSON.parse(res.body);
        const html = data.contents || data;
        if (typeof html === 'string' && html.length > 1000) {
          const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
          const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
          const priceInfo = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
          console.log(`  Title: ${title}`);
          console.log(`  OG Price: ${ogPrice?.[1] || 'none'}`);
          console.log(`  PriceInfo: ${priceInfo.length} matches`);
          if (priceInfo.length > 0) {
            for (const pi of priceInfo.slice(0, 3)) {
              console.log(`    ${parseInt(pi[1])/100} ${pi[2]}`);
            }
          }
        }
      } catch {
        console.log(`  Failed to parse response`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }

  // Test 6: Try Item ID search
  console.log('\n--- Test 6: Item ID search approaches ---');
  const itemId = 'TV10922608';
  
  // Try searching Temu directly
  const searchUrls = [
    `https://www.temu.com/search_result.html?search_key=${itemId}`,
    `https://www.temu.com/search_result.html?search_key=TV10922608&search_type=goods`,
  ];
  
  for (const sUrl of searchUrls) {
    try {
      console.log(`\n  Searching: ${sUrl}`);
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(sUrl)}`;
      const res = await fetch(proxyUrl, {
        headers: { 'Accept': 'application/json' },
      });
      const data = JSON.parse(res.body);
      const html = data.contents || '';
      console.log(`  HTML length: ${html.length}`);
      
      if (html.length > 1000) {
        // Look for the item ID in the HTML
        const tvMatches = [...html.matchAll(/TV10922608/gi)];
        console.log(`  Item ID mentions: ${tvMatches.length}`);
        
        // Look for goods_ids
        const goodsIdMatches = [...html.matchAll(/-g-(\d{10,})/g)];
        console.log(`  Goods IDs found: ${[...new Set(goodsIdMatches.map(m => m[1]))].slice(0, 5).join(', ') || 'none'}`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('ADVANCED DIAGNOSTICS COMPLETE');
  console.log('='.repeat(80));
}

main().catch(console.error);
