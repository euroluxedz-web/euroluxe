#!/usr/bin/env node
/**
 * Deep search in Temu page HTML for product data and price
 */

import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601101613236742";

async function test() {
  console.log("=== Deep HTML Search for Price ===\n");
  
  const zai = await ZAI.create();

  // Read the DZ locale page
  const result = await zai.invokeFunction("page_reader", {
    url: `https://www.temu.com/dz-en/goods.html?goods_id=${GOODS_ID}`,
  });
  const data = typeof result === "string" ? JSON.parse(result) : result;
  const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
  
  if (!content) {
    console.log("No content");
    return;
  }
  
  console.log("Content length:", content.length);

  // Search for all script tags with type="application/json"
  const jsonScripts = [...content.matchAll(/<script\s+id="([^"]*)"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)];
  console.log(`\nJSON script tags with IDs: ${jsonScripts.length}`);
  for (const match of jsonScripts) {
    console.log(`  ID: ${match[1]}, Length: ${match[2].length}`);
    if (match[2].length > 100 && match[2].length < 50000) {
      try {
        const parsed = JSON.parse(match[2]);
        const str = JSON.stringify(parsed);
        if (str.includes("price") || str.includes("Price") || str.includes(GOODS_ID) || str.includes("1998") || str.includes("4-Pack")) {
          console.log(`    Contains relevant data! (price/Price/GOODS_ID found)`);
          // Print first 500 chars
          console.log(`    Content: ${str.slice(0, 500)}`);
          
          // Deep search for price values
          const findPrices = (obj, path = "") => {
            if (!obj || typeof obj !== "object") return;
            for (const [key, value] of Object.entries(obj)) {
              const cp = path ? `${path}.${key}` : key;
              if (typeof value === "number" && (key.toLowerCase().includes("price") || key.toLowerCase().includes("cost"))) {
                console.log(`    PRICE: ${cp} = ${value}`);
              }
              if (typeof value === "string" && (key.toLowerCase().includes("price") || key.toLowerCase().includes("name"))) {
                if (value.length < 200) console.log(`    ${cp} = ${value}`);
              }
              if (typeof value === "object" && value !== null) {
                findPrices(value, cp);
              }
            }
          };
          findPrices(parsed);
        }
      } catch (e) {
        // Not valid JSON
      }
    }
  }

  // Search for __NEXT_DATA__
  const nextDataIdx = content.indexOf('__NEXT_DATA__');
  if (nextDataIdx > -1) {
    console.log("\n__NEXT_DATA__ found at position:", nextDataIdx);
    const scriptMatch = content.slice(nextDataIdx - 100, nextDataIdx + 50000).match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
      console.log("Script length:", scriptMatch[1].length);
      try {
        const parsed = JSON.parse(scriptMatch[1]);
        console.log("__NEXT_DATA__ keys:", Object.keys(parsed).join(", "));
        const props = parsed?.props?.pageProps;
        if (props) {
          console.log("pageProps keys:", Object.keys(props).join(", "));
          const str = JSON.stringify(props).slice(0, 1000);
          console.log("pageProps content:", str);
        }
      } catch (e) {
        console.log("Parse error:", e.message.slice(0, 80));
      }
    }
  }

  // Search for goods_id in different formats
  console.log("\n--- Searching for goods_id variations ---");
  const idPatterns = [
    `"goods_id":"${GOODS_ID}"`,
    `"goodsId":"${GOODS_ID}"`,
    `"goods_id":${GOODS_ID}`,
    `"goodsId":${GOODS_ID}`,
    `goods_id=${GOODS_ID}`,
    GOODS_ID,
  ];
  
  for (const pattern of idPatterns) {
    const idx = content.indexOf(pattern);
    if (idx > -1) {
      console.log(`Found "${pattern}" at position ${idx}`);
      const context = content.slice(Math.max(0, idx - 200), Math.min(content.length, idx + 500));
      console.log(`Context: ${context.slice(0, 700)}`);
    }
  }

  // Search for specific price-related strings
  console.log("\n--- Searching for price-related data ---");
  const priceStrings = [
    '"minPrice"',
    '"salePrice"',
    '"price"',
    '"origPrice"',
    '"marketPrice"',
    '"appPrice"',
    '"skuPrice"',
    '"priceNum"',
    '"displayPrice"',
    '"localPrice"',
  ];

  for (const ps of priceStrings) {
    const indices = [];
    let idx = 0;
    while ((idx = content.indexOf(ps, idx)) !== -1) {
      indices.push(idx);
      idx += ps.length;
    }
    if (indices.length > 0) {
      console.log(`"${ps}" found ${indices.length} times`);
      // Show context for first 3 occurrences
      for (const i of indices.slice(0, 3)) {
        const ctx = content.slice(i, Math.min(content.length, i + 100));
        console.log(`  ${ctx}`);
      }
    }
  }

  // Try to find the actual rendered price in the DOM
  console.log("\n--- Searching for rendered price elements ---");
  const priceElementPatterns = [
    /class="[^"]*productPrice[^"]*"[^>]*>([^<]+)/gi,
    /class="[^"]*salePrice[^"]*"[^>]*>([^<]+)/gi,
    /class="[^"]*price_now[^"]*"[^>]*>([^<]+)/gi,
    /class="[^"]*current-price[^"]*"[^>]*>([^<]+)/gi,
    /class="[^"]*goods-price[^"]*"[^>]*>([^<]+)/gi,
    /data-testid="[^"]*price[^"]*"[^>]*>([^<]+)/gi,
    /class="[^"]*_2j5S[^"]*"[^>]*>([^<]+)/gi, // Temu specific class
  ];

  for (const pattern of priceElementPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      console.log(`  ${pattern.source}: "${match[1]}"`);
    }
  }
}

test().catch(console.error);
