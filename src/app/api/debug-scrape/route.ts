import { NextRequest, NextResponse } from "next/server";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  const debug: any = { steps: [] };
  
  // Step 1: Resolve share link
  let currentUrl = url;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(currentUrl, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
    const loc = res.headers.get("location");
    if (loc) { currentUrl = new URL(loc, currentUrl).href; continue; }
    await res.text(); break;
  }
  const gidMatch = currentUrl.match(/goods_id=([^&]+)/);
  const goodsId = gidMatch?.[1] || "NONE";
  debug.goodsId = goodsId;
  debug.steps.push(`1. goods_id: ${goodsId}`);
  
  // Step 2: Try both Workers
  const pageUrl = `https://www.temu.com/dz-en/goods.html?goods_id=${goodsId}`;
  const workers = [
    "https://temu-proxy-2.euroluxe.workers.dev",
    "https://temu-proxy.euroluxe.workers.dev",
  ];
  
  let seoUrl: string | null = null;
  for (const workerBase of workers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const workerUrl = `${workerBase}/?url=${encodeURIComponent(pageUrl)}&_t=${Date.now()}_${attempt}`;
      try {
        const res = await fetch(workerUrl, { signal: AbortSignal.timeout(8000) });
        const html = await res.text();
        const ogUrl = html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1];
        debug.steps.push(`2. Worker ${workerBase.split('//')[1].split('.')[0]} attempt ${attempt+1}: ${html.length} bytes, og:url=${ogUrl ? 'YES' : 'NO'}`);
        if (ogUrl) {
          seoUrl = ogUrl.replace("/dz-en/", "/uk/").replace("/dz-fr/", "/uk/");
          debug.seoUrl = seoUrl.slice(0, 100);
          break;
        }
      } catch (e: any) {
        debug.steps.push(`2. Worker error: ${e.message?.slice(0, 60)}`);
      }
    }
    if (seoUrl) break;
  }
  
  if (!seoUrl) {
    debug.steps.push("2. FAILED: No SEO URL found from any Worker");
    return NextResponse.json(debug);
  }
  
  // Step 3: Call Apify
  const apifyToken = process.env.APIFY_API_TOKEN;
  debug.steps.push(`3. APIFY_API_TOKEN: ${apifyToken ? 'SET' : 'NOT SET'}`);
  
  try {
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/apivault_labs~temu-product-scraper/runs?token=${apifyToken}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productUrls: [seoUrl] }), signal: AbortSignal.timeout(10000) }
    );
    const startData = await startRes.json();
    const runId = startData?.data?.id;
    const datasetId = startData?.data?.defaultDatasetId;
    debug.steps.push(`3. Apify run started: ${runId}`);
    
    // Poll
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const sRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`, { signal: AbortSignal.timeout(5000) });
      const sData = await sRes.json();
      const status = sData?.data?.status;
      debug.steps.push(`3.${i}. Poll: ${status}`);
      if (status === "SUCCEEDED") break;
      if (status === "FAILED" || status === "ABORTED") break;
    }
    
    // Get results
    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}`, { signal: AbortSignal.timeout(5000) });
    const items = await itemsRes.json();
    debug.itemCount = items.length;
    if (items.length > 0) {
      debug.priceUsd = items[0].priceUsd;
      debug.priceLocal = items[0].priceLocal;
      debug.currency = items[0].currency;
      debug.title = items[0].title?.slice(0, 60);
      debug.availability = items[0].availability;
      debug.steps.push(`3. ✓ Price: $${items[0].priceUsd}`);
    } else {
      debug.steps.push("3. No items returned");
    }
  } catch (e: any) {
    debug.error = e.message;
  }
  
  return NextResponse.json(debug);
}
