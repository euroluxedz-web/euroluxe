import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const RATE = 300;

// ─── Temu Open Platform API credentials ───
function getTemuAppKey(): string {
  return process.env.TEMU_AFFILIATE_APP_KEY || "";
}
function getTemuAppSecret(): string {
  return process.env.TEMU_AFFILIATE_APP_SECRET || "";
}
function getTemuAccessToken(): string {
  return process.env.TEMU_AFFILIATE_APP_TOKEN || "";
}

// Temu cookies from the user's account - stored in environment variable
function getTemuCookies(): string {
  return process.env.TEMU_COOKIES || "";
}

// ─── Temu Open Platform Signature Algorithm ───
// sign = MD5(app_secret + sorted(key+value pairs) + app_secret).toUpperCase()
function generateTemuSign(
  params: Record<string, any>,
  appSecret: string
): string {
  // Step 1: Sort parameters by key (ascending ASCII order)
  const sortedKeys = Object.keys(params).sort();

  // Step 2: Concatenate key+value pairs (no separators)
  let concatenated = "";
  for (const key of sortedKeys) {
    if (key === "sign") continue; // Skip sign parameter
    const val = params[key];
    if (val === undefined || val === null) continue;
    // For arrays/objects, serialize to compact JSON
    if (typeof val === "object") {
      concatenated += key + JSON.stringify(val);
    } else {
      concatenated += key + String(val);
    }
  }

  // Step 3: Wrap with app_secret
  const signString = appSecret + concatenated + appSecret;

  // Step 4: MD5 hash and uppercase
  const sign = crypto
    .createHash("md5")
    .update(signString, "utf-8")
    .digest("hex")
    .toUpperCase();

  return sign;
}

interface TemuProductData {
  price: number | null;
  currency: string;
  productName: string | null;
  originalPrice: number | null;
  image: string | null;
  affiliateLink?: string | null;
}

// ─── Resolve share.temu.com short links ───
async function resolveShareLink(url: string): Promise<{
  resolvedUrl: string;
  goodsId: string;
  imageUrl: string | null;
} | null> {
  // Method 1: HEAD request with redirect follow (fastest)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const finalUrl = response.url || "";
    if (finalUrl.includes("temu.com")) {
      const goodsId = extractGoodsIdFromUrl(finalUrl);
      let imageUrl: string | null = null;
      const imgMatch = finalUrl.match(/[?&]share_img=([^&]+)/);
      if (imgMatch) imageUrl = decodeURIComponent(imgMatch[1]);

      console.log(
        "[Share Link] HEAD resolved:",
        finalUrl,
        "goodsId:",
        goodsId
      );
      return { resolvedUrl: finalUrl, goodsId, imageUrl };
    }
  } catch (err) {
    console.log("[Share Link] HEAD failed:", String(err).slice(0, 100));
  }

  // Method 2: GET request with redirect follow
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const finalUrl = response.url;
    if (finalUrl && finalUrl.includes("temu.com")) {
      let goodsId = extractGoodsIdFromUrl(finalUrl);
      let imageUrl: string | null = null;
      const imgMatch = finalUrl.match(/[?&]share_img=([^&]+)/);
      if (imgMatch) imageUrl = decodeURIComponent(imgMatch[1]);

      // Also try to extract from HTML if no goodsId from URL
      if (!goodsId) {
        const html = await response.text();
        const htmlGoodsMatch = html.match(
          /goods_id["']?\s*[:=]\s*["']?([a-zA-Z0-9]{6,20})/i
        );
        if (htmlGoodsMatch) goodsId = htmlGoodsMatch[1];
        else {
          const urlInHtml = html.match(
            /temu\.com\/[^"'\s]*-g-([a-zA-Z0-9]+)/i
          );
          if (urlInHtml) goodsId = urlInHtml[1];
        }
      }

      console.log(
        "[Share Link] GET resolved:",
        finalUrl,
        "goodsId:",
        goodsId
      );
      return { resolvedUrl: finalUrl, goodsId, imageUrl };
    }
  } catch (err) {
    console.log("[Share Link] GET failed:", String(err).slice(0, 100));
  }

  return null;
}

