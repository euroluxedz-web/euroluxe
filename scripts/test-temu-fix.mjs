/**
 * Quick test script for the Temu price extraction fixes
 * Tests: share URL handling, Item ID support, delivery guarantee detection
 */

const API_URL = "http://localhost:3000/api/scrape-price";

async function testAPI(url, label) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: ${label}`);
  console.log(`Input: ${url}`);
  console.log("-".repeat(60));
  
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(120000),
    });
    
    const data = await res.json();
    
    if (data.success && data.price) {
      console.log(`✅ Price found: $${data.price} USD = ${data.dzd} DZD`);
      console.log(`   Product: ${data.productName || "N/A"}`);
      console.log(`   Source: ${data.source || "N/A"}`);
      console.log(`   Image: ${data.productImage ? "Yes" : "No"}`);
      console.log(`   Item ID: ${data.itemId || "N/A"}`);
    } else if (data.success && data.requiresManualPrice) {
      console.log(`⚠️ Product found but requires manual price entry`);
      console.log(`   Product: ${data.productName || "N/A"}`);
      console.log(`   Image: ${data.productImage ? "Yes" : "No"}`);
      console.log(`   Message: ${data.message || "N/A"}`);
    } else {
      console.log(`❌ Failed: ${data.error || "Unknown error"}`);
      console.log(`   Allow manual: ${data.allowManual || false}`);
    }
  } catch (err) {
    console.log(`💥 Error: ${err.message}`);
  }
}

async function main() {
  console.log("Temu Price Extraction - Fix Test");
  console.log("=================================\n");
  
  // Test 1: Share URL (Algerian market)
  // This should NOT return $30.00 / 9,000 DA
  await testAPI("https://share.temu.com/7d4cdBt01yB", "Share URL (Algerian market)");
  
  // Test 2: Item ID
  await testAPI("TV10922608", "Item ID (TV10922608)");
  
  // Test 3: Direct product URL with goods_id
  await testAPI("https://www.temu.com/-g-601101613236742.html", "Direct URL with goods_id");
  
  console.log("\n" + "=".repeat(60));
  console.log("Tests completed!");
}

main().catch(console.error);
