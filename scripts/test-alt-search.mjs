/**
 * Test: Use DuckDuckGo HTML search (no API key needed)
 * Also test SerpAPI, Bing, and other free search options
 */

async function testDuckDuckGo() {
  const goodsId = "601102757183337";
  const query = `site:temu.com ${goodsId}`;
  
  // DuckDuckGo HTML version
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  
  console.log("Testing DuckDuckGo...");
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });
    console.log(`Status: ${res.status}`);
    const html = await res.text();
    console.log(`HTML length: ${html.length}`);
    
    // Look for temu.com URLs
    const temuUrls = [...html.matchAll(/https?:\/\/[^"'\s]+temu\.com[^"'\s]+/gi)];
    console.log(`Temu URLs found: ${temuUrls.length}`);
    for (const u of temuUrls.slice(0, 5)) {
      console.log(`  ${u[0].slice(0, 100)}`);
    }
    
    // Look for prices
    const prices = [...html.matchAll(/([\d,]+(?:\.\d{1,2})?)\s*(?:Rs|OMR|BHD|DA|\$|€)/gi)];
    if (prices.length > 0) {
      const unique = [...new Set(prices.map(m => m[0]))];
      console.log(`\nPrices found:`);
      for (const p of unique.slice(0, 10)) {
        console.log(`  ${p}`);
      }
    }
    
    // Check for result snippets
    const snippets = [...html.matchAll(/class=["']result__snippet["'][^>]*>([\s\S]*?)<\/a>/gi)];
    if (snippets.length > 0) {
      console.log(`\nSnippets:`);
      for (const s of snippets.slice(0, 3)) {
        console.log(`  ${s[1].replace(/<[^>]+>/g, '').trim().slice(0, 200)}`);
      }
    }
  } catch(e) {
    console.log(`Error: ${e.message}`);
  }
}

async function testBing() {
  const goodsId = "601102757183337";
  const query = `site:temu.com ${goodsId}`;
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10`;
  
  console.log("\n\nTesting Bing...");
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });
    console.log(`Status: ${res.status}`);
    const html = await res.text();
    console.log(`HTML length: ${html.length}`);
    
    // Look for temu.com URLs
    const temuUrls = [...html.matchAll(/https?:\/\/[^"'\s<>]+temu\.com[^"'\s<>]+/gi)];
    console.log(`Temu URLs found: ${temuUrls.length}`);
    
    // Look for prices in snippet text
    const pricePatterns = [
      /\$\s*([\d,]+(?:\.\d{1,2})?)/g,
      /OMR\s*([\d,]+(?:\.\d{1,3})?)/gi,
      /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    ];
    
    for (const pattern of pricePatterns) {
      const matches = [...html.matchAll(pattern)];
      if (matches.length > 0) {
        const unique = [...new Set(matches.map(m => m[0]))];
        console.log(`Prices (${pattern}): ${unique.slice(0, 5).join(', ')}`);
      }
    }
  } catch(e) {
    console.log(`Error: ${e.message}`);
  }
}

async function main() {
  await testDuckDuckGo();
  await testBing();
}

main();
