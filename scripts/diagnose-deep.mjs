/**
 * Deep diagnostic: 
 * 1. Show the actual HTML from share.temu.com redirect
 * 2. Try Temu's bgapi endpoint with goods_id
 * 3. Try AllOrigins to get the full product page
 */

const GOODS_IDS = [
  { id: "601101613236742", name: "7d4cdBt01yB" },
  { id: "601105214745191", name: "t0mQUcAlkoB / GLv19JAELgB" },
  { id: "601102757183337", name: "iEXtmO1ZX5B" },
];

async function testBgApi(goodsId) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing BG API for goods_id: ${goodsId}`);
  console.log("=".repeat(60));

  const bgApiUrls = [
    `https://www.temu.com/bg/goods/api?goodsId=${goodsId}&_x_sessn=us&currency=USD`,
    `https://www.temu.com/bg/goods/api?goods_id=${goodsId}&_x_sessn=us&currency=USD`,
    `https://www.temu.com/bg/goods/api?goodsId=${goodsId}`,
  ];

  for (const url of bgApiUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
          Accept: "application/json",
        },
      });
      console.log(`  ${url.slice(0, 70)}...`);
      console.log(`  Status: ${res.status}`);
      const text = await res.text();
      console.log(`  Response length: ${text.length}`);
      if (text.length < 2000) {
        console.log(`  Response: ${text.slice(0, 500)}`);
      } else {
        // Try to find price in the response
        const priceMatches = [...text.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
        if (priceMatches.length > 0) {
          console.log(`  Price fields:`);
          for (const m of priceMatches) {
            console.log(`    ${m[1]}: ${m[2]}`);
          }
        }
        const currencyMatch = text.match(/"currency"\s*:\s*"([^"]+)"/);
        console.log(`  Currency: ${currencyMatch ? currencyMatch[1] : "none"}`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message.slice(0, 100)}`);
    }
  }
}

async function testAllOrigins(goodsId) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing AllOrigins for goods_id: ${goodsId}`);
  console.log("=".repeat(60));

  const productUrls = [
    `https://www.temu.com/-g-${goodsId}.html`,
    `https://www.temu.com/dz-en/goods.html?goods_id=${goodsId}`,
    `https://www.temu.com/pk-en/-g-${goodsId}.html`,
    `https://www.temu.com/om-en/-g-${goodsId}.html`,
  ];

  for (const productUrl of productUrls) {
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(productUrl)}`;
      console.log(`\n  Trying: ${productUrl}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeout);
      console.log(`  Status: ${res.status}`);
      
      if (!res.ok) {
        console.log(`  Failed`);
        continue;
      }
      
      const text = await res.text();
      console.log(`  Response length: ${text.length}`);

      if (text.length < 100) {
        console.log(`  Too short: ${text}`);
        continue;
      }

      // Check for OG price
      const ogPrice = text.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
      const ogCurrency = text.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i);
      const ogTitle = text.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
      const ogImage = text.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);

      console.log(`  OG price: ${ogPrice ? ogPrice[1] : "none"}`);
      console.log(`  OG currency: ${ogCurrency ? ogCurrency[1] : "none"}`);
      console.log(`  OG title: ${ogTitle ? ogTitle[1].slice(0, 80) : "none"}`);

      // Check for window.rawData
      const rawDataMatch = text.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
      console.log(`  window.rawData: ${rawDataMatch ? "YES" : "NO"}`);

      if (rawDataMatch) {
        const rawDataStr = rawDataMatch[1];
        const priceFields = [...rawDataStr.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
        for (const m of priceFields) {
          console.log(`    ${m[1]}: ${m[2]}`);
        }
      }

      // Check for priceInfo blocks
      const priceInfoMatches = [...text.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
      if (priceInfoMatches.length > 0) {
        console.log(`  priceInfo blocks:`);
        for (const pi of priceInfoMatches) {
          console.log(`    price: ${parseInt(pi[1]) / 100} ${pi[2]}`);
        }
      }

    } catch (err) {
      console.log(`  Error: ${err.message.slice(0, 100)}`);
    }
  }
}

async function testShareHtml() {
  // Show the actual HTML content from share.temu.com
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Actual HTML from share.temu.com/iEXtmO1ZX5B`);
  console.log("=".repeat(60));

  try {
    const res = await fetch("https://share.temu.com/iEXtmO1ZX5B", {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const body = await res.text();
    console.log(`\nFull HTML (${body.length} chars):`);
    console.log(body);
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

async function main() {
  // Show the actual HTML first
  await testShareHtml();

  // Test BG API for each goods_id
  for (const { id, name } of GOODS_IDS) {
    console.log(`\n\n>>> Product from share URL: ${name} (goods_id: ${id})`);
    await testBgApi(id);
    await testAllOrigins(id);
  }
}

main().catch(console.error);
