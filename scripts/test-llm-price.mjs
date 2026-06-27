#!/usr/bin/env node
/**
 * Test LLM price extraction from Temu page content
 */

import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601101613236742";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
  console.log("=== LLM Price Extraction from Page Content ===\n");
  
  const zai = await ZAI.create();

  // Step 1: Read the DZ locale product page
  console.log("--- Reading DZ locale page ---");
  let dzContent = "";
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: `https://www.temu.com/dz-en/goods.html?goods_id=${GOODS_ID}`,
    });
    const data = typeof result === "string" ? JSON.parse(result) : result;
    dzContent = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    console.log("DZ content length:", dzContent.length);
  } catch (err) {
    console.log("Error reading DZ page:", err.message.slice(0, 200));
  }

  await sleep(2000);

  // Step 2: Read the US locale product page
  console.log("\n--- Reading US locale page ---");
  let usContent = "";
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`,
    });
    const data = typeof result === "string" ? JSON.parse(result) : result;
    usContent = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    console.log("US content length:", usContent.length);
  } catch (err) {
    console.log("Error reading US page:", err.message.slice(0, 200));
  }

  // Step 3: Use LLM to extract price from page content
  console.log("\n--- LLM extraction from DZ page ---");
  if (dzContent) {
    // Take a focused chunk - first look for the product section
    // Usually the product data is in a large JSON blob
    const relevantPart = dzContent.slice(0, Math.min(dzContent.length, 80000));
    
    try {
      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: "system",
            content: `You are a price extraction assistant. You will be given the HTML content of a Temu product page. Extract the product's sale price and original price. Return ONLY a JSON object: {"sale_price": "<amount>", "original_price": "<amount>", "currency": "<currency>", "product_name": "<name>"}. If you cannot find a price, return {"sale_price": null}. Focus on the ACTUAL displayed price, not template variables or config values.`
          },
          {
            role: "user",
            content: `Extract the product price from this Temu product page HTML (goods_id: ${GOODS_ID}). The page is from the Algeria locale (/dz-en/). Look for the actual product price in the HTML content:\n\n${relevantPart.slice(0, 30000)}`
          }
        ],
      });
      
      const response = completion.choices?.[0]?.message?.content || "";
      console.log("LLM Response:", response);
    } catch (err) {
      console.log("LLM Error:", err.message.slice(0, 200));
    }
  }

  // Step 4: Search for price in specific sections of the HTML
  console.log("\n--- Manual price search in DZ content ---");
  if (dzContent) {
    // Look for the product data section
    // Temu often embeds product data in script tags with type="application/json"
    const jsonScriptMatches = [...dzContent.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)];
    console.log(`Found ${jsonScriptMatches.length} JSON script tags`);
    
    for (let i = 0; i < Math.min(jsonScriptMatches.length, 5); i++) {
      const jsonStr = jsonScriptMatches[i][1];
      if (jsonStr.length > 100 && (jsonStr.includes("price") || jsonStr.includes("Price") || jsonStr.includes(GOODS_ID))) {
        console.log(`\nJSON script tag ${i}: length=${jsonStr.length}`);
        // Parse and look for price
        try {
          const parsed = JSON.parse(jsonStr);
          const priceStr = JSON.stringify(parsed).slice(0, 500);
          console.log("Content:", priceStr);
          
          // Search for price in the parsed JSON
          const searchForPrice = (obj, path = "") => {
            if (!obj || typeof obj !== "object") return;
            for (const [key, value] of Object.entries(obj)) {
              const currentPath = path ? `${path}.${key}` : key;
              if (key.toLowerCase().includes("price") && typeof value !== "object") {
                console.log(`  ${currentPath}: ${value}`);
              }
              if (typeof value === "object" && value !== null) {
                searchForPrice(value, currentPath);
              }
            }
          };
          searchForPrice(parsed);
        } catch (e) {
          console.log("Parse error, first 300 chars:", jsonStr.slice(0, 300));
        }
      }
    }

    // Also search for __NEXT_DATA__
    const nextDataMatch = dzContent.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextDataMatch) {
      console.log("\n__NEXT_DATA__ found, length:", nextDataMatch[1].length);
      try {
        const parsed = JSON.parse(nextDataMatch[1]);
        // Navigate to product data
        const pageProps = parsed?.props?.pageProps;
        if (pageProps) {
          console.log("__NEXT_DATA__ pageProps keys:", Object.keys(pageProps).join(", "));
        }
      } catch (e) {
        console.log("Parse error:", e.message.slice(0, 80));
      }
    }
  }
}

test().catch(console.error);
