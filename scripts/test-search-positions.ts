/**
 * Find the exact positions of goods_id and minPrice in the HTML
 */
async function findPositions() {
  const searchUrl = `https://www.temu.com/search_result.html?search_key=TV10922608&_x_sessn=us&currency=USD`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(searchUrl)}`;
  
  const res = await fetch(proxyUrl);
  const html = await res.text();
  
  // Find all occurrences of "goods_id" (case insensitive)
  let idx = 0;
  while (true) {
    idx = html.toLowerCase().indexOf("goods_id", idx);
    if (idx === -1) break;
    console.log(`goods_id at position ${idx}: ...${html.slice(idx, idx + 80)}...`);
    idx += 9;
  }
  
  // Find all occurrences of "minPrice"
  idx = 0;
  while (true) {
    idx = html.toLowerCase().indexOf("minprice", idx);
    if (idx === -1) break;
    console.log(`\nminPrice at position ${idx}: ...${html.slice(idx, idx + 80)}...`);
    idx += 9;
  }

  // Find all occurrences of "priceInfo"  
  idx = 0;
  while (true) {
    idx = html.toLowerCase().indexOf("priceinfo", idx);
    if (idx === -1) break;
    console.log(`\npriceInfo at position ${idx}: ...${html.slice(idx, idx + 100)}...`);
    idx += 9;
  }
}

findPositions().catch(console.error);
