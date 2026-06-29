/**
 * Minimal test: Just test one URL with timeout
 */
const BASE_URL = "https://my-project-lime-pi.vercel.app";

async function main() {
  console.log("Testing (with 90s timeout)...");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  
  try {
    const start = Date.now();
    const res = await fetch(`${BASE_URL}/api/scrape-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://share.temu.com/iEXtmO1ZX5B" }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    console.log(`Time: ${((Date.now() - start) / 1000).toFixed(1)}s`);
    console.log(`Success: ${data.success}`);
    console.log(`Price: $${data.price} / ${data.dzd} DA`);
    console.log(`Source: ${data.source}`);
    console.log(`Product: ${data.productName}`);
    console.log(`Image: ${data.productImage ? 'YES' : 'NO'}`);
    if (data.requiresManualPrice) console.log(`⚠️ Requires manual price`);
    if (data.error) console.log(`Error: ${data.error}`);
  } catch (e) {
    clearTimeout(timer);
    console.log(`Error after ${((Date.now() - start) / 1000).toFixed(1)}s: ${e.message}`);
  }
}

main();
