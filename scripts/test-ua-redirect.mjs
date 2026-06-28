// Test: Does the user-agent affect the share URL redirect?
// Mobile user agents might get a different redirect than desktop

const SHARE_URL = "https://share.temu.com/iEXtmO1ZX5B";

async function testUserAgent() {
  const userAgents = {
    "Mobile (Android)": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    "Desktop (Chrome)": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Desktop (Mac Safari)": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Temu App (Android)": "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 Temu/3.34.0",
  };

  for (const [name, ua] of Object.entries(userAgents)) {
    console.log(`\n=== ${name} ===`);
    try {
      const res = await fetch(SHARE_URL, {
        redirect: "follow",
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml",
        },
      });
      
      console.log(`Status: ${res.status}`);
      console.log(`Final URL: ${res.url}`);
      
      // Check for _oak_rec_ext_1
      const finalUrl = new URL(res.url);
      const oakRecExt1 = finalUrl.searchParams.get("_oak_rec_ext_1");
      const topGallery = finalUrl.searchParams.get("top_gallery_url");
      const goodsId = finalUrl.pathname.match(/-g-(\d+)/)?.[1] || finalUrl.searchParams.get("goods_id");
      const localeOverride = finalUrl.searchParams.get("locale_override");
      
      console.log(`_oak_rec_ext_1: ${oakRecExt1 || "NOT FOUND"}`);
      console.log(`top_gallery_url: ${topGallery ? "FOUND" : "NOT FOUND"}`);
      console.log(`goods_id: ${goodsId || "NOT FOUND"}`);
      console.log(`locale_override: ${localeOverride || "NOT FOUND"}`);
      console.log(`pathname: ${finalUrl.pathname}`);
      
      // Decode _oak_rec_ext_1 if present
      if (oakRecExt1) {
        try {
          const b64 = oakRecExt1.replace(/-/g, "+").replace(/_/g, "/");
          const decoded = Buffer.from(b64, "base64").toString("utf-8").trim();
          console.log(`_oak_rec_ext_1 decoded: "${decoded}"`);
          const cents = parseInt(decoded.replace(/\D/g, ""), 10);
          console.log(`Price: ${cents / 100}`);
        } catch (e) {
          console.log(`Decode error: ${e.message}`);
        }
      }
      
      // Check HTML body
      const html = await res.text();
      console.log(`HTML length: ${html.length}`);
      
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }

  // Also try redirect: "manual" to see the initial redirect
  console.log("\n\n=== Manual redirect check ===");
  try {
    const res = await fetch(SHARE_URL, {
      method: "HEAD",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html",
      },
    });
    console.log(`Status: ${res.status}`);
    console.log(`Location: ${res.headers.get("location")}`);
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }

  // Try GET with redirect: "manual"
  console.log("\n=== GET with redirect: manual ===");
  try {
    const res = await fetch(SHARE_URL, {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    console.log(`Status: ${res.status}`);
    const location = res.headers.get("location");
    console.log(`Location: ${location}`);
    
    if (location) {
      // Follow the redirect manually
      const res2 = await fetch(location, {
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
        },
      });
      console.log(`Second redirect status: ${res2.status}`);
      console.log(`Second redirect Location: ${res2.headers.get("location")}`);
      console.log(`Second redirect URL: ${res2.url}`);
      
      if (res2.status >= 200 && res2.status < 300) {
        const html = await res2.text();
        console.log(`HTML length: ${html.length}`);
        
        // Check for meta refresh or JS redirect
        const metaRefresh = html.match(/content=["']?\d+;\s*url=([^"'\s>]+)/i);
        const jsRedirect = html.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
        console.log(`Meta refresh: ${metaRefresh?.[1] || "none"}`);
        console.log(`JS redirect: ${jsRedirect?.[1] || "none"}`);
      }
    } else {
      const html = await res.text();
      console.log(`HTML length: ${html.length}`);
      
      // Check for meta refresh or JS redirect
      const metaRefresh = html.match(/content=["']?\d+;\s*url=([^"'\s>]+)/i);
      const jsRedirect = html.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
      console.log(`Meta refresh: ${metaRefresh?.[1] || "none"}`);
      console.log(`JS redirect: ${jsRedirect?.[1] || "none"}`);
    }
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

testUserAgent();
