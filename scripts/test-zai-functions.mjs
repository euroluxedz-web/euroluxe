#!/usr/bin/env node
/**
 * Test ZAI SDK available functions
 */

import ZAI from "z-ai-web-dev-sdk";

async function test() {
  console.log("=== ZAI SDK Functions Test ===\n");
  
  const zai = await ZAI.create();
  
  // List available functions
  console.log("SDK methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(zai)).filter(m => m !== 'constructor'));
  console.log("SDK properties:", Object.keys(zai));
  
  // Try page_reader (the web-reader skill name)
  console.log("\n--- Trying page_reader ---");
  try {
    const result = await zai.invokeFunction("page_reader", {
      url: "https://www.temu.com/dz-en/goods.html?goods_id=601101613236742",
    });
    console.log("page_reader result type:", typeof result);
    if (typeof result === "string") {
      console.log("Content (first 1000 chars):", result.slice(0, 1000));
    } else {
      console.log("Result:", JSON.stringify(result).slice(0, 1000));
    }
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }

  // Try read_web_page
  console.log("\n--- Trying read_web_page ---");
  try {
    const result = await zai.invokeFunction("read_web_page", {
      url: "https://www.temu.com/dz-en/goods.html?goods_id=601101613236742",
    });
    console.log("read_web_page result type:", typeof result);
    if (typeof result === "string") {
      console.log("Content (first 1000 chars):", result.slice(0, 1000));
    } else {
      console.log("Result:", JSON.stringify(result).slice(0, 1000));
    }
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }

  // Try web_page_reader
  console.log("\n--- Trying web_page_reader ---");
  try {
    const result = await zai.invokeFunction("web_page_reader", {
      url: "https://www.temu.com/dz-en/goods.html?goods_id=601101613236742",
    });
    console.log("web_page_reader result type:", typeof result);
    if (typeof result === "string") {
      console.log("Content (first 1000 chars):", result.slice(0, 1000));
    } else {
      console.log("Result:", JSON.stringify(result).slice(0, 1000));
    }
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }

  // Try web-reader
  console.log("\n--- Trying web-reader ---");
  try {
    const result = await zai.invokeFunction("web-reader", {
      url: "https://www.temu.com/dz-en/goods.html?goods_id=601101613236742",
    });
    console.log("web-reader result type:", typeof result);
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }

  // Try web_reader (with underscore)
  console.log("\n--- Trying web_reader ---");
  try {
    const result = await zai.invokeFunction("web_reader", {
      url: "https://www.temu.com/dz-en/goods.html?goods_id=601101613236742",
    });
    console.log("web_reader result type:", typeof result);
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }

  // Try fetch
  console.log("\n--- Trying fetch ---");
  try {
    const result = await zai.invokeFunction("fetch", {
      url: "https://www.temu.com/dz-en/goods.html?goods_id=601101613236742",
    });
    console.log("fetch result type:", typeof result);
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }
  
  // Try http_get
  console.log("\n--- Trying http_get ---");
  try {
    const result = await zai.invokeFunction("http_get", {
      url: "https://www.temu.com/dz-en/goods.html?goods_id=601101613236742",
    });
    console.log("http_get result type:", typeof result);
  } catch (err) {
    console.log("Error:", err.message.slice(0, 200));
  }
}

test().catch(console.error);
