/**
 * Test ZAI page_reader to read a Temu product page
 * This uses a real headless browser that can solve the JS challenge
 */

import ZAI from "z-ai-web-dev-sdk";

async function main() {
  const goodsId = "601102757183337"; // iEXtmO1ZX5B
  
  console.log("Creating ZAI instance...");
  const zai = await ZAI.create();

  // Test 1: Read the US product page directly
  const testUrls = [
    { url: `https://www.temu.com/-g-${goodsId}.html`, label: "US product page" },
    { url: `https://share.temu.com/iEXtmO1ZX5B`, label: "Share URL directly" },
    { url: `https://www.temu.com/dz-en/goods.html?goods_id=${goodsId}`, label: "DZ-en goods page" },
  ];

  for (const { url, label } of testUrls) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`[PageReader] Reading (${label}): ${url}`);
    console.log("=".repeat(60));

    try {
      const pageResult = await zai.invokeFunction("page_reader", { url });
      const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
      const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
      
      if (!content || content.length < 100) {
        console.log(`No content or too short (${content?.length || 0} chars)`);
        continue;
      }

      console.log(`Got content: ${content.length} chars`);

      // Check for OG price
      const ogPrice = content.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
      const ogCurrency = content.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
      const ogTitle = content.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
      const ogImage = content.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      console.log(`OG price: ${ogPrice?.[1] || "none"}`);
      console.log(`OG currency: ${ogCurrency?.[1] || "none"}`);
      console.log(`OG title: ${ogTitle?.[1]?.slice(0, 80) || "none"}`);

      // Check for window.rawData
      const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      console.log(`window.rawData: ${rawDataMatch ? "YES" : "NO"}`);

      if (rawDataMatch) {
        const rawDataStr = rawDataMatch[1];
        const priceFields = [...rawDataStr.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice|priceNum|displayPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
        console.log(`Price fields:`);
        for (const m of priceFields) {
          console.log(`  ${m[1]}: ${m[2]}`);
        }
        const currencyMatch = rawDataStr.match(/"currency"\s*:\s*"([^"]+)"/);
        console.log(`Currency: ${currencyMatch?.[1] || "none"}`);
      }

      // Check for priceInfo blocks
      const priceInfoMatches = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      if (priceInfoMatches.length > 0) {
        console.log(`priceInfo blocks:`);
        for (const pi of priceInfoMatches) {
          console.log(`  price: ${parseInt(pi[1]) / 100} ${pi[2]}`);
        }
      }

      // Dollar prices
      const dollarPrices = [...content.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)];
      if (dollarPrices.length > 0) {
        const unique = [...new Set(dollarPrices.map(m => m[1]))];
        console.log(`\nDollar prices (unique): ${unique.slice(0, 10).join(", ")}`);
      }

      // DZD/DA prices
      const dzdPrices = [...content.matchAll(/([\d,]+(?:\.\d{1,2})?)\s*(?:DA|DZD)/gi)];
      if (dzdPrices.length > 0) {
        const unique = [...new Set(dzdPrices.map(m => m[1]))];
        console.log(`DZD/DA prices (unique): ${unique.slice(0, 10).join(", ")}`);
      }

    } catch (err) {
      console.log(`Error: ${err.message?.slice(0, 200)}`);
    }
  }
}

main().catch(console.error);
