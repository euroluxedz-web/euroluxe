/**
 * Test: Use page_reader + LLM to extract price from Temu pages
 * The page has challenge/verify but the LLM might still find price data
 * Also try reading different locale pages
 */

import ZAI from "z-ai-web-dev-sdk";

async function main() {
  const zai = await ZAI.create();
  const goodsId = "601102757183337";

  // Try reading the share URL directly - page_reader follows redirects
  const shareUrl = "https://share.temu.com/iEXtmO1ZX5B";
  
  console.log("=== Reading share URL via page_reader ===");
  try {
    const pageResult = await zai.invokeFunction("page_reader", { url: shareUrl });
    const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    console.log(`Content length: ${content?.length || 0}`);

    if (content && content.length > 1000) {
      // Use LLM to extract price
      console.log("\nUsing LLM to extract price...");
      const contentForLLM = content.slice(0, 60000);
      
      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: "system",
            content:
              "You are a price extraction assistant for Temu products. " +
              "You will be given HTML content from a Temu product page. " +
              "Extract the SALE PRICE of the MAIN product being viewed. " +
              "IMPORTANT RULES:\n" +
              "1. IGNORE prices from 'recommended', 'you may also like', 'similar', 'related' sections.\n" +
              "2. ONLY return the price of the product at the TOP of the page (the main product).\n" +
              "3. If you see price in DZD, convert: USD = DZD / 300. If in EUR, USD = EUR * 1.08.\n" +
              "4. IGNORE any $30.00 or 9,000 DZD price — this is delivery guarantee, NOT product price.\n" +
              "5. Look for price patterns like: \"7.01\", \"2,103 DA\", \"€6.49\", etc.\n" +
              "6. Return ONLY a JSON object: {\"price_usd\": <number>, \"price_local\": \"<amount> <currency>\", \"product_name\": \"<name>\", \"confidence\": \"<high|medium|low>\"}\n" +
              "7. If you cannot find a price, return {\"price_usd\": null, \"confidence\": \"low\"}",
          },
          {
            role: "user",
            content: `Product goods_id: ${goodsId}\n\nTemu page HTML content:\n${contentForLLM}`,
          },
        ],
      });

      const aiResponse = completion.choices?.[0]?.message?.content || "";
      console.log(`\nLLM Response:\n${aiResponse}`);
    }
  } catch (e) {
    console.log(`Error: ${e.message?.slice(0, 300)}`);
  }

  // Also try: direct search for price using web_search with product name
  console.log("\n\n=== Web Search with product name ===");
  try {
    const results = await zai.invokeFunction("web_search", {
      query: `temu "8pcs womens sunglasses" "classic fashion" price`,
      num: 5,
    });
    if (Array.isArray(results)) {
      for (const r of results) {
        console.log(`  ${r.name?.slice(0, 60)}`);
        console.log(`  ${r.snippet?.slice(0, 200)}`);
        console.log();
      }
    }
  } catch (e) {
    console.log(`Error: ${e.message?.slice(0, 200)}`);
  }

  // Try: search on bh (Bahrain) locale which sometimes shows prices in snippets
  console.log("\n\n=== Try BH locale via page_reader ===");
  try {
    const bhUrl = `https://www.temu.com/bh/8pcs-womens-glasses-classic-fashion-mixed-shape-small-frame-color-set-glasse-g-${goodsId}.html`;
    const pageResult = await zai.invokeFunction("page_reader", { url: bhUrl });
    const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    console.log(`Content length: ${content?.length || 0}`);

    if (content && content.length > 1000) {
      // Search for BHD/OMR prices
      const bhdPrices = [...content.matchAll(/([\d,]+(?:\.\d{1,3})?)\s*(?:BHD|BD|OMR|Rs\.?|MUR)/gi)];
      if (bhdPrices.length > 0) {
        const unique = [...new Set(bhdPrices.map(m => m[0]))];
        console.log(`Local currency prices:`);
        for (const p of unique.slice(0, 20)) {
          console.log(`  ${p}`);
        }
      }

      // Check OG tags
      const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
      const ogCurrency = content.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
      console.log(`OG price: ${ogPrice?.[1] || "none"}`);
      console.log(`OG currency: ${ogCurrency?.[1] || "none"}`);
    }
  } catch (e) {
    console.log(`Error: ${e.message?.slice(0, 200)}`);
  }
}

main().catch(console.error);
