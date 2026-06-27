#!/usr/bin/env node
/**
 * Search around goods_id position in page_reader HTML for price data
 */

import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601101613236742";

async function test() {
  console.log("=== Find Price Near goods_id ===\n");
  
  const zai = await ZAI.create();

  // Read the share URL via page_reader (which includes the rendered page)
  console.log("Reading share URL via page_reader...");
  const result = await zai.invokeFunction("page_reader", {
    url: "https://share.temu.com/7d4cdBt01yB",
  });
  const data = typeof result === "string" ? JSON.parse(result) : result;
  const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
  
  if (!content) {
    console.log("No content");
    return;
  }

  console.log("Content length:", content.length);

  // Find all positions of goods_id
  const positions = [];
  let pos = 0;
  while ((pos = content.indexOf(GOODS_ID, pos)) !== -1) {
    positions.push(pos);
    pos += GOODS_ID.length;
  }
  console.log(`goods_id found at ${positions.length} positions:`, positions);

  // For each position, extract a 2000-char window and search for price
  for (let i = 0; i < Math.min(positions.length, 10); i++) {
    const p = positions[i];
    const start = Math.max(0, p - 500);
    const end = Math.min(content.length, p + 1500);
    const window = content.slice(start, end);
    
    console.log(`\n--- Window around goods_id position ${p} ---`);
    
    // Search for price patterns
    const pricePatterns = [
      /"minPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
      /"price"\s*:\s*"?(\d+\.?\d*)"?/g,
      /"salePrice"\s*:\s*"?(\d+\.?\d*)"?/g,
      /"marketPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
      /"origPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
      /"appPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
      /"priceNum"\s*:\s*"?(\d+\.?\d*)"?/g,
      /"localPrice"\s*:\s*"?(\d+\.?\d*)"?/g,
      /\$\s?(\d+[\.,]?\d*)/g,
      /(\d[\d,]*\.?\d*)\s*(?:DA|DZD|د\.ج)/gi,
    ];
    
    let foundAny = false;
    for (const pattern of pricePatterns) {
      let match;
      while ((match = pattern.exec(window)) !== null) {
        console.log(`  Pattern ${pattern.source}: ${match[0]}`);
        foundAny = true;
      }
    }
    
    if (!foundAny) {
      // Show a snippet of the window to understand the structure
      console.log("  No price patterns found. Context:");
      console.log(`  ${window.slice(0, 300)}`);
    }
  }

  // Also try: look for "goodsDetail" or "productDetail" sections
  console.log("\n--- Searching for goodsDetail/productDetail sections ---");
  const detailPatterns = [
    /"goodsDetail"\s*:\s*{/g,
    /"productDetail"\s*:\s*{/g,
    /"detail"\s*:\s*{/g,
  ];
  
  for (const pattern of detailPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      console.log(`Found ${match[0]} at position ${match.index}`);
      // Extract 2000 chars after this
      const detailContent = content.slice(match.index, match.index + 2000);
      console.log(`Content: ${detailContent.slice(0, 500)}`);
    }
  }

  // Search for specific price-related JSON structures
  console.log("\n--- Searching for price in JSON data ---");
  // Temu often embeds data in script tags or data attributes
  const scriptTags = [...content.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  console.log(`Found ${scriptTags.length} script tags`);
  
  for (let i = 0; i < scriptTags.length; i++) {
    const scriptContent = scriptTags[i][1];
    if (scriptContent.length > 1000 && scriptContent.includes(GOODS_ID)) {
      console.log(`\nScript tag ${i} (length ${scriptContent.length}) contains goods_id!`);
      console.log(`First 500 chars: ${scriptContent.slice(0, 500)}`);
      
      // Search for price in this script
      const prices = [...scriptContent.matchAll(/"minPrice"\s*:\s*"?(\d+\.?\d*)"?/g)];
      if (prices.length > 0) {
        console.log(`minPrice values: ${prices.map(m => m[1]).join(", ")}`);
      }
      
      const salePrices = [...scriptContent.matchAll(/"salePrice"\s*:\s*"?(\d+\.?\d*)"?/g)];
      if (salePrices.length > 0) {
        console.log(`salePrice values: ${salePrices.map(m => m[1]).join(", ")}`);
      }
      
      const priceValues = [...scriptContent.matchAll(/"price"\s*:\s*"?(\d+\.?\d*)"?/g)];
      if (priceValues.length > 0) {
        console.log(`price values: ${priceValues.map(m => m[1]).join(", ")}`);
      }

      // Search for any number that could be a price
      const numbers = [...scriptContent.matchAll(/"(?:min|sale|orig|market|app|display|unit|final|discount)Price"\s*:\s*"?(\d+\.?\d*)"?/gi)];
      if (numbers.length > 0) {
        console.log(`All price values: ${numbers.map(m => `${m[0]}`).join(", ")}`);
      }
    }
  }
}

test().catch(console.error);
