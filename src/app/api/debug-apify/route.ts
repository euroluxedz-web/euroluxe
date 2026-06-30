import { NextResponse } from "next/server";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const WORKER_URL = "https://temu-proxy.euroluxe.workers.dev";

export async function POST(req: Request) {
  const { url } = await req.json();
  const debug: any = = { steps: [] };

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
  debug.steps.push(`1. Resolved goods_id: ${goodsId}`);

  // Step 2: Check APIFY_API_TOKEN
  const apifyToken = process.env.APIFY_API_TOKEN;
  debug.apifyTokenSet = !!apifyToken;
  debug.steps.push(`2. APIFY_API_TOKEN: ${apifyToken ? "SET" : "NOT SET"}`);

  // Step 3: Get SEO URL from Worker
  const pageUrl = `https://www.temu.com/-g-${goodsId}.html`;
  const workerUrl = `${WORKER_URL}/?url=${encodeURIComponent(pageUrl)}`;
  debug.steps.push(`3. Fetching Worker: ${workerUrl.slice(0, 80)}...`);
  
  try {
    const wRes = await fetch(workerUrl, { signal: AbortSignal.timeout(8000) });
    const wHtml = await wRes.text();
    debug.workerHtmlLen = wHtml.length;
    debug.workerHasAntiBot = wHtml.includes("Security verification");
    
    const ogUrl = wHtml.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1];
    debug.ogUrl = ogUrl ? ogUrl.slice(0, 100) : "NONE";
    debug.steps.push(`3. Worker returned ${wHtml.length} bytes, og:url: ${ogUrl ? "FOUND" : "NONE"}`);

    if (!ogUrl) {
      debug.steps.push("3a. No og:url found - Apify will be SKIPPED");
      return NextResponse.json(debug);
    }

    // Step 4: Start Apify run
    debug.steps.push(`4. Starting Apify run...`);
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/apivault_labs~temu-product-scraper/runs?token=${apifyToken}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productUrls: [ogUrl] }), signal: AbortSignal.timeout(10000) }
    );
    const startData = await startRes.json();
    const runId = startData?.data?.id;
    const datasetId = startData?.data?.defaultDatasetId;
    debug.runId = runId;
    debug.datasetId = datasetId;
    debug.steps.push(`4. Apify run started: ${runId}`);

    // Step 5: Poll
    for (let i = 0; i < 13; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const sRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`, { signal: AbortSignal.timeout(5000) });
      const sData = await sRes.json();
      const status = sData?.data?.status;
      debug.steps.push(`5.${i}. Poll: ${status}`);
      if (status === "SUCCEEDED") break;
      if (status === "FAILED" || status === "ABORTED") { debug.steps.push("FAILED"); return NextResponse.json(debug); }
    }

    // Step 6: Get results
    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}`, { signal: AbortSignal.timeout(5000) });
    const items = await itemsRes.json();
    debug.itemCount = items.length;
    if (items.length > 0) {
      const item = items[0];
      debug.priceUsd = item.priceUsd;
      debug.priceLocal = item.priceLocal;
      debug.currency = item.currency;
      debug.title = item.title?.slice(0, 60);
      debug.availability = item.availability;
      debug.steps.push(`6. ✓ Price: $${item.priceUsd} (${item.priceLocal} ${item.currency})`);
    }
  } catch (e: any) {
    debug.error = e.message;
    debug.steps.push(`ERROR: ${e.message}`);
  }

  return NextResponse.json(debug);
}
