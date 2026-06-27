#!/usr/bin/env node
/**
 * Test mobile Temu site and alternative approaches
 */

import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601101613236742";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
  console.log("=== Alternative Approaches Test ===\n");
  
  const zai = await ZAI.create();

  // Approach 1: page_reader with mobile user agent on m.temu.com
  console.log("--- Approach 1: Mobile Temu site ---");
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: `https://m.temu.com/goods.html?goods_id=${GOODS_ID}`,
    });
    const data = typeof result === "string" ? JSON.parse(result) : result;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (content) {
      console.log("Mobile content length:", content.length);
      // Search for price patterns
      const priceMatches = [...content.matchAll(/\$\s?(\d+\.?\d*)/g)];
      console.log("USD prices:", priceMatches.map(m => m[0]).slice(0, 10).join(", "));
      
      const dzdMatches = [...content.matchAll(/(\d[\d,]*\.?\d*)\s*(?:DA|DZD|د\.ج)/gi)];
      console.log("DZD prices:", dzdMatches.map(m => m[0]).slice(0, 10).join(", "));
      
      // Search for goods_id
      const gidIdx = content.indexOf(GOODS_ID);
      console.log("goods_id found:", gidIdx > -1 ? `at position ${gidIdx}` : "NOT FOUND");
      
      // Search for minPrice/price
      const minPriceMatches = [...content.matchAll(/"minPrice"\s*:\s*"?(\d+\.?\d*)"?/g)];
      console.log("minPrice matches:", minPriceMatches.map(m => m[1]).slice(0, 5).join(", "));
      
      // Give LLM the content
      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: "system",
            content: `You extract product prices from e-commerce HTML. goods_id: ${GOODS_ID}, product: "4-Pack Women's Small Frame Vintage Oval Frame Regular Decorative Glasses". Return JSON ONLY: {"price": <number>, "currency": "<code>", "name": "<name>", "found": <true|false>}`
          },
          {
            role: "user",
            content: content.slice(0, 40000)
          }
        ],
      });
      
      const response = completion.choices?.[0]?.message?.content || "";
      console.log("LLM Response:", response);
    }
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }

  await sleep(3000);

  // Approach 2: Search with direct product name and "price" keyword
  console.log("\n--- Approach 2: Better web search queries ---");
  const queries = [
    `"4-Pack Women's Small Frame Vintage Oval Frame" temu price`,
    `temu 601101613236742 decorative glasses buy`,
    `site:temu.com 601101613236742 price`,
  ];
  
  for (const query of queries) {
    try {
      console.log(`\nQuery: ${query}`);
      const results = await zai.invokeFunction("web_search", {
        query,
        num: 5,
      });
      if (Array.isArray(results)) {
        for (const r of results) {
          const hasPrice = r.snippet?.match(/\$?\d+[\.,]?\d*\s*(?:USD|EUR|DA|DZD|$|€|£|Rs)/);
          if (hasPrice || r.url?.includes("temu.com")) {
            console.log(`  [${hasPrice ? "PRICE" : "NO-PRICE"}] ${r.name?.slice(0, 60)}`);
            console.log(`  URL: ${r.url?.slice(0, 100)}`);
            console.log(`  Snippet: ${r.snippet?.slice(0, 200)}`);
          }
        }
      }
    } catch (err) {
      console.log("Error:", err.message.slice(0, 100));
    }
    await sleep(2000);
  }

  // Approach 3: Use web search for US-specific Temu page
  console.log("\n--- Approach 3: US-specific Temu search ---");
  try {
    const results = await zai.invokeFunction("web_search", {
      query: `site:temu.com "g-601101613236742" -mu -om -bh -pk -dz -ec`,
      num: 5,
    });
    if (Array.isArray(results)) {
      console.log("Results:", results.length);
      for (const r of results) {
        console.log(`  ${r.name?.slice(0, 60)}`);
        console.log(`  URL: ${r.url?.slice(0, 100)}`);
        console.log(`  Snippet: ${r.snippet?.slice(0, 200)}`);
      }
    }
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }
}

test().catch(console.error);
