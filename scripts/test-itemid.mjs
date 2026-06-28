import ZAI from "z-ai-web-dev-sdk";

const itemId = "TV10922608"; // Example Item ID

console.log(`=== Testing Item ID: ${itemId} ===\n`);

const zai = await ZAI.create();

// Search for the Item ID
const searchQueries = [
  `temu "${itemId}" price`,
  `site:temu.com ${itemId}`,
];

const allResults = [];
const seenUrls = new Set();

for (const query of searchQueries) {
  console.log(`Searching: ${query}`);
  try {
    const results = await zai.invokeFunction("web_search", {
      query,
      num: 5,
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
for (const r of allResults) {
  console.log(`  ${r.name?.slice(0, 60)}`);
  console.log(`  URL: ${r.url?.slice(0, 80)}`);
  console.log(`  Snippet: ${r.snippet?.slice(0, 150)}`);
  console.log();
}

// Try to find goods_id from search results
let foundGoodsId = null;
for (const r of allResults) {
  const gMatch = r.url.match(/-g-(\d{10,})/);
  if (gMatch) {
    foundGoodsId = gMatch[1];
    console.log(`Found goods_id: ${foundGoodsId} from URL`);
    break;
  }
}

// If we found a goods_id, search for the price
if (foundGoodsId) {
  console.log(`\nNow searching for price with goods_id: ${foundGoodsId}`);
  const priceResults = await zai.invokeFunction("web_search", {
    query: `site:temu.com ${foundGoodsId}`,
    num: 5,
  });
  
  if (Array.isArray(priceResults)) {
    const searchContext = [...allResults, ...priceResults]
      .slice(0, 8)
      .map((r, i) => `${i + 1}. ${r.name}\n   URL: ${r.url}\n   Snippet: ${r.snippet}`)
      .join("\n\n");
    
    const completion = await zai.createChatCompletion({
      messages: [
        {
          role: "system",
          content: "You are a price extraction assistant for Temu products. Extract the SALE PRICE from the search results. Convert to USD (OMR×2.60, BHD×2.65, MUR×0.022, SAR×0.27, AED×0.27, EUR×1.08). NEVER return $30.00. Return JSON: {\"price_usd\": <number>, \"name\": \"<name>\", \"goods_id\": \"<id>\", \"confidence\": \"<high|medium|low>\"}",
        },
        {
          role: "user",
          content: `Item ID: ${itemId}\nGoods ID: ${foundGoodsId}\n\nSearch Results:\n${searchContext}\n\nExtract price in USD. Return JSON only.`,
        },
      ],
    });
    
    const response = completion.choices?.[0]?.message?.content || "";
    console.log("LLM Response:", response);
  }
} else {
  console.log("No goods_id found from search results");
}
