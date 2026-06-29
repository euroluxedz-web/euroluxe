/**
 * Test: Use direct Google search to find Temu product prices
 * This doesn't need ZAI SDK - just standard fetch
 */

async function main() {
  const goodsId = "601102757183337";
  const query = `site:temu.com ${goodsId}`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
  
  console.log(`Searching Google: ${query}`);
  
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
        Accept: "text/html",
      },
    });
    console.log(`Status: ${res.status}`);
    const html = await res.text();
    console.log(`HTML length: ${html.length}`);
    
    // Extract search results from Google HTML
    // Google wraps results in <div class="g"> or <div data-hveid>
    const results = [...html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    console.log(`\nFound ${results.length} links`);
    
    // Filter for temu.com links
    const temuLinks = results.filter(r => r[1].includes('temu.com'));
    console.log(`Temu links: ${temuLinks.length}`);
    
    for (const link of temuLinks.slice(0, 10)) {
      console.log(`  ${link[1].slice(0, 100)}`);
      // Extract text content
      const text = link[2].replace(/<[^>]+>/g, '').trim();
      console.log(`  Text: ${text.slice(0, 100)}`);
    }
    
    // Also look for price patterns in the raw HTML
    const pricePatterns = [
      /\$\s*([\d,]+(?:\.\d{1,2})?)/g,
      /OMR\s*([\d,]+(?:\.\d{1,3})?)/gi,
      /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/gi,
      /([\d,]+(?:\.\d{1,2})?)\s*Rs/gi,
      /BHD\s*([\d,]+(?:\.\d{1,3})?)/gi,
      /([\d,]+(?:\.\d{1,2})?)\s*DA/gi,
    ];
    
    console.log("\nPrice patterns found:");
    for (const pattern of pricePatterns) {
      const matches = [...html.matchAll(pattern)];
      if (matches.length > 0) {
        const unique = [...new Set(matches.map(m => m[0]))];
        console.log(`  ${pattern}: ${unique.slice(0, 5).join(', ')}`);
      }
    }
  } catch(e) {
    console.log(`Error: ${e.message}`);
  }
}

main();
