// Test the new fetchPriceWithLLMDirect strategy directly
import ZAI from "z-ai-web-dev-sdk";

const goodsId = "601102757183337";
const shareUrl = "https://share.temu.com/iEXtmO1ZX5B";

console.log("=== Testing New Strategy: LLM Direct Price Query ===\n");

const zai = await ZAI.create();

// Step 1: Web search to find the product with prices
const searchQueries = [
  `site:temu.com ${goodsId}`,
  `temu 8pcs sunglasses "67% OFF"`,
];

const allResults = [];
const seenUrls = new Set();

for (const query of searchQueries) {
  console.log(`Searching: ${query}`);
  try {
    const results = await zai.invokeFunction("web_search", {
      query,
      num: 8,
    });

    if (Array.isArray(results)) {
      for (const r of results) {
        if (r.url && !seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push({
            name: r.name || "",
            url: r.url,
            snippet: r.snippet || "",
          });
        }
      }
    }
  } catch (err) {
    console.log(`Search error:`, err.message);
  }
}

console.log(`\nCollected ${allResults.length} search results`);

// Step 2: Extract prices from snippets
console.log("\n--- Extracting prices from snippets ---");
for (const result of allResults) {
  const isTemuUrl = result.url?.includes("temu.com");
  
  // Check for explicit currency patterns
  const patterns = [
    { regex: /\$\s*([\d,]+(?:\.\d{1,2})?)/g, currency: "USD", rate: 1 },
    { regex: /OMR\s*([\d,]+(?:\.\d{1,3})?)/g, currency: "OMR", rate: 2.60 },
    { regex: /BHD\s*([\d,]+(?:\.\d{1,3})?)/g, currency: "BHD", rate: 2.65 },
    { regex: /SAR\s*([\d,]+(?:\.\d{1,2})?)/g, currency: "SAR", rate: 0.27 },
    { regex: /AED\s*([\d,]+(?:\.\d{1,2})?)/g, currency: "AED", rate: 0.27 },
    { regex: /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/g, currency: "MUR", rate: 0.022 },
  ];

  for (const { regex, currency, rate } of patterns) {
    const matches = [...result.snippet.matchAll(regex)];
    for (const m of matches) {
      const localPrice = parseFloat(m[1].replace(/,/g, ""));
      const usdPrice = Math.round(localPrice * rate * 100) / 100;
      console.log(`  ${m[0]} = $${usdPrice} USD (from ${result.url.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//)?.[1] || "unknown"} locale)`);
    }
  }
}

// Step 3: Use LLM to extract price
console.log("\n--- Using LLM to extract price ---");
const searchContext = allResults
  .slice(0, 8)
  .map((r, i) => `${i + 1}. ${r.name}\n   URL: ${r.url}\n   Snippet: ${r.snippet}`)
  .join("\n\n");

const completion = await zai.createChatCompletion({
  messages: [
    {
      role: "system",
      content:
        "You are a price extraction assistant for Temu products. " +
        "You will be given web search results for a Temu product. " +
        "Extract the SALE PRICE of the product from the search results.\n\n" +
        "IMPORTANT RULES:\n" +
        "1. The search results show the same product on different Temu locale pages.\n" +
        "2. Each locale shows the price in its local currency. Convert to USD:\n" +
        "   - OMR → USD: ×2.60, BHD → USD: ×2.65, MUR (Rs) → USD: ×0.022\n" +
        "   - SAR → USD: ×0.27, AED → USD: ×0.27, EUR → USD: ×1.08\n" +
        "3. Look for prices in snippet text like: OMR3.56, Rs 451, $7.01\n" +
        "4. The price shown is the SALE price (after discount).\n" +
        "5. Do NOT confuse discount percentages or sold counts with the price.\n" +
        "6. ⚠️ NEVER return $30.00 — this is a delivery guarantee amount.\n" +
        "7. Return ONLY JSON: {\"price_usd\": <number>, \"name\": \"<product_name>\", \"confidence\": \"<high|medium|low>\"}",
    },
    {
      role: "user",
      content:
        `Product goods_id: ${goodsId}\n\nSearch Results:\n${searchContext}\n\nExtract the product price in USD. Return JSON only.`,
    },
  ],
});

const aiResponse = completion.choices?.[0]?.message?.content || "";
console.log("LLM Response:", aiResponse);

const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
if (jsonMatch) {
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    console.log("\n=== RESULT ===");
    console.log(`Price: $${parsed.price_usd} USD`);
    console.log(`Product: ${parsed.name}`);
    console.log(`Confidence: ${parsed.confidence}`);
    console.log(`Price in DZD (×300): ${parsed.price_usd * 300} DA`);
  } catch {}
}

