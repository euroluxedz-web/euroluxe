import { NextRequest, NextResponse } from "next/server";
import { calculateAlgeriaPrice } from "@/lib/exchange-rate";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const RATE = 300;
const WORKER_URLS = [
  "https://temu-proxy-2.euroluxe.workers.dev",
  "https://temu-proxy.euroluxe.workers.dev",
];

const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1, EUR: 1.085, GBP: 1.265, CNY: 0.14, DZD: 0.0075,
  QAR: 0.274, OMR: 2.597, BHD: 2.652, SAR: 0.266, AED: 0.272,
  MUR: 0.0221, PKR: 0.00358, SEK: 0.0954, NOK: 0.0938, CAD: 0.735,
  AUD: 0.658, NZD: 0.605, JPY: 0.0067, KRW: 0.00072, INR: 0.0119,
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

interface TemuProductData {
  price: number | null;
  currency: string;
  productName: string | null;
  originalPrice: number | null;
  image: string | null;
}

function getTemuCookies(): string {
  return process.env.TEMU_COOKIES || "";
}

/* Get the user's Temu currency from cookies (EUR, USD, QAR, etc.) */
function getCurrencyFromCookies(cookies: string): string {
  const match = cookies.match(/currency=([A-Z]{3})/i);
  return match ? match[1].toUpperCase() : "USD";
}

