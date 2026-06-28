// Test more targeted ZAI strategies
import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601102757183337";
const PRODUCT_NAME = "8pcs womens sunglasses classic fashion mixed shape small frame";

async function testTargetedSearch() {
  console.log("=== Testing Targeted ZAI Strategies ===\n");
  const zai = await ZAI.create();

  // Test 1: Search with product name + price
  console.log("--- Test 1: Search with product name ---");
  try {
    const results = await zai.invokeFunction("web_search", {
      query: `"8pcs womens sunglasses" temu price`,
      num: 5,
    });
    if (Array.isArray(results)) {
      for (const r of results) {
        console.log(`  Name: ${r.name}`);
        console.log(`  URL: ${r.url}`);
        console.log(`  Snippet: ${r.snippet}`);
        console.log(`  ---`);
      }
    }
  } catch (err) {
    console.error("Error:", err.message?.slice(0, 100));
  }

  // Test 2: Search on different Temu locales that might show price
  console.log("\n--- Test 2: Search with goods_id on different locales ---");
  try {
    const results = await zai.invokeFunction("web_search", {
      query: `temu 601102757183337 sunglasses price`,
      num: 5,
    });
    if (Array.isArray(results)) {
      for (const r of results) {
        console.log(`  Name: ${r.name}`);
        console.log(`  URL: ${r.url}`);
        console.log(`  Snippet: ${r.snippet}`);
        console.log(`  ---`);
      }
    }
  } catch (err) {
    console.error("Error:", err.message?.slice(0, 100));
  }

  // Test 3: Read the Bahrain locale page (found in search results)
  console.log("\n--- Test 3: Page Reader - Bahrain locale ---");
  try {
    const bhUrl = `https://www.temu.com/bh/8pcs-womens-glasses-classic-fashion-mixed-shape-small-frame-color-set-glasses-minimalist-casual-fashion-trendy-decorative--additions-lightweight-glasses-durable-pc-material-unisex-eyewear-suitable-for--camping-beach-g-${GOODS_ID}.html`;
    console.log(`Reading: ${bhUrl.slice(0, 80)}...`);
    const pageResult = await zai.invokeFunction("page_reader", {
      url: bhUrl,
    });
    
    const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (content) {
      console.log(`Content length: ${content.length}`);
      
      // Search for prices
      const text = content.replace(/<[^>]*>/g, " ");
      const dollarMatches = [...text.matchAll(/\$\s*(\d{1,4}(?:\.\d{1,2})?)/g)];
      console.log(`Dollar prices: ${[...new Set(dollarMatches.map(m => m[1]))].join(", ") || "none"}`);
      
      // Search for BHD prices
      const bhdMatches = [...text.matchAll(/BHD\s*(\d{1,4}(?:\.\d{1,3})?)/g)];
      console.log(`BHD prices: ${[...new Set(bhdMatches.map(m => m[1]))].join(", ") || "none"}`);
      
      // Search for priceInfo
      const priceInfoMatches = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      console.log(`priceInfo blocks: ${priceInfoMatches.length}`);
      for (let i = 0; i < Math.min(priceInfoMatches.length, 10); i++) {
        const cents = parseInt(priceInfoMatches[i][1]);
        const cur = priceInfoMatches[i][2];
        console.log(`  ${i + 1}. ${cents / 100} ${cur} (raw: ${cents})`);
      }
      
      // Search for rawData
      const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      if (rawDataMatch) {
        console.log(`window.rawData found! Length: ${rawDataMatch[1].length}`);
        const rawData = rawDataMatch[1];
        
        if (rawData.includes(GOODS_ID)) {
          const gidIdx = rawData.indexOf(GOODS_ID);
          const searchWindow = rawData.slice(Math.max(0, gidIdx - 500), Math.min(rawData.length, gidIdx + 5000));
          
          const priceFields = ["minPrice", "salePrice", "price", "marketPrice", "origPrice", "appPrice"];
          for (const field of priceFields) {
            const re = new RegExp(`"${field}"\\s*:\\s*"?([\\d.]+)"?`, "g");
            const matches = [...searchWindow.matchAll(re)];
            if (matches.length > 0) {
              console.log(`  ${field} near goods_id: ${matches.map(m => m[1]).join(", ")}`);
            }
          }
        } else {
          console.log(`  goods_id NOT found in rawData`);
          // Try broader search
          const priceFields = ["minPrice", "salePrice", "price", "marketPrice"];
          for (const field of priceFields) {
            const re = new RegExp(`"${field}"\\s*:\\s*"?([\\d.]+)"?`, "g");
            const matches = [...rawData.matchAll(re)];
            if (matches.length > 0) {
              console.log(`  ${field} (broad): ${matches.slice(0, 5).map(m => m[1]).join(", ")}`);
            }
          }
        }
      }
    } else {
      console.log(`No content returned`);
    }
  } catch (err) {
    console.error("Error:", err.message?.slice(0, 200));
  }

  // Test 4: Read US product page and look at actual content
  console.log("\n--- Test 4: Page Reader - US page, examine content ---");
  try {
    const usUrl = `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`;
    console.log(`Reading: ${usUrl}`);
    const pageResult = await zai.invokeFunction("page_reader", {
      url: usUrl,
    });
    
    const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (content) {
      console.log(`Content length: ${content.length}`);
      
      // Look for ALL price-related patterns
      const text = content.replace(/<[^>]*>/g, " ");
      
      // Find all dollar amounts
      const dollarMatches = [...text.matchAll(/\$\s*(\d{1,5}(?:\.\d{1,2})?)/g)];
      const priceCount = {};
      for (const m of dollarMatches) {
        const val = m[1];
        priceCount[val] = (priceCount[val] || 0) + 1;
      }
      console.log(`All dollar prices (with counts):`);
      for (const [price, count] of Object.entries(priceCount).sort((a, b) => parseInt(b[1]) - parseInt(a[1]))) {
        console.log(`  $${price} (x${count})`);
      }
      
      // Look for "delivery guarantee" or "delay credit" text
      const deliveryMatch = text.match(/deliver.{0,30}guarant.{0,30}\$/i);
      const delayMatch = text.match(/delay.{0,30}credit.{0,30}\$/i);
      const couponMatch = text.match(/coupon.{0,30}\$/i);
      console.log(`\nDelivery guarantee text: ${deliveryMatch?.[0]?.slice(0, 100) || "NOT FOUND"}`);
      console.log(`Delay credit text: ${delayMatch?.[0]?.slice(0, 100) || "NOT FOUND"}`);
      console.log(`Coupon text: ${couponMatch?.[0]?.slice(0, 100) || "NOT FOUND"}`);
      
      // Look for "30" near price keywords
      const thirtyMatch = text.match(/(?:price|cost|total|amount).{0,30}30/i);
      console.log(`Price near 30: ${thirtyMatch?.[0]?.slice(0, 100) || "NOT FOUND"}`);
      
      // Find rawData
      const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      if (rawDataMatch) {
        console.log(`\nwindow.rawData length: ${rawDataMatch[1].length}`);
        console.log(`rawData preview: ${rawDataMatch[1].slice(0, 300)}`);
      }
      
      // Look for any JSON-like price data
      const jsonPriceMatches = [...content.matchAll(/"(?:minPrice|salePrice|price|marketPrice)"\s*:\s*"?(\d+\.?\d*)"?/g)];
      if (jsonPriceMatches.length > 0) {
        console.log(`\nJSON price fields found:`);
        for (const m of jsonPriceMatches.slice(0, 10)) {
          console.log(`  ${m[0]}`);
        }
      }
      
      // Save content for manual inspection
      const fs = await import("fs");
      fs.writeFileSync("/home/z/my-project/download/us-page-content.txt", text.slice(0, 50000));
      console.log(`\nSaved text content to /home/z/my-project/download/us-page-content.txt`);
    }
  } catch (err) {
    console.error("Error:", err.message?.slice(0, 200));
  }

  // Test 5: Use LLM with more context
  console.log("\n--- Test 5: LLM with comprehensive search ---");
  try {
    // First, search for the product with price
    const searchResults = await zai.invokeFunction("web_search", {
      query: `site:temu.com "8pcs womens sunglasses" price`,
      num: 5,
    });
    
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      const searchContext = searchResults
        .slice(0, 3)
        .map((r, i) => `${i + 1}. ${r.name}\n   URL: ${r.url}\n   Snippet: ${r.snippet}`)
        .join("\n\n");
      
      console.log(`Search context:\n${searchContext}`);
      
      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: "system",
            content: "You are a price extraction assistant for Temu products. " +
              "Extract the product price from the search results. " +
              "IMPORTANT: The product price is likely between $1-$20 USD. " +
              "IGNORE any $30.00 price - that's a delivery guarantee, not the product price. " +
              "Return JSON: {\"price_usd\": <number>, \"confidence\": \"<high|medium|low>\"}"
          },
          {
            role: "user",
            content: `Product: 8pcs Women's Sunglasses (goods_id: ${GOODS_ID})\n\nSearch Results:\n${searchContext}`,
          },
        ],
      });
      
      const aiResponse = completion.choices?.[0]?.message?.content || "";
      console.log(`\nLLM response: ${aiResponse}`);
    }
  } catch (err) {
    console.error("Error:", err.message?.slice(0, 200));
  }
}

testTargetedSearch();
