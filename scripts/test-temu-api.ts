/**
 * Test script: Try different Temu API endpoints with the goods_id
 * from share.temu.com links
 */
import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601105214745191"; // From share.temu.com/t0mQUcAlkoB - Expected price: $7.01

async function testApis() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Testing Temu API endpoints for goods_id: ${GOODS_ID}`);
  console.log(`Expected price: $7.01 (2,103 DA)`);
  console.log(`${"=".repeat(80)}\n`);

  // Test 1: BG API
  console.log("[1] Testing BG API...");
  try {
    const bgUrl = `https://www.temu.com/bg/goods/api?goodsId=${GOODS_ID}&_x_sessn=us&currency=USD`;
    const res = await fetch(bgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
    });
    console.log(`  Status: ${res.status}`);
    const text = await res.text();
    console.log(`  Response (${text.length} chars): ${text.slice(0, 500)}`);
    
    if (text.includes("{")) {
      try {
        const json = JSON.parse(text);
        console.log(`  Parsed keys: ${Object.keys(json).join(", ")}`);
        if (json.data?.goods?.minPrice) {
          console.log(`  ★ minPrice: ${json.data.goods.minPrice}`);
        }
        if (json.data?.goods?.salePrice) {
          console.log(`  ★ salePrice: ${json.data.goods.salePrice}`);
        }
      } catch { /* not JSON */ }
    }
  } catch (err) {
    console.log(`  Error: ${String(err).slice(0, 150)}`);
  }

  // Test 2: Temu goods API (different endpoint)
  console.log("\n[2] Testing /api/goods/detail...");
  try {
    const apiUrl = `https://www.temu.com/api/goods/detail?goods_id=${GOODS_ID}&_x_sessn=us&currency=USD`;
    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
      },
    });
    console.log(`  Status: ${res.status}`);
    const text = await res.text();
    console.log(`  Response (${text.length} chars): ${text.slice(0, 500)}`);
  } catch (err) {
    console.log(`  Error: ${String(err).slice(0, 150)}`);
  }

  // Test 3: AllOrigins proxy for US product page
  console.log("\n[3] Testing AllOrigins proxy for US product page...");
  try {
    const productUrl = `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(productUrl)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeout);
    console.log(`  Status: ${res.status}`);
    const text = await res.text();
    console.log(`  HTML length: ${text.length}`);
    
    // Check OG tags
    const ogTitle = text.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogPrice = text.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogCurrency = text.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
    console.log(`  OG Title: ${ogTitle || "NOT FOUND"}`);
    console.log(`  OG Price: ${ogPrice || "NOT FOUND"} ${ogCurrency || ""}`);
    
    // Check for priceInfo
    const priceInfoMatches = [...text.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
    for (const pi of priceInfoMatches) {
      console.log(`  priceInfo: ${parseInt(pi[1]) / 100} ${pi[2]}`);
    }
  } catch (err) {
    console.log(`  Error: ${String(err).slice(0, 150)}`);
  }

  // Test 4: AllOrigins proxy for DZ product page
  console.log("\n[4] Testing AllOrigins proxy for DZ product page...");
  try {
    const productUrl = `https://www.temu.com/dz-en/goods.html?goods_id=${GOODS_ID}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(productUrl)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeout);
    console.log(`  Status: ${res.status}`);
    const text = await res.text();
    console.log(`  HTML length: ${text.length}`);
    
    const ogTitle = text.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogPrice = text.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogCurrency = text.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogImage = text.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
    console.log(`  OG Title: ${ogTitle || "NOT FOUND"}`);
    console.log(`  OG Price: ${ogPrice || "NOT FOUND"} ${ogCurrency || ""}`);
    console.log(`  OG Image: ${ogImage ? ogImage.slice(0, 80) + "..." : "NOT FOUND"}`);
    
    // Check for priceInfo
    const priceInfoMatches = [...text.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
    for (const pi of priceInfoMatches) {
      console.log(`  priceInfo: ${parseInt(pi[1]) / 100} ${pi[2]}`);
    }
  } catch (err) {
    console.log(`  Error: ${String(err).slice(0, 150)}`);
  }

  // Test 5: ZAI Page Reader on US product page
  console.log("\n[5] Testing ZAI Page Reader on US product page...");
  try {
    const zai = await ZAI.create();
    const productUrl = `https://www.temu.com/-g-${GOODS_ID}.html?_x_sessn=us&currency=USD`;
    const pageResult = await (zai as any).invokeFunction("page_reader", { url: productUrl });
    const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    console.log(`  Content length: ${content?.length || 0}`);

    if (content && content.length > 1000) {
      // Check OG tags
      const ogTitle = content.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogCurrency = content.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
      console.log(`  OG Title: ${ogTitle || "NOT FOUND"}`);
      console.log(`  OG Price: ${ogPrice || "NOT FOUND"} ${ogCurrency || ""}`);

      // Check for priceInfo
      const priceInfoMatches = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      for (const pi of priceInfoMatches) {
        console.log(`  priceInfo: ${parseInt(pi[1]) / 100} ${pi[2]}`);
      }

      // Check for rawData
      const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      if (rawDataMatch) {
        console.log(`  rawData found: ${rawDataMatch[1].length} chars`);
        const priceMatches = [...rawDataMatch[1].matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice|priceNum|displayPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
        for (const m of priceMatches) {
          console.log(`  rawData price: ${m[1]} = ${m[2]}`);
        }
      }

      // Check for minPrice / salePrice anywhere
      const minPrices = [...content.matchAll(/"minPrice"\s*:\s*(\d+)/g)];
      for (const m of minPrices) {
        console.log(`  minPrice: ${m[1]} (÷100 = ${parseInt(m[1]) / 100})`);
      }
      const salePrices = [...content.matchAll(/"salePrice"\s*:\s*(\d+)/g)];
      for (const m of salePrices) {
        console.log(`  salePrice: ${m[1]} (÷100 = ${parseInt(m[1]) / 100})`);
      }
    }
  } catch (err) {
    console.log(`  Error: ${String(err).slice(0, 150)}`);
  }

  // Test 6: ZAI Web Search with goods_id
  console.log("\n[6] Testing ZAI Web Search with goods_id...");
  try {
    const zai = await ZAI.create();
    const results = await (zai as any).invokeFunction("web_search", {
      query: `temu 601105214745191 price`,
      num: 5,
    });
    if (Array.isArray(results)) {
      for (const r of results) {
        console.log(`  Result: ${r.name}`);
        console.log(`    URL: ${r.url}`);
        console.log(`    Snippet: ${r.snippet || "No snippet"}`);
      }
    }
  } catch (err) {
    console.log(`  Error: ${String(err).slice(0, 150)}`);
  }

  // Test 7: ZAI Page Reader on DZ product page  
  console.log("\n[7] Testing ZAI Page Reader on DZ product page...");
  try {
    const zai = await ZAI.create();
    const productUrl = `https://www.temu.com/dz-en/goods.html?goods_id=${GOODS_ID}`;
    const pageResult = await (zai as any).invokeFunction("page_reader", { url: productUrl });
    const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
    const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
    console.log(`  Content length: ${content?.length || 0}`);

    if (content && content.length > 1000) {
      const ogTitle = content.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogCurrency = content.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
      console.log(`  OG Title: ${ogTitle || "NOT FOUND"}`);
      console.log(`  OG Price: ${ogPrice || "NOT FOUND"} ${ogCurrency || ""}`);

      // Check for minPrice/salePrice
      const minPrices = [...content.matchAll(/"minPrice"\s*:\s*(\d+)/g)];
      for (const m of minPrices) {
        console.log(`  minPrice: ${m[1]} (÷100 = ${parseInt(m[1]) / 100})`);
      }

      // Check for priceInfo
      const priceInfoMatches = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      for (const pi of priceInfoMatches) {
        console.log(`  priceInfo: ${parseInt(pi[1]) / 100} ${pi[2]}`);
      }
    }
  } catch (err) {
    console.log(`  Error: ${String(err).slice(0, 150)}`);
  }
}

testApis().catch(console.error);
