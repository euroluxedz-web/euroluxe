/**
 * Final test: Extract price from web search snippets
 * We found that search results contain prices like "519.36 Rs"
 * Let's verify this approach works reliably
 */

import ZAI from "z-ai-web-dev-sdk";

async function main() {
  const zai = await ZAI.create();

  const testCases = [
    { goodsId: "601101613236742", shareCode: "7d4cdBt01yB", expectedUSD: 7.01 },
    { goodsId: "601105214745191", shareCode: "t0mQUcAlkoB", expectedUSD: null },
    { goodsId: "601102757183337", shareCode: "iEXtmO1ZX5B", expectedUSD: null },
  ];

  for (const tc of testCases) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`Testing goods_id: ${tc.goodsId} (share: ${tc.shareCode})`);
    console.log("=".repeat(70));

    // Search with different queries
    const queries = [
      `site:temu.com ${tc.goodsId}`,
      `site:temu.com -g-${tc.goodsId}`,
      `temu "${tc.goodsId}" price`,
    ];

    let foundPrice = false;

    for (const query of queries) {
      if (foundPrice) break;
      
      try {
        console.log(`\nSearching: ${query}`);
        const results = await zai.invokeFunction("web_search", { query, num: 10 });

        if (!Array.isArray(results) || results.length === 0) {
          console.log("  No results");
          continue;
        }

        for (const r of results) {
          const snippet = r.snippet || "";
          
          // Extract price patterns from snippets
          // Pattern: "519.36 Rs" or "Rs. 451.17" or "$7.01" or "€6.49" etc.
          const pricePatterns = [
            { pattern: /([\d,]+(?:\.\d{1,2})?)\s*Rs\.?/gi, currency: "PKR" },
            { pattern: /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/gi, currency: "PKR" },
            { pattern: /\$\s*([\d,]+(?:\.\d{1,2})?)/g, currency: "USD" },
            { pattern: /€\s*([\d,]+(?:\.\d{1,2})?)/g, currency: "EUR" },
            { pattern: /OMR\s*([\d,]+(?:\.\d{1,3})?)/gi, currency: "OMR" },
            { pattern: /BHD\s*([\d,]+(?:\.\d{1,3})?)/gi, currency: "BHD" },
            { pattern: /MUR\s*([\d,]+(?:\.\d{1,2})?)/gi, currency: "MUR" },
            { pattern: /([\d,]+(?:\.\d{1,2})?)\s*DA/gi, currency: "DZD" },
          ];

          for (const pp of pricePatterns) {
            pp.pattern.lastIndex = 0;
            const match = pp.pattern.exec(snippet);
            if (match) {
              const priceStr = match[1].replace(/,/g, "");
              const price = parseFloat(priceStr);
              
              // Convert to USD
              const rates = {
                PKR: 0.0036,
                USD: 1,
                EUR: 1.08,
                OMR: 2.60,
                BHD: 2.65,
                MUR: 0.022,
                DZD: 0.00333,
              };
              
              const usd = price * (rates[pp.currency] || 1);
              
              if (usd > 0.5 && usd < 500) {
                // Skip suspicious $30
                if (Math.abs(usd - 30) < 0.1) {
                  console.log(`  ⚠️ Skipping suspicious $30 from ${pp.currency}: ${price} ${pp.currency}`);
                  continue;
                }
                
                console.log(`  ✓ Found price: ${price} ${pp.currency} = $${usd.toFixed(2)} USD`);
                console.log(`    From: ${r.name?.slice(0, 60)}`);
                console.log(`    Snippet: ${snippet.slice(0, 150)}`);
                foundPrice = true;
                break;
              }
            }
          }

          if (foundPrice) break;
        }
      } catch (e) {
        console.log(`  Error: ${e.message?.slice(0, 100)}`);
      }
    }

    if (!foundPrice) {
      console.log(`\n  ❌ No price found for goods_id ${tc.goodsId}`);
    }
  }
}

main().catch(console.error);
