// Run the scrape-price logic directly to trace which strategy returns what

// Simulate the full API handler logic with console tracing
import { Buffer } from 'buffer';
import ZAI from 'z-ai-web-dev-sdk';

const CURRENCY_TO_USD = {
  USD: 1, EUR: 1.08, GBP: 1.27, DZD: 0.0075, MUR: 0.022, OMR: 2.60,
  BHD: 2.65, PKR: 0.0036, INR: 0.012, SAR: 0.27, AED: 0.27,
};

const url = 'https://share.temu.com/GLv19JAELgB';

function extractProductInfo(html, originalUrl) {
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
  const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
  const ogUrl = html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;

  let price = null;
  let currency = 'USD';
  let priceSource = '';

  // 2-preferred: URL hint
  try {
    const parsedUrl = new URL(originalUrl);
    const hint = parsedUrl.searchParams.get('_oak_rec_ext_1');
    if (hint) {
      const b64 = hint.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(b64, 'base64').toString('utf-8').trim();
      const cents = parseInt(decoded.replace(/\D/g, ''), 10);
      if (cents > 0 && cents < 10000000) {
        price = cents / 100;
        currency = 'USD';
        priceSource = 'url-hint';
      }
    }
  } catch {}

  // 2b: OG product:price:amount
  if (!price && ogPrice) {
    const p = parseFloat(ogPrice);
    if (p > 0) {
      price = p;
      currency = ogCurrency || 'USD';
      priceSource = 'og-meta';
    }
  }

  // 2d: Embedded JSON price fields
  if (!price) {
    const fields = ['salePrice', 'minPrice', 'minAppPrice', 'appPrice', 'displayPrice', 'normalPrice'];
    const found = [];
    for (const f of fields) {
      const re = new RegExp(`"${f}"\\s*:\\s*"?([\\d.]+)"?`, 'g');
      for (const m of html.matchAll(re)) {
        const v = parseFloat(m[1]);
        if (v > 0 && v < 100000) found.push({ value: v, field: f });
      }
    }
    if (found.length > 0) {
      found.sort((a, b) => a.value - b.value);
      const best = found[0];
      price = best.value > 100 ? best.value / 100 : best.value;
      priceSource = `embedded-${best.field}`;
    }
  }

  // 2e: Dollar/£/€ text
  if (!price) {
    const text = html.replace(/<[^>]*>/g, ' ');
    const matches = [...text.matchAll(/[£€$]\s*(\d{1,4}(?:[.,]\d{1,2})?)/g)];
    const prices = [];
    for (const m of matches) {
      const raw = m[1].replace(/,/g, '');
      const v = parseFloat(raw);
      if (v > 1.5 && v < 5000) {
        const cur = m[0].includes('£') ? 'GBP' : m[0].includes('€') ? 'EUR' : 'USD';
        prices.push({ value: v, currency: cur });
      }
    }
    if (prices.length > 0) {
      const sorted = prices.sort((a, b) => a.value - b.value);
      const filtered = sorted.filter(p => !(p.value < 20 && p.value === Math.floor(p.value)));
      if (filtered.length > 0) {
        price = filtered[0].value;
        currency = filtered[0].currency;
        priceSource = 'text';
      }
    }
  }

  return {
    price,
    currency,
    productName: ogTitle?.replace(/\s*[-|]\s*Temu\s*$/i, '').trim() || null,
    image: ogImage,
    source: priceSource || (ogTitle ? 'og-only' : 'none'),
  };
}