function extractGoodsIdFromUrl(urlStr: string): string {
  let goodsId = "";
  const goodsIdParam = urlStr.match(/[?&]goods_id=([a-zA-Z0-9]+)/);
  if (goodsIdParam) goodsId = goodsIdParam[1];
  else {
    const gMatch = urlStr.match(/-g-([a-zA-Z0-9]+)/);
    if (gMatch) goodsId = gMatch[1];
    else {
      const numMatch = urlStr.match(/(\d{10,})/);
      if (numMatch) goodsId = numMatch[1];
    }
  }
  return goodsId;
}

// ─── Strategy 0: Temu Open Platform API (bg.local.goods.detail.query) ───
async function fetchFromTemuOpenPlatform(
  goodsId: string
): Promise<TemuProductData | null> {
  const appKey = getTemuAppKey();
  const appSecret = getTemuAppSecret();
  const accessToken = getTemuAccessToken();

  if (!appKey || !appSecret || !accessToken) return null;

  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Try multiple regional endpoints
  const endpoints = [
    "https://openapi-b-us.temu.com/openapi/router",
    "https://openapi-b-eu.temu.com/openapi/router",
    "https://openapi-b-global.temu.com/openapi/router",
  ];

  // ─── Attempt 1: bg.local.goods.detail.query ───
  const detailParams: Record<string, any> = {
    type: "bg.local.goods.detail.query",
    app_key: appKey,
    access_token: accessToken,
    timestamp,
    data_type: "JSON",
    goodsId: parseInt(goodsId) || goodsId,
    language: "en",
  };
  detailParams.sign = generateTemuSign(detailParams, appSecret);

  for (const baseUrl of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detailParams),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.error(
          `[Open Platform] ${baseUrl} returned ${response.status} for detail query`
        );
        continue;
      }

      const data = await response.json();
      console.log(
        "[Open Platform] Detail query response:",
        JSON.stringify(data).slice(0, 300)
      );

      if (data?.success === true && data?.result) {
        const result = extractPriceFromOpenPlatformResponse(data.result);
        if (result?.price && result.price > 0) {
          console.log("[Open Platform] Detail query SUCCESS! Price:", result.price);
          return result;
        }
      } else if (data?.error_code) {
        console.error(
          "[Open Platform] Detail query error:",
          data.error_code,
          data.error_msg
        );
        // If auth error on one endpoint, no point trying others
        if (data.error_code === 40003 || data.error_code === 10001) break;
      }
    } catch (err) {
      console.error(
        "[Open Platform] Detail query error for",
        baseUrl,
        ":",
        String(err).slice(0, 150)
      );
    }
  }

  // ─── Attempt 2: bg.local.goods.list.query with goodsIdList ───
  const listParams: Record<string, any> = {
    type: "bg.local.goods.list.query",
    app_key: appKey,
    access_token: accessToken,
    timestamp,
    data_type: "JSON",
    goodsIdList: [parseInt(goodsId) || goodsId],
    pageNo: 1,
    pageSize: 1,
  };
  listParams.sign = generateTemuSign(listParams, appSecret);

  for (const baseUrl of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listParams),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) continue;

      const data = await response.json();
      if (data?.success === true && data?.result?.list?.[0]) {
        const result = extractPriceFromOpenPlatformResponse(data.result.list[0]);
        if (result?.price && result.price > 0) {
          console.log("[Open Platform] List query SUCCESS! Price:", result.price);
          return result;
        }
      }
    } catch (err) {
      console.error(
        "[Open Platform] List query error:",
        String(err).slice(0, 150)
      );
    }
  }

  // ─── Attempt 3: temu.local.goods.recommendedprice.query ───
  const priceParams: Record<string, any> = {
    type: "temu.local.goods.recommendedprice.query",
    app_key: appKey,
    access_token: accessToken,
    timestamp,
    data_type: "JSON",
    goodsIdList: [parseInt(goodsId) || goodsId],
    recommendedPriceType: 20,
    language: "en",
  };
  priceParams.sign = generateTemuSign(priceParams, appSecret);

  for (const baseUrl of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(priceParams),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) continue;

      const data = await response.json();
      if (data?.success === true && data?.result?.goodsList?.[0]) {
        const goods = data.result.goodsList[0];
        const sku = goods.skuList?.[0];
        if (sku?.recommendedSupplyPrice) {
          const price = parseFloat(sku.recommendedSupplyPrice.amount || 0);
          if (price > 0) {
            return {
              price,
              currency: sku.recommendedSupplyPrice.currency || "USD",
              productName: null,
              originalPrice: null,
              image: null,
            };
          }
        }
      }
    } catch (err) {
      console.error(
        "[Open Platform] Price query error:",
        String(err).slice(0, 150)
      );
    }
  }

  return null;
}

