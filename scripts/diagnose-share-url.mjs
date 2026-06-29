/**
 * Diagnostic script: Resolve share.temu.com URLs and inspect what we get
 * This helps understand why the price always comes back as $30.00
 */

const SHARE_URLS = [
  "https://share.temu.com/7d4cdBt01yB",
  "https://share.temu.com/t0mQUcAlkoB",
  "https://share.temu.com/GLv19JAELgB",
  "https://share.temu.com/iEXtmO1ZX5B",
];

async function resolveShareUrl(url) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Resolving: ${url}`);
  console.log("=".repeat(80));

  try {
    // Step 1: Follow redirect with redirect:"follow"
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    console.log(`Status: ${res.status}`);
    console.log(`Final URL: ${res.url}`);

    // Get response body
    const body = await res.text();
    console.log(`Body length: ${body.length}`);

    // Parse the resolved URL
    try {
      const resolved = new URL(res.url);
      console.log(`\nResolved URL params:`);
      for (const [key, value] of resolved.searchParams.entries()) {
        console.log(`  ${key}: ${value.slice(0, 100)}${value.length > 100 ? "..." : ""}`);
      }

      // Check for _oak_rec_ext_1
      const hint = resolved.searchParams.get("_oak_rec_ext_1");
      if (hint) {
        try {
          const b64 = hint.replace(/-/g, "+").replace(/_/g, "/");
          const decoded = Buffer.from(b64, "base64").toString("utf-8").trim();
          console.log(`\n_oak_rec_ext_1 decoded: "${decoded}"`);
          const cents = parseInt(decoded.replace(/\D/g, ""), 10);
          console.log(`Cents: ${cents}, Price: ${cents / 100}`);
        } catch (e) {
          console.log(`_oak_rec_ext_1 decode error: ${e.message}`);
        }
      }

      // Check for goods_id
      const goodsId = resolved.searchParams.get("goods_id");
      const gMatch = resolved.pathname.match(/-g-([a-zA-Z0-9]+)/);
      console.log(`\ngoods_id from param: ${goodsId}`);
      console.log(`goods_id from path: ${gMatch ? gMatch[1] : "none"}`);

      // Check for top_gallery_url (image)
      const topGallery = resolved.searchParams.get("top_gallery_url");
      console.log(`top_gallery_url: ${topGallery ? topGallery.slice(0, 80) + "..." : "none"}`);

      // Check locale
      const localeMatch = resolved.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);
      console.log(`Locale: ${localeMatch ? localeMatch[1] : "none (US default)"}`);
    } catch (e) {
      console.log(`URL parse error: ${e.message}`);
    }

    // Look for price in HTML body
    if (body.length > 100) {
      // OG price
      const ogPrice = body.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
      const ogCurrency = body.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
      console.log(`\nOG price: ${ogPrice ? ogPrice[1] : "none"}`);
      console.log(`OG currency: ${ogCurrency ? ogCurrency[1] : "none"}`);

      // OG title
      const ogTitle = body.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
      console.log(`OG title: ${ogTitle ? ogTitle[1].slice(0, 80) : "none"}`);

      // OG image
      const ogImage = body.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      console.log(`OG image: ${ogImage ? ogImage[1].slice(0, 80) + "..." : "none"}`);

      // Look for window.rawData
      const rawDataMatch = body.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      console.log(`\nwindow.rawData found: ${rawDataMatch ? "YES" : "NO"}`);

      if (rawDataMatch) {
        // Search for price fields
        const rawDataStr = rawDataMatch[1];
        const priceFields = [...rawDataStr.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice|priceNum|displayPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
        console.log(`Price fields in rawData:`);
        for (const m of priceFields) {
          console.log(`  ${m[1]}: ${m[2]}`);
        }

        // Search for currency
        const currencyMatch = rawDataStr.match(/"currency"\s*:\s*"([^"]+)"/);
        console.log(`Currency in rawData: ${currencyMatch ? currencyMatch[1] : "none"}`);
      }

      // Look for priceInfo blocks
      const priceInfoMatches = [...body.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      if (priceInfoMatches.length > 0) {
        console.log(`\npriceInfo blocks:`);
        for (const pi of priceInfoMatches) {
          console.log(`  price: ${parseInt(pi[1]) / 100} ${pi[2]}`);
        }
      }

      // Search for any $XX.XX or DA patterns
      const dollarPrices = [...body.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)];
      if (dollarPrices.length > 0) {
        console.log(`\nDollar prices found in HTML:`);
        const unique = [...new Set(dollarPrices.map(m => m[1]))];
        for (const p of unique.slice(0, 15)) {
          console.log(`  $${p}`);
        }
      }

      // Search for DZD/DA prices
      const dzdPrices = [...body.matchAll(/([\d,]+(?:\.\d{1,2})?)\s*(?:DA|DZD)/gi)];
      if (dzdPrices.length > 0) {
        console.log(`\nDZD/DA prices found in HTML:`);
        const unique = [...new Set(dzdPrices.map(m => m[1]))];
        for (const p of unique.slice(0, 15)) {
          console.log(`  ${p} DA`);
        }
      }

      // Check for "delivery guarantee" / "30.00" specifically
      const thirty = body.match(/30\.00/g);
      console.log(`\n"30.00" occurrences in HTML: ${thirty ? thirty.length : 0}`);

      // Check for "9,000" or "9000" (delivery guarantee in DZD)
      const nineK = body.match(/9[\s,]?000/g);
      console.log(`"9,000/9000" occurrences in HTML: ${nineK ? nineK.length : 0}`);

      // Check for "delay credit" or "delivery guarantee"
      const delayCredit = body.match(/delay\s*credit|delivery\s*guarantee|garantie/i);
      console.log(`"delay credit/delivery guarantee" found: ${delayCredit ? "YES" : "NO"}`);
    }
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

async function main() {
  for (const url of SHARE_URLS) {
    await resolveShareUrl(url);
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

main().catch(console.error);
