// Simulate the exact API flow for share URL to identify which strategy returns $30.00
import ZAI from 'z-ai-web-dev-sdk';
import { Buffer } from 'buffer';

const CURRENCY_TO_USD = {
  USD: 1, EUR: 1.08, GBP: 1.27, MUR: 0.022, OMR: 2.60, BHD: 2.65,
  PKR: 0.0036, INR: 0.012, SAR: 0.27, AED: 0.27, KWD: 3.26, QAR: 0.27,
  EGP: 0.021, JOD: 1.41, MAD: 0.10, TND: 0.32, DZD: 0.0075,
  CNY: 0.14, JPY: 0.0067, KRW: 0.00074, PHP: 0.017, BRL: 0.18,
  MXN: 0.059, TRY: 0.030, ZAR: 0.055, AUD: 0.66, CAD: 0.74,
  NZD: 0.61, SGD: 0.74, HKD: 0.13, TWD: 0.031, THB: 0.029,
};

const SHARE_URL = 'https://share.temu.com/GLv19JAELgB';

async function simulate() {
  console.log('=== Simulating API flow for:', SHARE_URL, '===\n');

  // Step 1: Resolve share URL
  let finalUrl = SHARE_URL;
  let goodsId = '';
  let shareImage = null;
  let originalShareUrl = SHARE_URL;
  let shareUrlPriceUSD = null;
  let shareUrlPriceSource = '';
  let resolvedShareUrl = null;

  try {
    const res = await fetch(SHARE_URL, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    const resolvedUrl = res.url || '';
    const html = await res.text();
    console.log('[Share URL] Resolved to:', resolvedUrl);
    console.log('[Share URL] HTML length:', html.length);

    if (resolvedUrl && resolvedUrl !== SHARE_URL) {
      resolvedShareUrl = resolvedUrl;
      finalUrl = resolvedUrl;
    }

    const resolved = new URL(finalUrl);

    // Extract image
    const topGallery = resolved.searchParams.get('top_gallery_url');
    if (topGallery) shareImage = topGallery;
    console.log('[Share URL] Image found:', !!shareImage);

    // Extract goods_id
    const gMatch = resolved.pathname.match(/-g-([a-zA-Z0-9]+)/);
    if (gMatch) {
      goodsId = gMatch[1];
    } else {
      const gidParam = resolved.searchParams.get('goods_id');
      if (gidParam) goodsId = gidParam;
    }
    console.log('[Share URL] goods_id:', goodsId);

    // Extract _oak_rec_ext_1
    const hint = resolved.searchParams.get('_oak_rec_ext_1');
    if (hint) {
      console.log('[Share URL] _oak_rec_ext_1 found:', hint);
      const b64 = hint.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(b64, 'base64').toString('utf-8').trim();
      const cents = parseInt(decoded.replace(/\D/g, ''), 10);
      if (cents > 0) {
        const localPrice = cents / 100;
        const localeMatch = resolved.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);
        const locale = localeMatch ? localeMatch[1].toLowerCase() : '';
        const LOCALE_TO_CURRENCY = { 'dz-en': 'DZD', 'dz-fr': 'DZD', 'dz-ar': 'DZD', dz: 'DZD' };
        const localCurrency = LOCALE_TO_CURRENCY[locale] || 'USD';
        if (localCurrency === 'USD') {
          shareUrlPriceUSD = localPrice;
        } else {
          const rate = CURRENCY_TO_USD[localCurrency];
          if (rate) shareUrlPriceUSD = Math.round(localPrice * rate * 100) / 100;
        }
        if (shareUrlPriceUSD && shareUrlPriceUSD >= 0.01 && shareUrlPriceUSD < 100000) {
          shareUrlPriceSource = `share-url-${localCurrency}`;
          console.log('[Share URL] Price from _oak_rec_ext_1:', localPrice, localCurrency, '=', '$' + shareUrlPriceUSD);
        } else {
          shareUrlPriceUSD = null;
        }
      }
    } else {
      console.log('[Share URL] _oak_rec_ext_1: NOT FOUND');
    }

    // Reconstruct URL
    if (goodsId) {
      finalUrl = `https://www.temu.com/-g-${goodsId}.html?_x_sessn=us&currency=USD`;
    }
    console.log('[Share URL] Reconstructed URL:', finalUrl);
  } catch (err) {
    console.log('[Share URL] Error:', err.message);
  }

  // Strategy -1: Pre-extracted price from share URL
  console.log('\n=== Strategy -1: Pre-extracted share URL price ===');
  if (shareUrlPriceUSD && shareUrlPriceUSD > 0) {
    console.log(`✓ Using pre-extracted price: $${shareUrlPriceUSD} (${shareUrlPriceSource})`);
    console.log('THIS WOULD BE RETURNED! Price = $' + shareUrlPriceUSD);
    return;
  } else {
    console.log('No pre-extracted price available');
  }

  // Strategy 0: URL params
  console.log('\n=== Strategy 0: URL params ===');
  try {
    const parsed = new URL(finalUrl);
    const hint = parsed.searchParams.get('_oak_rec_ext_1');
    if (hint) {
      const b64 = hint.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(b64, 'base64').toString('utf-8').trim();
      const cents = parseInt(decoded.replace(/\D/g, ''), 10);
      if (cents > 0) {
        console.log(`✓ Got price $${cents/100} from URL hint`);
        console.log('THIS WOULD BE RETURNED! Price = $' + cents/100);
        return;
      }
    }
    console.log('No _oak_rec_ext_1 in reconstructed URL');
  } catch { /* skip */ }

  // Strategy 0-C: Page Reader + LLM
  console.log('\n=== Strategy 0-C: Page Reader + LLM ===');
  try {
    const zai = await ZAI.create();
    const readUrls = [];
    if (originalShareUrl) readUrls.push({ url: originalShareUrl, label: 'share-url' });
    if (resolvedShareUrl && resolvedShareUrl !== originalShareUrl) readUrls.push({ url: resolvedShareUrl, label: 'resolved-share-url' });
    if (goodsId && /^\d{10,}$/.test(goodsId)) {
      readUrls.push({ url: `https://www.temu.com/-g-${goodsId}.html?_x_sessn=us&currency=USD`, label: 'us-product-page' });
      readUrls.push({ url: `https://www.temu.com/goods.html?goods_id=${goodsId}&_x_sessn=us&currency=USD`, label: 'goods-api-us' });
    }

    for (const { url, label } of readUrls) {
      console.log(`  Reading ${label}: ${url}`);
      try {
        const result = await zai.invokeFunction('page_reader', { url });
        const data = typeof result === 'string' ? JSON.parse(result) : result;
        const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;

        if (!content || content.length < 1000) {
          console.log(`  No content for ${label}`);
          continue;
        }

        console.log(`  Content length: ${content.length}`);

        // Check page title
        const pageTitle = content.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
        console.log(`  Page title: ${pageTitle || 'none'}`);

        // Quick price scan
        const dollarPrices = [...content.replace(/<[^>]*>/g, ' ').matchAll(/\$\s*([\d,.]+)/g)].map(m => m[1]);
        const uniqueDollar = [...new Set(dollarPrices)];
        console.log(`  Dollar prices in text: ${uniqueDollar.slice(0, 20).join(', ')}`);

        // Check for priceInfo
        const pi = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
        console.log(`  priceInfo blocks: ${pi.length}`);
        for (const p of pi.slice(0, 10)) {
          console.log(`    ${p[2]} ${parseInt(p[1])/100}`);
        }

        // Check for rawData
        const rawData = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
        if (rawData) {
          console.log(`  rawData found, length: ${rawData[1].length}`);
          // Search for price near goods_id
          if (goodsId && rawData[1].includes(goodsId)) {
            const gidIdx = rawData[1].indexOf(goodsId);
            const window = rawData[1].slice(Math.max(0, gidIdx - 2000), Math.min(rawData[1].length, gidIdx + 10000));
            const priceMatches = [...window.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice|priceNum|displayPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
            for (const m of priceMatches) {
              console.log(`    ${m[1]}: ${m[2]}`);
            }
          }
        }

        // Try LLM extraction on a small sample
        console.log(`  Using LLM to extract price from ${label}...`);
        const contentForLLM = content.slice(0, 60000);
        const completion = await zai.createChatCompletion({
          messages: [
            {
              role: 'system',
              content: 'You are a price extraction assistant for Temu products. Extract the SALE PRICE of the MAIN product. Return ONLY JSON: {"price_usd": <number>, "confidence": "high|medium|low"}. If no price found, return {"price_usd": null, "confidence": "low"}.'
            },
            {
              role: 'user',
              content: `Product goods_id: ${goodsId || 'unknown'}\n\nTemu page HTML:\n${contentForLLM}`
            }
          ]
        });
        const aiResponse = completion.choices?.[0]?.message?.content || '';
        console.log(`  LLM response: ${aiResponse.slice(0, 300)}`);
        const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.price_usd && parsed.price_usd > 0) {
              console.log(`  ✓ LLM found price: $${parsed.price_usd} (confidence: ${parsed.confidence})`);
              console.log(`  THIS WOULD BE RETURNED! Price = $${parsed.price_usd}`);
              return;
            }
          } catch { /* skip */ }
        }
      } catch (err) {
        console.log(`  Error reading ${label}: ${err.message}`);
      }
    }
  } catch (err) {
    console.log('Page Reader error:', err.message);
  }

  // Strategy 0-AI: Web Search
  console.log('\n=== Strategy 0-AI: Web Search ===');
  try {
    const zai = await ZAI.create();
    const searchQuery = goodsId ? `site:temu.com "g-${goodsId}"` : `temu ${SHARE_URL.replace(/https?:\/\//, '')} price`;
    console.log(`  Searching: ${searchQuery}`);
    const results = await zai.invokeFunction('web_search', { query: searchQuery, num: 5 });

    if (Array.isArray(results) && results.length > 0) {
      for (const r of results) {
        console.log(`  Result: ${r.name}`);
        console.log(`    URL: ${r.url}`);
        console.log(`    Snippet: ${r.snippet || 'No snippet'}`);

        // Check snippet for price
        if (r.snippet) {
          const dollarMatch = r.snippet.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
          if (dollarMatch) {
            console.log(`    ✓ Found $ price in snippet: ${dollarMatch[0]}`);
          }
        }
      }

      // Try LLM on search results
      console.log('\n  Using LLM on search results...');
      const searchContext = results.slice(0, 5).map((r, i) =>
        `${i + 1}. ${r.name || 'No title'}\n   URL: ${r.url}\n   Snippet: ${r.snippet || 'No snippet'}`
      ).join('\n\n');

      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: 'system',
            content: 'You are a price extraction assistant for Temu products. Extract the product price from search results. Return ONLY JSON: {"price_usd": <number>, "confidence": "high|medium|low"}. If no clear price, return {"price_usd": null}. Do NOT guess.'
          },
          {
            role: 'user',
            content: `Product goods_id: ${goodsId || 'unknown'}\n\nSearch Results:\n${searchContext}\n\nExtract the price in USD. Return JSON only.`
          }
        ]
      });
      const aiResponse = completion.choices?.[0]?.message?.content || '';
      console.log(`  LLM response: ${aiResponse.slice(0, 300)}`);
      const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.price_usd && parsed.price_usd > 0) {
            console.log(`  ✓ Web Search LLM found price: $${parsed.price_usd} (confidence: ${parsed.confidence})`);
            console.log(`  THIS WOULD BE RETURNED! Price = $${parsed.price_usd}`);
            return;
          }
        } catch { /* skip */ }
      }
    } else {
      console.log('  No search results');
    }
  } catch (err) {
    console.log('Web Search error:', err.message);
  }

  console.log('\n=== All strategies exhausted ===');
}

simulate();
