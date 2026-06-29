/**
 * Test the deployed API on my-project-lime-pi.vercel.app
 */

const BASE_URL = "https://my-project-lime-pi.vercel.app";

async function testAPI(url, label) {
  console.log(`\n=== Testing: ${label} ===`);
  console.log(`URL: ${url}`);
  try {
    const startTime = Date.now();
    const response = await fetch(`${BASE_URL}/api/scrape-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const data = await response.json();
    console.log(`  Time: ${elapsed}s`);
    console.log(`  Success: ${data.success}`);
    if (data.price) {
      console.log(`  ✅ Price: $${data.price} / ${data.dzd?.toLocaleString()} DA`);
    }
    if (data.productName) console.log(`  Product: ${data.productName}`);
    console.log(`  Source: ${data.source}`);
    if (data.productImage) console.log(`  Image: YES`);
    if (data.requiresManualPrice) console.log(`  ⚠️ Requires manual price`);
    if (data.error) console.log(`  Error: ${data.error}`);
    if (data.originalPrice) console.log(`  Original price: $${data.originalPrice}`);
    return data;
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }
}

async function main() {
  // Test 1: Share URL that was returning 30.00$
  await testAPI("https://share.temu.com/7d4cdBt01yB", "Share URL 1 (7d4cdBt01yB)");
  await new Promise(r => setTimeout(r, 2000));
  
  // Test 2: Another share URL
  await testAPI("https://share.temu.com/t0mQUcAlkoB", "Share URL 2 (t0mQUcAlkoB)");
  await new Promise(r => setTimeout(r, 2000));
  
  // Test 3: Another share URL  
  await testAPI("https://share.temu.com/iEXtmO1ZX5B", "Share URL 3 (iEXtmO1ZX5B)");
  await new Promise(r => setTimeout(r, 2000));
  
  // Test 4: Item ID
  await testAPI("TV10922608", "Item ID (TV10922608)");
  await new Promise(r => setTimeout(r, 2000));
  
  // Test 5: Full URL (should still work)
  await testAPI("https://www.temu.com/-g-601102757183337.html", "Full URL (goods_id)");
}

main().catch(console.error);
