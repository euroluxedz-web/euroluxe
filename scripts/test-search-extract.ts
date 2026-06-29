/**
 * Extract goods_id and minPrice from Temu search results page
 */
async function extractSearchData() {
  const searchUrl = `https://www.temu.com/search_result.html?search_key=TV10922608&_x_sessn=us&currency=USD`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(searchUrl)}`;
  
  const res = await fetch(proxyUrl);
  const html = await res.text();
  
  // Extract goods_id values
  const goodsIdMatches = [...html.matchAll(/goods_id[^:]*:\s*"?(\d{5,})"?/gi)];
  console.log("goods_id matches:");
  for (const m of goodsIdMatches) {
    console.log(`  ${m[0].slice(0, 50)} → ${m[1]}`);
  }
  
  // Extract goodsId values
  const goodsIdMatches2 = [...html.matchAll(/goodsId[^:]*:\s*"?(\d{5,})"?/gi)];
  console.log("\ngoodsId matches:");
  for (const m of goodsIdMatches2) {
    console.log(`  ${m[0].slice(0, 50)} → ${m[1]}`);
  }
  
  // Extract minPrice values
  const minPriceMatches = [...html.matchAll(/minPrice[^:]*:\s*"?(\d+\.?\d*)"?/gi)];
  console.log("\nminPrice matches:");
  for (const m of minPriceMatches) {
    console.log(`  ${m[0].slice(0, 50)} → ${m[1]}`);
  }
  
  // Extract priceInfo values
  const priceInfoMatches = [...html.matchAll(/priceInfo[^}]*}/gi)];
  console.log("\npriceInfo matches:");
  for (const m of priceInfoMatches) {
    console.log(`  ${m[0].slice(0, 100)}`);
  }
}

extractSearchData().catch(console.error);
