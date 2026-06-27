#!/usr/bin/env node
/**
 * Test the ZAI Web Search strategy that the actual code uses
 */

import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601101613236742";

async function test() {
  console.log("=== Web Search Strategy Test ===\n");
  
  const zai = await ZAI.create();
  
  // Test 1: Search with goods_id (like the code does)
  console.log("--- Test 1: site:temu.com \"g-601101613236742\" ---");
  try {
    const results = await zai.invokeFunction("web_search", {
      query: `site:temu.com "g-${GOODS_ID}"`,
      num: 5,
    });
    console.log("Results count:", Array.isArray(results) ? results.length : 0);
    if (Array.isArray(results)) {
      for (const r of results) {
        console.log(`\n  Title: ${r.name}`);
        console.log(`  URL: ${r.url}`);
        console.log(`  Snippet: ${r.snippet}`);
      }
    }
  } catch (err) {
    console.log("Error:", err.message);
  }

  // Test 2: Broader search
  console.log("\n--- Test 2: temu 601101613236742 price ---");
  try {
    const results = await zai.invokeFunction("web_search", {
      query: `temu ${GOODS_ID} price`,
      num: 5,
    });
    console.log("Results count:", Array.isArray(results) ? results.length : 0);
    if (Array.isArray(results)) {
      for (const r of results) {
        console.log(`\n  Title: ${r.name}`);
        console.log(`  URL: ${r.url}`);
        console.log(`  Snippet: ${r.snippet}`);
      }
    }
  } catch (err) {
    console.log("Error:", err.message);
  }

  // Test 3: Search with Item ID format
  console.log("\n--- Test 3: site:temu.com \"TV10922608\" ---");
  try {
    const results = await zai.invokeFunction("web_search", {
      query: `site:temu.com "TV10922608"`,
      num: 5,
    });
    console.log("Results count:", Array.isArray(results) ? results.length : 0);
    if (Array.isArray(results)) {
      for (const r of results) {
        console.log(`\n  Title: ${r.name}`);
        console.log(`  URL: ${r.url}`);
        console.log(`  Snippet: ${r.snippet}`);
      }
    }
  } catch (err) {
    console.log("Error:", err.message);
  }

  // Test 4: Broader Item ID search
  console.log("\n--- Test 4: temu TV10922608 price ---");
  try {
    const results = await zai.invokeFunction("web_search", {
      query: `temu TV10922608 price`,
      num: 5,
    });
    console.log("Results count:", Array.isArray(results) ? results.length : 0);
    if (Array.isArray(results)) {
      for (const r of results) {
        console.log(`\n  Title: ${r.name}`);
        console.log(`  URL: ${r.url}`);
        console.log(`  Snippet: ${r.snippet}`);
      }
    }
  } catch (err) {
    console.log("Error:", err.message);
  }

  // Test 5: Use web-reader to read the share URL directly
  console.log("\n--- Test 5: web-reader on share URL ---");
  try {
    const result = await zai.invokeFunction("web_reader", {
      url: "https://share.temu.com/7d4cdBt01yB",
    });
    console.log("web-reader result type:", typeof result);
    if (typeof result === "string") {
      console.log("Content (first 500 chars):", result.slice(0, 500));
    } else {
      console.log("Result:", JSON.stringify(result).slice(0, 500));
    }
  } catch (err) {
    console.log("Error:", err.message);
  }

  // Test 6: Use web-reader to read the product page
  console.log("\n--- Test 6: web-reader on product page ---");
  try {
    const result = await zai.invokeFunction("web_reader", {
      url: `https://www.temu.com/-g-${GOODS_ID}.html`,
    });
    console.log("web-reader result type:", typeof result);
    if (typeof result === "string") {
      console.log("Content (first 1000 chars):", result.slice(0, 1000));
      // Look for price patterns
      const priceMatch = result.match(/\$\s?(\d+\.?\d*)/);
      if (priceMatch) console.log("\nFound price in content:", priceMatch[0]);
      
      const dzdMatch = result.match(/(\d[\d,]+)\s*(?:DA|DZD|دج)/i);
      if (dzdMatch) console.log("Found DZD price in content:", dzdMatch[0]);
    } else {
      console.log("Result:", JSON.stringify(result).slice(0, 1000));
    }
  } catch (err) {
    console.log("Error:", err.message);
  }
}

test().catch(console.error);