// Extract price from Temu Open Platform response
function extractPriceFromOpenPlatformResponse(
  obj: any
): TemuProductData | null {
  if (!obj) return null;

  const productName =
    obj.goodsName || obj.title || obj.name || obj.productName || null;
  const image =
    obj.thumbUrl ||
    obj.imageUrl ||
    obj.picUrl ||
    obj.mainImage ||
    obj.image ||
    null;

  // Try skuList first (most reliable for prices)
  if (obj.skuList && Array.isArray(obj.skuList) && obj.skuList.length > 0) {
    let minPrice = Infinity;
    let minOrigPrice = Infinity;
    let currency = "USD";

    for (const sku of obj.skuList) {
      // retailPrice can be an object {amount, currency}
      const retailPrice = extractPriceValue(sku.retailPrice);
      const listPrice = extractPriceValue(sku.listPrice);
      const price = extractPriceValue(sku.price);
      const salePrice = extractPriceValue(sku.salePrice);

      const skuPrice = retailPrice || price || salePrice || listPrice;
      if (skuPrice > 0 && skuPrice < minPrice) {
        minPrice = skuPrice;
        currency = extractCurrency(sku.retailPrice) || extractCurrency(sku.price) || "USD";
      }

      const origPrice = listPrice || extractPriceValue(sku.origPrice) || extractPriceValue(sku.minOrigPrice);
      if (origPrice > 0 && origPrice < minOrigPrice) {
        minOrigPrice = origPrice;
      }
    }

    if (minPrice < Infinity && minPrice > 0) {
      return {
        price: minPrice,
        currency,
        productName,
        originalPrice: minOrigPrice < Infinity ? minOrigPrice : null,
        image,
      };
    }
  }

  // Try top-level price fields
  const priceFields = [
    "retailPrice",
    "listPrice",
    "price",
    "salePrice",
    "minPrice",
    "displayPrice",
    "marketPrice",
  ];

  for (const field of priceFields) {
    const val = extractPriceValue(obj[field]);
    if (val > 0 && val < 100000) {
      const currency = extractCurrency(obj[field]) || "USD";
      const origPrice = extractPriceValue(obj.origPrice || obj.minOrigPrice);
      return {
        price: val,
        currency,
        productName,
        originalPrice: origPrice > 0 ? origPrice : null,
        image,
      };
    }
  }

  return null;
}

// Extract price value from either a number, string, or {amount, currency} object
function extractPriceValue(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val > 0 && val < 100000 ? val : 0;
  if (typeof val === "string") {
    const num = parseFloat(val);
    return num > 0 && num < 100000 ? num : 0;
  }
  if (typeof val === "object") {
    // {amount: "12.99", currency: "USD"} format
    const amount = val.amount || val.value || val.num;
    if (amount !== undefined) return extractPriceValue(amount);
  }
  return 0;
}

function extractCurrency(val: any): string | null {
  if (typeof val === "object" && val?.currency) return val.currency;
  return null;
}

