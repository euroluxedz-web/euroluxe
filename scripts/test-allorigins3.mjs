const GOODS_ID = '601105214745191';

async function test() {
  const url = `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`;
  console.log('Testing AllOrigins with:', url);
  
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(20000) });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Response length:', text.length);
  console.log('First 500 chars:', text.slice(0, 500));
  
  // Try to parse
  let html = '';
  try {
    const data = JSON.parse(text);
    html = data?.contents || '';
  } catch {
    // Maybe the response is HTML directly
    html = text;
  }
  
  if (html) {
    console.log('\nHTML length:', html.length);
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
    console.log('OG title:', ogTitle || 'none');
    console.log('OG price:', ogPrice || 'none');
    console.log('OG currency:', ogCurrency || 'none');
  }
}

test();
