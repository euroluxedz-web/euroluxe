/**
 * Test: Parse Temu search results page via AllOrigins for Item ID
 * Focus on extracting goods_id from the HTML
 */
const ITEM_ID = "TV10922608";

async function testSearchParsing() {
  console.log(`Parsing Temu search page for Item ID: ${ITEM_ID}\n`);

  const searchUrl = `https://www.temu.com/search_result.html?search_key=${ITEM_ID}&_x_sessn=us&currency=USD`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(searchUrl)}`;
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeout);
    const html = await res.text();
    console.log(`HTML length: ${html.length}`);

    // Search for all goods_id patterns
    const patterns = [
      /"goods_id"\s*:\s*"?(\d{10,})"?/g,
      /goods_id=(\d{10,})/g,
      /-g-(\d{10,})/g,
      /"sku_id"\s*:\s*"?(\d{10,})"?/g,
      /"group_id"\s*:\s*"?(\d{10,})"?/g,
    ];

    for (const pattern of patterns) {
      const matches = [...html.matchAll(pattern)];
      if (matches.length > 0) {
        const unique = [...new Set(matches.map(m => m[1]))];
        console.log(`Pattern ${pattern.source}: ${unique.join(", ")}`);
      }
    }

    // Look for search result items
    const itemMatches = [...html.matchAll(/"searchResult"\s*:\s*\[/g)];
    console.log(`"searchResult" occurrences: ${itemMatches.length}`);

    const goodsListMatches = [...html.matchAll(/"goodsList"\s*:\s*\[/g)];
    console.log(`"goodsList" occurrences: ${goodsListMatches.length}`);

    const listMatches = [...html.matchAll(/"list"\s*:\s*\[/g)];
    console.log(`"list" occurrences: ${listMatches.length}`);

    // Check for any JSON data with goods
    const jsonMatches = [...html.matchAll(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/g)];
    if (jsonMatches.length > 0) {
      console.log(`rawData found: ${jsonMatches[0][1].length} chars`);
      
      // Look for the Item ID in rawData
      if (jsonMatches[0][1].includes(ITEM_ID)) {
        console.log(`★ Item ID ${ITEM_ID} found in rawData!`);
      } else {
        console.log(`Item ID ${ITEM_ID} NOT found in rawData`);
      }

      // Extract all goods_ids from rawData
      const gIds = [...jsonMatches[0][1].matchAll(/"goods_id"\s*:\s*"?(\d{10,})"?/g)];
      const uniqueGIds = [...new Set(gIds.map(m => m[1]))];
      console.log(`Goods IDs in rawData: ${uniqueGIds.join(", ")}`);

      // Extract minPrice for each goods_id
      for (const gid of uniqueGIds.slice(0, 3)) {
        const gidIdx = jsonMatches[0][1].indexOf(gid);
        if (gidIdx >= 0) {
          const window = jsonMatches[0][1].slice(gidIdx, gidIdx + 500);
          const minP = window.match(/"minPrice"\s*:\s*(\d+)/);
          const saleP = window.match(/"salePrice"\s*:\s*(\d+)/);
          console.log(`  goods_id ${gid}: minPrice=${minP?.[1] || "?"} salePrice=${saleP?.[1] || "?"}`);
        }
      }
    }

    // Check for any item_id matching pattern
    const itemIdPatterns = [...html.matchAll(new RegExp(`"${ITEM_ID}"|"item_id"\\s*:\\s*"${ITEM_ID}"`, 'gi'))];
    console.log(`\nItem ID ${ITEM_ID} mentions in HTML: ${itemIdPatterns.length}`);

    // Look for the specific search key in any JSON
    const searchKeyMatches = [...html.matchAll(/"search_key"\s*:\s*"([^"]+)"/g)];
    for (const m of searchKeyMatches) {
      console.log(`search_key: ${m[1]}`);
    }

  } catch (err) {
    console.log(`Error: ${String(err).slice(0, 150)}`);
  }
}

testSearchParsing().catch(console.error);