/* ── Resolve share.temu.com/XXX → goods_id + image ── */
async function resolveShareUrl(url: string): Promise<{
  finalUrl: string;
  goodsId: string | null;
  image: string | null;
}> {
  let currentUrl = url;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(currentUrl, {
      redirect: "manual",
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    const location = res.headers.get("location");
    if (location && res.status >= 300 && res.status < 400) {
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }
    await res.text();
    break;
  }

  let goodsId: string | null = null;
  const gidMatch = currentUrl.match(/goods_id=([^&]+)/);
  if (gidMatch) goodsId = gidMatch[1];
  if (!goodsId) {
    const gidMatch2 = currentUrl.match(/-g-(\d+)\.html/);
    if (gidMatch2) goodsId = gidMatch2[1];
  }

  let image: string | null = null;
  try {
    const u = new URL(currentUrl);
    image = u.searchParams.get("share_img") || u.searchParams.get("top_gallery_url") || null;
  } catch {
    const m = currentUrl.match(/[?&](?:share_img|top_gallery_url)=([^&]+)/);
    if (m) {
      try { image = decodeURIComponent(m[1]); } catch { image = m[1]; }
    }
  }

  return { finalUrl: currentUrl, goodsId, image };
}

/* ── Strategy 0: Call Temu API DIRECTLY from Vercel (no Worker) ── */
/* Vercel's IP might be less blocked than Cloudflare Worker's IP */
async function fetchFromTemuAPIDirect(goodsId: string, cookies: string): Promise<TemuProductData | null> {
  if (!cookies) return null;

  try {
    console.log(`[Temu API Direct] Trying direct call for: ${goodsId}`);
    console.log(`[Temu API Direct] Cookies length: ${cookies.length}`);
    const res = await fetch("https://www.temu.com/api/oak/integration/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookies,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://www.temu.com",
        "Referer": `https://www.temu.com/-g-${goodsId}.html`,
      },
      body: JSON.stringify({
        goods_id: goodsId,
        page_sn: 10032,
        refer_page_name: "goods",
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.log(`[Temu API Direct] HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const goods = data?.goods;
    if (!goods) {
      console.log(`[Temu API Direct] No goods in response. Keys: ${Object.keys(data).join(",")}`);
      return null;
    }

    console.log(`[Temu API Direct] ✓ Got response! status=${goods.status}, keys=${Object.keys(goods).join(",")}`);

    // Check for price fields
    const priceFields = ["minPrice", "salePrice", "price", "displayPrice", "skuPrice"];
    for (const field of priceFields) {
      const val = goods[field];
      if (val !== undefined && val !== null) {
        const price = typeof val === "string" ? parseFloat(val) : typeof val === "number" ? val : null;
        if (price && price > 0 && price < 500) {
          const actualPrice = price > 100 ? price / 100 : price;
          console.log(`[Temu API Direct] ✓ Found price: ${actualPrice} (from ${field})`);
          return {
            price: actualPrice,
            currency: goods.currency || "USD",
            productName: goods.goodsName || goods.goods_name || goods.title || goods.name || null,
            originalPrice: null,
            image: goods.hd_thumb_url || goods.thumbUrl || null,
          };
        }
      }
    }

    // Also check sku for price
    const sku = data?.sku;
    if (Array.isArray(sku) && sku.length > 0) {
      for (const s of sku) {
        const sPrice = s.minPrice || s.salePrice || s.price;
        if (sPrice) {
          const price = typeof sPrice === "string" ? parseFloat(sPrice) : sPrice;
          if (price > 0 && price < 500) {
            const actualPrice = price > 100 ? price / 100 : price;
            console.log(`[Temu API Direct] ✓ Found SKU price: ${actualPrice}`);
            return {
              price: actualPrice,
              currency: s.currency || "USD",
              productName: goods.goodsName || goods.goods_name || null,
              originalPrice: null,
              image: goods.hd_thumb_url || null,
            };
          }
        }
      }
    }

    // Return image even if no price
    if (goods.hd_thumb_url) {
      return {
        price: null,
        currency: "USD",
        productName: goods.goodsName || goods.goods_name || null,
        originalPrice: null,
        image: goods.hd_thumb_url,
      };
    }

    return null;
  } catch (err) {
    console.log(`[Temu API Direct] Error: ${String(err).slice(0, 100)}`);
    return null;
  }
}

/* ── Strategy 1: Call Temu's internal API via Worker with cookies ── */
async function fetchFromTemuAPI(goodsId: string, cookies: string): Promise<TemuProductData | null> {
  if (!cookies) return null;

  const apiUrls = [
    `https://www.temu.com/api/oak/integration/render?goods_id=${encodeURIComponent(goodsId)}`,
    `https://www.temu.com/api/oak/integration/render?subject_id=${encodeURIComponent(goodsId)}`,
    `https://www.temu.com/bg/goods/api`,
  ];

  for (let i = 0; i < apiUrls.length; i++) {
    const apiUrl = apiUrls[i];
    const isPost = i === 2; // bg/goods/api needs POST
    try {
      console.log(`[Temu API] Trying: ${apiUrl.slice(0, 60)}`);

      const workerBody = isPost
        ? { target: apiUrl, body: { goods_id: goodsId }, headers: { Cookie: cookies } }
        : { target: apiUrl, headers: { Cookie: cookies } };

      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workerBody),
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        console.log(`[Temu API] HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const responseBody = data.body || "";
      
      // Try to parse as JSON
      let jsonData: any = null;
      try {
        jsonData = JSON.parse(responseBody);
      } catch {
        // Not JSON, skip
        continue;
      }

      // Check for anti-bot error
      if (jsonData.error_code === 40003 || jsonData.error_code === 1000000) {
        console.log(`[Temu API] Anti-bot blocked (error_code: ${jsonData.error_code})`);
        continue;
      }

      // Extract price from various response structures
      const paths = [
        jsonData?.data?.goodsDetail?.goods,
        jsonData?.data?.goods,
        jsonData?.data?.detail,
        jsonData?.result?.goods,
        jsonData?.data,
        jsonData?.result,
      ];

      for (const obj of paths) {
        if (!obj) continue;

        const priceFields = ["minPrice", "salePrice", "price", "displayPrice", "minOrigPrice", "origPrice"];
        for (const field of priceFields) {
          const val = obj[field];
          if (val !== undefined && val !== null) {
            const price = typeof val === "string" ? parseFloat(val) : typeof val === "number" ? val : null;
            if (price && price > 0 && price < 100000) {
              const actualPrice = price > 100 ? price / 100 : price; // Convert cents to dollars
              const name = obj.goodsName || obj.title || obj.name || obj.productName || null;
              const image = obj.hd_thumb_url || obj.thumbUrl || obj.imageUrl || obj.picUrl || null;
              const origPrice = obj.minOrigPrice || obj.origPrice || null;

              console.log(`[Temu API] ✓ Found price: ${actualPrice} (from ${field})`);
              return {
                price: actualPrice,
                currency: obj.currency || "USD",
                productName: name,
                originalPrice: origPrice ? (typeof origPrice === "number" ? (origPrice > 100 ? origPrice / 100 : origPrice) : parseFloat(String(origPrice))) : null,
                image,
              };
            }
          }
        }
      }
    } catch (err) {
      console.log(`[Temu API] Error: ${String(err).slice(0, 100)}`);
    }
  }

  return null;
}


/* ── Fetch product image from Temu API (works even for sold-out products) ── */
async function fetchProductImageFromTemuAPI(goodsId: string, cookies: string): Promise<{ image: string | null; name: string | null } | null> {
  if (!cookies) return null;

  try {
    console.log(`[Temu Image API] Fetching image for goods_id: ${goodsId}`);
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: "https://www.temu.com/api/oak/integration/render",
        body: { goods_id: goodsId, page_sn: 10032, refer_page_name: "goods" },
        headers: { Cookie: cookies },
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const responseBody = data.body || "";
    let jsonData: any = null;
    try {
      jsonData = JSON.parse(responseBody);
    } catch {
      return null;
    }

    if (jsonData.error_code === 40003 || jsonData.error_code === 1000000) {
      console.log(`[Temu Image API] Anti-bot blocked`);
      return null;
    }

    const goods = jsonData?.goods;
    if (!goods) return null;

    // Extract image from hd_thumb_url (always present, even for sold-out products)
    const image = goods.hd_thumb_url || goods.thumbUrl || goods.imageUrl || goods.picUrl || null;
    const name = goods.goodsName || goods.goods_name || goods.title || goods.name || null;

    console.log(`[Temu Image API] ✓ Image: ${image ? image.slice(0, 60) : "none"}, Name: ${name?.slice(0, 40) || "none"}`);

    return { image, name };
  } catch (err) {
    console.log(`[Temu Image API] Error: ${String(err).slice(0, 100)}`);
    return null;
  }
}

/* ── Strategy APIFY: Use Apify Temu scraper (most reliable) ── */
/* Uses ASYNC polling: start run → poll → get results */
/* Each HTTP call < 5s, total < 50s, fits Vercel 60s limit */
async function fetchFromApify(seoUrl: string, goodsId: string): Promise<TemuProductData | null> {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) return null;

  try {
    console.log(`[Apify] Starting async scrape...`);
    
    // Step 1: Start the run (returns immediately)
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/apivault_labs~temu-product-scraper/runs?token=${apifyToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
        productUrls: [seoUrl],
        proxyConfiguration: { useApifyProxy: true, apifyProxyCountry: "US" },
      }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!startRes.ok) return null;

    const startData = await startRes.json();
    const runId = startData?.data?.id;
    const datasetId = startData?.data?.defaultDatasetId;
    if (!runId || !datasetId) return null;

    console.log(`[Apify] Run ${runId} started, polling...`);

    // Step 2: Poll every 2s - check DATASET directly (not run status)
    // Apify writes results to dataset BEFORE run status changes to SUCCEEDED
    let items: any[] = [];
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const itemsRes = await fetch(
          `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}`,
          { signal: AbortSignal.timeout(5000) }
        );
        const data = await itemsRes.json();
        if (Array.isArray(data) && data.length > 0) {
          items = data;
          console.log(`[Apify] ✓ Got ${items.length} items on poll ${i+1}`);
          break;
        }
        // Also check if run failed
        const statusRes = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`,
          { signal: AbortSignal.timeout(3000) }
        );
        const statusData = await statusRes.json();
        const status = statusData?.data?.status;
        if (status === "FAILED" || status === "ABORTED") {
          console.log(`[Apify] Run ${status}`);
          return null;
        }
        console.log(`[Apify] Poll ${i+1}: ${status}, 0 items`);
      } catch { /* continue polling */ }
    }

    if (items.length === 0) {
      console.log(`[Apify] No items after 40s`);
      return null;
    }

    const item = items[0];
    if (!item || item.success === false) return null;

    const priceUSD = item.priceUsd ? parseFloat(item.priceUsd) : null;
    const priceLocal = item.priceLocal ? parseFloat(item.priceLocal) : null;
    const currency = item.currency || "USD";
    const title = item.title || null;
    const image = item.imageUrl || null;
    const originalPriceUsd = item.originalPriceUsd ? parseFloat(item.originalPriceUsd) : null;

    console.log(`[Apify] ✓ $${priceUSD} (${priceLocal} ${currency})`);

    if (priceUSD && priceUSD > 0 && priceUSD < 500) {
      return { price: priceUSD, currency: "USD", productName: title, originalPrice: originalPriceUsd, image };
    }
    if (priceLocal && priceLocal > 0 && currency !== "USD" && CURRENCY_TO_USD[currency]) {
      const usd = Math.round(priceLocal * CURRENCY_TO_USD[currency] * 100) / 100;
      if (usd > 0 && usd < 500) return { price: usd, currency: "USD", productName: title, originalPrice: originalPriceUsd, image };
    }
    return null;
  } catch (err) {
    console.log(`[Apify] Error: ${String(err).slice(0, 150)}`);
    return null;
  }
}
/* ── Get full SEO URL from Temu page (needed for Apify) ── */
async function getSeoUrlFromTemu(goodsId: string, cookies: string): Promise<string | null> {
  const pageUrl = `https://www.temu.com/dz-en/goods.html?goods_id=${goodsId}`;
  
  // Try ALL sources IN PARALLEL for maximum speed
  const sources = [
    // Worker 2
    `https://temu-proxy-2.euroluxe.workers.dev/?url=${encodeURIComponent(pageUrl)}`,
    // Worker 1
    `https://temu-proxy.euroluxe.workers.dev/?url=${encodeURIComponent(pageUrl)}`,
  ];
  
  // Also try Temu API for goods_name (to construct URL)
  if (cookies) {
    sources.push(`__TEMU_API__:${goodsId}`);
  }
  
  // Race all sources - first one to return og:url or goods_name wins
  const results = await Promise.allSettled(sources.map(async (src, idx) => {
    if (src.startsWith("__TEMU_API__")) {
      // Call Temu API directly for goods_name
      const gid = src.split(":")[1];
      const res = await fetch("https://www.temu.com/api/oak/integration/render", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cookie": cookies, "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({ goods_id: gid, page_sn: 10032, refer_page_name: "goods" }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const name = data?.goods?.goods_name || data?.goods?.goodsName || "";
      if (name && name.length > 5 && !name.includes("discontinued")) {
        const slug = name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 200);
        return `https://www.temu.com/${slug}-g-${gid}.html`;
      }
      return null;
    }
    
    // Fetch page from Worker
    const res = await fetch(src + `&_t=${Date.now()}`, { signal: AbortSignal.timeout(6000) });
    const html = await res.text();
    
    // Try og:url
    const ogUrl = html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1];
    if (ogUrl) {
      return ogUrl;
    }
    
    // Try og:title to construct URL
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    if (ogTitle && !ogTitle.includes("discontinued") && !ogTitle.includes("Login") && ogTitle.length > 5) {
      const name = ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim();
      const slug = name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 200);
      return `https://www.temu.com/${slug}-g-${goodsId}.html`;
    }
    
    return null;
  }));
  
  // Return first successful result
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      console.log(`[SEO URL] ✓ Found: ${result.value.slice(0, 80)}`);
      return result.value;
    }
  }
  
  console.log("[SEO URL] All sources failed");
  return null;
}

