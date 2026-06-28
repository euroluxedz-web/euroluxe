import ZAI from 'z-ai-web-dev-sdk';

async function test() {
  const zai = await ZAI.create();
  
  // Check available functions
  console.log('Testing ZAI web_reader function...');
  
  const urls = [
    'https://www.temu.com/-g-601105214745191.html?_x_sessn=us&currency=USD',
    'https://share.temu.com/GLv19JAELgB',
  ];
  
  for (const url of urls) {
    console.log(`\n--- Reading: ${url} ---`);
    try {
      const result = await zai.invokeFunction('web_reader', { url });
      const data = typeof result === 'string' ? JSON.parse(result) : result;
      console.log('Result keys:', Object.keys(data || {}));
      console.log('Data keys:', Object.keys(data?.data || {}));
      
      const content = data?.data?.content || data?.data?.text || data?.data?.html || 
                       data?.content || data?.text || data?.html ||
                       (typeof data === 'string' ? data : null);
      
      if (content) {
        console.log('Content length:', content.length);
        console.log('First 500 chars:', content.slice(0, 500));
        
        // Check for OG price
        const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
        const ogTitle = content.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
        console.log('OG title:', ogTitle || 'none');
        console.log('OG price:', ogPrice || 'none');
        
        // Check for priceInfo
        const pi = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
        console.log('priceInfo blocks:', pi.length);
      } else {
        console.log('No content found');
        console.log('Full result:', JSON.stringify(data).slice(0, 1000));
      }
    } catch (err) {
      console.log('Error:', err.message);
    }
  }
}

test();
