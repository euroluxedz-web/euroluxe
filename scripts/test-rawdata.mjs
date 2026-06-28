// Examine the rawData from the dz-en goods.html page
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";

const GOODS_ID = "601102757183337";

async function examineRawData() {
  const zai = await ZAI.create();
  
  // Read the dz-en goods.html page
  const dzUrl = `https://www.temu.com/dz-en/goods.html?_bg_fs=1&goods_id=${GOODS_ID}&locale_override=4~en~USD`;
  console.log(`Reading: ${dzUrl}`);
  
  const pageResult = await zai.invokeFunction("page_reader", {
    url: dzUrl,
  });

  const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
  const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;

  if (!content) {
    console.log("No content!");
    return;
  }

  console.log(`Content length: ${content.length}`);

  // Extract rawData
  const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
  if (rawDataMatch) {
    const rawData = rawDataMatch[1];
    console.log(`\nrawData length: ${rawData.length}`);
    
    // Save rawData for analysis
    fs.writeFileSync("/home/z/my-project/download/rawdata-dz-en.json", rawData);
    console.log("Saved rawData to /home/z/my-project/download/rawdata-dz-en.json");
    
    // Search for ALL price-related patterns
    console.log("\n=== Price-related patterns in rawData ===");
    
    // 1. Direct price fields
    const priceFields = ["minPrice", "salePrice", "price", "marketPrice", "origPrice", "appPrice", "priceNum", "displayPrice", "normalPrice", "minAppPrice"];
    for (const field of priceFields) {
      const re = new RegExp(`"${field}"\\s*:\\s*"?([\\d.]+)"?`, "g");
      const matches = [...rawData.matchAll(re)];
      if (matches.length > 0) {
        console.log(`  ${field}: ${matches.map(m => m[1]).join(", ")}`);
      }
    }
    
    // 2. priceInfo blocks
    const priceInfoMatches = [...rawData.matchAll(/"priceInfo"\s*:\s*\{([^}]+)\}/g)];
    console.log(`\n  priceInfo blocks: ${priceInfoMatches.length}`);
    for (let i = 0; i < Math.min(priceInfoMatches.length, 5); i++) {
      console.log(`    ${i + 1}. ${priceInfoMatches[i][1].slice(0, 200)}`);
    }
    
    // 3. Currency field
    const currencyMatches = [...rawData.matchAll(/"currency"\s*:\s*"([^"]+)"/g)];
    const currencies = [...new Set(currencyMatches.map(m => m[1]))];
    console.log(`\n  Currencies found: ${currencies.join(", ")}`);
    
    // 4. Search for the goods_id
    if (rawData.includes(GOODS_ID)) {
      console.log(`\n  ✓ goods_id "${GOODS_ID}" FOUND in rawData`);
      const gidIdx = rawData.indexOf(GOODS_ID);
      const window = rawData.slice(Math.max(0, gidIdx - 500), Math.min(rawData.length, gidIdx + 5000));
      console.log(`  Context around goods_id (500 before + 5000 after):`);
      console.log(`  ${window.slice(0, 500)}`);
    } else {
      console.log(`\n  ✗ goods_id "${GOODS_ID}" NOT found in rawData`);
    }
    
    // 5. Search for "sunglasses" or "glasses" to find the product section
    const productKeywords = ["sunglasses", "glasses", "sunglass", "8pcs"];
    for (const keyword of productKeywords) {
      if (rawData.toLowerCase().includes(keyword.toLowerCase())) {
        const idx = rawData.toLowerCase().indexOf(keyword.toLowerCase());
        console.log(`\n  Found "${keyword}" at position ${idx}`);
        const context = rawData.slice(Math.max(0, idx - 200), Math.min(rawData.length, idx + 500));
        console.log(`  Context: ${context.slice(0, 300)}`);
      }
    }
    
    // 6. Try to parse the rawData as JSON
    try {
      const parsed = JSON.parse(rawData);
      console.log(`\n  rawData parsed as JSON! Keys: ${Object.keys(parsed).join(", ")}`);
      
      // Look for goods data
      const findGoods = (obj, path = "") => {
        if (!obj || typeof obj !== "object") return;
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          if (key === "goods" || key === "goodsDetail" || key === "product" || key === "detail") {
            console.log(`  Found goods object at: ${currentPath}`);
            if (value && typeof value === "object") {
              console.log(`    Keys: ${Object.keys(value).join(", ")}`);
              // Look for price in the goods object
              for (const [k, v] of Object.entries(value)) {
                if (typeof v === "number" || (typeof v === "string" && /^\d+\.?\d*$/.test(v))) {
                  if (k.toLowerCase().includes("price") || k.toLowerCase().includes("amount") || k === "minPrice" || k === "salePrice") {
                    console.log(`    ★ ${k}: ${v}`);
                  }
                }
              }
            }
          }
          if (typeof value === "object" && value !== null) {
            findGoods(value, currentPath);
          }
        }
      };
      findGoods(parsed);
      
    } catch (e) {
      console.log(`\n  rawData is not valid JSON: ${e.message?.slice(0, 100)}`);
    }
  } else {
    console.log("No rawData found!");
  }
}

examineRawData();