// ─── Strategy 1: Temu Affiliate API (with corrected signature) ───
async function fetchFromTemuAffiliateAPI(
  goodsId: string,
  url?: string
): Promise<TemuProductData | null> {
  const appKey = getTemuAppKey();
  const appSecret = getTemuAppSecret();
  if (!appKey || !appSecret) return null;

  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const accessToken = getTemuAccessToken();

    // ─── Attempt 1: Generate affiliate link ───
    const linkParams: Record<string, string> = {
      app_key: appKey,
      timestamp,
      url: url || `https://www.temu.com/-g-${goodsId}.html`,
    };
    if (accessToken) {
      linkParams.promotion_ids = accessToken;
    }

    // Sign: MD5(app_secret + sorted_key_value + app_secret).toUpperCase()
    const sign = generateTemuSign(linkParams, appSecret);
    linkParams.sign = sign;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(
      "https://api.temu.com/affiliate/v1/link/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {}),
        },
        body: JSON.stringify(linkParams),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      console.error("[Affiliate API] Returned", response.status);
      return null;
    }

    const data = await response.json();

    // Check for API errors (40003 = unauthorized/app not approved)
    if (data?.error_code) {
      console.error(
        "[Affiliate API] Error code:",
        data.error_code,
        "msg:",
        data.error_msg
      );
      if (data.error_code === 40003) {
        return {
          price: -1,
          currency: "USD",
          productName: null,
          originalPrice: null,
          image: null,
        } as TemuProductData;
      }
      return null;
    }

    // Temu Affiliate API response structure
    if (data?.resp_code === 0 || data?.success !== false) {
      const result = data?.result || data?.data || data;
      const productInfo =
        result?.goods_list?.[0] || result?.product_info || result;

      if (productInfo) {
        const price = parseFloat(
          productInfo.min_price ||
            productInfo.sale_price ||
            productInfo.price ||
            productInfo.discount_price ||
            0
        );

        if (price > 0 && price < 100000) {
          const origPrice = parseFloat(
            productInfo.orig_price ||
              productInfo.min_orig_price ||
              productInfo.original_price ||
              0
          );

          return {
            price,
            currency: productInfo.currency || "USD",
            productName:
              productInfo.goods_name ||
              productInfo.title ||
              productInfo.name ||
              null,
            originalPrice: origPrice > 0 ? origPrice : null,
            image:
              productInfo.thumb_url ||
              productInfo.image_url ||
              productInfo.pic_url ||
              null,
            affiliateLink: result?.url || productInfo.affiliate_url || null,
          };
        }
      }
    }

    // Try getting product details separately if we got an affiliate link
    if (data?.resp_code === 0 && data?.result?.url) {
      const productDetail = await fetchFromTemuAffiliateProductAPI(
        goodsId,
        appKey,
        appSecret,
        accessToken
      );
      if (productDetail) return productDetail;
    }

    return null;
  } catch (err) {
    console.error("[Affiliate API] Error:", String(err).slice(0, 200));
    return null;
  }
}

// Get product details via Temu Affiliate Product API
async function fetchFromTemuAffiliateProductAPI(
  goodsId: string,
  appKey: string,
  appSecret: string,
  accessToken?: string
): Promise<TemuProductData | null> {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const params: Record<string, string> = {
      app_key: appKey,
      timestamp,
      goods_id: goodsId,
    };
    if (accessToken) {
      params.promotion_ids = accessToken;
    }

    const sign = generateTemuSign(params, appSecret);
    params.sign = sign;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(
      "https://api.temu.com/affiliate/v1/goods/detail",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {}),
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();

    if (data?.resp_code === 0 || data?.success !== false) {
      const product =
        data?.result?.goods_detail || data?.result || data?.data;

      if (product) {
        const price = parseFloat(
          product.min_price ||
            product.sale_price ||
            product.price ||
            product.discount_price ||
            0
        );

        if (price > 0 && price < 100000) {
          const origPrice = parseFloat(
            product.orig_price ||
              product.min_orig_price ||
              product.original_price ||
              0
          );

          return {
            price,
            currency: product.currency || "USD",
            productName:
              product.goods_name || product.title || product.name || null,
            originalPrice: origPrice > 0 ? origPrice : null,
            image:
              product.thumb_url ||
              product.image_url ||
              product.pic_url ||
              null,
          };
        }
      }
    }

    return null;
  } catch (err) {
    console.error(
      "[Affiliate Product API] Error:",
      String(err).slice(0, 200)
    );
    return null;
  }
}

// Build headers that mimic a real Temu browser session
function buildTemuHeaders(): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
    "Content-Type": "application/json",
    Origin: "https://www.temu.com",
    Referer: "https://www.temu.com/",
    "Sec-Ch-Ua":
      '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
}

