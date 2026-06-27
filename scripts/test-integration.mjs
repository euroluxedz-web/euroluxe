/**
 * Integration test for the scrape-price API
 * Tests the full flow with share URL and Item ID
 */

// We'll simulate the API call by running the route handler directly
import ZAI from 'z-ai-web-dev-sdk';

async function testWebSearchStrategy() {
  console.log('='.repeat(60));
  console.log('Testing ZAI Web Search Strategy');
  console.log('='.repeat(60));
  
  const zai = await ZAI.create();
  
  // Test 1: Share URL case (goods_id search)
  console.log('\n--- Test 1: Share URL (goods_id search) ---');
  const goodsId = '601101613236742';
  const searchQuery1 = `site:temu.com "g-${goodsId}"`;
  console.log('Search query:', searchQuery1);
  
  const results1 = await (zai).invokeFunction('web_search', {
    query: searchQuery1,
    num: 5,
  });
  
  console.log('Results:', results1.length);
  for (const r of results1) {
    console.log(`  ${r.name}: ${r.snippet?.slice(0, 150)}`);
    // Check if snippet has a price
    const priceMatch = r.snippet?.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
    const rsMatch = r.snippet?.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/);
    const omrMatch = r.snippet?.match(/OMR\s*([\d,]+(?:\.\d{1,3})?)/);
    if (priceMatch) console.log(`    → $${priceMatch[1]}`);
    if (rsMatch) console.log(`    → Rs ${rsMatch[1]}`);
    if (omrMatch) console.log(`    → OMR ${omrMatch[1]}`);
  }
  
  // Test 2: Item ID search (TV10922608)
  console.log('\n--- Test 2: Item ID (TV10922608) search ---');
  const itemId = 'TV10922608';
  const searchQuery2 = `site:temu.com "${itemId}"`;
  console.log('Search query:', searchQuery2);
  
  const results2 = await (zai).invokeFunction('web_search', {
    query: searchQuery2,
    num: 5,
  });
  
  console.log('Results:', results2.length);
  for (const r of results2) {
    console.log(`  ${r.name}: ${r.snippet?.slice(0, 150)}`);
    // Check if URL has a goods_id
    const gMatch = r.url?.match(/-g-(\d{10,})/);
    if (gMatch) console.log(`    → goods_id: ${gMatch[1]}`);
  }
  
  // If no results, try broader search
  if (results2.length === 0 || !results2.some(r => r.url?.includes('temu.com'))) {
    console.log('  No Temu results, trying broader search...');
    const broadResults = await (zai).invokeFunction('web_search', {
      query: `temu ${itemId} price`,
      num: 5,
    });
    for (const r of broadResults) {
      console.log(`  ${r.name}: ${r.snippet?.slice(0, 150)}`);
    }
  }
  
  // Test 3: Product name search (more reliable for Item IDs)
  console.log('\n--- Test 3: Product name search for Item ID ---');
  const nameQuery = `temu "TV10922608"`;
  console.log('Search query:', nameQuery);
  
  const results3 = await (zai).invokeFunction('web_search', {
    query: nameQuery,
    num: 5,
  });
  
  console.log('Results:', results3.length);
  for (const r of results3) {
    console.log(`  ${r.name}: ${r.snippet?.slice(0, 150)}`);
  }
  
  // Test 4: LLM price extraction
  console.log('\n--- Test 4: LLM price extraction ---');
  const searchContext = results1
    .slice(0, 5)
    .map((r, i) => `${i + 1}. ${r.name || "No title"}\n   URL: ${r.url}\n   Snippet: ${r.snippet || "No snippet"}`)
    .join('\n\n');
  
  const completion = await zai.createChatCompletion({
    messages: [
      {
        role: 'system',
        content:
          'You are a price extraction assistant for Temu products. Extract the product price from the search results. ' +
          'Return ONLY a JSON object with: {"price_usd": <number_in_USD>, "name": "<product_name>", "confidence": <high|medium|low>}. ' +
          'If the price is in a non-USD currency, CONVERT it to USD. ' +
          'Common conversions: MUR→USD ÷47, OMR→USD ×2.60, BHD→USD ×2.65, PKR→USD ÷278. ' +
          'If you cannot find a clear price, return {"price_usd": null, "name": "<best_guess_name>", "confidence": "low"}. ' +
          'ALWAYS return valid JSON.',
      },
      {
        role: 'user',
        content:
          `Product goods_id: ${goodsId}\nItem ID: ${itemId}\n\n` +
          `Search Results:\n${searchContext}\n\n` +
          `Extract the product price in USD. Return JSON only.`,
      },
    ],
  });
  
  const aiResponse = completion.choices?.[0]?.message?.content || '';
  console.log('LLM Response:', aiResponse);
  
  // Parse
  const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('Parsed:', JSON.stringify(parsed, null, 2));
    } catch {
      console.log('Failed to parse JSON');
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Tests Complete');
  console.log('='.repeat(60));
}

testWebSearchStrategy().catch(e => console.log('Error:', e.message));
