// Test: Search for the product price on the web (not just Temu)
import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601102757183337";
const PRODUCT_NAME = "8pcs womens sunglasses classic fashion mixed shape small frame";

async function testWebPriceSearch() {
  console.log("=== Testing Web Price Search ===\n");
  const zai = await ZAI.create();

  // Test 1: Search for the product with price on different sites
  const queries = [
    `"8pcs womens sunglasses" temu price`,
    `temu 601102757183337 price`,
    `8pcs womens sunglasses temu $`,
    `site:temu.com "8pcs womens sunglasses" price sunglasses`,
  ];

  for (const query of queries) {
    console.log(`\n--- Searching: ${query} ---`);
    try {
      const results = await zai.invokeFunction("web_search", {
        query: query,
        num: 5,
      });

      if (Array.isArray(results)) {
        for (const r of results) {
          if (r.snippet && (r.snippet.includes("$") || r.snippet.includes("DA") || r.snippet.includes("DZD") || r.snippet.includes("price") || r.snippet.includes("€"))) {
            console.log(`  ★ ${r.name}`);
            console.log(`    URL: ${r.url}`);
            console.log(`    Snippet: ${r.snippet}`);
          } else {
            console.log(`  ${r.name?.slice(0, 50)}`);
            console.log(`    Snippet: ${r.snippet?.slice(0, 100)}`);
          }
        }
      }
    } catch (err) {
      console.log(`  Error: ${err.message?.slice(0, 100)}`);
    }
  }

  // Test 2: Use LLM with search results to find the price
  console.log("\n\n=== LLM with Web Search ===");
  try {
    const results = await zai.invokeFunction("web_search", {
      query: `"8pcs womens sunglasses" temu`,
      num: 10,
    });

    if (Array.isArray(results) && results.length > 0) {
      const searchContext = results
        .filter(r => r.url?.includes("temu.com"))
        .slice(0, 5)
        .map((r, i) => `${i + 1}. ${r.name}\n   URL: ${r.url}\n   Snippet: ${r.snippet}`)
        .join("\n\n");

      console.log(`Search context:\n${searchContext}\n`);

      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: "system",
            content:
              "You are a price extraction assistant. " +
              "I'm looking for the price of a specific product on Temu. " +
              "The product is: 8pcs Women's Sunglasses Classic Fashion Mixed Shape Small Frame (goods_id: 601102757183337). " +
              "This is a cheap fashion accessory - the price should be between $1-$15 USD. " +
              "If you find a Temu page URL, note the locale prefix (e.g., /om-en/ = Oman, /bh/ = Bahrain) " +
              "and estimate the price based on what similar products cost. " +
              "Return JSON: {\"price_usd\": <estimated_number>, \"confidence\": \"<high|medium|low>\", \"reasoning\": \"<why>\"}"
          },
          {
            role: "user",
            content: `Search results for this Temu product:\n\n${searchContext}`,
          },
        ],
      });

      const aiResponse = completion.choices?.[0]?.message?.content || "";
      console.log(`LLM response: ${aiResponse}`);
    }
  } catch (err) {
    console.log(`Error: ${err.message?.slice(0, 200)}`);
  }

  // Test 3: Try reading the Temu product page with different URL format
  // The key insight: try reading the localized goods.html page that the share URL redirects to
  console.log("\n\n=== Test: Reading localized goods.html page ===");
  try {
    const dzUrl = `https://www.temu.com/dz-en/goods.html?_bg_fs=1&goods_id=${GOODS_ID}&locale_override=4~en~USD`;
    console.log(`Reading: ${dzUrl}`);
    const pageResult = await zai.invokeFunction("page_reader", {
      url: dzUrl,
    });

    const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;

    if (content) {
      console.log(`Content length: ${content.length}`);
      
      // Check for all prices
      const text = content.replace(/<[^>]*>/g, " ");
      const dollarMatches = [...text.matchAll(/\$\s*(\d{1,5}(?:\.\d{1,2})?)/g)];
      const prices = [...new Set(dollarMatches.map(m => `$${m[1]}`))];
      console.log(`Dollar prices: ${prices.join(", ") || "none"}`);

      // Search for DZD/DA
      const daMatches = [...text.matchAll(/([\d,]+)\s*(?:DA|DZD)/gi)];
      console.log(`DA amounts: ${daMatches.map(m => `${m[1]} DA`).join(", ") || "none"}`);

      // rawData
      const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      if (rawDataMatch) {
        console.log(`rawData length: ${rawDataMatch[1].length}`);
        const rawData = rawDataMatch[1];
        
        // Search for any price-related fields
        const allPriceMatches = [...rawData.matchAll(/"(minPrice|salePrice|price|marketPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
        if (allPriceMatches.length > 0) {
          console.log(`Price fields in rawData:`);
          for (const m of allPriceMatches) {
            console.log(`  ${m[1]}: ${m[2]}`);
          }
        }
      }
      
      // Use LLM
      console.log(`\nUsing LLM on dz-en goods.html page...`);
      const contentForLLM = content.slice(0, 40000);
      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: "system",
            content:
              "You are a price extraction assistant for Temu products. " +
              "Find the SALE PRICE of the product on this page. " +
              "IMPORTANT: The page is from Temu Algeria (dz-en locale). " +
              "Prices might be shown in DZD (Algerian Dinar) or USD. " +
              "IGNORE the $30.00 / 9,000 DA delivery guarantee amount. " +
              "The real product price is likely between $1-$15 USD (300-4,500 DA). " +
              "Return JSON: {\"price_usd\": <number>, \"price_local\": \"<amount> <currency>\", \"confidence\": \"<high|medium|low>\"}"
          },
          {
            role: "user",
            content: `Product: 8pcs Women's Sunglasses (goods_id: ${GOODS_ID})\n\nPage:\n${contentForLLM}`,
          },
        ],
      });
      console.log(`LLM: ${completion.choices?.[0]?.message?.content || "no response"}`);
    } else {
      console.log(`No content returned`);
    }
  } catch (err) {
    console.log(`Error: ${err.message?.slice(0, 200)}`);
  }
}

testWebPriceSearch();
