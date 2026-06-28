// Test share.temu.com resolution directly
const shareUrl = "https://share.temu.com/iEXtmO1ZX5B";

console.log("=== Testing share URL resolution ===");
console.log("URL:", shareUrl);

// Step 1: Follow redirect with mobile UA
try {
  const res = await fetch(shareUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  
  console.log("\n--- Response ---");
  console.log("Status:", res.status);
  console.log("Final URL:", res.url);
  console.log("Redirected:", res.redirected);
  
  const html = await res.text();
  console.log("HTML length:", html.length);
  
  // Look for _oak_rec_ext_1 in the final URL
  const finalUrl = new URL(res.url);
  const oakRec = finalUrl.searchParams.get("_oak_rec_ext_1");
  console.log("\n--- URL Params ---");
  console.log("_oak_rec_ext_1:", oakRec);
  console.log("top_gallery_url:", finalUrl.searchParams.get("top_gallery_url")?.slice(0, 100));
  console.log("goods_id:", finalUrl.searchParams.get("goods_id"));
  console.log("Pathname:", finalUrl.pathname);
  
  // Decode _oak_rec_ext_1
  if (oakRec) {
    const b64 = oakRec.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(b64, "base64").toString("utf-8").trim();
    console.log("_oak_rec_ext_1 decoded:", decoded);
    const cents = parseInt(decoded.replace(/\D/g, ""), 10);
    console.log("Cents:", cents, "→ Price:", cents / 100);
  }
  
  // Search for price in HTML
  const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
  const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
  console.log("\n--- OG Price ---");
  console.log("og:price:amount:", ogPrice?.[1]);
  console.log("og:price:currency:", ogCurrency?.[1]);
  
  // Look for rawData price
  const rawDataMatch = html.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
  if (rawDataMatch) {
    const rawDataStr = rawDataMatch[1];
    const priceMatches = [...rawDataStr.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
    console.log("\n--- RawData Prices ---");
    for (const m of priceMatches) {
      console.log(`${m[1]}: ${m[2]}`);
    }
    const currencyMatch = rawDataStr.match(/"currency"\s*:\s*"([^"]+)"/);
    console.log("Currency:", currencyMatch?.[1]);
  } else {
    console.log("\nNo window.rawData found in HTML");
  }
  
  // Look for priceInfo blocks
  const priceInfoMatches = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
  if (priceInfoMatches.length > 0) {
    console.log("\n--- PriceInfo blocks ---");
    for (const pi of priceInfoMatches) {
      console.log(`price: ${parseInt(pi[1])/100} ${pi[2]}`);
    }
  }
  
  // Look for goods_id
  const gMatch = finalUrl.pathname.match(/-g-([a-zA-Z0-9]+)/);
  console.log("\n--- Goods ID ---");
  console.log("From pathname (-g-):", gMatch?.[1]);
  console.log("From query (goods_id):", finalUrl.searchParams.get("goods_id"));
  
  // Save first 5000 chars of HTML
  console.log("\n--- First 2000 chars of HTML ---");
  console.log(html.slice(0, 2000));
  
} catch (err) {
  console.error("Error:", err.message);
}
