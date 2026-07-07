import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * SHEIN Product Price Extraction via Apify
 *
 * Uses the shahidirfan/shein-product-scraper Apify actor.
 * Apify handles all anti-bot, CAPTCHA, and proxy rotation automatically.
 * This is 100% automatic - no user interaction needed.
 *
 * The run-sync-get-dataset-items endpoint starts the run, waits for it
 * to complete, and returns the results all in one request.
 */

interface SheinResult {
  status: "success" | "failed";
  price?: number | null;
  currency?: string | null;
  productName?: string | null;
  productImage?: string | null;
  productUrl?: string | null;
  message?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ status: "failed", message: "URL required" }, { status: 400 });
    }

    if (!url.includes("shein.com")) {
      return NextResponse.json({ status: "failed", message: "Please provide a SHEIN URL" }, { status: 400 });
    }

    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      return NextResponse.json({ status: "failed", message: "APIFY_API_TOKEN not configured" }, { status: 500 });
    }

    console.log(`\n=== [SHEIN-Apify] ${url.substring(0, 80)} ===`);

    // Use Apify's sync endpoint - starts run, waits for completion, returns results
    // This is the simplest approach: one request, one response
    const apifyUrl = `https://api.apify.com/v2/acts/shahidirfan~shein-product-scraper/run-sync-get-dataset-items?token=${apifyToken}&timeout=120`;

    // The actor expects "startUrl" (singular) as a string
    const input = {
      startUrl: url.trim(),
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyCountry: "US",
      },
    };

    console.log("[SHEIN-Apify] Starting sync run...");
    const startTime = Date.now();

    const res = await fetch(apifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(110000), // 110s timeout (leaves buffer)
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SHEIN-Apify] Response: ${res.status} (${elapsed}s)`);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.log(`[SHEIN-Apify] Error: ${errText.substring(0, 200)}`);
      return NextResponse.json({
        status: "failed",
        message: `Apify returned ${res.status}: ${errText.substring(0, 100)}`,
      });
    }

    const data = await res.json();
    console.log(`[SHEIN-Apify] Response type: ${Array.isArray(data) ? "array" : typeof data}, length: ${Array.isArray(data) ? data.length : Object.keys(data).length}`);

    // The response is an array of product items
    if (!Array.isArray(data) || data.length === 0) {
      console.log("[SHEIN-Apify] No items in response");
      return NextResponse.json({
        status: "failed",
        message: "No product data returned from Apify",
      });
    }

    // The actor may return multiple items - find the one matching our URL
    // or just use the first one
    let item = data[0];
    
    // Try to find the exact product by goods_id
    const goodsIdMatch = url.match(/-p-(\d+)\.html/i);
    if (goodsIdMatch) {
      const targetGoodsId = goodsIdMatch[1];
      const found = data.find((d: any) => String(d.goods_id) === targetGoodsId || String(d.product_id) === targetGoodsId);
      if (found) {
        item = found;
        console.log(`[SHEIN-Apify] Found matching product by goods_id: ${targetGoodsId}`);
      }
    }
    
    console.log(`[SHEIN-Apify] Item keys: ${Object.keys(item).join(", ")}`);
    console.log(`[SHEIN-Apify] Product: ${item.title || item.goods_name || item.name || "unknown"}`);

    // Extract price - the Apify actor returns prices in multiple formats:
    // sale_price: 6.68 (number)
    // salePrice: { amount: "6.68", amountWithSymbol: "$6.68", usdAmount: "6.68" }
    // retailPrice: { amount: "9.99", ... }
    let price: number | null = null;
    let currency = "USD";

    // Strategy 1: Direct numeric fields (sale_price, original_price)
    const numericFields = ["sale_price", "original_price", "price"];
    for (const field of numericFields) {
      if (item[field] !== undefined && item[field] !== null) {
        const val = typeof item[field] === "string" ? parseFloat(item[field].replace(/[^\d.]/g, "")) : item[field];
        if (typeof val === "number" && val > 0 && val < 10000) {
          price = val;
          console.log(`[SHEIN-Apify] Found price in "${field}": ${price}`);
          break;
        }
      }
    }

    // Strategy 2: Nested objects (salePrice.amount, salePrice.usdAmount)
    if (price === null) {
      const objectFields = ["salePrice", "retailPrice", "discountPrice", "flashPrice", "price"];
      for (const field of objectFields) {
        const val = item[field];
        if (val && typeof val === "object") {
          // Try usdAmount first (always USD), then amount
          const amountStr = val.usdAmount || val.amount || val.value;
          if (amountStr) {
            const amount = typeof amountStr === "string" ? parseFloat(amountStr.replace(/[^\d.]/g, "")) : amountStr;
            if (typeof amount === "number" && amount > 0 && amount < 10000) {
              price = amount;
              console.log(`[SHEIN-Apify] Found price in "${field}.${val.usdAmount ? 'usdAmount' : 'amount'}": ${price}`);
              break;
            }
          }
        }
      }
    }

    // Try priceWithSymbol or similar
    if (price === null && item.priceWithSymbol) {
      const match = String(item.priceWithSymbol).match(/[\d,.]+/);
      if (match) {
        price = parseFloat(match[0].replace(",", ""));
        if (price > 0 && price < 10000) {
          console.log(`[SHEIN-Apify] Found price in "priceWithSymbol": ${price}`);
        }
      }
    }

    // Extract currency
    if (item.currency) currency = item.currency;
    else if (item.priceCurrency) currency = item.priceCurrency;

    // Extract product name and image - Apify returns goods_name, title, goods_img, image_url
    const productName = item.title || item.goods_name || item.name || item.productName || item.product_name || null;
    const productImage = item.goods_img || item.image_url || item.image || item.imageUrl || item.img || item.mainImage || item.thumbnail || null;

    console.log(`[SHEIN-Apify] Product: ${productName?.substring(0, 50)}`);
    console.log(`[SHEIN-Apify] Price: ${price} ${currency}`);
    console.log(`[SHEIN-Apify] Image: ${productImage ? "yes" : "no"}`);

    if (price !== null && price > 0) {
      // Convert to USD if needed
      let priceUSD = price;
      if (currency === "EUR") priceUSD = price * 1.085;
      else if (currency === "GBP") priceUSD = price * 1.265;
      else if (currency === "DZD") priceUSD = price / 240;

      return NextResponse.json({
        status: "success",
        price: Math.round(priceUSD * 100) / 100,
        currency: "USD",
        productName,
        productImage,
        productUrl: url.trim(),
      });
    }

    return NextResponse.json({
      status: "failed",
      message: "Price not found in Apify response. The product may be unavailable.",
      productName,
      productImage,
      productUrl: url.trim(),
    });
  } catch (e: any) {
    console.error("[SHEIN-Apify] Fatal error:", e);
    return NextResponse.json({ status: "failed", message: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST { url: 'https://www.shein.com/...' }",
    approach: "Apify shahidirfan/shein-product-scraper (100% automatic, no CAPTCHA)",
  });
}
