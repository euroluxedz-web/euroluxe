#!/usr/bin/env node
/**
 * Extract actual price data from Temu page HTML using page_reader
 */

import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601101613236742";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
  console.log("=== Temu Page Price Data Extraction ===\n");
  
  const zai = await ZAI.create();

  // Read the DZ locale product page (most relevant for Algeria user)
  console.log("--- Reading DZ locale page ---");
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: `https://www.temu.com/dz-en/goods.html?goods_id=${GOODS_ID}`,
    });
    const data = typeof result === "string" ? JSON.parse(result) : result;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (!content) {
      console.log("No content found");
      return;
    }

    console.log("Content length:", content.length);

    // Search for __INITIAL_STATE__ or goodsDetail
    const statePatterns = [
      /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/,
      /"goodsDetail"\s*:\s*({[\s\S]*?"goods"\s*:\s*{[\s\S]*?}})/,
      /"minPrice"\s*:\s*"?(\d+\.?\d*)"?/,
      /"price"\s*:\s*"?(\d+\.?\d*)"?/,
      /"marketPrice"\s*:\s*"?(\d+\.?\d*)"?/,
      /"salePrice"\s*:\s*"?(\d+\.?\d*)"?/,
      /"origPrice"\s*:\s*"?(\d+\.?\d*)"?/,
      /data-price="(\d+\.?\d*)"/,
      /"skuList"\s*:\s*\[/,
      /"priceBasis"\s*:\s*"?(\d+\.?\d*)"?/,
    ];

    for (const pattern of statePatterns) {
      const match = content.match(pattern);
      if (match) {
        console.log(`\nPattern ${pattern.source}:`);
        console.log(`  Match: ${String(match[1] || match[0]).slice(0, 300)}`);
      }
    }

    // Also search for JSON objects with price info
    console.log("\n--- Searching for price-related JSON data ---");
    
    // Look for goods_id references in the HTML
    const goodsIdOccurrences = content.match(new RegExp(`${GOODS_ID}`, "g"));
    console.log(`Goods ID ${GOODS_ID} appears ${goodsIdOccurrences?.length || 0} times`);

    // Find the area around the goods_id
    const gidIdx = content.indexOf(GOODS_ID);
    if (gidIdx > -1) {
      // Look in a 5000 char window around each occurrence
      let searchStart = Math.max(0, gidIdx - 500);
      let searchEnd = Math.min(content.length, gidIdx + 5000);
      const window = content.slice(searchStart, searchEnd);
      
      // Search for price patterns in this window
      const pricePatterns = [
        /"minPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
        /"price"\s*:\s*"?(\d+\.?\d*)"?/g,
        /"marketPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
        /"salePrice"\s*:\s*"?(\d+\.?\d*)"?/g,
        /"origPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
        /"appPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
        /"priceBasis"\s*:\s*"?(\d+\.?\d*)"?/g,
      ];
      
      for (const pattern of pricePatterns) {
        let match;
        while ((match = pattern.exec(window)) !== null) {
          console.log(`  ${pattern.source}: ${match[1]}`);
        }
      }

      // Also look for the actual displayed price text
      const priceTextPatterns = [
        /(\d+[\d,.]*)\s*DA/gi,
        /\$\s*(\d+[\d,.]*)/g,
        /DZD\s*(\d+[\d,.]*)/gi,
      ];
      
      for (const pattern of priceTextPatterns) {
        let match;
        while ((match = pattern.exec(window)) !== null) {
          console.log(`  Price text: ${match[0]}`);
        }
      }
    }

    // Find ALL occurrences of goods_id and look for price nearby
    let pos = 0;
    let occNum = 0;
    while ((pos = content.indexOf(GOODS_ID, pos)) !== -1) {
      occNum++;
      if (occNum <= 5) { // Only check first 5 occurrences
        const start = Math.max(0, pos - 200);
        const end = Math.min(content.length, pos + 2000);
        const chunk = content.slice(start, end);
        
        const minP = chunk.match(/"minPrice"\s*:\s*"?(\d+\.?\d*)"?/);
        const price = chunk.match(/"price"\s*:\s*"?(\d+\.?\d*)"?/);
        const nameMatch = chunk.match(/"name"\s*:\s*"([^"]{5,80})"/);
        
        if (minP || price || nameMatch) {
          console.log(`\n  Occurrence ${occNum} at pos ${pos}:`);
          if (minP) console.log(`    minPrice: ${minP[1]}`);
          if (price) console.log(`    price: ${price[1]}`);
          if (nameMatch) console.log(`    name: ${nameMatch[1]}`);
        }
      }
      pos += GOODS_ID.length;
    }

  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }

  await sleep(3000);

  // Also try the US page to compare
  console.log("\n--- Reading US locale page ---");
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us`,
    });
    const data = typeof result === "string" ? JSON.parse(result) : result;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (!content) {
      console.log("No content found");
      return;
    }

    console.log("Content length:", content.length);

    // Search for price near goods_id
    const gidIdx = content.indexOf(GOODS_ID);
    if (gidIdx > -1) {
      const start = Math.max(0, gidIdx - 200);
      const end = Math.min(content.length, gidIdx + 2000);
      const window = content.slice(start, end);
      
      const pricePatterns = [
        /"minPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
        /"price"\s*:\s*"?(\d+\.?\d*)"?/g,
        /"marketPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
      ];
      
      for (const pattern of pricePatterns) {
        let match;
        while ((match = pattern.exec(window)) !== null) {
          console.log(`  ${pattern.source}: ${match[1]}`);
        }
      }
      
      const priceTextPatterns = [
        /\$\s*(\d+[\d,.]*)/g,
      ];
      
      for (const pattern of priceTextPatterns) {
        let match;
        while ((match = pattern.exec(window)) !== null) {
          console.log(`  Price text: ${match[0]}`);
        }
      }
    }

    // Find all price fields in the entire content
    console.log("\n--- All minPrice occurrences in US page ---");
    const allMinPrices = [...content.matchAll(/"minPrice"\s*:\s*"?(\d+\.?\d*)"?/g)];
    for (const m of allMinPrices.slice(0, 10)) {
      console.log(`  minPrice: ${m[1]}`);
    }

    console.log("\n--- All price occurrences in US page ---");
    const allPrices = [...content.matchAll(/"price"\s*:\s*"?(\d+\.?\d*)"?/g)];
    for (const m of allPrices.slice(0, 10)) {
      console.log(`  price: ${m[1]}`);
    }

  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }
}

test().catch(console.error);