async function main() {
  console.log('=== Running full API flow ===\n');

  // Step 1: Resolve share URL
  let finalUrl = url;
  let goodsId = '';
  let shareImage = null;
  let originalShareUrl = url;
  let shareUrlPriceUSD = null;
  let shareHtmlBody = null;
  let resolvedShareUrl = null;

  const res1 = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  const resolvedUrl = res1.url || '';
  shareHtmlBody = await res1.text();
  console.log('Share URL resolved to:', resolvedUrl);
  console.log('HTML body length:', shareHtmlBody.length);

  if (resolvedUrl && resolvedUrl !== url) {
    resolvedShareUrl = resolvedUrl;
    finalUrl = resolvedUrl;
  }

  const resolved = new URL(finalUrl);
  shareImage = resolved.searchParams.get('top_gallery_url') || resolved.searchParams.get('share_img');
  
  const gMatch = resolved.pathname.match(/-g-([a-zA-Z0-9]+)/);
  if (gMatch) goodsId = gMatch[1];
  else {
    const gidParam = resolved.searchParams.get('goods_id');
    if (gidParam) goodsId = gidParam;
  }
  console.log('goods_id:', goodsId);
  console.log('shareImage:', !!shareImage);

  // Check _oak_rec_ext_1
  const hint = resolved.searchParams.get('_oak_rec_ext_1');
  console.log('_oak_rec_ext_1:', hint || 'NOT FOUND');

  // Reconstruct URL
  if (goodsId) {
    finalUrl = `https://www.temu.com/-g-${goodsId}.html?_x_sessn=us&currency=USD`;
  }
  console.log('Reconstructed URL:', finalUrl);

  // Strategy -1: Pre-extracted price
  if (shareUrlPriceUSD && shareUrlPriceUSD > 0) {
    console.log('\n✓ Strategy -1: Using pre-extracted price: $' + shareUrlPriceUSD);
    return;
  }
  console.log('\nStrategy -1: No pre-extracted price');

  // Strategy 0: URL params
  try {
    const parsed = new URL(finalUrl);
    const urlHint = parsed.searchParams.get('_oak_rec_ext_1');
    if (urlHint) {
      console.log('Strategy 0: Found _oak_rec_ext_1 in reconstructed URL');
    }
  } catch {}
  console.log('Strategy 0: No URL hint in reconstructed URL');

  // Strategy 0-C: Page Reader (SKIP - we know it gets blocked)

  // Strategy 0-AI: Web Search (SKIP - we know snippets have no prices)

  // Strategy 0b: BG API
  console.log('\n=== Strategy 0b: BG API ===');
  try {
    const bgRes = await fetch('https://www.temu.com/bg/goods/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json',
        Origin: 'https://www.temu.com',
        Referer: `https://www.temu.com/-g-${goodsId}.html`,
      },
      body: JSON.stringify({ goods_id: goodsId }),
    });
    const bgText = await bgRes.text();
    console.log('BG API status:', bgRes.status);
    console.log('BG API response length:', bgText.length);
    if (bgText.length < 5000) {
      console.log('BG API response:', bgText.slice(0, 500));
    }
    // Check if it's JSON
    try {
      const bgData = JSON.parse(bgText);
      const goods = bgData?.result?.goods;
      if (goods) {
        console.log('BG API goods found! minPrice:', goods.minPrice, 'price:', goods.price, 'name:', goods.name);
      }
    } catch {
      console.log('BG API: Not JSON (anti-bot page)');
    }
  } catch (err) {
    console.log('BG API error:', err.message);
  }

  // Strategy 1: Direct fetch
  console.log('\n=== Strategy 1: Direct fetch ===');
  try {
    const directRes = await fetch(finalUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const directHtml = await directRes.text();
    console.log('Direct fetch status:', directRes.status);
    console.log('Direct fetch HTML length:', directHtml.length);
    const directResult = extractProductInfo(directHtml, finalUrl);
    console.log('extractProductInfo result:', JSON.stringify(directResult));
  } catch (err) {
    console.log('Direct fetch error:', err.message);
  }

  // Strategy 2: AllOrigins
  console.log('\n=== Strategy 2: AllOrigins ===');
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(finalUrl)}`;
    const aoRes = await fetch(proxyUrl, { signal: AbortSignal.timeout(25000) });
    console.log('AllOrigins status:', aoRes.status);
    if (aoRes.ok) {
      const aoData = await aoRes.json();
      const aoHtml = aoData?.contents || '';
      console.log('AllOrigins HTML length:', aoHtml.length);
      const aoResult = extractProductInfo(aoHtml, finalUrl);
      console.log('extractProductInfo result:', JSON.stringify(aoResult));
    } else {
      console.log('AllOrigins failed');
    }
  } catch (err) {
    console.log('AllOrigins error:', err.message);
  }

  // Strategy 3: CorsProxy
  console.log('\n=== Strategy 3: CorsProxy ===');
  try {
    const cpUrl = `https://corsproxy.io/?url=${encodeURIComponent(finalUrl)}`;
    const cpRes = await fetch(cpUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    console.log('CorsProxy status:', cpRes.status);
    if (cpRes.ok) {
      const cpHtml = await cpRes.text();
      console.log('CorsProxy HTML length:', cpHtml.length);
      const cpResult = extractProductInfo(cpHtml, finalUrl);
      console.log('extractProductInfo result:', JSON.stringify(cpResult));
    }
  } catch (err) {
    console.log('CorsProxy error:', err.message);
  }

  console.log('\n=== DONE ===');
}

main();
