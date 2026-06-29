/**
 * Test the deployed API with share URLs
 */

async function testAPI(shareUrl) {
  console.log(`\nTesting: ${shareUrl}`);
  try {
    const response = await fetch("https://my-project-m4bjghiwd-euroluxedz-4371s-projects.vercel.app/api/scrape-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: shareUrl }),
    });
    const data = await response.json();
    console.log(`  Success: ${data.success}`);
    console.log(`  Price: $${data.price} / ${data.dzd} DA`);
    console.log(`  Source: ${data.source}`);
    console.log(`  Product: ${data.productName}`);
    if (data.requiresManualPrice) console.log(`  ⚠️ Requires manual price`);
    if (data.error) console.log(`  Error: ${data.error}`);
    return data;
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
}

async function main() {
  await testAPI("https://share.temu.com/7d4cdBt01yB");
  await new Promise(r => setTimeout(r, 3000));
  
  await testAPI("https://share.temu.com/t0mQUcAlkoB");
  await new Promise(r => setTimeout(r, 3000));
  
  await testAPI("https://share.temu.com/iEXtmO1ZX5B");
  await new Promise(r => setTimeout(r, 3000));
  
  // Test Item ID
  await testAPI("TV10922608");
}

main().catch(console.error);
