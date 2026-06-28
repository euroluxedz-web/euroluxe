// Quick test - just the US product page
const GOODS_ID = '601105214745191';

async function test() {
  const url = `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`;
  console.log('Testing AllOrigins with:', url);
  
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(20000) });
  const data = await res.json();
  const html = data?.contents || '';
  console.log('HTML length:', html.length);
  
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
  
  console.log('OG title:', ogTitle || 'none');
  console.log('OG price:', ogPrice || 'none');
  console.log('OG currency:', ogCurrency || 'none');
  console.log('OG image:', ogImage ? 'present' : 'none');
  
  // priceInfo with priceStr
  const pi = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"[^}]*?"priceStr"\s*:\s*"([^"]+)"/g)];
  console.log('priceInfo with priceStr:', pi.length);
  for (const p of pi.slice(0, 10)) {
    console.log(`  ${p[2]} ${parseInt(p[1])/100} (priceStr: "${p[3]}")`);
  }
  
  // All priceInfo
  const piAll = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
  console.log('All priceInfo:', piAll.length);
  for (const p of piAll.slice(0, 15)) {
    console.log(`  ${p[2]} ${parseInt(p[1])/100} (${p[1]} cents)`);
  }
}

test();
