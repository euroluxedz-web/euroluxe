/**
 * Test different approaches to get price:
 * 1. Web search for the product
 * 2. Page reader on different locale pages
 * 3. LLM to extract from what we have
 */

import ZAI from "z-ai-web-dev-sdk";

async function main() {
  const zai = await ZAI.create();
  const goodsId = "601102757183337";
  const itemId = ""; // Unknown for this product

  console.log("=== Test 1: Web Search ===");
  try {
    const searchQuery = `site:temu.com ${goodsId}`;
    console.log(`Searching: ${searchQuery}`);
    const results = await zai.invokeFunction("web_search", { query: searchQuery, num: 5 });
    
    if (Array.isArray(results)) {
      for (const r of results) {
        console.log(`\n  Title: ${r.name?.slice(0, 80)}`);
        console.log(`  URL: ${r.url?.slice(0, 100)}`);
        console.log(`  Snippet: ${r.snippet?.slice(0, 200)}`);
        
        // Try to extract price from snippet
        const dollarPrice = r.snippet?.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
        const rsPrice = r.snippet?.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/);
        const omrPrice = r.snippet?.match(/OMR\s*([\d,]+(?:\.\d{1,3})?)/);
        if (dollarPrice) console.log(`  ** Found $ price: $${dollarPrice[1]}`);
        if (rsPrice) console.log(`  ** Found Rs price: Rs.${rsPrice[1]}`);
        if (omrPrice) console.log(`  ** Found OMR price: OMR ${omrPrice[1]}`);
      }
    } else {
      console.log("No results");
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  console.log("\n\n=== Test 2: Page Reader on pk-en locale ===");
  try {
    const url = `https://www.temu.com/pk-en/-g-${goodsId}.html`;
    console.log(`Reading: ${url}`);
    const pageResult = await zai.invokeFunction("page_reader", { url });
    const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    console.log(`Content length: ${content?.length || 0}`);

    if (content && content.length > 1000) {
      const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
      const ogCurrency = content.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
      const ogTitle = content.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
      console.log(`OG price: ${ogPrice?.[1] || "none"}`);
      console.log(`OG currency: ${ogCurrency?.[1] || "none"}`);
      console.log(`OG title: ${ogTitle?.[1]?.slice(0, 80) || "none"}`);

      // Search for any price pattern
      const allPrices = [...content.matchAll(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:Rs\.?|PKR|MUR|OMR|BHD)/gi)];
      if (allPrices.length > 0) {
        console.log(`\nLocal currency prices found:`);
        const unique = [...new Set(allPrices.map(m => m[0]))];
        for (const p of unique.slice(0, 20)) {
          console.log(`  ${p}`);
        }
      }

      // Check for challenge page
      const isChallenge = content.includes("verifyCode") || content.includes("challenge");
      console.log(`\nIs challenge/verify page: ${isChallenge}`);
    }
  } catch (e) {
    console.log(`Error: ${e.message?.slice(0, 200)}`);
  }

  console.log("\n\n=== Test 3: Web Search with broader query ===");
  try {
    const queries = [
      `temu -g-${goodsId} price`,
      `temu ${goodsId} price`,
      `"601102757183337" temu`,
    ];
    
    for (const q of queries) {
      console.log(`\nSearching: ${q}`);
      const results = await zai.invokeFunction("web_search", { query: q, num: 5 });
      if (Array.isArray(results) && results.length > 0) {
        for (const r of results) {
          console.log(`  ${r.name?.slice(0, 60)} | ${r.snippet?.slice(0, 150)}`);
        }
      } else {
        console.log("  No results");
      }
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

main().catch(console.error);
