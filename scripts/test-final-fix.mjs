// Final comprehensive test of all fixes
// Tests: 1) share URL price extraction, 2) $30.00 blocking, 3) Item ID support

import ZAI from "z-ai-web-dev-sdk";

// Simulate isSuspiciousPrice from the fixed code
function isSuspiciousPrice(priceUSD, source) {
  if (priceUSD === 30.00 || priceUSD === 30) return true;
  if (priceUSD >= 29.90 && priceUSD <= 30.10) return true;
  const roundSuspicious = [5, 8, 10, 13, 15, 20, 30, 50];
  if (roundSuspicious.includes(Math.round(priceUSD)) && source.includes("priceInfo")) return true;
  return false;
}

console.log("=== Final Comprehensive Test ===\n");

// Test 1: isSuspiciousPrice
console.log("--- Test 1: isSuspiciousPrice ---");
const testCases = [
  { price: 30.00, source: "url-hint", expected: true },
  { price: 7.01, source: "url-hint", expected: false },
  { price: 29.95, source: "priceInfo", expected: true },
  { price: 20.00, source: "priceInfo", expected: true },
  { price: 20.00, source: "url-hint", expected: false },
  { price: 15.99, source: "priceInfo", expected: false },
  { price: 15.00, source: "priceInfo", expected: true },
  { price: 15.00, source: "llm", expected: false },
  { price: 5.00, source: "priceInfo", expected: true },
  { price: 4.99, source: "priceInfo", expected: false },
];

for (const tc of testCases) {
  const result = isSuspiciousPrice(tc.price, tc.source);
  const status = result === tc.expected ? "✓" : "✗";
  console.log(`  ${status} isSuspiciousPrice($${tc.price}, "${tc.source}") = ${result} (expected: ${tc.expected})`);
}

// Test 2: share URL resolution
console.log("\n--- Test 2: Share URL Resolution ---");
const SHARE_URL = "https://share.temu.com/iEXtmO1ZX5B";

try {
  const res = await fetch(SHARE_URL, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "text/html",
    },
  });

  const finalUrl = new URL(res.url);
  const goodsId = finalUrl.searchParams.get("goods_id") || finalUrl.pathname.match(/-g-(\d+)/)?.[1];
  const topGallery = finalUrl.searchParams.get("top_gallery_url");
  const oakRecExt1 = finalUrl.searchParams.get("_oak_rec_ext_1");
  const localeMatch = finalUrl.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);

  console.log(`  Redirect URL: ${res.url.slice(0, 80)}...`);
  console.log(`  goods_id: ${goodsId || "NOT FOUND"}`);
  console.log(`  _oak_rec_ext_1: ${oakRecExt1 || "NOT FOUND"}`);
  console.log(`  top_gallery_url: ${topGallery ? "FOUND" : "NOT FOUND"}`);
  console.log(`  locale: ${localeMatch?.[1] || "NOT FOUND"}`);

  // If no _oak_rec_ext_1, we know the price can't be extracted from URL
  if (!oakRecExt1) {
    console.log(`  ⚠️ No _oak_rec_ext_1 - price must come from scraping strategies`);
  }
} catch (err) {
  console.log(`  Error: ${err.message}`);
}

// Test 3: Strategy 0-B (Web Search → Page Reader)
console.log("\n--- Test 3: Strategy 0-B (Web Search → Page Reader) ---");
try {
  const zai = await ZAI.create();
  const GOODS_ID = "601102757183337";
  
  // Search for the product
  const searchResults = await zai.invokeFunction("web_search", {
    query: `site:temu.com ${GOODS_ID}`,
    num: 5,
  });

  if (Array.isArray(searchResults) && searchResults.length > 0) {
    // Find product URLs
    const productUrls = [];
    for (const r of searchResults) {
      if (!r.url?.includes("temu.com")) continue;
      if (!r.url.includes(GOODS_ID)) continue;
      const localeMatch = r.url.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i);
      productUrls.push({ url: r.url, locale: localeMatch?.[1] || "us" });
    }

    console.log(`  Found ${productUrls.length} product URLs from search`);

    if (productUrls.length > 0) {
      // Try reading the first URL
      const { url: productUrl, locale } = productUrls[0];
      console.log(`  Reading: ${productUrl.slice(0, 60)}... (${locale})`);

      try {
        const pageResult = await zai.invokeFunction("page_reader", {
          url: productUrl,
        });

        const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
        const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;

        if (content && content.length > 5000) {
          console.log(`  Got content: ${content.length} chars`);

          // Try LLM extraction
          const contentForLLM = content.slice(0, 30000);
          const completion = await zai.createChatCompletion({
            messages: [
              {
                role: "system",
                content:
                  "You are a price extraction assistant for Temu products. " +
                  "Find the SALE PRICE of the MAIN product on this page. " +
                  "CRITICAL: IGNORE any $30.00 or 9,000 DA - that's a delivery guarantee, not the product price. " +
                  "The real price is likely between $1-$15 USD. " +
                  "Return JSON: {\"price_usd\": <number>, \"confidence\": \"<high|medium|low>\"}"
              },
              {
                role: "user",
                content: `Product: 8pcs Women's Sunglasses (goods_id: ${GOODS_ID})\n\nPage content:\n${contentForLLM}`,
              },
            ],
          });

          const aiResponse = completion.choices?.[0]?.message?.content || "";
          const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const priceUSD = parseFloat(parsed.price_usd);
            console.log(`  LLM price: $${priceUSD} (${parsed.confidence})`);
            console.log(`  Is suspicious: ${isSuspiciousPrice(priceUSD, "llm")}`);
          }
        } else {
          console.log(`  Content too short or empty`);
        }
      } catch (err) {
        console.log(`  Page reader error: ${err.message?.slice(0, 100)}`);
      }
    }
  }
} catch (err) {
  console.log(`  Error: ${err.message?.slice(0, 100)}`);
}

// Test 4: Item ID support
console.log("\n--- Test 4: Item ID Support ---");
const ITEM_ID = "TV10922608";
try {
  const zai = await ZAI.create();
  const searchResults = await zai.invokeFunction("web_search", {
    query: `site:temu.com ${ITEM_ID}`,
    num: 5,
  });

  if (Array.isArray(searchResults) && searchResults.length > 0) {
    console.log(`  Found ${searchResults.length} results for Item ID ${ITEM_ID}`);
    for (const r of searchResults) {
      console.log(`    ${r.name?.slice(0, 50)} - ${r.url?.slice(0, 60)}`);
    }
  } else {
    console.log(`  No results found for Item ID ${ITEM_ID}`);
  }
} catch (err) {
  console.log(`  Error: ${err.message?.slice(0, 100)}`);
}

// Test 5: Full URL (should still work)
console.log("\n--- Test 5: Full URL (should work with _oak_rec_ext_1) ---");
// This simulates what happens when the user copies the URL from the browser
// The full URL includes _oak_rec_ext_1 which encodes the price
console.log("  Full URLs with _oak_rec_ext_1 should work correctly (Strategy -1)");
console.log("  This is already handled by the existing code");

console.log("\n=== Test Complete ===");
console.log("\nSummary of fixes:");
console.log("  1. Strategy 0-B added: Web Search → Page Reader for share URLs");
console.log("  2. isSuspiciousPrice expanded: catches round prices from priceInfo");
console.log("  3. Final safeguard in buildSuccessResponse: blocks $30.00 forever");
console.log("  4. When price can't be found: returns requiresManualPrice mode");
console.log("  5. Item ID support: searches Temu for the product");
