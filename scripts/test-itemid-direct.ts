/**
 * Test: Direct fetch of -i- URL to follow redirect and get goods_id
 */
const ITEM_ID = "TV10922608";

async function testDirectFetch() {
  console.log(`Testing direct fetch for Item ID: ${ITEM_ID}\n`);

  // Test 1: Direct fetch with redirect follow
  console.log("[1] Direct fetch -i- URL with redirect follow...");
  try {
    const url = `https://www.temu.com/-i-${ITEM_ID}.html`;
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    console.log(`  Status: ${res.status}`);
    console.log(`  Final URL: ${res.url}`);
    
    // Extract goods_id from final URL
    const gMatch = res.url.match(/-g-(\d{10,})/);
    if (gMatch) {
      console.log(`  ★ Found goods_id from URL: ${gMatch[1]}`);
    }
    
    const html = await res.text();
    console.log(`  HTML length: ${html.length}`);
    
    if (html.length > 1000) {
      const gMatch2 = html.match(/-g-(\d{10,})/);
      if (gMatch2) console.log(`  ★ Found goods_id from HTML: ${gMatch2[1]}`);
      
      const gidMatch = html.match(/"goods_id"\s*:\s*"?(\d{10,})"?/);
      if (gidMatch) console.log(`  ★ Found goods_id from JSON: ${gidMatch[1]}`);

      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      console.log(`  OG Title: ${ogTitle || "NOT FOUND"}`);
      console.log(`  OG Price: ${ogPrice || "NOT FOUND"}`);
    }
  } catch (err) {
    console.log(`  Error: ${String(err).slice(0, 150)}`);
  }

  // Test 2: Manual redirect to get Location header
  console.log("\n[2] HEAD request with redirect manual...");
  try {
    const url = `https://www.temu.com/-i-${ITEM_ID}.html`;
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });
    console.log(`  Status: ${res.status}`);
    console.log(`  Location: ${res.headers.get("location") || "NONE"}`);
  } catch (err) {
    console.log(`  Error: ${String(err).slice(0, 150)}`);
  }

  // Test 3: AllOrigins on the temu.to short link format (like from Instagram)
  console.log("\n[3] Resolving temu.to short link...");
  try {
    // First search for a temu.to link for this Item ID
    const zai = await (await import("z-ai-web-dev-sdk")).default.create();
    const results = await (zai as any).invokeFunction("web_search", {
      query: `temu.to ${ITEM_ID}`,
      num: 5,
    });
    if (Array.isArray(results)) {
      for (const r of results) {
        console.log(`  Result: ${r.name} - ${r.url}`);
        console.log(`  Snippet: ${(r.snippet || "").slice(0, 200)}`);
      }
    }
  } catch (err) {
    console.log(`  Error: ${String(err).slice(0, 150)}`);
  }
}

testDirectFetch().catch(console.error);
