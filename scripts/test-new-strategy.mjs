// Direct test of the scrape-price API logic for share URLs
// This simulates what the API does without running the Next.js server

import ZAI from "z-ai-web-dev-sdk";

const GOODS_ID = "601102757183337";
const SHARE_URL = "https://share.temu.com/iEXtmO1ZX5B";

// Suspicious price check (same as in route.ts)
function isSuspiciousPrice(priceUSD, source) {
  if (priceUSD === 30.00 || priceUSD === 30) return true;
  if (priceUSD >= 29.90 && priceUSD <= 30.10) return true;
  const roundSuspicious = [5, 8, 10, 13, 15, 20, 30, 50];
  if (roundSuspicious.includes(Math.round(priceUSD)) && source.includes("priceInfo")) return true;
  return false;
}

async function testNewStrategy() {
  console.log("=== Testing Strategy 0-B: Web Search → Page Reader ===\n");
  const zai = await ZAI.create();

  // Step 1: Search for the product
  console.log("Step 1: Searching for product...");
  const searchQuery = `site:temu.com ${GOODS_ID}`;
  const searchResults = await zai.invokeFunction("web_search", {
    query: searchQuery,
    num: 10,
  });

  if (!Array.isArray(searchResults) || searchResults.length === 0) {
    console.log("No search results found!");
    return;
  }

  // Step 2: Collect product URLs
  const productUrls = [];
  for (const r of searchResults) {
    if (!r.url?.includes("temu.com")) continue;
    if (GOODS_ID && !r.url.includes(GOODS_ID) && !r.url.includes(`-g-${GOODS_ID}`)) continue;
    const localeMatch = r.url.match(/temu\.com\/([a-z]{2}(?:-[a-z]{2})?)\//i);
    const locale = localeMatch?.[1] || "us";
    productUrls.push({ url: r.url, locale, name: r.name });
  }

  // Sort: prefer US locale, then English locales
  productUrls.sort((a, b) => {
    const aScore = a.locale === "us" ? 0 : a.locale.includes("-en") ? 1 : 2;
    const bScore = b.locale === "us" ? 0 : b.locale.includes("-en") ? 1 : 2;
    return aScore - bScore;
  });

  console.log(`Found ${productUrls.length} product URLs:`);
  for (const { url, locale, name } of productUrls) {
    console.log(`  [${locale}] ${name?.slice(0, 50)}`);
  }

  // Step 3: Try reading each product URL with page_reader
  for (const { url: productUrl, locale } of productUrls.slice(0, 3)) {
    console.log(`\nStep 3: Reading product page (${locale})...`);
    try {
      const pageResult = await zai.invokeFunction("page_reader", {
        url: productUrl,
      });

      const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
      const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;

      if (!content || content.length < 5000) {
        console.log(`  Content too short (${content?.length || 0}), skipping`);
        continue;
      }

      console.log(`  Got content: ${content.length} chars`);

      // Search for all price patterns in the content
      const text = content.replace(/<[^>]*>/g, " ");

      // Dollar prices
      const dollarMatches = [...text.matchAll(/\$\s*(\d{1,5}(?:\.\d{1,2})?)/g)];
      const priceCount = {};
      for (const m of dollarMatches) {
        const val = m[1];
        priceCount[val] = (priceCount[val] || 0) + 1;
      }
      console.log(`  Dollar prices: ${JSON.stringify(priceCount)}`);

      // DZD/DA prices
      const dzdMatches = [...text.matchAll(/([\d,]+(?:\.\d{1,2})?)\s*(?:DA|DZD|دج)/gi)];
      console.log(`  DZD amounts: ${dzdMatches.map(m => m[1]).join(", ") || "none"}`);

      // priceInfo blocks
      const priceInfoMatches = [...content.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      console.log(`  priceInfo blocks: ${priceInfoMatches.length}`);
      for (let i = 0; i < Math.min(priceInfoMatches.length, 5); i++) {
        const cents = parseInt(priceInfoMatches[i][1]);
        const cur = priceInfoMatches[i][2];
        const usd = cents / 100;
        console.log(`    ${usd} ${cur} (suspicious: ${isSuspiciousPrice(usd, `priceInfo-${locale}`)})`);
      }

      // rawData
      const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      if (rawDataMatch) {
        console.log(`  rawData length: ${rawDataMatch[1].length}`);
        const rawData = rawDataMatch[1];

        // Search for price fields
        const priceFields = ["minPrice", "salePrice", "price", "marketPrice"];
        for (const field of priceFields) {
          const re = new RegExp(`"${field}"\\s*:\\s*"?([\\d.]+)"?`, "g");
          const matches = [...rawData.matchAll(re)];
          if (matches.length > 0) {
            console.log(`    ${field}: ${matches.map(m => m[1]).join(", ")}`);
          }
        }
      }

      // Use LLM to extract price
      console.log(`\n  Using LLM to extract price from ${locale} page...`);
      const contentForLLM = content.slice(0, Math.min(content.length, 40000));
      const completion = await zai.createChatCompletion({
        messages: [
          {
            role: "system",
            content:
              "You are a price extraction assistant for Temu products. " +
              "You MUST find the SALE PRICE of the MAIN product on this page. " +
              "CRITICAL RULES:\n" +
              "1. The product price is shown near the TOP of the page, usually in a large font.\n" +
              "2. IGNORE any price that is exactly $30.00 or 9,000 DA — this is a 'delivery guarantee' amount, NOT the product price.\n" +
              "3. IGNORE prices from 'recommended', 'similar', 'you may also like', or 'bought together' sections.\n" +
              "4. Look for the MAIN product price — it could be shown as $X.XX, DA X,XXX, or in a priceInfo/minPrice field.\n" +
              "5. If the page is from a non-US locale (e.g., /dz-en/, /bh/, /om-en/), the price shown is in the LOCAL currency, not USD.\n" +
              "6. Common Temu product prices range from $1-$100 USD (or 300-30,000 DZD).\n" +
              "7. Return ONLY JSON: {\"price_usd\": <number_in_USD>, \"price_local\": \"<amount> <currency>\", \"product_name\": \"<name>\", \"confidence\": \"<high|medium|low>\"}\n" +
              "8. If you cannot find the product price, return {\"price_usd\": null, \"confidence\": \"low\"}",
          },
          {
            role: "user",
            content: `Product goods_id: ${GOODS_ID}\nLocale: ${locale}\n\nPage content:\n${contentForLLM}`,
          },
        ],
      });

      const aiResponse = completion.choices?.[0]?.message?.content || "";
      console.log(`  LLM response: ${aiResponse}`);

      const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const priceUSD = typeof parsed.price_usd === "number" ? parsed.price_usd : parseFloat(String(parsed.price_usd));
          console.log(`  Parsed price: $${priceUSD} USD (${parsed.price_local})`);
          console.log(`  Confidence: ${parsed.confidence}`);
          console.log(`  Is suspicious ($30.00)? ${isSuspiciousPrice(priceUSD, "llm")}`);

          if (priceUSD && !isSuspiciousPrice(priceUSD, "llm")) {
            console.log(`\n  ✅ FOUND VALID PRICE: $${priceUSD} USD!`);
            return; // Stop testing, we found the price
          }
        } catch (e) {
          console.log(`  Parse error: ${e.message}`);
        }
      }

    } catch (err) {
      console.log(`  Error: ${err.message?.slice(0, 100)}`);
      continue;
    }
  }
}

testNewStrategy();
