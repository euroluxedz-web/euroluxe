#!/usr/bin/env node
/**
 * Test page_reader on Temu API endpoint (which returns JS challenge)
 * Also test reading the resolved share URL directly via page_reader
 */

import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601101613236742";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
  console.log("=== page_reader on API endpoints ===\n");
  
  const zai = await ZAI.create();

  // Approach 1: page_reader on the share URL directly (it redirects)
  console.log("--- page_reader on share URL ---");
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: "https://share.temu.com/7d4cdBt01yB",
    });
    const data = typeof result === "string" ? JSON.parse(result) : result;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (content) {
      console.log("Content length:", content.length);
      
      // Search for goods_id
      const gidIdx = content.indexOf(GOODS_ID);
      console.log("goods_id found:", gidIdx > -1 ? `YES at ${gidIdx}` : "NO");
      
      // Search for price patterns
      const prices = [...content.matchAll(/\$\s?(\d+\.?\d*)/g)];
      const uniquePrices = [...new Set(prices.map(m => m[0]))];
      console.log("USD prices:", uniquePrices.slice(0, 15).join(", "));
      
      // Search for DZD prices
      const dzdPrices = [...content.matchAll(/(\d[\d,]*\.?\d*)\s*(?:DA|DZD|د\.ج)/gi)];
      const uniqueDzd = [...new Set(dzdPrices.map(m => m[0]))];
      console.log("DZD prices:", uniqueDzd.slice(0, 15).join(", "));
      
      // Use LLM to extract from the FULL content
      console.log("\nUsing LLM to extract price from full content...");
      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: "system",
            content: `You are extracting the MAIN PRODUCT price from a Temu product page HTML. The product is goods_id ${GOODS_ID}, "4-Pack Women's Small Frame Vintage Oval Frame Regular Decorative Glasses". IMPORTANT: Ignore prices from "recommended", "you may also like", "similar items", or any section that is NOT the main product. Only return the price shown for the MAIN product being viewed. Return JSON: {"price_usd": <number_or_null>, "price_local": "<amount_and_currency>", "product_name": "<name>", "found": <true|false>}`
          },
          {
            role: "user",
            content: `Extract the main product price from this Temu page HTML. Ignore all recommended/similar product prices. Only the price of the product being viewed:\n\n${content.slice(0, 60000)}`
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

  // Approach 2: page_reader on the BG API endpoint
  console.log("\n--- page_reader on BG API endpoint ---");
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: `https://www.temu.com/bg/goods/api`,
    });
    const data = typeof result === "string" ? JSON.parse(result) : result;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (content) {
      console.log("Content length:", content.length);
      console.log("First 500 chars:", content.slice(0, 500));
    }
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }

  await sleep(3000);

  // Approach 3: Try the Temu search with Item ID using page_reader
  console.log("\n--- page_reader on Temu search for Item ID ---");
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: `https://www.temu.com/search.html?q=TV10922608&type=s`,
    });
    const data = typeof result === "string" ? JSON.parse(result) : result;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    
    if (content) {
      console.log("Search page content length:", content.length);
      
      // Search for TV10922608
      const tvIdx = content.indexOf("TV10922608");
      console.log("TV10922608 found:", tvIdx > -1 ? `YES at ${tvIdx}` : "NO");
      
      // Search for prices
      const prices = [...content.matchAll(/\$\s?(\d+\.?\d*)/g)];
      const uniquePrices = [...new Set(prices.map(m => m[0]))];
      console.log("USD prices:", uniquePrices.slice(0, 10).join(", "));
      
      // Use LLM to check if the search page has our item
      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: "system",
            content: "Check if this Temu search page contains a product with ID 'TV10922608'. If yes, extract its price and name. Return JSON: {\"found\": true/false, \"price\": number/null, \"name\": string/null, \"goods_id\": string/null}"
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
}

test().catch(console.error);
