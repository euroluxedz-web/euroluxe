#!/usr/bin/env node
/**
 * Dump the actual rawData content to see its structure
 */

import ZAI from 'z-ai-web-dev-sdk';

async function main() {
  const zai = await ZAI.create();
  const goodsId = '601101613236742';
  
  // Try the US URL which has more rawData
  const url = `https://www.temu.com/goods.html?goods_id=${goodsId}&_x_sessn=us&currency=USD`;
  console.log(`Reading: ${url}`);
  
  const result = await zai.invokeFunction('page_reader', { url });
  const data = typeof result === 'string' ? JSON.parse(result) : result;
  const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
  
  // Find rawData
  const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
  if (rawDataMatch) {
    const rawData = rawDataMatch[1];
    console.log(`\nrawData first 3000 chars:`);
    console.log(rawData.substring(0, 3000));
    console.log(`\n...`);
    console.log(`\nrawData last 1000 chars:`);
    console.log(rawData.substring(rawData.length - 1000));
    
    // Search for goods_id
    console.log(`\n\nSearching for "${goodsId}" in rawData...`);
    const idx = rawData.indexOf(goodsId);
    if (idx >= 0) {
      console.log(`Found at index ${idx}`);
      console.log(`Context: ${rawData.substring(Math.max(0, idx - 100), idx + 200)}`);
    } else {
      console.log('NOT FOUND in rawData');
      // Try searching for partial matches
      const shortId = goodsId.substring(0, 8);
      const shortIdx = rawData.indexOf(shortId);
      if (shortIdx >= 0) {
        console.log(`Partial match "${shortId}" found at ${shortIdx}`);
        console.log(`Context: ${rawData.substring(Math.max(0, shortIdx - 100), shortIdx + 200)}`);
      }
    }
    
    // Search for "price" (case insensitive)
    console.log(`\n\nSearching for "price" occurrences...`);
    const priceRegex = /["'](\w*[Pp]rice\w*)["']\s*:\s*["']?([^"',}\s]+)/g;
    let match;
    let count = 0;
    while ((match = priceRegex.exec(rawData)) !== null && count < 20) {
      console.log(`  ${match[1]}: ${match[2]}`);
      count++;
    }
    if (count === 0) console.log('  No price fields found');
    
    // Try broader search - any number that looks like a price
    console.log(`\n\nSearching for number patterns that could be prices...`);
    // Find numbers that are > 100 (likely cents) near the word "price" or "Price"
    const nearPriceMatches = [...rawData.matchAll(/(?:price|Price)[^}]{0,200}?(\d{3,6})/g)];
    console.log(`Numbers near "price" (${nearPriceMatches.length}):`);
    for (let i = 0; i < Math.min(nearPriceMatches.length, 10); i++) {
      console.log(`  ${nearPriceMatches[i][1]} (context: ...${nearPriceMatches[i][0].substring(0, 80)}...)`);
    }
  } else {
    console.log('No rawData found!');
    
    // Search the entire content for "price" patterns
    console.log('\nSearching content for price patterns...');
    const pricePatterns = [...content.matchAll(/"(minPrice|salePrice|price|marketPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
    console.log(`Found ${pricePatterns.length} price matches in content`);
    for (const m of pricePatterns.slice(0, 10)) {
      console.log(`  ${m[1]}: ${m[2]}`);
    }
    
    // Dump first 2000 chars of content
    console.log(`\nContent first 2000 chars:`);
    console.log(content.substring(0, 2000));
  }
}

main().catch(console.error);
