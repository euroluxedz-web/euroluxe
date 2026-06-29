/**
 * More precise test: Use web search + LLM to extract accurate price
 * Also test Item ID support
 */

import ZAI from "z-ai-web-dev-sdk";

async function main() {
  const zai = await ZAI.create();

  // Test 1: Search + LLM for goods_id 601105214745191 (8pcs sunglasses)
  console.log("=== Test 1: Search + LLM for goods_id 601105214745191 ===");
  try {
    const searchResults = await zai.invokeFunction("web_search", {
      query: `site:temu.com 601105214745191`,
      num: 10,
    });

    if (Array.isArray(searchResults) && searchResults.length > 0) {
      // Build context from all results
      const context = searchResults
        .slice(0, 8)
        .map((r, i) => `${i + 1}. ${r.name || "No title"}\n   URL: ${r.url}\n   Snippet: ${r.snippet || "No snippet"}`)
        .join("\n\n");

      console.log("Search results:\n" + context.slice(0, 1500));

      // Use LLM to extract the right price
      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: "system",
            content:
              'You are a price extraction assistant for Temu products. ' +
              'Find the price of the product with goods_id 601105214745191 from these search results. ' +
              'IGNORE prices from unrelated products. Only use prices from Temu pages that match this goods_id. ' +
              'Common currency conversions: OMR→USD ×2.60, BHD→USD ×2.65, PKR→USD ÷278, MUR→USD ÷47, EUR→USD ×1.08, DZD→USD ÷300. ' +
              'IGNORE $30.00 or 9,000 DZD — that is a delivery guarantee amount. ' +
              'Return ONLY JSON: {"price_usd": <number>, "original_price": "<amount> <currency>", "product_name": "<name>", "confidence": "<high|medium|low>"}',
          },
          {
            role: "user",
            content: `Search results:\n${context}`,
          },
        ],
      });

      const aiResponse = completion.choices?.[0]?.message?.content || "";
      console.log(`\nLLM Response: ${aiResponse}`);
    }
  } catch (e) {
    console.log(`Error: ${e.message?.slice(0, 200)}`);
  }

  // Test 2: Item ID support - search for "TV10922608"
  console.log("\n\n=== Test 2: Item ID TV10922608 ===");
  try {
    const itemId = "TV10922608";
    
    // Search for the Item ID
    const searchResults = await zai.invokeFunction("web_search", {
      query: `temu "${itemId}"`,
      num: 10,
    });

    if (Array.isArray(searchResults) && searchResults.length > 0) {
      const context = searchResults
        .slice(0, 8)
        .map((r, i) => `${i + 1}. ${r.name || "No title"}\n   URL: ${r.url}\n   Snippet: ${r.snippet || "No snippet"}`)
        .join("\n\n");

      console.log("Search results:\n" + context.slice(0, 1500));

      // Use LLM to extract
      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: "system",
            content:
              'You are a price extraction assistant for Temu products. ' +
              'Find the price of the product with Item ID TV10922608 from these search results. ' +
              'Common currency conversions: OMR→USD ×2.60, BHD→USD ×2.65, PKR→USD ÷278, MUR→USD ÷47, EUR→USD ×1.08, DZD→USD ÷300. ' +
              'IGNORE $30.00 or 9,000 DZD — that is a delivery guarantee amount. ' +
              'Return ONLY JSON: {"price_usd": <number>, "original_price": "<amount> <currency>", "product_name": "<name>", "goods_id": "<id>", "confidence": "<high|medium|low>"}',
          },
          {
            role: "user",
            content: `Search results:\n${context}`,
          },
        ],
      });

      const aiResponse = completion.choices?.[0]?.message?.content || "";
      console.log(`\nLLM Response: ${aiResponse}`);
    } else {
      console.log("No search results found for Item ID");
      
      // Try broader search
      const broadResults = await zai.invokeFunction("web_search", {
        query: `temu TV10922608 price`,
        num: 5,
      });
      if (Array.isArray(broadResults)) {
        for (const r of broadResults) {
          console.log(`  ${r.name?.slice(0, 60)}: ${r.snippet?.slice(0, 100)}`);
        }
      }
    }
  } catch (e) {
    console.log(`Error: ${e.message?.slice(0, 200)}`);
  }

  // Test 3: Direct search for pk-en page with price in snippet
  console.log("\n\n=== Test 3: Search pk-en locale for price ===");
  try {
    const goodsId = "601105214745191";
    const results = await zai.invokeFunction("web_search", {
      query: `site:temu.com/pk-en ${goodsId}`,
      num: 5,
    });

    if (Array.isArray(results)) {
      for (const r of results) {
        console.log(`  ${r.name?.slice(0, 60)}`);
        console.log(`  Snippet: ${r.snippet?.slice(0, 200)}`);
        
        // Try to extract Rs. price
        const rsPrices = [...(r.snippet || "").matchAll(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/gi)];
        for (const m of rsPrices) {
          const pkrPrice = parseFloat(m[1].replace(/,/g, ""));
          const usd = pkrPrice / 278;
          console.log(`  ** PKR ${m[1]} = $${usd.toFixed(2)} USD`);
        }
        
        // Also try "519 Rs" pattern
        const rsPattern2 = [...(r.snippet || "").matchAll(/([\d,]+(?:\.\d{1,2})?)\s*Rs/gi)];
        for (const m of rsPattern2) {
          const pkrPrice = parseFloat(m[1].replace(/,/g, ""));
          const usd = pkrPrice / 278;
          console.log(`  ** ${m[1]} Rs = $${usd.toFixed(2)} USD`);
        }
        console.log();
      }
    }
  } catch (e) {
    console.log(`Error: ${e.message?.slice(0, 200)}`);
  }
}

main().catch(console.error);
