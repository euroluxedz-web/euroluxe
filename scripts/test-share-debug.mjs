#!/usr/bin/env node
/**
 * Debug script: resolve share.temu.com short links and analyze the data
 */

const SHARE_URL = process.argv[2] || "https://share.temu.com/7d4cdBt01yB";

async function test() {
  console.log("=== Share URL Debug ===\n");
  console.log("Original URL:", SHARE_URL);

  // Step 1: Follow redirect with fetch
  console.log("\n--- Step 1: Fetch with redirect:follow ---");
  try {
    const res = await fetch(SHARE_URL, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    console.log("Status:", res.status);
    console.log("Final URL (res.url):", res.url);
    console.log("Redirected:", res.redirected);
    console.log("Headers location:", res.headers.get("location"));

    // Parse the resolved URL
    if (res.url) {
      const parsed = new URL(res.url);
      console.log("\n--- Resolved URL analysis ---");
      console.log("Hostname:", parsed.hostname);
      console.log("Pathname:", parsed.pathname);
      console.log("Search params:");
      for (const [key, value] of parsed.searchParams.entries()) {
        console.log(`  ${key} = ${value.slice(0, 200)}${value.length > 200 ? "..." : ""}`);
      }

      // Extract _oak_rec_ext_1
      const oakRec = parsed.searchParams.get("_oak_rec_ext_1");
      if (oakRec) {
        console.log("\n--- _oak_rec_ext_1 analysis ---");
        console.log("Raw value:", oakRec);
        try {
          const b64 = oakRec.replace(/-/g, "+").replace(/_/g, "/");
          const decoded = Buffer.from(b64, "base64").toString("utf-8").trim();
          console.log("Base64 decoded:", decoded);
          const cents = parseInt(decoded.replace(/\D/g, ""), 10);
          console.log("Extracted cents:", cents);
          console.log("As USD (cents/100):", cents / 100);
        } catch (e) {
          console.log("Decode error:", e.message);
        }
      }

      // Extract goods_id
      const gMatch = parsed.pathname.match(/-g-([a-zA-Z0-9]+)/);
      if (gMatch) {
        console.log("\n--- goods_id ---");
        console.log("goods_id:", gMatch[1]);
      }

      // Extract top_gallery_url
      const topGallery = parsed.searchParams.get("top_gallery_url");
      if (topGallery) {
        console.log("\n--- top_gallery_url ---");
        console.log("Image URL:", topGallery.slice(0, 200));
      }

      // Extract share_img
      const shareImg = parsed.searchParams.get("share_img");
      if (shareImg) {
        console.log("\n--- share_img ---");
        console.log("Image URL:", shareImg.slice(0, 200));
      }

      // Detect locale
      const localeMatch = parsed.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);
      if (localeMatch) {
        console.log("\n--- Locale ---");
        console.log("Locale prefix:", localeMatch[1]);
      }

      // Extract product name from slug
      const segments = parsed.pathname.split("/").filter(Boolean);
      const slug = segments.find((s) => s.includes("-g-")) || segments[segments.length - 1] || "";
      const nameFromSlug = slug
        .replace(/-g-[a-zA-Z0-9]+\.html?$/i, "")
        .replace(/\.html?$/i, "")
        .replace(/-/g, " ")
        .trim();
      console.log("\n--- Product name from slug ---");
      console.log("Name:", nameFromSlug);
    }

    // Also check the HTML body for price info
    const html = await res.text();
    console.log("\n--- HTML body analysis ---");
    console.log("HTML length:", html.length);

    // Look for price patterns in HTML
    const pricePatterns = [
      /"price"\s*:\s*(\d+)/g,
      /"minPrice"\s*:\s*(\d+)/g,
      /data-price="(\d+)"/g,
      /class="[^"]*price[^"]*"[^>]*>([^<]+)/g,
      /"price":\s*\{\s*"value"\s*:\s*(\d+)/g,
      /offerPrice[^"]*"\s*:\s*(\d+)/g,
      /"salePrice"\s*:\s*"?(\d+\.?\d*)"?/g,
    ];

    for (const pattern of pricePatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        console.log(`  Pattern ${pattern.source}: ${match[1]}`);
      }
    }

    // Look for JSON-LD data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
      console.log("\n--- JSON-LD ---");
      try {
        const ld = JSON.parse(jsonLdMatch[1]);
        console.log("Type:", ld["@type"]);
        console.log("Name:", ld.name);
        console.log("Offers:", JSON.stringify(ld.offers).slice(0, 300));
      } catch (e) {
        console.log("Parse error:", e.message);
      }
    }

    // Look for og:price meta tags
    const ogPrice = html.match(/<meta[^>]*property="product:price:amount"[^>]*content="([^"]+)"/);
    if (ogPrice) console.log("OG Price:", ogPrice[1]);

    // Look for any __INITIAL_STATE__ or similar
    const stateMatch = html.match(/__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
    if (stateMatch) {
      console.log("\n--- __INITIAL_STATE__ found ---");
      try {
        const state = JSON.parse(stateMatch[1]);
        const goods = state?.goodsDetail?.goods || state?.productDetail?.goods;
        if (goods) {
          console.log("Price:", goods.minPrice || goods.price);
          console.log("Name:", (goods.name || "").slice(0, 80));
        }
      } catch (e) {
        console.log("Parse error:", e.message);
      }
    }

  } catch (err) {
    console.log("Fetch error:", err.message);
  }

  // Step 2: Try HEAD request with redirect:manual
  console.log("\n--- Step 2: HEAD with redirect:manual ---");
  try {
    const headRes = await fetch(SHARE_URL, {
      method: "HEAD",
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      },
    });
    console.log("Status:", headRes.status);
    console.log("Location:", headRes.headers.get("location"));
  } catch (err) {
    console.log("HEAD error:", err.message);
  }

  // Step 3: Try Temu BG API with goods_id (if found)
  console.log("\n--- Step 3: Temu BG API test ---");
  // We'll try with the goods_id from the resolved URL
  // First, resolve the share URL again to get the goods_id
  try {
    const res = await fetch(SHARE_URL, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (res.url) {
      const parsed = new URL(res.url);
      const gMatch = parsed.pathname.match(/-g-([a-zA-Z0-9]+)/);
      if (gMatch) {
        const goodsId = gMatch[1];
        console.log("Testing BG API with goods_id:", goodsId);

        const apiRes = await fetch("https://www.temu.com/bg/goods/api", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
              "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept: "application/json",
            Origin: "https://www.temu.com",
            Referer: `https://www.temu.com/-g-${goodsId}.html`,
          },
          body: JSON.stringify({ goods_id: goodsId }),
        });
        console.log("BG API Status:", apiRes.status);
        const apiText = await apiRes.text();
        console.log("BG API Response (first 500 chars):", apiText.slice(0, 500));

        // Also try with _x_sessn=us and currency=USD
        console.log("\n--- BG API with US session ---");
        const apiRes2 = await fetch("https://www.temu.com/bg/goods/api", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
              "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept: "application/json",
            Origin: "https://www.temu.com",
            Referer: `https://www.temu.com/-g-${goodsId}.html?_x_sessn=us&currency=USD`,
          },
          body: JSON.stringify({ goods_id: goodsId, _x_sessn: "us" }),
        });
        console.log("BG API US Status:", apiRes2.status);
        const apiText2 = await apiRes2.text();
        console.log("BG API US Response (first 500 chars):", apiText2.slice(0, 500));
      } else {
        console.log("No goods_id found in resolved URL");
      }
    }
  } catch (err) {
    console.log("BG API error:", err.message);
  }
}

test().catch(console.error);
