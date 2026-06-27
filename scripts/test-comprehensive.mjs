#!/usr/bin/env node
/**
 * Test comprehensive price extraction approaches
 */

import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601101613236742";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
  console.log("=== Comprehensive Price Extraction ===\n");
  
  const zai = await ZAI.create();

  // Approach 1: Search for "4 pack womens small frame vintage oval frame temu price"
  console.log("--- Approach 1: Product name + temu + price ---");
  try {
    const results = await zai.invokeFunction("web_search", {
      query: "4 pack womens small frame vintage oval frame decorative glasses temu price",
      num: 10,
    });
    if (Array.isArray(results)) {
      for (const r of results) {
        if (r.url?.includes("temu.com") || r.snippet?.match(/\$?\d+\.?\d*/)) {
          console.log(`\n  Title: ${r.name}`);
          console.log(`  URL: ${r.url}`);
          console.log(`  Snippet: ${r.snippet}`);
        }
      }
    }
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }

  await sleep(2000);

  // Approach 2: Search for the specific Temu product page URL with price
  console.log("\n--- Approach 2: temu.com product page price search ---");
  try {
    const results = await zai.invokeFunction("web_search", {
      query: `temu.com ${GOODS_ID} "$" price`,
      num: 5,
    });
    if (Array.isArray(results)) {
      for (const r of results) {
        console.log(`\n  Title: ${r.name}`);
        console.log(`  URL: ${r.url}`);
        console.log(`  Snippet: ${r.snippet}`);
      }
    }
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }

  await sleep(2000);

  // Approach 3: Use page_reader on the US product page + LLM
  console.log("\n--- Approach 3: page_reader on US page + LLM ---");
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`,
    });
    const data = typeof result === "string" ? JSON.parse(result) : result;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (content) {
      console.log("Page content length:", content.length);
      
      // Give the LLM the first 30K chars (usually has product data)
      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: "system",
            content: `You extract product prices from Temu HTML pages. Return ONLY JSON: {"price_usd": <number>, "price_local": <number>, "currency": "<code>", "product_name": "<name>", "confidence": "<high|medium|low>"}. The goods_id is ${GOODS_ID}. Only extract the price for THIS product (not recommended products). If unsure, set confidence to "low".`
          },
          {
            role: "user",
            content: content.slice(0, 30000)
          }
        ],
      });
      
      const response = completion.choices?.[0]?.message?.content || "";
      console.log("LLM Response:", response);
    }
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }

  await sleep(2000);

  // Approach 4: page_reader on the DZ locale + focused LLM extraction
  console.log("\n--- Approach 4: page_reader DZ locale + LLM ---");
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: `https://www.temu.com/dz-en/goods.html?goods_id=${GOODS_ID}`,
    });
    const data = typeof result === "string" ? JSON.parse(result) : result;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (content) {
      // Find the section with the price display (look for specific patterns)
      // Temu typically shows prices in elements with specific class names
      // Let me search for common price display patterns
      const priceSectionPatterns = [
        /class="[^"]*(?:price|Price|cost|Cost)[^"]*"[^>]*>([^<]+)/g,
        /data-price="([^"]+)"/g,
        /"salePrice"\s*:\s*"?(\d+\.?\d*)"?/g,
        /"minPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
        /"appPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
      ];
      
      for (const pattern of priceSectionPatterns) {
        let match;
        const matches = [];
        while ((match = pattern.exec(content)) !== null) {
          matches.push(match[1] || match[0]);
        }
        if (matches.length > 0) {
          console.log(`Pattern ${pattern.source}: ${matches.slice(0, 5).join(", ")}`);
        }
      }
      
      // Also search for "1,998" to verify the LLM's finding
      const priceSearch = content.match(/1[\s,.]?998|1998/g);
      console.log("Search for 1998:", priceSearch?.length || 0, "matches");
      
      // Search for "DA" or "DZD" with numbers nearby
      const daPrices = [...content.matchAll(/(\d[\d\s,.]*)\s*(?:DA|DZD|د\.ج)/gi)];
      if (daPrices.length > 0) {
        console.log("DA/DZD prices found:");
        for (const m of daPrices.slice(0, 10)) {
          console.log(`  ${m[0]}`);
        }
      }
      
      // Search for "$" with numbers
      const usdPrices = [...content.matchAll(/\$\s*(\d+[\d,.]*)/g)];
      if (usdPrices.length > 0) {
        console.log("USD prices found:");
        for (const m of usdPrices.slice(0, 10)) {
          console.log(`  ${m[0]}`);
        }
      }

      // Give the LLM a focused section
      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: "system",
            content: `You extract product prices from Temu HTML pages. The goods_id is ${GOODS_ID} and the product is "4-Pack Women's Small Frame Vintage Oval Frame Regular Decorative Glasses". ONLY extract the price for THIS specific product, NOT for recommended/related products. Return ONLY JSON: {"price_local": "<amount>", "currency": "<code>", "product_name": "<name>", "confidence": "<high|medium|low>"}. If you find a price in DZD, include it.`
          },
          {
            role: "user",
            content: content.slice(0, 50000)
          }
        ],
      });
      
      const response = completion.choices?.[0]?.message?.content || "";
      console.log("\nLLM Response:", response);
    }
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }

  // Approach 5: Try with Item ID TV10922608 using search
  console.log("\n--- Approach 5: Item ID TV10922608 via page_reader on search ---");
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: `https://www.temu.com/search.html?q=TV10922608`,
    });
    const data = typeof result === "string" ? JSON.parse(result) : result;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (content) {
      console.log("Search page content length:", content.length);
      
      // Search for TV10922608 in the content
      const idIdx = content.indexOf("TV10922608");
      if (idIdx > -1) {
        console.log("Found TV10922608 in content at position", idIdx);
        const context = content.slice(Math.max(0, idIdx - 200), idIdx + 500);
        console.log("Context:", context.slice(0, 500));
      } else {
        console.log("TV10922608 not found in search page content");
      }
    }
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }
}

test().catch(console.error);
