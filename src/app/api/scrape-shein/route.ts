import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const SHEIN_COOKIES = "_twpid=tw.1783373277498.327604763536648714; _cfuvid=hWhBmvalpuLUgYz1pO09Ewa2tBhvfK8Ka_2EAhau9k4-1783371930.597719-1.0.1.1-3GvdUFC0mbp_R8oEVTksfxKBeG1sXDNFGSw56M; AT=MDEwMDE.eyJiIjo3LCJnIjoxNzgzMzcyMDI5LCJyIjoib3FuaDhtIiwidCI6MiwibSI6NjQ0NzI2NzMwMCwibCI6MTc4MzM3MjAyOX0.4c56089d09d07609.ac001a1b261952665e4c0f7f9022b82362c3e10ec400a08e1e33ed2228352610; memberId=6447267300; sessionID_shein=s%3A0cbHi-oQWkzbYRugpcWDtYvyFtrL1NC5.GYRPAkPB%2FRKvGnHyZQfv5eQAfqloySYNFSDaotjHe0g";

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

    console.log(`\n=== [SHEIN] ${url.substring(0, 80)} ===`);

    // Use Apify's Cheerio Scraper - fast, lightweight, handles anti-bot
    const apifyUrl = `https://api.apify.com/v2/acts/apify~cheerio-scraper/run-sync-get-dataset-items?token=${apifyToken}&timeout=120`;

    const input = {
      startUrls: [{ url: url.trim() }],
      pageFunction: `async function pageFunction(context) {
        const { $, request } = context;
        
        // Get product name
        let productName = $('meta[property="og:title"]').attr('content') || 
                         $('h1').first().text().trim() || 
                         $('title').text().trim() || '';
        
        // Get product image
        let productImage = $('meta[property="og:image"]').attr('content') || '';
        
        // Get price from JSON-LD
        let price = null;
        let currency = 'USD';
        
        $('script[type="application/ld+json"]').each(function() {
          try {
            const data = JSON.parse($(this).text());
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if (item.offers) {
                if (item.offers.price) {
                  price = parseFloat(item.offers.price);
                  currency = item.offers.priceCurrency || 'USD';
                }
                if (!price && item.offers.lowPrice) {
                  price = parseFloat(item.offers.lowPrice);
                  currency = item.offers.priceCurrency || 'USD';
                }
              }
            }
          } catch(e) {}
        });
        
        // Get price from meta tags
        if (!price) {
          const priceMeta = $('meta[property="product:price:amount"]').attr('content') ||
                           $('meta[name="product:price:amount"]').attr('content');
          if (priceMeta) {
            price = parseFloat(priceMeta);
            const curMeta = $('meta[property="product:price:currency"]').attr('content') ||
                           $('meta[name="product:price:currency"]').attr('content');
            if (curMeta) currency = curMeta;
          }
        }
        
        // Get price from page text ($X.XX pattern, excluding shipping credits)
        if (!price) {
          const shippingCredits = [1.01, 5.00, 8.00, 13.00];
          const allText = $('body').text();
          const matches = allText.match(/\\$\\s*(\\d+\\.\\d{2})/g);
          if (matches) {
            const prices = matches
              .map(m => parseFloat(m.match(/\\$(\\d+\\.\\d{2})/)[1]))
              .filter(p => p > 0 && p < 10000 && !shippingCredits.includes(p));
            if (prices.length > 0) {
              prices.sort((a, b) => a - b);
              price = prices[0];
            }
          }
        }
        
        // Get HTML length for debugging
        const htmlLength = $('html').html().length;
        
        return {
          url: request.url,
          productName: productName,
          productImage: productImage,
          price: price,
          currency: currency,
          htmlLength: htmlLength,
          loadedUrl: request.loadedUrl || request.url
        };
      }`,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyCountry: "US",
      },
      prepareRequestHooks: [
        `async (request, context) => {
          // Add SHEIN cookies to bypass anti-bot
          request.headers = request.headers || {};
          request.headers['Cookie'] = '${SHEIN_COOKIES}';
          request.headers['Accept-Language'] = 'en-US,en;q=0.9';
        }`
      ],
    };

    console.log("[SHEIN] Starting Apify Cheerio Scraper...");
    const startTime = Date.now();

    const res = await fetch(apifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(110000),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SHEIN] Response: ${res.status} (${elapsed}s)`);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.log(`[SHEIN] Error: ${errText.substring(0, 300)}`);
      return NextResponse.json({
        status: "failed",
        message: `Apify error: ${errText.substring(0, 200)}`,
      });
    }

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({
        status: "failed",
        message: "No data returned from Apify",
      });
    }

    const item = data[0];
    console.log(`[SHEIN] Product: ${item.productName?.substring(0, 50)}`);
    console.log(`[SHEIN] Price: ${item.price} ${item.currency}`);
    console.log(`[SHEIN] HTML length: ${item.htmlLength}`);
    console.log(`[SHEIN] Loaded URL: ${item.loadedUrl?.substring(0, 80)}`);

    if (item.price && item.price > 0) {
      let priceUSD = item.price;
      if (item.currency === "EUR") priceUSD = item.price * 1.085;
      else if (item.currency === "GBP") priceUSD = item.price * 1.265;

      return NextResponse.json({
        status: "success",
        price: Math.round(priceUSD * 100) / 100,
        currency: "USD",
        productName: item.productName || null,
        productImage: item.productImage || null,
        productUrl: url.trim(),
      });
    }

    return NextResponse.json({
      status: "failed",
      message: "Price not found in SHEIN page. The product may be unavailable or require login.",
      productName: item.productName || null,
      productImage: item.productImage || null,
      productUrl: url.trim(),
    });
  } catch (e: any) {
    console.error("[SHEIN] Fatal error:", e);
    return NextResponse.json({ status: "failed", message: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST { url: 'https://www.shein.com/...' }",
    approach: "Apify Cheerio Scraper (fetches SHEIN product page, extracts price)",
  });
}
