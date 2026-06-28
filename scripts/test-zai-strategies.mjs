// Test ZAI SDK strategies for share.temu.com price extraction
import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601102757183337";

async function testZAI() {
  console.log("=== Testing ZAI SDK Strategies ===\n");
  const zai = await ZAI.create();

  // Test 1: Web Search for the product
  console.log("--- Test 1: Web Search ---");
  try {
    const searchQuery = `site:temu.com ${GOODS_ID} price`;
    console.log(`Searching: ${searchQuery}`);
    const searchResults = await zai.invokeFunction("web_search", {
      query: searchQuery,
      num: 5,
    });
    
    if (Array.isArray(searchResults)) {
      console.log(`Found ${searchResults.length} results`);
      for (let i = 0; i < searchResults.length; i++) {
        const r = searchResults[i];
        console.log(`\n  Result ${i + 1}:`);
        console.log(`    Name: ${r.name || "N/A"}`);
        console.log(`    URL: ${r.url || "N/A"}`);
        console.log(`    Snippet: ${r.snippet || "N/A"}`);
      }
    } else {
      console.log(`Search results: ${JSON.stringify(searchResults).slice(0, 500)}`);
    }
  } catch (err) {
    console.error("Web search error:", err.message);
  }

  // Test 2: Web Search with just the goods_id
  console.log("\n\n--- Test 2: Web Search (broader) ---");
  try {
    const searchQuery = `temu ${GOODS_ID}`;
    console.log(`Searching: ${searchQuery}`);
    const searchResults = await zai.invokeFunction("web_search", {
      query: searchQuery,
      num: 5,
    });
    
    if (Array.isArray(searchResults)) {
      console.log(`Found ${searchResults.length} results`);
      for (let i = 0; i < searchResults.length; i++) {
        const r = searchResults[i];
        console.log(`\n  Result ${i + 1}:`);
        console.log(`    Name: ${r.name || "N/A"}`);
        console.log(`    URL: ${r.url || "N/A"}`);
        console.log(`    Snippet: ${r.snippet || "N/A"}`);
      }
    } else {
      console.log(`Search results: ${JSON.stringify(searchResults).slice(0, 500)}`);
    }
  } catch (err) {
    console.error("Web search error:", err.message);
  }

  // Test 3: Page Reader - read the US product page
  console.log("\n\n--- Test 3: Page Reader (US product page) ---");
  try {
    const pageUrl = `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`;
    console.log(`Reading: ${pageUrl}`);
    const pageResult = await zai.invokeFunction("page_reader", {
      url: pageUrl,
    });
    
    const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (content) {
      console.log(`Content length: ${content.length}`);
      
      // Search for price patterns
      const text = content.replace(/<[^>]*>/g, " ");
      
      // Find $ prices
      const dollarMatches = [...text.matchAll(/\$\s*(\d{1,4}(?:\.\d{1,2})?)/g)];
      const uniquePrices = [...new Set(dollarMatches.map(m => m[1]))];
      console.log(`Dollar prices: ${uniquePrices.join(", ") || "none"}`);
      
      // Find priceInfo blocks
      const priceInfoMatches = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      console.log(`priceInfo blocks: ${priceInfoMatches.length}`);
      for (let i = 0; i < Math.min(priceInfoMatches.length, 5); i++) {
        const cents = parseInt(priceInfoMatches[i][1]);
        const cur = priceInfoMatches[i][2];
        console.log(`  ${i + 1}. ${cents / 100} ${cur}`);
      }
      
      // Find rawData
      const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      if (rawDataMatch) {
        console.log(`window.rawData found! Length: ${rawDataMatch[1].length}`);
        const rawData = rawDataMatch[1];
        
        // Find price fields near goods_id
        if (rawData.includes(GOODS_ID)) {
          const gidIdx = rawData.indexOf(GOODS_ID);
          const searchWindow = rawData.slice(Math.max(0, gidIdx - 500), Math.min(rawData.length, gidIdx + 5000));
          const priceFields = ["minPrice", "salePrice", "price", "marketPrice", "origPrice"];
          for (const field of priceFields) {
            const re = new RegExp(`"${field}"\\s*:\\s*"?([\\d.]+)"?`, "g");
            const matches = [...searchWindow.matchAll(re)];
            if (matches.length > 0) {
              console.log(`  ${field} near goods_id: ${matches.map(m => m[1]).join(", ")}`);
            }
          }
        }
      }
      
      // Use LLM to extract price
      console.log(`\n  Using LLM to extract price...`);
      const contentForLLM = content.slice(0, Math.min(content.length, 30000));
      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: "system",
            content: "You are a price extraction assistant for Temu products. " +
              "Extract the SALE PRICE of the MAIN product. " +
              "CRITICAL: Ignore any price that is exactly $30.00 or 9,000 DA - this is a 'delivery guarantee' amount, NOT the product price. " +
              "The REAL product price is typically much lower (e.g., $1-$50). " +
              "Look for the price shown near the top of the page, often with a struck-through original price. " +
              "Return ONLY JSON: {\"price_usd\": <number>, \"price_local\": \"<amount> <currency>\", \"product_name\": \"<name>\", \"confidence\": \"<high|medium|low>\"}"
          },
          {
            role: "user",
            content: `Product goods_id: ${GOODS_ID}\n\nPage content:\n${contentForLLM}`,
          },
        ],
      });
      
      const aiResponse = completion.choices?.[0]?.message?.content || "";
      console.log(`  LLM response: ${aiResponse.slice(0, 500)}`);
    } else {
      console.log(`No content returned`);
      console.log(`Data keys: ${Object.keys(data || {}).join(", ")}`);
      console.log(`Data preview: ${JSON.stringify(data).slice(0, 500)}`);
    }
  } catch (err) {
    console.error("Page reader error:", err.message?.slice(0, 200));
  }

  // Test 4: Page Reader - read the share URL directly
  console.log("\n\n--- Test 4: Page Reader (share URL directly) ---");
  try {
    const shareUrl = "https://share.temu.com/iEXtmO1ZX5B";
    console.log(`Reading: ${shareUrl}`);
    const pageResult = await zai.invokeFunction("page_reader", {
      url: shareUrl,
    });
    
    const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (content) {
      console.log(`Content length: ${content.length}`);
      
      // Quick price search
      const text = content.replace(/<[^>]*>/g, " ");
      const dollarMatches = [...text.matchAll(/\$\s*(\d{1,4}(?:\.\d{1,2})?)/g)];
      const uniquePrices = [...new Set(dollarMatches.map(m => m[1]))];
      console.log(`Dollar prices: ${uniquePrices.join(", ") || "none"}`);
      
      // Check for priceInfo
      const priceInfoMatches = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      console.log(`priceInfo blocks: ${priceInfoMatches.length}`);
      for (let i = 0; i < Math.min(priceInfoMatches.length, 5); i++) {
        const cents = parseInt(priceInfoMatches[i][1]);
        const cur = priceInfoMatches[i][2];
        console.log(`  ${i + 1}. ${cents / 100} ${cur}`);
      }
    } else {
      console.log(`No content returned`);
      console.log(`Data preview: ${JSON.stringify(data).slice(0, 500)}`);
    }
  } catch (err) {
    console.error("Page reader (share URL) error:", err.message?.slice(0, 200));
  }

  // Test 5: Web Reader - read the product page
  console.log("\n\n--- Test 5: Web Reader (US product page) ---");
  try {
    const pageUrl = `https://www.temu.com/-g-${GOODS_ID}.html`;
    console.log(`Reading with web_reader: ${pageUrl}`);
    const readerResult = await zai.invokeFunction("web_reader", {
      url: pageUrl,
    });
    
    const data = typeof readerResult === "string" ? JSON.parse(readerResult) : readerResult;
    console.log(`Result keys: ${Object.keys(data || {}).join(", ")}`);
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html || data?.data?.markdown;
    
    if (content) {
      console.log(`Content length: ${content.length}`);
      
      // Quick price search
      const dollarMatches = [...content.matchAll(/\$\s*(\d{1,4}(?:\.\d{1,2})?)/g)];
      const uniquePrices = [...new Set(dollarMatches.map(m => m[1]))];
      console.log(`Dollar prices: ${uniquePrices.join(", ") || "none"}`);
    } else {
      console.log(`No content returned`);
      console.log(`Data preview: ${JSON.stringify(data).slice(0, 500)}`);
    }
  } catch (err) {
    console.error("Web reader error:", err.message?.slice(0, 200));
  }
}

testZAI();