/* ── Strategy 2: Fetch product page via Worker with cookies ── */

async function fetchFromTemuPage(url: string, cookies: string): Promise<TemuProductData | null> {
  if (!cookies) return null;

  try {
    console.log(`[Temu Page] Fetching: ${url.slice(0, 60)}`);
    const workerUrl = `${WORKER_URL}/?url=${encodeURIComponent(url)}&cookie=${encodeURIComponent(cookies)}`;
    
    const res = await fetch(workerUrl, {
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    return extractPriceFromHtml(html);
  } catch (err) {
    console.log(`[Temu Page] Error: ${String(err).slice(0, 100)}`);
    return null;
  }
}

/* ── Extract price from HTML ── */
function extractPriceFromHtml(html: string): TemuProductData | null {
  // Check for anti-bot
  if (html.includes("Security verification") && html.length < 5000) {
    return null;
  }

  // OG price meta tag
  const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];

  if (ogPrice) {
    const price = parseFloat(ogPrice);
    if (price > 0 && price < 100000) {
      return {
        price,
        currency: ogCurrency || "USD",
        productName: ogTitle ? ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim() : null,
        originalPrice: null,
        image: ogImage || null,
      };
    }
  }

  // Embedded JSON data — same as v5 but with tighter price range
  const priceFields = ["minPrice", "salePrice", "price", "displayPrice", "priceStr", "minOrigPrice", "origPrice"];
  const foundPrices: number[] = [];
  
  for (const field of priceFields) {
    const pattern = new RegExp(`${'"'}${field}${'"'}\\s*:\\s*"?\\$?(\\d+\\.?\\d*)"?`, "i");
    const m = html.match(pattern);
    if (m) {
      const p = parseFloat(m[1]);
      // Tighter range: $0.50 - $200 (filters out false positives like 619, 716, 10032)
      if (p >= 0.5 && p <= 200) foundPrices.push(p);
    }
  }

  if (foundPrices.length > 0) {
    foundPrices.sort((a, b) => a - b);
    const nameMatch =
      html.match(/"goodsName"\s*:\s*"([^"]+)"/) ||
      html.match(/"title"\s*:\s*"([^"]+)"/) ||
      html.match(/"subject"\s*:\s*"([^"]+)"/);
    return {
      price: foundPrices[0],
      currency: "USD",
      productName: nameMatch ? nameMatch[1] : (ogTitle ? ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim() : null),
      originalPrice: null,
      image: ogImage || null,
    };
  }

  // If we have a title but no price, return that
  if (ogTitle) {
    return {
      price: null,
      currency: "USD",
      productName: ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim(),
      originalPrice: null,
      image: ogImage || null,
    };
  }

  return null;
}

function extractNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const slug = segments.find((s) => s.includes("-g-") && s.length > 10) || segments[segments.length - 1] || "";
    const name = slug.replace(/-g-[a-zA-Z0-9]+\.html?$/i, "").replace(/\.html?$/i, "").replace(/-/g, " ").trim();
    if (name && name.length > 3) return name.replace(/\b\w/g, (l) => l.toUpperCase());
  } catch { /* skip */ }
  return null;
}

/* ── Main POST handler ── */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, manualPrice } = body;

    // Manual price entry
    if (manualPrice) {
      const price = parseFloat(String(manualPrice).replace(/[^\d.]/g, ""));
      if (price > 0 && price < 100000) {
        const isDZD = /DA|dzd|DZD|دينار/i.test(String(manualPrice));
        const priceUSD = isDZD ? price / RATE : price;
        const breakdown = calculateAlgeriaPrice(priceUSD);
        return NextResponse.json({
          success: true,
          price: Math.round(priceUSD * 100) / 100,
          dzd: breakdown.totalDZD,
          breakdown,
          productName: body.productName || null,
          productImage: body.productImage || null,
          productUrl: url || "",
          source: "manual",
          itemId: body.itemId || undefined,
        });
      }
    }

    if (!url || typeof url !== "string") {
      return NextResponse.json({ success: false, error: "URL required", allowManual: true }, { status: 400 });
    }

    console.log(`\n=== [scrape-price v5-cookie] ${url.slice(0, 80)} ===`);

    // Resolve share URL and extract goods_id
    let finalUrl = url.trim();
    let goodsId = "";
    let shareImage: string | null = null;

    if (url.includes("share.temu.com/")) {
      console.log("[Step 1] Resolving share URL...");
      const resolved = await resolveShareUrl(url);
      finalUrl = resolved.finalUrl;
      goodsId = resolved.goodsId || "";
      shareImage = resolved.image;
      console.log(`[Step 1] goods_id=${goodsId}, image=${shareImage ? "yes" : "no"}`);
    } else if (url.includes("temu.com")) {
      try {
        const parsed = new URL(url);
        const gMatch = parsed.searchParams.get("goods_id") || parsed.pathname.match(/-g-([a-zA-Z0-9]+)/)?.[1];
        if (gMatch) goodsId = gMatch;
        shareImage = parsed.searchParams.get("share_img") || parsed.searchParams.get("top_gallery_url") || null;
      } catch { /* skip */ }
    } else if (/^[a-zA-Z0-9]{6,30}$/.test(url.trim())) {
      goodsId = url.trim();
      finalUrl = `https://www.temu.com/-g-${url.trim()}.html`;
    }

    if (!goodsId) {
      return NextResponse.json({
        success: false,
        error: "Could not extract goods_id from URL",
        allowManual: true,
      });
    }

    const cookies = getTemuCookies();
    console.log(`[Step 2] Cookies: ${cookies ? `yes (${cookies.length} chars)` : "NO - TEMU_COOKIES not set"}`);

    // Strategy APIFY: DISABLED for now - Temu API with fresh cookies is tried first
    if (process.env.APIFY_API_TOKEN) {
      console.log("[Strategy Apify] Getting SEO URL...");
      const seoUrl = await getSeoUrlFromTemu(goodsId, cookies);
      if (seoUrl) {
        console.log("[Strategy Apify] Starting Apify run (async)...");
        try {
          const startRes = await fetch(
            `https://api.apify.com/v2/acts/apivault_labs~temu-product-scraper/runs?token=${process.env.APIFY_API_TOKEN}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
        productUrls: [seoUrl],
        proxyConfiguration: { useApifyProxy: true, apifyProxyCountry: "US" },
      }),
              signal: AbortSignal.timeout(10000),
            }
          );
          if (startRes.ok) {
            const startData = await startRes.json();
            const runId = startData?.data?.id;
            const datasetId = startData?.data?.defaultDatasetId;
            if (datasetId) {
              console.log(`[Apify] Run started: ${runId}, dataset: ${datasetId}`);
              // Return immediately - frontend will poll /api/scrape-poll
              return NextResponse.json({
                success: false,
                pending: true,
                datasetId,
                runId,
                goodsId,
                productImage: shareImage,
                productUrl: `https://www.temu.com/-g-${goodsId}.html`,
                itemId: goodsId,
                productName: `Produit Temu #${goodsId}`,
              });
            }
          }
        } catch (e) {
          console.log(`[Apify] Start error: ${String(e).slice(0, 80)}`);
        }
      } else {
        console.log("[Apify] No SEO URL found");
      }
    }

    // Strategy 0: Temu API DIRECTLY from Vercel (bypasses Worker IP block)
    if (cookies) {
      console.log("[Strategy 0] Trying Temu API direct (Vercel IP)...");
      const directResult = await fetchFromTemuAPIDirect(goodsId, cookies);
      if (directResult?.price && directResult.price > 0) {
        let cur = directResult.currency?.toUpperCase() || "USD";
        if (cur === "USD" && cookies) {
          const cookieCur = getCurrencyFromCookies(cookies);
          if (cookieCur !== "USD") cur = cookieCur;
        }
        let priceUSD = directResult.price;
        if (cur !== "USD" && CURRENCY_TO_USD[cur]) {
          priceUSD = directResult.price * CURRENCY_TO_USD[cur];
        }
        const breakdown = calculateAlgeriaPrice(priceUSD);
        console.log(`[Done] ✓ Direct API price: $${priceUSD} = ${breakdown.totalDZD} DZD`);
        return NextResponse.json({
          success: true,
          price: Math.round(priceUSD * 100) / 100,
          dzd: breakdown.totalDZD,
          breakdown,
          productName: directResult.productName || `Produit Temu #${goodsId}`,
          productImage: directResult.image || shareImage,
          productUrl: `https://www.temu.com/-g-${goodsId}.html`,
          source: "temu-api-direct",
          itemId: goodsId,
        });
      }
    }

    // Strategy 1: Temu internal API with cookies (via Worker)
    if (cookies) {
      console.log("[Strategy 1] Trying Temu API with cookies...");
      const temuResult = await fetchFromTemuAPI(goodsId, cookies);
      if (temuResult?.price && temuResult.price > 0) {
        let cur = temuResult.currency?.toUpperCase() || "USD";
        if (cur === "USD" && cookies) {
          const cookieCur = getCurrencyFromCookies(cookies);
          if (cookieCur !== "USD") cur = cookieCur;
        }
        let priceUSD = temuResult.price;
        if (cur !== "USD" && CURRENCY_TO_USD[cur]) {
          priceUSD = temuResult.price * CURRENCY_TO_USD[cur];
        }
        const breakdown = calculateAlgeriaPrice(priceUSD);
        console.log(`[Done] ✓ API price: $${priceUSD} = ${breakdown.totalDZD} DZD`);
        // If no image from API, try fetching it separately
        let finalImage = temuResult.image || shareImage;
        if (!finalImage) {
          const imgResult = await fetchProductImageFromTemuAPI(goodsId, cookies);
          if (imgResult?.image) finalImage = imgResult.image;
        }
        return NextResponse.json({
          success: true,
          price: Math.round(priceUSD * 100) / 100,
          dzd: breakdown.totalDZD,
          breakdown,
          productName: temuResult.productName || `Produit Temu #${goodsId}`,
          productImage: finalImage,
          productUrl: `https://www.temu.com/-g-${goodsId}.html`,
          originalPrice: temuResult.originalPrice,
          source: "temu-api",
          itemId: goodsId,
        });
      }
    }

    // Strategy 2: Fetch product page with cookies (via Worker)
    if (cookies) {
      console.log("[Strategy 2] Trying Temu page with cookies...");
      const pageResult = await fetchFromTemuPage(finalUrl, cookies);
      if (pageResult?.price && pageResult.price > 0) {
        let cur = pageResult.currency?.toUpperCase() || "USD";
        // If currency is USD but user's cookies specify EUR, use EUR
        if (cur === "USD" && cookies) {
          const cookieCur = getCurrencyFromCookies(cookies);
          if (cookieCur !== "USD") cur = cookieCur;
        }
        let priceUSD = pageResult.price;
        if (cur !== "USD" && CURRENCY_TO_USD[cur]) {
          priceUSD = pageResult.price * CURRENCY_TO_USD[cur];
        }
        const breakdown = calculateAlgeriaPrice(priceUSD);
        console.log(`[Done] ✓ Page price: $${priceUSD} = ${breakdown.totalDZD} DZD`);
        // If no image from page, try fetching it from Temu API
        let finalImage = pageResult.image || shareImage;
        if (!finalImage) {
          const imgResult = await fetchProductImageFromTemuAPI(goodsId, cookies);
          if (imgResult?.image) finalImage = imgResult.image;
        }
        return NextResponse.json({
          success: true,
          price: Math.round(priceUSD * 100) / 100,
          dzd: breakdown.totalDZD,
          breakdown,
          productName: pageResult.productName || `Produit Temu #${goodsId}`,
          productImage: finalImage,
          productUrl: `https://www.temu.com/-g-${goodsId}.html`,
          source: "temu-page",
          itemId: goodsId,
        });
      }
    }

    // No price found — but try to get product image from Temu API
    console.log("[Done] No price found, fetching product image from Temu API...");
    let productImage = shareImage;
    let productName = extractNameFromUrl(finalUrl) || `Produit Temu #${goodsId}`;

    if (cookies && !productImage) {
      const imgResult = await fetchProductImageFromTemuAPI(goodsId, cookies);
      if (imgResult?.image) {
        productImage = imgResult.image;
        console.log(`[Done] ✓ Got image from Temu API: ${productImage.slice(0, 60)}`);
      }
      if (imgResult?.name && productName.startsWith("Produit Temu #")) {
        productName = imgResult.name;
      }
    }

    return NextResponse.json({
      success: false,
      error: cookies
        ? "This product may be sold out or unavailable. Try a different product link."
        : "TEMU_COOKIES not configured.",
      productName,
      productImage,
      productUrl: `https://www.temu.com/-g-${goodsId}.html`,
      itemId: goodsId,
      allowManual: true,
    });
  } catch (error) {
    console.error("[scrape-price v5] Fatal error:", error);
    return NextResponse.json(
      { success: false, error: "An error occurred", allowManual: true },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: "v5-cookie-worker",
    hasCookies: !!process.env.TEMU_COOKIES,
    usage: 'POST { "url": "https://share.temu.com/XXX" | "601105214745191" }',
  });
}
// Apify strategy active
