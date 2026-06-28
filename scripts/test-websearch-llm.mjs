import ZAI from "z-ai-web-dev-sdk";

const goodsId = "601102757183337";
const itemId = null;

console.log("=== Testing Web Search + LLM Price Extraction ===\n");

const zai = await ZAI.create();

// Step 1: Search for the product
const searchQuery = `site:temu.com ${goodsId}`;
console.log("Search query:", searchQuery);

const searchResults = await zai.invokeFunction("web_search", {
  query: searchQuery,
  num: 10,
});

console.log(`Found ${searchResults.length} results\n`);

// Display all results with full snippets
for (const r of searchResults) {
  console.log(`${r.name}`);
  console.log(`  URL: ${r.url}`);
  console.log(`  Snippet: ${r.snippet}`);
  console.log();
}

// Step 2: Use LLM to extract price from search results
const searchContext = searchResults
  .slice(0, 8)
  .map((r, i) => `${i + 1}. ${r.name || "No title"}\n   URL: ${r.url}\n   Snippet: ${r.snippet || "No snippet"}`)
  .join("\n\n");

const completion = await zai.createChatCompletion({
  messages: [
    {
      role: "system",
      content: `You are a price extraction assistant for Temu products. 
Extract the product price from the search results.

CRITICAL RULES:
1. The search results show the same product on different Temu locale pages (Bahrain, Oman, Mauritius, Slovakia, etc.)
2. Each locale shows the price in its local currency. Convert to USD:
   - OMR → USD: multiply by 2.60
   - BHD → USD: multiply by 2.65
   - MUR (Rs) → USD: multiply by 0.022
   - EUR → USD: multiply by 1.08
   - SAR → USD: multiply by 0.27
   - AED → USD: multiply by 0.27
3. Look for prices in the snippet text. They often appear as "OMR3.56", "Rs 451", "$7.01", "BHD 1.23", etc.
4. Do NOT confuse discount percentages with prices. "67% OFF" is a discount, not a price.
5. The price is the SALE price (after discount), not the original price.
6. If multiple prices are found in different currencies, use the one that seems most accurate after conversion.
7. Return ONLY a JSON object: {"price_usd": <number_in_USD>, "name": "<product_name>", "confidence": "<high|medium|low>"}
8. If you cannot find a clear price, return {"price_usd": null, "confidence": "low"}`,
    },
    {
      role: "user",
      content: `Product goods_id: ${goodsId}\nItem ID: ${itemId || "unknown"}\n\nSearch Results:\n${searchContext}\n\nExtract the product price in USD from these results. Return JSON only.`,
    },
  ],
});

const aiResponse = completion.choices?.[0]?.message?.content || "";
console.log("LLM Response:", aiResponse);

const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
if (jsonMatch) {
  const parsed = JSON.parse(jsonMatch[0]);
  console.log("\nExtracted price:", parsed.price_usd, "USD");
  console.log("Product name:", parsed.name);
  console.log("Confidence:", parsed.confidence);
}
