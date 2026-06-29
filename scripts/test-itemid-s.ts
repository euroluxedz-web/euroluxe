/**
 * Test script: Try the -s- URL format discovered from Item ID search
 */
const ITEM_ID = "TV10922608";

async function testSUrl() {
  const urls = [
    `https://www.temu.com/${ITEM_ID.toLowerCase()}-s.html?_x_sessn=us&currency=USD`,
    `https://www.temu.com/${ITEM_ID.toLowerCase()}-s.html`,
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
      
      // Extract goods_id
      const gMatch = html.match(/-g-(\d{10,})/);
      if (gMatch) {
        console.log(`Found goods_id: ${gMatch[1]}`);
      }
      const gidMatch = html.match(/"goods_id"\s*:\s*"?(\d{10,})"?/);
      if (gidMatch) {
        console.log(`Found goods_id in JSON: ${gidMatch[1]}`);
      }

      // Check for priceInfo blocks
      const priceInfoMatches = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      for (const pi of priceInfoMatches) {
        console.log(`priceInfo: ${parseInt(pi[1]) / 100} ${pi[2]}`);
      }

      // Check for minPrice
      const minPrices = [...html.matchAll(/"minPrice"\s*:\s*(\d+)/g)];
      for (const m of minPrices) {
        console.log(`minPrice: ${m[1]} (÷100 = ${parseInt(m[1]) / 100})`);
      }

      // Check rawData
      const rawDataMatch = html.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      if (rawDataMatch) {
        console.log(`rawData found: ${rawDataMatch[1].length} chars`);
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

testSUrl().catch(console.error);
