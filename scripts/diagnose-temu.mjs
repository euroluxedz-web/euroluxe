/**
 * Diagnostic script for Temu share URLs and Item IDs
 * Tests what share.temu.com actually returns and how Item IDs work
 */

import https from 'https';
import http from 'http';

// Helper: follow redirects and get final URL + HTML
function fetchWithRedirects(url, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    let currentUrl = url;
    let redirectCount = 0;
    let allResponses = [];

    function doFetch() {
      if (redirectCount >= maxRedirects) {
        reject(new Error('Too many redirects'));
        return;
      }

      const parsed = new URL(currentUrl);
      const mod = parsed.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      };

      const req = mod.request(options, (res) => {
        const location = res.headers.location;
        
        allResponses.push({
          url: currentUrl,
          status: res.statusCode,
          location: location || null,
          contentType: res.headers['content-type'] || null,
          contentLength: res.headers['content-length'] || 'unknown',
        });

        if ([301, 302, 303, 307, 308].includes(res.statusCode) && location) {
          console.log(`  [Redirect ${redirectCount + 1}] ${res.statusCode} → ${location}`);
          redirectCount++;
          // Handle relative URLs
          currentUrl = new URL(location, currentUrl).toString();
          doFetch();
        } else {
          // Final response - read the body
          let body = '';
          res.on('data', (chunk) => body += chunk);
          res.on('end', () => {
            resolve({
              finalUrl: currentUrl,
              redirectCount,
              allResponses,
              html: body,
              htmlLength: body.length,
            });
          });
        }
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    }

    doFetch();
  });
}

// Extract info from HTML
function analyzeHtml(html, url) {
  const results = {};
  
  // OG tags
  results.ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
  results.ogDescription = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
  results.ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
  results.ogUrl = html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
  
  // Meta refresh redirect
  const metaRefresh = html.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i);
  results.metaRefreshUrl = metaRefresh?.[1] || null;
  
  // JavaScript redirects
  const jsRedirects = [];
  const windowLocation = html.matchAll(/window\.location\s*=\s*["']([^"']+)["']/g);
  for (const m of windowLocation) jsRedirects.push(m[1]);
  const windowHref = html.matchAll(/window\.location\.href\s*=\s*["']([^"']+)["']/g);
  for (const m of windowHref) jsRedirects.push(m[1]);
  const locationAssign = html.matchAll(/location\.assign\s*\(\s*["']([^"']+)["']\s*\)/g);
  for (const m of locationAssign) jsRedirects.push(m[1]);
  const locationReplace = html.matchAll(/location\.replace\s*\(\s*["']([^"']+)["']\s*\)/g);
  for (const m of locationReplace) jsRedirects.push(m[1]);
  results.jsRedirects = jsRedirects;

  // Temu-specific patterns
  // goods_id in page
  const goodsIdMatches = [...html.matchAll(/goods[_-]?id["']?\s*[:=]\s*["']?(\d{10,})["']?/gi)];
  results.goodsIds = goodsIdMatches.map(m => m[1]);

  // Item ID pattern (TV prefix)
  const itemIdMatches = [...html.matchAll(/(TV\w{6,})/gi)];
  results.itemIds = [...new Set(itemIdMatches.map(m => m[1]))];

  // Price patterns
  const priceInfo = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"[^}]*?"priceStr"\s*:\s*"([^"]+)"/g)];
  results.priceInfos = priceInfo.map(m => ({ price: m[1], currency: m[2], priceStr: m[3] }));

  // product:price:amount
  const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
  results.ogPrice = ogPrice?.[1] || null;
  
  // _oak_rec_ext_1 in URL
  try {
    const parsed = new URL(url);
    results.oakRecExt = parsed.searchParams.get('_oak_rec_ext_1');
    results.topGalleryUrl = parsed.searchParams.get('top_gallery_url');
    results.shareImg = parsed.searchParams.get('share_img');
    results.goodsIdParam = parsed.searchParams.get('goods_id');
    
    // Try decoding _oak_rec_ext_1
    if (results.oakRecExt) {
      try {
        const b64 = results.oakRecExt.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(b64, 'base64').toString('utf-8').trim();
        results.oakDecoded = decoded;
        const cents = parseInt(decoded.replace(/\D/g, ''), 10);
        results.oakPriceUSD = cents / 100;
      } catch (e) {
        results.oakDecoded = 'Failed to decode: ' + e.message;
      }
    }
  } catch {}
  
  // Title
  results.htmlTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || null;

  // Check for anti-bot
  const verifyCount = (html.match(/verify/gi) || []).length;
  results.antiBotHeuristic = html.length < 450000 && verifyCount > 100;
  results.verifyCount = verifyCount;

  return results;
}

