// Test script to debug share.temu.com URL resolution
// This follows the redirect and shows what data is available

const SHARE_URL = "https://share.temu.com/iEXtmO1ZX5B";

async function testShareUrl() {
  console.log("=== Testing share.temu.com URL resolution ===\n");
  
  // Step 1: Follow redirect
  console.log("Step 1: Following redirect...");
  try {
    const res = await fetch(SHARE_URL, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    
    console.log(`Status: ${res.status}`);
    console.log(`Final URL: ${res.url}`);
    console.log(`Redirected: ${res.url !== SHARE_URL}`);
    
    // Parse the final URL
    const finalUrl = new URL(res.url);
    console.log(`\nFinal URL details:`);
    console.log(`  Host: ${finalUrl.host}`);
    console.log(`  Pathname: ${finalUrl.pathname}`);
    console.log(`  Search params:`);
    for (const [key, value] of finalUrl.searchParams) {
      console.log(`    ${key}: ${value.slice(0, 100)}${value.length > 100 ? "..." : ""}`);
    }
    
    // Extract key params
    const oakRecExt1 = finalUrl.searchParams.get("_oak_rec_ext_1");
    const topGalleryUrl = finalUrl.searchParams.get("top_gallery_url");
    const goodsId = finalUrl.pathname.match(/-g-([a-zA-Z0-9]+)/)?.[1];
    const localeMatch = finalUrl.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);
    
    console.log(`\nKey extracted data:`);
    console.log(`  goods_id: ${goodsId || "NOT FOUND"}`);
    console.log(`  locale: ${localeMatch?.[1] || "NOT FOUND"}`);
    console.log(`  _oak_rec_ext_1: ${oakRecExt1 || "NOT FOUND"}`);
    console.log(`  top_gallery_url: ${topGalleryUrl ? topGalleryUrl.slice(0, 80) + "..." : "NOT FOUND"}`);
    
    // Decode _oak_rec_ext_1
    if (oakRecExt1) {
      try {
        const b64 = oakRecExt1.replace(/-/g, "+").replace(/_/g, "/");
        const decoded = Buffer.from(b64, "base64").toString("utf-8").trim();
        console.log(`  _oak_rec_ext_1 decoded: "${decoded}"`);
        const cents = parseInt(decoded.replace(/\D/g, ""), 10);
        console.log(`  _oak_rec_ext_1 as cents: ${cents}`);
        console.log(`  _oak_rec_ext_1 as price: ${cents / 100}`);
        
        // If locale is dz-en, price is in DZD
        const locale = localeMatch?.[1]?.toLowerCase() || "";
        if (locale.includes("dz")) {
          const dzdPrice = cents / 100;
          const usdPrice = dzdPrice * 0.0075;
          console.log(`  Price in DZD: ${dzdPrice}`);
          console.log(`  Converted to USD: $${usdPrice.toFixed(2)}`);
        } else {
          console.log(`  Price in USD: $${(cents / 100).toFixed(2)}`);
        }
      } catch (e) {
        console.log(`  _oak_rec_ext_1 decode error: ${e.message}`);
      }
    }
    
    // Read HTML body
    const html = await res.text();
    console.log(`\nHTML body length: ${html.length}`);
    
    // Check for OG tags
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
    
    console.log(`\nOG tags:`);
    console.log(`  og:title: ${ogTitle || "NOT FOUND"}`);
    console.log(`  og:image: ${ogImage ? ogImage.slice(0, 80) + "..." : "NOT FOUND"}`);
    console.log(`  product:price:amount: ${ogPrice || "NOT FOUND"}`);
    console.log(`  product:price:currency: ${ogCurrency || "NOT FOUND"}`);
    
    // Search for priceInfo blocks
    const priceInfoMatches = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
    console.log(`\npriceInfo blocks found: ${priceInfoMatches.length}`);
    for (let i = 0; i < Math.min(priceInfoMatches.length, 10); i++) {
      const cents = parseInt(priceInfoMatches[i][1]);
      const cur = priceInfoMatches[i][2];
      console.log(`  ${i + 1}. ${cents / 100} ${cur} (raw: ${cents})`);
    }
    
    // Search for minPrice/salePrice fields
    const priceFields = ["minPrice", "salePrice", "price", "marketPrice", "origPrice", "appPrice"];
    console.log(`\nPrice fields in HTML:`);
    for (const field of priceFields) {
      const re = new RegExp(`"${field}"\\s*:\\s*"?([\\d.]+)"?`, "g");
      const matches = [...html.matchAll(re)];
      if (matches.length > 0) {
        const values = matches.map(m => parseFloat(m[1]));
        console.log(`  ${field}: ${values.join(", ")}`);
      }
    }
    
    // Search for "$30" or "9000" patterns
    const text = html.replace(/<[^>]*>/g, " ");
    const dollarPrices = [...text.matchAll(/\$\s*(\d{1,4}(?:[.,]\d{1,2})?)/g)];
    console.log(`\nDollar prices found in text:`);
    for (const m of dollarPrices.slice(0, 10)) {
      console.log(`  $${m[1]}`);
    }
    
    // Search for DZD/DA amounts
    const dzdPrices = [...text.matchAll(/([\d,]+(?:\.\d{1,2})?)\s*(?:DA|DZD|دج)/gi)];
    console.log(`\nDZD amounts found in text:`);
    for (const m of dzdPrices.slice(0, 10)) {
      console.log(`  ${m[1]} DA`);
    }
    
    // Look for the rawData object
    const rawDataMatch = html.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
    if (rawDataMatch) {
      console.log(`\nwindow.rawData found! Length: ${rawDataMatch[1].length}`);
      const rawData = rawDataMatch[1];
      
      // Search for price near goods_id
      if (goodsId && rawData.includes(goodsId)) {
        console.log(`  goods_id "${goodsId}" found in rawData`);
        const gidIdx = rawData.indexOf(goodsId);
        const searchWindow = rawData.slice(Math.max(0, gidIdx - 200), Math.min(rawData.length, gidIdx + 2000));
        
        const priceFieldMatches = [...searchWindow.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice|priceNum|displayPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
        console.log(`  Price fields near goods_id:`);
        for (const m of priceFieldMatches) {
          console.log(`    ${m[1]}: ${m[2]}`);
        }
      }
    } else {
      console.log(`\nwindow.rawData NOT found`);
    }
    
    // Save HTML for analysis
    const fs = await import("fs");
    fs.writeFileSync("/home/z/my-project/download/share-url-debug2.html", html);
    console.log(`\nHTML saved to /home/z/my-project/download/share-url-debug2.html`);
    
  } catch (err) {
    console.error("Error:", err.message);
  }
  
  // Step 2: Try manual HEAD request with redirect:"manual"
  console.log("\n\n=== Step 2: Manual HEAD redirect ===");
  try {
    const headRes = await fetch(SHARE_URL, {
      method: "HEAD",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      },
    });
    console.log(`Status: ${headRes.status}`);
    console.log(`Location: ${headRes.headers.get("location")}`);
  } catch (err) {
    console.error("HEAD error:", err.message);
  }
  
  // Step 3: Try with the full URL (the one that works)
  console.log("\n\n=== Step 3: Testing full URL via AllOrigins ===");
  const FULL_URL = "https://www.temu.com/dz-en/8pcs-womens-sunglasses-classic-fashion-mixed-shape-small-frame-color-set-glasses--trendy-decorative-glasses-fashion-additions-lightweight-glasses-durable-pc-material-unisex-glasses-suitable-for-holidays-travel-camping-beach-g-601102757183337.html";
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(FULL_URL)}`;
    const aoRes = await fetch(proxyUrl);
    if (aoRes.ok) {
      const aoHtml = await aoRes.text();
      console.log(`AllOrigins HTML length: ${aoHtml.length}`);
      
      const ogTitle = aoHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogPrice = aoHtml.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogCurrency = aoHtml.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
      
      console.log(`  og:title: ${ogTitle || "NOT FOUND"}`);
      console.log(`  product:price:amount: ${ogPrice || "NOT FOUND"}`);
      console.log(`  product:price:currency: ${ogCurrency || "NOT FOUND"}`);
      
      // PriceInfo blocks
      const piMatches = [...aoHtml.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      console.log(`  priceInfo blocks: ${piMatches.length}`);
      for (let i = 0; i < Math.min(piMatches.length, 5); i++) {
        console.log(`    ${parseInt(piMatches[i][1]) / 100} ${piMatches[i][2]}`);
      }
    }
  } catch (err) {
    console.error("AllOrigins error:", err.message);
  }
}

testShareUrl();
