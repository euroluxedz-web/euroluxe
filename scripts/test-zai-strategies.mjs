#!/usr/bin/env node
/**
 * Test the ZAI SDK tools (web_search, page_reader) to see what prices they find
 * for the products from share.temu.com URLs
 */

import ZAI from 'z-ai-web-dev-sdk';

const TEST_PRODUCTS = [
  { goodsId: '601101613236742', expectedPrice: '~$7', shareUrl: 'https://share.temu.com/7d4cdBt01yB' },
  { goodsId: '601105214745191', expectedPrice: '~$7.01', shareUrl: 'https://share.temu.com/t0mQUcAlkoB' },
  { goodsId: '601102757183337', expectedPrice: 'unknown', shareUrl: 'https://share.temu.com/iEXtmO1ZX5B' },
];

const CURRENCY_TO_USD = {
  USD: 1, EUR: 1.08, DZD: 0.0075, OMR: 2.60, BHD: 2.65, SAR: 0.27, AED: 0.27,
  MUR: 0.022, PKR: 0.0036, MAD: 0.10, TND: 0.32, KWD: 3.26, QAR: 0.27,
  JOD: 1.41, EGP: 0.021, INR: 0.012, GBP: 1.27,
};

async function testWebSearch(zai, goodsId) {
  console.log(`\n--- Web Search for goods_id: ${goodsId} ---`);
  
  const queries = [
    `site:temu.com ${goodsId}`,
    `temu ${goodsId} price`,
  ];
  
  for (const query of queries) {
    console.log(`\nSearch: "${query}"`);
    try {
      const results = await zai.invokeFunction('web_search', { query, num: 5 });
      if (!Array.isArray(results) || results.length === 0) {
        console.log('  No results');
        continue;
      }
      
      for (const r of results) {
        console.log(`  [${r.url?.substring(0, 80)}]`);
        console.log(`    Name: ${r.name || 'N/A'}`);
        console.log(`    Snippet: ${(r.snippet || 'N/A').substring(0, 200)}`);
        
        // Try to extract prices from snippet
        const pricePatterns = [
          /\$\s*([\d,]+(?:\.\d{1,2})?)/g,
          /DZD\s*([\d,]+(?:\.\d{1,2})?)/g,
          /([\d,]+(?:\.\d{1,2})?)\s*DA\b/g,
          /OMR\s*([\d,]+(?:\.\d{1,3})?)/g,
          /BHD\s*([\d,]+(?:\.\d{1,3})?)/g,
          /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/g,
        ];
        
        for (const pattern of pricePatterns) {
          const matches = [...(r.snippet || '').matchAll(pattern)];
          for (const m of matches) {
            const price = parseFloat(m[1].replace(/,/g, ''));
            const currency = m[0].includes('$') ? 'USD' : m[0].includes('DA') || m[0].includes('DZD') ? 'DZD' : 
                            m[0].includes('OMR') ? 'OMR' : m[0].includes('BHD') ? 'BHD' : 'MUR';
            const rate = CURRENCY_TO_USD[currency] || 1;
            const usd = Math.round(price * rate * 100) / 100;
            console.log(`    💰 Found price: ${m[0]} → ${usd} USD`);
          }
        }
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }
}

async function testPageReader(zai, goodsId) {
  console.log(`\n--- Page Reader for goods_id: ${goodsId} ---`);
  
  const urls = [
    `https://www.temu.com/-g-${goodsId}.html?_x_sessn=us&currency=USD`,
    `https://www.temu.com/dz-en/goods.html?goods_id=${goodsId}`,
    `https://www.temu.com/goods.html?goods_id=${goodsId}&_x_sessn=us&currency=USD`,
  ];
  
  for (const url of urls) {
    console.log(`\nReading: ${url.substring(0, 80)}...`);
    try {
      const result = await zai.invokeFunction('page_reader', { url });
      const data = typeof result === 'string' ? JSON.parse(result) : result;
      const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
      
      if (!content || content.length < 1000) {
        console.log(`  Content too short: ${content?.length || 0} chars`);
        continue;
      }
      
      console.log(`  Content length: ${content.length} chars`);
      
      // Check for OG tags
      const ogTitle = content.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogCurrency = content.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
      
      console.log(`  OG Title: ${ogTitle || 'N/A'}`);
      console.log(`  OG Price: ${ogPrice || 'N/A'} ${ogCurrency || ''}`);
      
      // Check for priceInfo blocks
      const priceInfoMatches = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      if (priceInfoMatches.length > 0) {
        console.log(`  Found ${priceInfoMatches.length} priceInfo blocks:`);
        for (let i = 0; i < Math.min(priceInfoMatches.length, 8); i++) {
          const pi = priceInfoMatches[i];
          const cents = parseInt(pi[1]);
          const currency = pi[2];
          const value = cents / 100;
          const priceStrMatch = pi[0].match(/"priceStr"\s*:\s*"([^"]+)"/);
          const marketPriceMatch = pi[0].match(/"marketPrice"\s*:\s*(\d+)/);
          console.log(`    priceInfo[${i}]: ${cents} cents = ${value} ${currency}${priceStrMatch ? ` (priceStr: ${priceStrMatch[1]})` : ''}${marketPriceMatch ? ` (market: ${parseInt(marketPriceMatch[1])/100})` : ''}`);
        }
      }
      
      // Check for rawData price fields
      const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      if (rawDataMatch) {
        console.log(`  Found window.rawData (${rawDataMatch[1].length} chars)`);
        
        // Search for ALL price fields
        const allPriceMatches = [...rawDataMatch[1].matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
        const priceMap = {};
        for (const m of allPriceMatches) {
          if (!priceMap[m[1]]) priceMap[m[1]] = [];
          priceMap[m[1]].push(m[2]);
        }
        for (const [field, values] of Object.entries(priceMap)) {
          console.log(`    ${field}: ${values.join(', ')}`);
        }
        
        // Check currency
        const currencyMatch = rawDataMatch[1].match(/"currency"\s*:\s*"([^"]+)"/g);
        if (currencyMatch) {
          console.log(`    Currencies found: ${currencyMatch.join(', ')}`);
        }
      }
      
      // Search for "30.00" or "9000" patterns
      const suspicious = content.match(/30\.00/g);
      const da9000 = content.match(/9[\s,.]*000/g);
      console.log(`  Occurrences of "30.00": ${suspicious?.length || 0}`);
      console.log(`  Occurrences of "9,000": ${da9000?.length || 0}`);
      
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }
}

async function testAllOrigins(goodsId) {
  console.log(`\n--- AllOrigins for goods_id: ${goodsId} ---`);
  
  const urls = [
    `https://www.temu.com/-g-${goodsId}.html?_x_sessn=us&currency=USD`,
    `https://www.temu.com/dz-en/goods.html?goods_id=${goodsId}`,
    `https://www.temu.com/goods.html?goods_id=${goodsId}&_x_sessn=us&currency=USD`,
  ];
  
  for (const url of urls) {
    console.log(`\nFetching via AllOrigins: ${url.substring(0, 80)}...`);
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        console.log(`  HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      console.log(`  HTML length: ${html.length}`);
      
      if (html.length < 5000) {
        console.log(`  Too short, skipping`);
        continue;
      }
      
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
      
      console.log(`  OG Title: ${ogTitle || 'N/A'}`);
      console.log(`  OG Price: ${ogPrice || 'N/A'} ${ogCurrency || ''}`);
      
      // Check for priceInfo blocks
      const priceInfoMatches = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      if (priceInfoMatches.length > 0) {
        console.log(`  Found ${priceInfoMatches.length} priceInfo blocks:`);
        for (let i = 0; i < Math.min(priceInfoMatches.length, 8); i++) {
          const pi = priceInfoMatches[i];
          const cents = parseInt(pi[1]);
          const currency = pi[2];
          console.log(`    priceInfo[${i}]: ${cents/100} ${currency}`);
        }
      }
      
      // Check for 30.00
      const suspicious = html.match(/30\.00/g);
      console.log(`  Occurrences of "30.00": ${suspicious?.length || 0}`);
      
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }
}

async function main() {
  const zai = await ZAI.create();
  
  // Test with the first product (the one we know should be ~$7)
  const product = TEST_PRODUCTS[0];
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing product: goods_id=${product.goodsId}, expected=${product.expectedPrice}`);
  console.log('='.repeat(80));
  
  await testWebSearch(zai, product.goodsId);
  await testPageReader(zai, product.goodsId);
  await testAllOrigins(product.goodsId);
  
  // Also test with the second product
  const product2 = TEST_PRODUCTS[1];
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing product: goods_id=${product2.goodsId}, expected=${product2.expectedPrice}`);
  console.log('='.repeat(80));
  
  await testWebSearch(zai, product2.goodsId);
  await testAllOrigins(product2.goodsId);
}

main().catch(console.error);
