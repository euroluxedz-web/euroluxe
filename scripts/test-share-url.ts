/**
 * Test script: Analyze what share.temu.com links return
 * This helps understand why we always get $30.00
 */
import ZAI from "z-ai-web-dev-sdk";

const TEST_URLS = [
  "https://share.temu.com/7d4cdBt01yB",
  "https://share.temu.com/t0mQUcAlkoB",  // Expected: 7.01$ 
  "https://share.temu.com/GLv19JAELgB",
];

async function testShareUrl(url: string) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Testing: ${url}`);
  console.log(`${"=".repeat(80)}`);

  // Step 1: Follow the redirect
  try {
    const shareRes = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const resolvedUrl = shareRes.url || "";
    console.log(`\n[1] Resolved URL: ${resolvedUrl}`);
    console.log(`[1] Status: ${shareRes.status}`);

    // Parse the resolved URL
    if (resolvedUrl) {
      const parsed = new URL(resolvedUrl);
      console.log(`[1] Hostname: ${parsed.hostname}`);
      console.log(`[1] Pathname: ${parsed.pathname}`);

      // Check _oak_rec_ext_1
      const oak = parsed.searchParams.get("_oak_rec_ext_1");
      if (oak) {
        const b64 = oak.replace(/-/g, "+").replace(/_/g, "/");
        const decoded = Buffer.from(b64, "base64").toString("utf-8").trim();
        const cents = parseInt(decoded.replace(/\D/g, ""), 10);
        const price = cents / 100;
        console.log(`[1] _oak_rec_ext_1: ${oak}`);
        console.log(`[1] Decoded: "${decoded}" → cents=${cents} → price=${price}`);
      } else {
        console.log(`[1] No _oak_rec_ext_1 parameter`);
      }

      // Check all search params
      console.log(`[1] All params:`);
      for (const [key, value] of parsed.searchParams.entries()) {
        if (key === "_oak_rec_ext_1") {
          const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
          const decoded = Buffer.from(b64, "base64").toString("utf-8").trim();
          console.log(`    ${key} = ${value} (decoded: "${decoded}")`);
        } else if (key === "top_gallery_url" || key === "share_img") {
          console.log(`    ${key} = ${value.slice(0, 80)}...`);
        } else {
          console.log(`    ${key} = ${value}`);
        }
      }

      // Extract goods_id
      const gMatch = parsed.pathname.match(/-g-([a-zA-Z0-9]+)/);
      if (gMatch) {
        console.log(`[1] goods_id from path: ${gMatch[1]}`);
      }
      const gidParam = parsed.searchParams.get("goods_id");
      if (gidParam) {
        console.log(`[1] goods_id from param: ${gidParam}`);
      }

      // Extract locale
      const localeMatch = parsed.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);
      if (localeMatch) {
        console.log(`[1] Locale: ${localeMatch[1]}`);
      }
    }

    // Step 2: Read the HTML body
    const html = await shareRes.text();
    console.log(`\n[2] HTML length: ${html.length}`);

    // Check for OG tags
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];

    console.log(`[2] OG Title: ${ogTitle || "NOT FOUND"}`);
    console.log(`[2] OG Price: ${ogPrice || "NOT FOUND"} ${ogCurrency || ""}`);
    console.log(`[2] OG Image: ${ogImage ? ogImage.slice(0, 80) + "..." : "NOT FOUND"}`);

    // Check for window.rawData
    const rawDataMatch = html.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
    if (rawDataMatch) {
      console.log(`[2] window.rawData found: ${rawDataMatch[1].length} chars`);
      // Extract price fields
      const priceMatches = [...rawDataMatch[1].matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice|priceNum|displayPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
      for (const m of priceMatches) {
        console.log(`[2] rawData price field: ${m[1]} = ${m[2]}`);
      }
    } else {
      console.log(`[2] No window.rawData found`);
    }

    // Check for priceInfo blocks
    const priceInfoMatches = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
    for (const pi of priceInfoMatches) {
      console.log(`[2] priceInfo: ${parseInt(pi[1]) / 100} ${pi[2]}`);
    }

    // Step 3: Try web search for the product
    if (resolvedUrl) {
      const parsed = new URL(resolvedUrl);
      const gMatch = parsed.pathname.match(/-g-([a-zA-Z0-9]+)/);
      const gidParam = parsed.searchParams.get("goods_id");
      const goodsId = gMatch?.[1] || gidParam || null;

      if (goodsId) {
        console.log(`\n[3] Trying web search for goods_id: ${goodsId}`);
        try {
          const zai = await ZAI.create();
          const searchResults = await (zai as any).invokeFunction("web_search", {
            query: `site:temu.com -g-${goodsId}`,
            num: 5,
          });

          if (Array.isArray(searchResults)) {
            for (const r of searchResults) {
              console.log(`[3] Result: ${r.name}`);
              console.log(`    URL: ${r.url}`);
              console.log(`    Snippet: ${r.snippet || "No snippet"}`);
            }
          } else {
            console.log(`[3] No search results`);
          }
        } catch (err) {
          console.log(`[3] Web search error: ${String(err).slice(0, 150)}`);
        }
      }
    }
  } catch (err) {
    console.log(`Error: ${String(err).slice(0, 200)}`);
  }
}

async function main() {
  for (const url of TEST_URLS) {
    await testShareUrl(url);
  }
}

main().catch(console.error);
