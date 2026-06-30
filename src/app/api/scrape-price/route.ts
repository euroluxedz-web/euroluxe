import { NextRequest, NextResponse } from "next/server";
import { calculateAlgeriaPrice } from "@/lib/exchange-rate";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const RATE = 300;
const WORKER_URL = "https://temu-proxy.euroluxe.workers.dev";

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

  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];

  // Strategy A: OG price meta tag (most reliable)
  const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];

  if (ogPrice) {
    const price = parseFloat(ogPrice);
    if (price > 0.1 && price < 500) {
      return {
        price,
        currency: ogCurrency || "USD",
        productName: ogTitle ? ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim() : null,
        originalPrice: null,
        image: ogImage || null,
      };
    }
  }

  // Strategy B: JSON price fields with STRICT validation
  // Only match SPECIFIC field names (not generic "price" which matches everything)
  // Only accept prices in Temu's typical range: $0.50 - $100
  const strictPriceFields = ["minPrice", "salePrice", "priceStr", "displayPrice", "skuPrice", "sale_amount"];
  const foundPrices: number[] = [];
  
  for (const field of strictPriceFields) {
    // Match: "fieldName": <number> or "fieldName": "<number>"
    // BUT NOT: "fieldName": false or "fieldName": "OK" or "fieldName": {object}
    const pattern = new RegExp(`"${field}"\\s*:\\s*(?!false|true|null|\\{|\\")([0-9]+\\.?[0-9]*)`, "i");
    const m = html.match(pattern);
    if (m) {
      const p = parseFloat(m[1]);
      // Strict range: $0.50 - $100 (Temu's typical product range)
      if (p >= 0.5 && p <= 100) {
        foundPrices.push(p);
      }
    }
  }

  if (foundPrices.length > 0) {
    foundPrices.sort((a, b) => a - b);
    const nameMatch =
      html.match(/"goodsName"\s*:\s*"([^"]+)"/) ||
      html.match(/"title"\s*:\s*"([^"]+)"/);
    return {
      price: foundPrices[0],
      currency: "USD",
      productName: nameMatch ? nameMatch[1] : (ogTitle ? ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim() : null),
      originalPrice: null,
      image: ogImage || null,
    };
  }

  // If we have a title but no price, return that (for image + name extraction)
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

    // Strategy 1: Temu internal API with cookies (via Worker)
    if (cookies) {
      console.log("[Strategy 1] Trying Temu API with cookies...");
      const temuResult = await fetchFromTemuAPI(goodsId, cookies);
      if (temuResult?.price && temuResult.price > 0) {
        let priceUSD = temuResult.price;
        const cur = temuResult.currency?.toUpperCase() || "USD";
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
        let priceUSD = pageResult.price;
        const cur = pageResult.currency?.toUpperCase() || "USD";
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
        ? "Could not extract price. Temu cookies may have expired. Please update TEMU_COOKIES."
        : "TEMU_COOKIES not configured. Please set the TEMU_COOKIES environment variable.",
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
