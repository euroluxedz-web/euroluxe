import ZAI from "z-ai-web-dev-sdk";

const goodsId = "601102757183337";

console.log("=== Final Search Strategy Test ===\n");

const zai = await ZAI.create();

// Try various search queries to find the price
const queries = [
  `temu.com 601102757183337`,
  `temu "8pcs" "sunglasses" OMR price`,
  `temu 8pcs sunglasses "67% OFF"`,
  `temu 8pcs womens sunglasses price buy`,
  `site:temu.com/om-en 8pcs sunglasses`,
  `site:temu.com/bh 8pcs sunglasses`,
];

for (const q of queries) {
  console.log(`\n--- Query: ${q} ---`);
  try {
    const results = await zai.invokeFunction("web_search", {
      query: q,
      num: 5,
    });
    
    if (Array.isArray(results)) {
      for (const r of results) {
        // Check if snippet has price-like patterns
        const hasPrice = r.snippet?.match(/(?:OMR|BHD|SAR|AED|Rs|EUR|\$)\s*[\d,.]+/i);
        const priceStr = hasPrice ? hasPrice[0] : "NO PRICE";
        console.log(`  [${priceStr}] ${r.name?.slice(0, 40)}`);
        if (hasPrice) {
          console.log(`    FULL SNIPPET: ${r.snippet?.slice(0, 300)}`);
        }
      }
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
}

// Also try reading the Temu search page for this product
console.log("\n\n=== Page Reader on Temu Search Page ===");
const searchUrl = `https://www.temu.com/search?q=${goodsId}`;
console.log("URL:", searchUrl);

try {
  const pageResult = await zai.invokeFunction("page_reader", {
    url: searchUrl,
  });
  
  const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
  const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
  
  if (content) {
    console.log("Content length:", content.length);
    
    // Strip HTML and search for prices
    const text = content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
    
    // Search for dollar amounts
    const dollars = [...text.matchAll(/\$\s*(\d{1,3}\.?\d{0,2})/g)];
    const uniqueDollars = {};
    for (const m of dollars) {
      const val = parseFloat(m[1]);
      if (val >= 1 && val <= 100) {
        uniqueDollars[m[0]] = (uniqueDollars[m[0]] || 0) + 1;
      }
    }
    console.log("Dollar amounts in search page:");
    for (const [p, c] of Object.entries(uniqueDollars).sort((a,b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`  ${c}x: ${p}`);
    }
    
    // Search for the specific product name
    const productMatch = text.match(/8pcs.{0,50}sunglasses/i);
    console.log("\nProduct match:", productMatch?.[0]?.slice(0, 80) || "NOT FOUND");
    
    // Show first 1000 chars
    console.log("\nFirst 1000 chars:", text.slice(0, 1000));
  }
} catch (err) {
  console.log("Error:", err.message);
}

// Finally, try using the ZAI LLM with web search capability
console.log("\n\n=== ZAI LLM with Direct Price Query ===");
try {
  const completion = await zai.createChatCompletion({
    messages: [
      {
        role: "system",
        content: "You are a product price finder. Find the current price of the specified product on Temu. Return ONLY a JSON object with the price in USD.",
      },
      {
        role: "user",
        content: `What is the current price of this Temu product in USD? 
Product: 8pcs womens sunglasses classic fashion mixed shape small frame UV400
Temu goods_id: ${goodsId}
Temu URL: https://www.temu.com/-g-${goodsId}.html

Search the web for this product's price. Return JSON: {"price_usd": <number>, "source": "<where you found it>", "confidence": "<high|medium|low>"}`,
      },
    ],
  });
  
  const response = completion.choices?.[0]?.message?.content || "";
  console.log("LLM response:", response);
} catch (err) {
  console.log("LLM error:", err.message);
}