// Strategy 2: Call Temu's internal API with user's cookies
async function fetchFromTemuAPI(
  goodsId: string,
  cookies: string
): Promise<TemuProductData | null> {
  if (!cookies) return null;

  const headers = buildTemuHeaders();
  headers["Cookie"] = cookies;

  const apiUrls = [
    `https://www.temu.com/api/oak/integration/render?goods_id=${encodeURIComponent(goodsId)}`,
    `https://www.temu.com/api/oak/integration/render?subject_id=${encodeURIComponent(goodsId)}`,
  ];

  for (const apiUrl of apiUrls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(apiUrl, {
        headers,
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);

      if (!response.ok) continue;

      const data = await response.json();
      const result = extractPriceFromTemuResponse(data);
      if (result?.price && result.price > 0) return result;
    } catch (err) {
      console.error("[Temu API] Error:", String(err).slice(0, 150));
    }
  }

  return null;
}

// Strategy 3: Fetch the Temu product page with cookies and extract price from HTML
async function fetchFromTemuPage(
  url: string,
  cookies: string
): Promise<TemuProductData | null> {
  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };
    if (cookies) headers["Cookie"] = cookies;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();
    return extractPriceFromHtml(html);
  } catch (err) {
    console.error("[Temu Page] Error:", String(err).slice(0, 150));
    return null;
  }
}

// Strategy 4: Fetch AliExpress
async function fetchFromAliExpress(
  url: string
): Promise<TemuProductData | null> {
  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();
    return extractPriceFromHtml(html);
  } catch {
    return null;
  }
}

// ─── Price Extraction Functions ───

function extractPriceFromTemuResponse(data: any): TemuProductData | null {
  const paths = [
    data?.data?.goodsDetail?.goods,
    data?.data?.goods,
    data?.data?.detail,
    data?.result?.goods,
    data?.data,
    data?.result,
  ];

  for (const obj of paths) {
    if (!obj) continue;

    const priceFields = [
      "minPrice",
      "salePrice",
      "price",
      "displayPrice",
      "minOrigPrice",
      "origPrice",
    ];

    for (const field of priceFields) {
      const val = obj[field];
      if (val !== undefined && val !== null) {
        const price =
          typeof val === "string"
            ? parseFloat(val)
            : typeof val === "number"
            ? val
            : null;
        if (price && price > 0 && price < 100000) {
          const name =
            obj.goodsName || obj.title || obj.name || obj.productName || null;
          const image = obj.thumbUrl || obj.imageUrl || obj.picUrl || null;
          const origPrice = obj.minOrigPrice || obj.origPrice || null;

          return {
            price,
            currency: obj.currency || "USD",
            productName: name,
            originalPrice: origPrice ? parseFloat(String(origPrice)) : null,
            image,
          };
        }
      }
    }

    if (obj.priceStr) {
      const match = String(obj.priceStr).match(/[\d,]+\.?\d{0,2}/);
      if (match) {
        const price = parseFloat(match[0].replace(/,/g, ""));
        if (price > 0 && price < 100000) {
          return {
            price,
            currency: "USD",
            productName: obj.goodsName || obj.title || null,
            originalPrice: null,
            image: null,
          };
        }
      }
    }

    if (obj.skuList && Array.isArray(obj.skuList) && obj.skuList.length > 0) {
      const prices = obj.skuList
        .map((sku: any) =>
          parseFloat(sku.price || sku.salePrice || sku.minPrice || 0)
        )
        .filter((priceItem: number) => priceItem > 0 && priceItem < 100000);
      if (prices.length > 0) {
        prices.sort((a: number, b: number) => a - b);
        return {
          price: prices[0],
          currency: "USD",
          productName: obj.goodsName || obj.title || null,
          originalPrice: null,
          image: null,
        };
      }
    }
  }

  // Deep search for any price field
  const jsonStr = JSON.stringify(data);
  const pricePatterns = [
    /"minPrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"salePrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"price"\s*:\s*"?(\d+\.?\d*)"?/,
    /"displayPrice"\s*:\s*"?(\d+\.?\d*)"?/,
  ];

  const foundPrices: number[] = [];
  for (const pattern of pricePatterns) {
    const match = jsonStr.match(pattern);
    if (match) {
      const priceVal = parseFloat(match[1]);
      if (priceVal > 0 && priceVal < 10000) foundPrices.push(priceVal);
    }
  }

  if (foundPrices.length > 0) {
    foundPrices.sort((a, b) => a - b);
    const nameMatch =
      jsonStr.match(/"goodsName"\s*:\s*"([^"]+)"/) ||
      jsonStr.match(/"title"\s*:\s*"([^"]+)"/);
    return {
      price: foundPrices[0],
      currency: "USD",
      productName: nameMatch ? nameMatch[1] : null,
      originalPrice: null,
      image: null,
    };
  }

  return null;
}

