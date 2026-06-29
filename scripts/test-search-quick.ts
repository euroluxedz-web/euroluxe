/**
 * Quick test: What does Temu search page actually contain via AllOrigins?
 */
async function quickTest() {
  const searchUrl = `https://www.temu.com/search_result.html?search_key=TV10922608&_x_sessn=us&currency=USD`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(searchUrl)}`;
  
  const res = await fetch(proxyUrl);
  const html = await res.text();
  
  // Save first 5000 chars to analyze
  console.log("=== First 2000 chars ===");
  console.log(html.slice(0, 2000));
  console.log("\n=== Looking for goods_id patterns ===");
  
  // Various patterns
  const patterns = [
    /goods_id/gi,
    /goodsId/gi,  
    /product_id/gi,
    /itemId/gi,
    /item_id/gi,
    /minPrice/gi,
    /salePrice/gi,
    /priceInfo/gi,
    /rawData/gi,
  ];
  
  for (const p of patterns) {
    const count = (html.match(p) || []).length;
    console.log(`${p.source}: ${count} matches`);
  }
  
  // Look for JSON-like structures
  console.log("\n=== JSON structures ===");
  const jsonBlocks = [...html.matchAll(/"goods_id"\s*:\s*"?(\d+)"/g)];
  console.log(`"goods_id": value — ${jsonBlocks.length} matches`);
  for (const m of jsonBlocks.slice(0, 5)) {
    console.log(`  goods_id: ${m[1]}`);
  }
}

quickTest().catch(console.error);
