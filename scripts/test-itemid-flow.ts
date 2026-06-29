/**
 * Test script: Extract goods_id from Temu search page for Item ID
 * Then use goods_id to get the price via AllOrigins
 */
import ZAI from "z-ai-web-dev-sdk";

const ITEM_ID = "TV10922608";

async function testItemIdFlow() {
  console.log(`Testing Item ID flow: ${ITEM_ID}\n`);

  // Step 1: ZAI Web search to find the product
  console.log("[1] Web search for Item ID...");
  try {
    const zai = await ZAI.create();
    const results = await (zai as any).invokeFunction("web_search", {
      query: `temu "${ITEM_ID}"`,
      num: 5,
    });
    if (Array.isArray(results)) {
      for (const r of results) {
        console.log(`  Result: ${r.name}`);
        console.log(`  URL: ${r.url}`);
        console.log(`  Snippet: ${(r.snippet || "").slice(0, 150)}`);
        // Extract goods_id from URL
        const gMatch = r.url?.match(/-g-(\d{10,})/);
        if (gMatch) {
          console.log(`  ★ Found goods_id: ${gMatch[1]}`);
        }
      }
    }
  } catch (err) {
    console.log(`Error: ${String(err).slice(0, 150)}`);
  }

  // Step 2: ZAI Page Reader on the -i- URL to follow the redirect
  console.log("\n[2] Page Reader on -i- URL...");
  try {
    const zai = await ZAI.create();
    const pageResult = await (zai as any).invokeFunction("page_reader", {
      url: `https://www.temu.com/-i-${ITEM_ID}.html`,
    });
    const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    console.log(`  Content length: ${content?.length || 0}`);
    
    if (content) {
      // Extract goods_id
      const gMatch = content.match(/-g-(\d{10,})/);
      if (gMatch) {
        console.log(`  ★ Found goods_id: ${gMatch[1]}`);
        
        // Try AllOrigins with this goods_id
        console.log(`\n  [2b] Trying AllOrigins with goods_id ${gMatch[1]}...`);
        const productUrl = `https://www.temu.com/-g-${gMatch[1]}.html?_x_sessn=us&currency=USD`;
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(productUrl)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeout);
        const html = await res.text();
        console.log(`  HTML length: ${html.length}`);
        
        const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
        const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
        const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
        console.log(`  OG Title: ${ogTitle || "NOT FOUND"}`);
        console.log(`  OG Price: ${ogPrice || "NOT FOUND"} ${ogCurrency || ""}`);
      }

      // Check for priceInfo
      const priceInfoMatches = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      for (const pi of priceInfoMatches) {
        console.log(`  priceInfo: ${parseInt(pi[1]) / 100} ${pi[2]}`);
      }
    }
  } catch (err) {
    console.log(`Error: ${String(err).slice(0, 150)}`);
  }

  // Step 3: AllOrigins on Temu search page for Item ID
  console.log("\n[3] AllOrigins on Temu search page...");
  try {
    const searchUrl = `https://www.temu.com/search_result.html?search_key=${ITEM_ID}&_x_sessn=us&currency=USD`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(searchUrl)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeout);
    const html = await res.text();
    console.log(`  HTML length: ${html.length}`);
    
    // Extract goods_id from search results
    const gMatches = [...html.matchAll(/-g-(\d{10,})/g)];
    const uniqueGoodsIds = [...new Set(gMatches.map(m => m[1]))];
    console.log(`  Found goods_ids: ${uniqueGoodsIds.join(", ")}`);
    
    // Check for priceInfo in search results
    const priceInfoMatches = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
    for (const pi of priceInfoMatches) {
      console.log(`  priceInfo: ${parseInt(pi[1]) / 100} ${pi[2]}`);
    }

    // Check for minPrice
    const minPrices = [...html.matchAll(/"minPrice"\s*:\s*(\d+)/g)];
    for (const m of minPrices) {
      console.log(`  minPrice: ${m[1]} (÷100 = ${parseInt(m[1]) / 100})`);
    }
    
    // If we found a goods_id, try getting price from it
    if (uniqueGoodsIds.length > 0) {
      const firstGoodsId = uniqueGoodsIds[0];
      console.log(`\n  [3b] Trying AllOrigins with goods_id ${firstGoodsId}...`);
      const productUrl = `https://www.temu.com/-g-${firstGoodsId}.html?_x_sessn=us&currency=USD`;
      const prodProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(productUrl)}`;
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 15000);
      const res2 = await fetch(prodProxyUrl, { signal: controller2.signal });
      clearTimeout(timeout2);
      const html2 = await res2.text();
      console.log(`  HTML length: ${html2.length}`);
      
      const ogTitle2 = html2.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogPrice2 = html2.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogCurrency2 = html2.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
      console.log(`  OG Title: ${ogTitle2 || "NOT FOUND"}`);
      console.log(`  OG Price: ${ogPrice2 || "NOT FOUND"} ${ogCurrency2 || ""}`);
    }
  } catch (err) {
    console.log(`Error: ${String(err).slice(0, 150)}`);
  }
}

testItemIdFlow().catch(console.error);