function extractPriceFromHtml(html: string): TemuProductData | null {
  // Try JSON-LD
  const jsonLdMatches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const schemas = Array.isArray(data) ? data : [data];
      for (const schema of schemas) {
        if (schema["@type"] === "Product" && schema.offers) {
          const offers = Array.isArray(schema.offers)
            ? schema.offers
            : [schema.offers];
          for (const offer of offers) {
            if (offer.price !== undefined) {
              return {
                price: parseFloat(offer.price),
                currency: offer.priceCurrency || "USD",
                productName: schema.name || null,
                originalPrice: null,
                image: schema.image || null,
              };
            }
          }
        }
      }
    } catch {
      /* skip */
    }
  }

  // Try OG meta
  const ogPriceMatch = html.match(
    /<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i
  );
  if (ogPriceMatch) {
    const price = parseFloat(ogPriceMatch[1]);
    if (price > 0) {
      const nameMatch = html.match(
        /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
      );
      return {
        price,
        currency: "USD",
        productName: nameMatch ? nameMatch[1] : null,
        originalPrice: null,
        image: null,
      };
    }
  }

  // Try embedded data patterns
  const embeddedPatterns = [
    /"minPrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"salePrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"price"\s*:\s*"?(\d+\.?\d*)"?/,
    /"priceStr"\s*:\s*"\$?(\d+\.?\d*)"/,
    /"displayPrice"\s*:\s*"?(\d+\.?\d*)"?/,
    /"minAmount"\s*:\s*"?(\d+\.?\d*)"?/,
    /"saleAmount"\s*:\s*"?(\d+\.?\d*)"?/,
    /"actMinPrice"\s*:\s*"?(\d+\.?\d*)"?/,
  ];

  const foundPrices: number[] = [];
  for (const pattern of embeddedPatterns) {
    const m = html.match(pattern);
    if (m) {
      const priceNum = parseFloat(m[1]);
      if (priceNum > 0 && priceNum < 10000) foundPrices.push(priceNum);
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
      productName: nameMatch ? nameMatch[1] : null,
      originalPrice: null,
      image: null,
    };
  }

  // Last resort: generic $ patterns
  const text = html.replace(/<[^>]*>/g, " ");
  const dollarMatches = text.matchAll(/\$\s*(\d{1,5}\.?\d{0,2})/g);
  const prices: number[] = [];
  for (const m of dollarMatches) {
    const priceNum = parseFloat(m[1]);
    if (priceNum > 0.5 && priceNum < 10000) prices.push(priceNum);
  }
  if (prices.length > 0) {
    prices.sort((a, b) => a - b);
    return {
      price: prices[0],
      currency: "USD",
      productName: null,
      originalPrice: null,
      image: null,
    };
  }

  return null;
}

function extractProductNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const slug =
      segments.find((s) => s.includes("-") && s.length > 10) ||
      segments[segments.length - 1] ||
      "";
    const name = slug
      .replace(/-g-[a-zA-Z0-9]+\.html?$/i, "")
      .replace(/\.html?$/i, "")
      .replace(/-/g, " ")
      .trim();
    if (name && name.length > 3) {
      return name.replace(/\b\w/g, (l) => l.toUpperCase());
    }
  } catch {
    /* skip */
  }
  return null;
}

function cleanProductName(name: string | null): string | null {
  if (!name) return null;
  let cleaned = name
    .replace(/\s*[-|]\s*(Temu|AliExpress|Aliexpress)\s*/gi, "")
    .replace(/\s*[-|]\s*(Login|Sign In|Register)\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length > 60) cleaned = cleaned.slice(0, 57) + "...";
  cleaned = cleaned.replace(/\b\w/g, (l) => l.toUpperCase());
  return cleaned || null;
}

