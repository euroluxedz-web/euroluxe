/**
 * Test script: Try AllOrigins with Item ID URL format
 */
const ITEM_ID = "TV10922608";

async function testItemId() {
  console.log(`Testing Item ID: ${ITEM_ID}`);

  // Test 1: AllOrigins with -i- URL
  const urls = [
    `https://www.temu.com/-i-${ITEM_ID}.html?_x_sessn=us&currency=USD`,
    `https://www.temu.com/search_result.html?search_key=${ITEM_ID}&_x_sessn=us&currency=USD`,
    `https://www.temu.com/-i-${ITEM_ID}.html`,
  ];

  for (const url of urls) {
    console.log(`\n--- Testing: ${url} ---`);
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeout);
      
      console.log(`Status: ${res.status}`);
      const html = await res.text();
      console.log(`HTML length: ${html.length}`);
      
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogUrl = html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1];

      console.log(`OG Title: ${ogTitle || "NOT FOUND"}`);
      console.log(`OG Price: ${ogPrice || "NOT FOUND"} ${ogCurrency || ""}`);
      console.log(`OG Image: ${ogImage ? ogImage.slice(0, 80) + "..." : "NOT FOUND"}`);
      console.log(`OG URL: ${ogUrl || "NOT FOUND"}`);
      
      // Check for goods_id in the HTML
      const gMatch = html.match(/-g-(\d{10,})/);
      if (gMatch) {
        console.log(`Found goods_id: ${gMatch[1]}`);
      }
      
      // Check for window.rawData
      const rawDataMatch = html.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      if (rawDataMatch) {
        const priceMatches = [...rawDataMatch[1].matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
        for (const m of priceMatches) {
          console.log(`rawData price: ${m[1]} = ${m[2]}`);
        }
      }
    } catch (err) {
      console.log(`Error: ${String(err).slice(0, 150)}`);
    }
  }
}

testItemId().catch(console.error);
