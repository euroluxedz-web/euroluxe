#!/usr/bin/env node
/**
 * Extract price from window.rawData in the page_reader HTML
 */

import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601101613236742";

async function test() {
  console.log("=== Extract Price from rawData ===\n");
  
  const zai = await ZAI.create();

  const result = await zai.invokeFunction("page_reader", {
    url: "https://share.temu.com/7d4cdBt01yB",
  });
  const data = typeof result === "string" ? JSON.parse(result) : result;
  const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
  
  if (!content) {
    console.log("No content");
    return;
  }

  // Find the script tag with window.rawData
  const rawDataMatch = content.match(/window\.rawData\s*=\s*({[\s\S]*?});?\s*(?:window\.__CHUNK_DATA__|<\/script>)/);
  if (rawDataMatch) {
    console.log("rawData found, length:", rawDataMatch[1].length);
    
    try {
      const rawData = JSON.parse(rawDataMatch[1]);
      console.log("rawData top-level keys:", Object.keys(rawData).join(", "));
      
      // Navigate to product data
      const store = rawData?.store;
      if (store) {
        console.log("store keys:", Object.keys(store).join(", "));
      }
      
      // Search for goods_id in the rawData
      const rawDataStr = JSON.stringify(rawData);
      const gidIdx = rawDataStr.indexOf(GOODS_ID);
      if (gidIdx > -1) {
        console.log(`goods_id found in rawData at position ${gidIdx}`);
        const context = rawDataStr.slice(Math.max(0, gidIdx - 200), gidIdx + 500);
        console.log("Context:", context.slice(0, 500));
      }
      
      // Deep search for price values
      const findPrices = (obj, path = "", depth = 0) => {
        if (!obj || typeof obj !== "object" || depth > 5) return;
        for (const [key, value] of Object.entries(obj)) {
          const cp = path ? `${path}.${key}` : key;
          if (typeof value === "number" && value > 0 && (
            key.toLowerCase().includes("price") || 
            key.toLowerCase().includes("cost") ||
            key.toLowerCase().includes("amount")
          )) {
            console.log(`  PRICE: ${cp} = ${value}`);
          }
          if (typeof value === "string" && value.length < 200 && (
            key.toLowerCase().includes("price") || 
            key.toLowerCase().includes("name") ||
            key.toLowerCase().includes("title")
          )) {
            console.log(`  ${cp} = "${value}"`);
          }
          if (typeof value === "object" && value !== null) {
            findPrices(value, cp, depth + 1);
          }
        }
      };
      
      console.log("\n--- Price search in rawData ---");
      findPrices(rawData);
      
    } catch (e) {
      console.log("JSON parse error:", e.message.slice(0, 80));
      // Try to find price in the raw string
      const minPrices = [...rawDataMatch[1].matchAll(/"minPrice"\s*:\s*"?(\d+\.?\d*)"?/g)];
      console.log("minPrice from regex:", minPrices.map(m => m[1]));
      
      const prices = [...rawDataMatch[1].matchAll(/"price"\s*:\s*"?(\d+\.?\d*)"?/g)];
      console.log("price from regex:", prices.slice(0, 5).map(m => m[1]));
    }
  } else {
    console.log("rawData NOT found");
    
    // Try alternative patterns
    const altPatterns = [
      /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/,
      /window\.goodsDetail\s*=\s*({[\s\S]*?});?\s*<\/script>/,
      /window\.productData\s*=\s*({[\s\S]*?});?\s*<\/script>/,
    ];
    
    for (const pattern of altPatterns) {
      const match = content.match(pattern);
      if (match) {
        console.log(`Found ${pattern.source} (length: ${match[1].length})`);
      }
    }
  }

  // Also search for the FULL script that contains goods_id
  const scriptTags = [...content.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  for (let i = 0; i < scriptTags.length; i++) {
    const scriptContent = scriptTags[i][1];
    if (scriptContent.includes(GOODS_ID) && scriptContent.length > 5000) {
      console.log(`\n--- Script tag ${i} (${scriptContent.length} chars) contains goods_id ---`);
      
      // Extract all key-value pairs with "price" in the key
      const pricePairs = [...scriptContent.matchAll(/"(\w*[Pp]rice\w*)"\s*:\s*"?([^",}]+)"?/g)];
      if (pricePairs.length > 0) {
        console.log("Price-related key-value pairs:");
        for (const m of pricePairs) {
          console.log(`  ${m[1]}: ${m[2]}`);
        }
      }
      
      // Also search for the goods_id context
      const gidIdx = scriptContent.indexOf(GOODS_ID);
      if (gidIdx > -1) {
        console.log(`\ngoods_id at position ${gidIdx}, showing context:`);
        console.log(scriptContent.slice(Math.max(0, gidIdx - 100), Math.min(scriptContent.length, gidIdx + 300)));
      }
      
      // Search for any number that could be a price (1-1000 range) near the goods_id
      const searchWindow = scriptContent.slice(Math.max(0, gidIdx - 500), Math.min(scriptContent.length, gidIdx + 5000));
      const numberMatches = [...searchWindow.matchAll(/"(\w+)"\s*:\s*(\d+\.?\d*)/g)];
      const interestingNumbers = numberMatches.filter(m => {
        const val = parseFloat(m[2]);
        return val > 0 && val < 100000;
      });
      if (interestingNumbers.length > 0) {
        console.log("\nNumbers near goods_id:");
        for (const m of interestingNumbers) {
          console.log(`  ${m[1]}: ${m[2]}`);
        }
      }
      
      break; // Only process the first matching script tag
    }
  }
}

test().catch(console.error);