function buildSuccessResponse(
  result: TemuProductData,
  urlProductName: string | null,
  source: string
) {
  let priceUSD = result.price || 0;
  if (result.currency?.toUpperCase() !== "USD") {
    const rates: Record<string, number> = {
      EUR: 1.08,
      GBP: 1.27,
      CNY: 0.14,
      DZD: 0.0075,
    };
    const rate = rates[result.currency.toUpperCase()];
    if (rate) priceUSD = priceUSD * rate;
  }

  return NextResponse.json({
    price: Math.round(priceUSD * 100) / 100,
    dzd: Math.round(priceUSD * RATE * 100) / 100,
    productName: cleanProductName(result.productName) || urlProductName,
    originalPrice: result.originalPrice
      ? Math.round(result.originalPrice * 100) / 100
      : null,
    image: result.image,
    estimated: false,
    source,
    ...(result.affiliateLink ? { affiliateLink: result.affiliateLink } : {}),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, manualPrice } = body;

    // ─── Manual price entry ───
    if (manualPrice) {
      const price = parseFloat(
        String(manualPrice).replace(/[^\d.]/g, "")
      );
      if (price > 0 && price < 100000) {
        const isDZD = /DA|dzd|DZD|دينار/i.test(String(manualPrice));
        const priceUSD = isDZD ? price / RATE : price;
        return NextResponse.json({
          price: Math.round(priceUSD * 100) / 100,
          dzd: Math.round(priceUSD * RATE * 100) / 100,
          productName: null,
          estimated: false,
          manual: true,
        });
      }
    }

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        {
          error:
            "Veuillez fournir un lien ou un code produit valide",
          allowManual: true,
        },
        { status: 400 }
      );
    }

    const input = url.trim();

    // ─── Handle share.temu.com short links ───
    let finalUrl = input;
    let goodsId = "";
    let isTemu = false;
    let isAliExpress = false;
    let shareImageUrl: string | null = null;

    if (input.includes("share.temu.com") || input.includes("temu.to/")) {
      isTemu = true;
      console.log("[Share Link] Resolving:", input);

      try {
        const resolved = await resolveShareLink(input);
        if (resolved) {
          finalUrl = resolved.resolvedUrl;
          goodsId = resolved.goodsId;
          shareImageUrl = resolved.imageUrl;
          console.log(
            "[Share Link] Resolved to:",
            finalUrl,
            "goodsId:",
            goodsId
          );
        } else {
          console.log(
            "[Share Link] Could not resolve, trying direct strategies"
          );
        }
      } catch (resolveErr) {
        console.error(
          "[Share Link] Resolution error:",
          String(resolveErr).slice(0, 200)
        );
      }
    } else {
      // Check if it's a Temu product ID (e.g., GW188941 or 601104094120953)
      const isTemuProductId = /^[a-zA-Z0-9]{6,20}$/.test(input);

      if (isTemuProductId) {
        goodsId = input;
        finalUrl = `https://www.temu.com/-g-${input}.html`;
        isTemu = true;
      } else {
        try {
          const parsed = new URL(
            finalUrl.startsWith("http") ? finalUrl : `https://${finalUrl}`
          );
          const domain = parsed.hostname;
          isTemu = domain.includes("temu");
          isAliExpress = domain.includes("aliexpress");

          // Extract goods_id from URL patterns
          const gMatch = parsed.pathname.match(/-g-([a-zA-Z0-9]+)/);
          if (gMatch) goodsId = gMatch[1];
          else {
            const numMatch = parsed.pathname.match(/(\d{10,})/);
            if (numMatch) goodsId = numMatch[1];
          }
        } catch {
          return NextResponse.json(
            { error: "Le format du lien est invalide", allowManual: true },
            { status: 400 }
          );
        }
      }
    }

    const urlProductName = extractProductNameFromUrl(finalUrl);
    const cookies = getTemuCookies();
    const hasApiCredentials = !!getTemuAppKey() && !!getTemuAppSecret();

    // ─── Strategy 0: Temu Open Platform API (most reliable) ───
    if (isTemu && goodsId && hasApiCredentials) {
      console.log(
        "[Strategy 0] Trying Temu Open Platform API for:",
        goodsId
      );
      const openPlatformResult = await fetchFromTemuOpenPlatform(goodsId);
      if (openPlatformResult?.price && openPlatformResult.price > 0) {
        console.log(
          "[Strategy 0] SUCCESS! Price:",
          openPlatformResult.price
        );
        return buildSuccessResponse(
          openPlatformResult,
          urlProductName,
          "temu-openapi"
        );
      }
    }

    // ─── Strategy 1: Temu Affiliate API ───
    if (isTemu && goodsId && hasApiCredentials) {
      console.log(
        "[Strategy 1] Trying Temu Affiliate API for:",
        goodsId
      );
      const affiliateResult = await fetchFromTemuAffiliateAPI(
        goodsId,
        finalUrl
      );
      // price === -1 means 40003 error (app not approved)
      if (affiliateResult?.price === -1) {
        console.log(
          "[Strategy 1] API returned 40003 - app not approved yet"
        );
        // Continue to next strategy
      } else if (affiliateResult?.price && affiliateResult.price > 0) {
        console.log("[Strategy 1] SUCCESS! Price:", affiliateResult.price);
        return buildSuccessResponse(
          affiliateResult,
          urlProductName,
          "temu-affiliate"
        );
      }
    }

    // ─── Strategy 2: Temu Internal API with cookies ───
    if (isTemu && goodsId && cookies) {
      console.log(
        "[Strategy 2] Trying Temu API with cookies for:",
        goodsId
      );
      const temuResult = await fetchFromTemuAPI(goodsId, cookies);
      if (temuResult?.price && temuResult.price > 0) {
        console.log("[Strategy 2] SUCCESS! Price:", temuResult.price);
        return buildSuccessResponse(
          temuResult,
          urlProductName,
          "temu-api"
        );
      }
    }

    // ─── Strategy 3: Temu product page with cookies ───
    if (isTemu && cookies) {
      console.log(
        "[Strategy 3] Trying Temu page with cookies for:",
        finalUrl
      );
      const pageResult = await fetchFromTemuPage(finalUrl, cookies);
      if (pageResult?.price && pageResult.price > 0) {
        console.log("[Strategy 3] SUCCESS! Price:", pageResult.price);
        return buildSuccessResponse(
          pageResult,
          urlProductName,
          "temu-page"
        );
      }
    }

    // ─── Strategy 4: Temu without cookies (limited) ───
    if (isTemu && !cookies && !hasApiCredentials) {
      console.log(
        "[Strategy 4] Trying Temu page WITHOUT cookies (limited)"
      );
      const noCookieResult = await fetchFromTemuPage(finalUrl, "");
      if (noCookieResult?.price && noCookieResult.price > 0) {
        return buildSuccessResponse(
          noCookieResult,
          urlProductName,
          "temu-nocookie"
        );
      }
    }

    // ─── Strategy 5: AliExpress ───
    if (isAliExpress) {
      console.log("[Strategy 5] Trying AliExpress for:", finalUrl);
      const aliResult = await fetchFromAliExpress(finalUrl);
      if (aliResult?.price && aliResult.price > 0) {
        return buildSuccessResponse(aliResult, urlProductName, "aliexpress");
      }
    }

    // ─── All strategies failed ───
    let errorMsg = "";
    if (isTemu && hasApiCredentials) {
      errorMsg =
        "L'extraction automatique du prix n'a pas fonctionné avec l'API. Veuillez entrer le prix manuellement.";
    } else if (isTemu && !hasApiCredentials && !cookies) {
      errorMsg =
        "Extraction automatique indisponible. Configurez la clé API Temu ou entrez le prix manuellement.";
    } else {
      errorMsg =
        "Nous n'avons pas pu extraire le prix automatiquement. Veuillez l'entrer manuellement.";
    }

    return NextResponse.json({
      error: errorMsg,
      allowManual: true,
      productName: urlProductName,
      image: shareImageUrl || undefined,
      goodsId: goodsId || undefined,
    });
  } catch (error) {
    console.error("[scrape-price] Fatal error:", error);
    return NextResponse.json(
      {
        error:
          "Une erreur est survenue. Veuillez entrer le prix manuellement.",
        allowManual: true,
      },
      { status: 500 }
    );
  }
}
