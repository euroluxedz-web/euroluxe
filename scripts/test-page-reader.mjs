#!/usr/bin/env node
/**
 * Test page_reader to extract price from Temu product pages
 */

import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601101613236742";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
  console.log("=== Page Reader Price Extraction Test ===\n");
  
  const zai = await ZAI.create();

  // Test 1: Read the share URL directly (this should redirect and render)
  console.log("--- Test 1: page_reader on share URL ---");
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: "https://share.temu.com/7d4cdBt01yB",
    });
    console.log("Result type:", typeof result);
    const data = typeof result === "string" ? JSON.parse(result) : result;
    console.log("Keys:", Object.keys(data).join(", "));
    
    // Check data.content or data.text or data.html
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    if (content) {
      console.log("Content length:", content.length);
      console.log("Content (first 2000 chars):", content.slice(0, 2000));
      
      // Search for price patterns
      const pricePatterns = [
        /\$\s?(\d+\.?\d*)/g,
        /(\d[\d,]*\.?\d*)\s*(?:DA|DZD|دج)/gi,
        /price[^<]*?(\d+\.?\d*)/gi,
        /(\d+\.?\d*)\s*(?:USD|EUR|OMR|BHD)/gi,
      ];
      
      for (const pattern of pricePatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          console.log(`  Price found: ${match[0]}`);
        }
      }
    } else {
      console.log("Full result:", JSON.stringify(data).slice(0, 2000));
    }
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }

  await sleep(3000);

  // Test 2: Read the product page directly (US locale)
  console.log("\n--- Test 2: page_reader on US product page ---");
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: `https://www.temu.com/-g-${GOODS_ID}.html`,
    });
    const data = typeof result === "string" ? JSON.parse(result) : result;
    
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    if (content) {
      console.log("Content length:", content.length);
      console.log("Content (first 2000 chars):", content.slice(0, 2000));
      
      // Search for price
      const pricePatterns = [
        /\$\s?(\d+\.?\d*)/g,
        /(\d[\d,]*\.?\d*)\s*(?:DA|DZD|دج)/gi,
      ];
      for (const pattern of pricePatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          console.log(`  Price found: ${match[0]}`);
        }
      }
    } else {
      console.log("Full result:", JSON.stringify(data).slice(0, 3000));
    }
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }

  await sleep(3000);

  // Test 3: Read the DZ locale product page
  console.log("\n--- Test 3: page_reader on DZ locale product page ---");
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: `https://www.temu.com/dz-en/goods.html?goods_id=${GOODS_ID}`,
    });
    const data = typeof result === "string" ? JSON.parse(result) : result;
    
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    if (content) {
      console.log("Content length:", content.length);
      console.log("Content (first 3000 chars):", content.slice(0, 3000));
      
      // Search for price
      const pricePatterns = [
        /\$\s?(\d+\.?\d*)/g,
        /(\d[\d,]*\.?\d*)\s*(?:DA|DZD|دج)/gi,
      ];
      for (const pattern of pricePatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          console.log(`  Price found: ${match[0]}`);
        }
      }
    } else {
      console.log("Full result:", JSON.stringify(data).slice(0, 3000));
    }
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }
}

test().catch(console.error);