// Test Temu BG API
async function testTemuBgApi(goodsId) {
  const endpoints = [
    { url: 'https://www.temu.com/bg/goods/api', body: { goods_id: goodsId } },
    { url: 'https://www.temu.com/api/ego/product/detail', body: { goods_id: goodsId, _x_sessn: 'us' } },
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`\n  Testing BG API: ${endpoint.url} with goods_id=${goodsId}`);
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Origin': 'https://www.temu.com',
          'Referer': `https://www.temu.com/-g-${goodsId}.html`,
        },
        body: JSON.stringify(endpoint.body),
      });

      console.log(`  Status: ${response.status}`);
      const text = await response.text();
      console.log(`  Response length: ${text.length}`);
      
      try {
        const data = JSON.parse(text);
        const goods = data?.result?.goods || data?.result?.data;
        if (goods) {
          console.log(`  ✓ Product found!`);
          console.log(`    Name: ${goods.name || goods.goodsName || 'N/A'}`);
          console.log(`    minPrice: ${goods.minPrice}`);
          console.log(`    price: ${goods.price}`);
          console.log(`    marketPrice: ${goods.marketPrice}`);
          console.log(`    thumbUrl: ${goods.thumbUrl || goods.imageUrl || 'N/A'}`);
          return { success: true, endpoint: endpoint.url, goods };
        } else {
          console.log(`  No goods data in response. Keys: ${Object.keys(data || {}).join(', ')}`);
          if (data?.error_code) console.log(`  Error code: ${data.error_code}`);
          if (data?.error_msg) console.log(`  Error msg: ${data.error_msg}`);
          // Print first 500 chars of response
          console.log(`  Response preview: ${text.slice(0, 500)}`);
        }
      } catch {
        console.log(`  Non-JSON response. Preview: ${text.slice(0, 200)}`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }
  return { success: false };
}

