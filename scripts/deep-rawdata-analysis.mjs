#!/usr/bin/env node
/**
 * Deep dive into rawData from page_reader to find where $30.00 comes from
 */

import ZAI from 'z-ai-web-dev-sdk';

async function main() {
  const zai = await ZAI.create();
  
  const goodsId = '601101613236742';
  
  // Read the dz-en page which has the most rawData
  const url = `https://www.temu.com/dz-en/goods.html?goods_id=${goodsId}`;
  console.log(`Reading: ${url}`);
  
  const result = await zai.invokeFunction('page_reader', { url });
  const data = typeof result === 'string' ? JSON.parse(result) : result;
  const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
  
  if (!content) {
    console.log('No content!');
    return;
  }
  
  console.log(`Content length: ${content.length}`);
  
  // Find ALL price-related patterns
  const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
  if (rawDataMatch) {
    const rawData = rawDataMatch[1];
    console.log(`\nrawData length: ${rawData.length}`);
    
    // Find ALL numeric price fields
    const priceFieldMatches = [...rawData.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice|priceNum|displayPrice|minAppPrice|normalPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
    console.log(`\nAll price field matches (${priceFieldMatches.length}):`);
    for (const m of priceFieldMatches) {
      console.log(`  ${m[1]}: ${m[2]}`);
    }
    
    // Find all currency fields
    const currencyMatches = [...rawData.matchAll(/"currency"\s*:\s*"([^"]+)"/g)];
    console.log(`\nAll currency fields (${currencyMatches.length}):`);
    for (const m of currencyMatches) {
      console.log(`  currency: ${m[1]}`);
    }
    
    // Find goods_id occurrences
    const goodsIdOccurrences = [...rawData.matchAll(new RegExp(goodsId, 'g'))];
    console.log(`\nGoods ID ${goodsId} found at ${goodsIdOccurrences.length} positions`);
    
    // Search for priceInfo near goods_id
    if (goodsIdOccurrences.length > 0) {
      const gidIdx = rawData.indexOf(goodsId);
      console.log(`\nFirst goods_id at index ${gidIdx}`);
      
      // Get a large window around the goods_id
      const window = rawData.slice(Math.max(0, gidIdx - 2000), Math.min(rawData.length, gidIdx + 10000));
      
      // Find all price fields in this window
      const windowPrices = [...window.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
      console.log(`\nPrice fields near goods_id (${windowPrices.length}):`);
      for (const m of windowPrices) {
        const val = parseFloat(m[2]);
        const displayVal = val > 100 ? val / 100 : val;
        console.log(`  ${m[1]}: ${m[2]} (${displayVal} if cents)`);
      }
    }
    
    // Search for the number "3000" (which could be 30.00 in cents)
    const cents3000 = [...rawData.matchAll(/"price"\s*:\s*(3000)\b/g)];
    console.log(`\nExact "price": 3000 matches: ${cents3000.length}`);
    
    // Search for the number "9000" (DZD delivery guarantee)
    const matches9000 = [...rawData.matchAll(/\b9000\b/g)];
    console.log(`Occurrences of 9000: ${matches9000.length}`);
    
    // Look for "guarantee" or "credit" related fields
    const guaranteeMatches = [...rawData.matchAll(/"(guarantee|credit|delay|shipping|delivery)"[^}]*?(\d+)/gi)];
    console.log(`\nGuarantee/credit/delay fields (${guaranteeMatches.length}):`);
    for (const m of guaranteeMatches) {
      console.log(`  ${m[1]}: ${m[2]}`);
    }
    
    // Find ALL priceInfo blocks with full context
    const priceInfoMatches = [...rawData.matchAll(/"priceInfo"\s*:\s*\{([^}]+)\}/g)];
    console.log(`\npriceInfo blocks in rawData (${priceInfoMatches.length}):`);
    for (let i = 0; i < Math.min(priceInfoMatches.length, 10); i++) {
      const block = priceInfoMatches[i][1];
      console.log(`  priceInfo[${i}]: ${block.substring(0, 200)}`);
    }
  }
  
  // Also check for OG price in HTML
  const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
  const ogCurrency = content.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
  console.log(`\nOG Price: ${ogPrice?.[1] || 'NOT FOUND'} ${ogCurrency?.[1] || ''}`);
  
  // Check for JSON-LD
  const jsonLdMatches = [...content.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  console.log(`\nJSON-LD blocks: ${jsonLdMatches.length}`);
  for (const match of jsonLdMatches) {
    try {
      const d = JSON.parse(match[1]);
      if (d.offers?.price) {
        console.log(`  JSON-LD price: ${d.offers.price} ${d.offers.priceCurrency || ''}`);
      }
    } catch {}
  }
  
  // Now try the US URL
  const usUrl = `https://www.temu.com/goods.html?goods_id=${goodsId}&_x_sessn=us&currency=USD`;
  console.log(`\n\nReading US URL: ${usUrl}`);
  
  const usResult = await zai.invokeFunction('page_reader', { url: usUrl });
  const usData = typeof usResult === 'string' ? JSON.parse(usResult) : usResult;
  const usContent = usData?.data?.content || usData?.data?.text || usData?.data?.html || usData?.content || usData?.text || usData?.html;
  
  if (usContent) {
    console.log(`US content length: ${usContent.length}`);
    
    const usRawDataMatch = usContent.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
    if (usRawDataMatch) {
      const usRawData = usRawDataMatch[1];
      console.log(`US rawData length: ${usRawData.length}`);
      
      const usPriceMatches = [...usRawData.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
      console.log(`\nUS price fields (${usPriceMatches.length}):`);
      for (const m of usPriceMatches) {
        console.log(`  ${m[1]}: ${m[2]}`);
      }
      
      const usCurrencyMatches = [...usRawData.matchAll(/"currency"\s*:\s*"([^"]+)"/g)];
      const uniqueCurrencies = [...new Set(usCurrencyMatches.map(m => m[1]))];
      console.log(`\nUS currencies: ${uniqueCurrencies.join(', ')}`);
      
      // Find priceInfo blocks
      const usPriceInfo = [...usRawData.matchAll(/"priceInfo"\s*:\s*\{([^}]+)\}/g)];
      console.log(`\nUS priceInfo blocks (${usPriceInfo.length}):`);
      for (let i = 0; i < Math.min(usPriceInfo.length, 10); i++) {
        const block = usPriceInfo[i][1];
        console.log(`  priceInfo[${i}]: ${block.substring(0, 200)}`);
      }
    }
  }
  
  // Finally, try AllOrigins on the dz-en URL to get OG price
  console.log(`\n\nTrying AllOrigins on dz-en URL...`);
  try {
    const aoUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const aoRes = await fetch(aoUrl, { signal: AbortSignal.timeout(20000) });
    const aoHtml = await aoRes.text();
    console.log(`AllOrigins HTML length: ${aoHtml.length}`);
    
    const aoOgPrice = aoHtml.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
    const aoOgCurrency = aoHtml.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
    const aoOgTitle = aoHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    
    console.log(`AO OG Title: ${aoOgTitle?.[1] || 'NOT FOUND'}`);
    console.log(`AO OG Price: ${aoOgPrice?.[1] || 'NOT FOUND'} ${aoOgCurrency?.[1] || ''}`);
    
    // Also extract priceInfo from AllOrigins HTML
    const aoPriceInfo = [...aoHtml.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
    console.log(`\nAO priceInfo blocks (${aoPriceInfo.length}):`);
    for (let i = 0; i < Math.min(aoPriceInfo.length, 10); i++) {
      const pi = aoPriceInfo[i];
      console.log(`  priceInfo[${i}]: ${parseInt(pi[1])/100} ${pi[2]}`);
    }
    
    // Check the rawData in AllOrigins HTML
    const aoRawDataMatch = aoHtml.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
    if (aoRawDataMatch) {
      const aoRawData = aoRawDataMatch[1];
      console.log(`\nAO rawData length: ${aoRawData.length}`);
      
      const aoPriceMatches = [...aoRawData.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
      console.log(`AO price fields (${aoPriceMatches.length}):`);
      for (const m of aoPriceMatches) {
        console.log(`  ${m[1]}: ${m[2]}`);
      }
    }
  } catch (err) {
    console.log(`AllOrigins error: ${err.message}`);
  }
}

main().catch(console.error);
