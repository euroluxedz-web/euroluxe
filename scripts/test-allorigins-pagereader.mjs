import ZAI from 'z-ai-web-dev-sdk';
import { Buffer } from 'buffer';

const GOODS_ID = '601105214745191';

async function test() {
  const zai = await ZAI.create();
  
  // Strategy: Use page_reader to read the AllOrigins proxy URL
  // The proxy fetches the Temu page from its servers (different IP),
  // and page_reader reads the JSON response
  const temuUrl = `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`;
  const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(temuUrl)}`;
  
  console.log('=== Reading AllOrigins proxy via page_reader ===');
  console.log('Target:', temuUrl);
  console.log('Proxy URL:', allOriginsUrl);
  
  try {
    const result = await zai.invokeFunction('page_reader', { url: allOriginsUrl });
    const data = typeof result === 'string' ? JSON.parse(result) : result;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (!content) {
      console.log('No content');
      return;
    }
    
    console.log('Content length:', content.length);
    console.log('First 500 chars:', content.slice(0, 500));
    
    // The content might be JSON with a "contents" field
    try {
      const jsonData = JSON.parse(content);
      const html = jsonData?.contents || '';
      if (html) {
        console.log('\nHTML from JSON contents field:', html.length);
        extractPrices(html, temuUrl);
      }
    } catch {
      // Not JSON, try as HTML directly
      extractPrices(content, temuUrl);
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
  
  // Also try reading the resolved share URL via AllOrigins
  console.log('\n\n=== Reading resolved share URL via AllOrigins ===');
  const resolvedUrl = 'https://www.temu.com/dz-en/goods.html?_bg_fs=1&goods_id=601105214745191&_x_sessn=us&currency=USD';
  const allOriginsUrl2 = `https://api.allorigins.win/get?url=${encodeURIComponent(resolvedUrl)}`;
  
  try {
    const result2 = await zai.invokeFunction('page_reader', { url: allOriginsUrl2 });
    const data2 = typeof result2 === 'string' ? JSON.parse(result2) : result2;
    const content2 = data2?.data?.content || data2?.data?.text || data2?.data?.html || data2?.content || data2?.text || data2?.html;
    
    if (!content2) {
      console.log('No content');
      return;
    }
    
    console.log('Content length:', content2.length);
    
    try {
      const jsonData2 = JSON.parse(content2);
      const html2 = jsonData2?.contents || '';
      if (html2) {
        console.log('HTML from JSON:', html2.length);
        extractPrices(html2, resolvedUrl);
      }
    } catch {
      extractPrices(content2, resolvedUrl);
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}

function extractPrices(html, originalUrl) {
  // OG tags
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
  
  console.log('OG title:', ogTitle || 'none');
  console.log('OG price:', ogPrice || 'none');
  console.log('OG currency:', ogCurrency || 'none');
  console.log('OG image:', ogImage ? 'present' : 'none');
  
  // priceInfo blocks
  const pi = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
  console.log('priceInfo blocks:', pi.length);
  for (const p of pi.slice(0, 10)) {
    const priceStrMatch = p[0].match(/"priceStr"\s*:\s*"([^"]+)"/);
    console.log(`  ${p[2]} ${parseInt(p[1])/100}${priceStrMatch ? ` (priceStr: "${priceStrMatch[1]}")` : ''}`);
  }
  
  // priceInfo with priceStr
  const piStr = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"[^}]*?"priceStr"\s*:\s*"([^"]+)"/g)];
  console.log('priceInfo with priceStr:', piStr.length);
  for (const p of piStr.slice(0, 10)) {
    console.log(`  ${p[2]} ${parseInt(p[1])/100} (priceStr: "${p[3]}")`);
  }
  
  // URL hint
  try {
    const parsed = new URL(originalUrl);
    const hint = parsed.searchParams.get('_oak_rec_ext_1');
    if (hint) {
      const b64 = hint.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(b64, 'base64').toString('utf-8').trim();
      console.log('_oak_rec_ext_1:', hint, '→ decoded:', decoded);
    }
  } catch {}
  
  // minPrice/salePrice
  const priceFields = [...html.matchAll(/"(minPrice|salePrice|price|marketPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
  console.log('Price fields:', priceFields.length);
  for (const m of priceFields.slice(0, 10)) {
    console.log(`  ${m[1]}: ${m[2]}`);
  }
}

test();