// ─── MAIN ───
async function main() {
  console.log('='.repeat(80));
  console.log('TEMU DIAGNOSTIC SCRIPT');
  console.log('='.repeat(80));

  // Test 1: Share URL
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: Share URL Resolution');
  console.log('='.repeat(60));
  
  const shareUrl = 'https://share.temu.com/7d4cdBt01yB';
  console.log(`\nFetching: ${shareUrl}`);
  
  try {
    const result = await fetchWithRedirects(shareUrl);
    console.log(`\nFinal URL: ${result.finalUrl}`);
    console.log(`Redirect count: ${result.redirectCount}`);
    console.log(`HTML length: ${result.htmlLength}`);
    
    for (const resp of result.allResponses) {
      console.log(`  ${resp.status} ${resp.url} → ${resp.location || 'FINAL'}`);
    }
    
    if (result.htmlLength > 0) {
      const analysis = analyzeHtml(result.html, result.finalUrl);
      console.log('\nHTML Analysis:');
      console.log(`  Title: ${analysis.htmlTitle}`);
      console.log(`  OG Title: ${analysis.ogTitle}`);
      console.log(`  OG Description: ${analysis.ogDescription?.slice(0, 100)}`);
      console.log(`  OG Image: ${analysis.ogImage}`);
      console.log(`  OG URL: ${analysis.ogUrl}`);
      console.log(`  Meta Refresh: ${analysis.metaRefreshUrl}`);
      console.log(`  JS Redirects: ${analysis.jsRedirects.join(', ') || 'none'}`);
      console.log(`  Goods IDs found: ${analysis.goodsIds.join(', ') || 'none'}`);
      console.log(`  Item IDs found: ${analysis.itemIds.join(', ') || 'none'}`);
      console.log(`  Price Infos: ${JSON.stringify(analysis.priceInfos.slice(0, 3))}`);
      console.log(`  OG Price: ${analysis.ogPrice}`);
      console.log(`  Anti-bot: ${analysis.antiBotHeuristic} (verify count: ${analysis.verifyCount})`);
      
      // URL params
      console.log('\n  URL Parameters:');
      console.log(`    _oak_rec_ext_1: ${analysis.oakRecExt || 'not present'}`);
      if (analysis.oakDecoded) console.log(`    Decoded: ${analysis.oakDecoded} → $${analysis.oakPriceUSD}`);
      console.log(`    top_gallery_url: ${analysis.topGalleryUrl ? 'present' : 'not present'}`);
      console.log(`    share_img: ${analysis.shareImg ? 'present' : 'not present'}`);
      console.log(`    goods_id param: ${analysis.goodsIdParam || 'not present'}`);

      // Try BG API if we found a goods_id
      const gid = analysis.goodsIds[0] || analysis.goodsIdParam;
      if (gid) {
        await testTemuBgApi(gid);
      }
    }
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }

  // Test 2: Item ID
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: Item ID (TV10922608)');
  console.log('='.repeat(60));
  
  const itemId = 'TV10922608';
  
  // Try different URL patterns
  const itemUrlPatterns = [
    `https://www.temu.com/-g-${itemId}.html`,
    `https://www.temu.com/${itemId}.html`,
    `https://www.temu.com/search/${itemId}`,
    `https://www.temu.com/item-${itemId}.html`,
  ];
  
  for (const pattern of itemUrlPatterns) {
    console.log(`\nTrying pattern: ${pattern}`);
    try {
      const result = await fetchWithRedirects(pattern);
      console.log(`  Final URL: ${result.finalUrl}`);
      console.log(`  Redirects: ${result.redirectCount}`);
      console.log(`  HTML length: ${result.htmlLength}`);
      
      if (result.htmlLength > 0) {
        const analysis = analyzeHtml(result.html, result.finalUrl);
        console.log(`  Title: ${analysis.htmlTitle}`);
        console.log(`  OG Title: ${analysis.ogTitle}`);
        console.log(`  OG Price: ${analysis.ogPrice}`);
        console.log(`  Goods IDs: ${analysis.goodsIds.join(', ') || 'none'}`);
        console.log(`  Price Infos: ${analysis.priceInfos.length}`);
        console.log(`  Anti-bot: ${analysis.antiBotHeuristic}`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }

  // Test 3: Direct product page (known working URL format)
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Direct Temu product page (for reference)');
  console.log('='.repeat(60));

  // Let's try to use Temu search to find a product by Item ID
  console.log(`\nTrying Temu search for Item ID: ${itemId}`);
  const searchUrl = `https://www.temu.com/search_result.html?search_key=${itemId}&_x_sessn=us&currency=USD`;
  try {
    const result = await fetchWithRedirects(searchUrl);
    console.log(`  Final URL: ${result.finalUrl}`);
    console.log(`  HTML length: ${result.htmlLength}`);
    if (result.htmlLength > 0) {
      const analysis = analyzeHtml(result.html, result.finalUrl);
      console.log(`  Title: ${analysis.htmlTitle}`);
      console.log(`  Goods IDs found: ${analysis.goodsIds.slice(0, 5).join(', ') || 'none'}`);
      console.log(`  Item IDs found: ${analysis.itemIds.slice(0, 5).join(', ') || 'none'}`);
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // Test 4: Temu BG API with Item ID directly
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: Temu BG API with Item ID');
  console.log('='.repeat(60));
  await testTemuBgApi(itemId);

  console.log('\n' + '='.repeat(80));
  console.log('DIAGNOSTICS COMPLETE');
  console.log('='.repeat(80));
}

main().catch(console.error);
