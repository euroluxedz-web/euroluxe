import { NextResponse } from "next/server";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const WORKER_URL = "https://temu-proxy.euroluxe.workers.dev";

export async function POST(req: Request) {
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

  // Step 2: Fetch page via Worker
  const pageUrl = `https://www.temu.com/-g-${goodsId}.html`;
  const workerUrl = `${WORKER_URL}/?url=${encodeURIComponent(pageUrl)}&_t=${Date.now()}`;
  
  try {
    const wRes = await fetch(workerUrl, { signal: AbortSignal.timeout(8000) });
    const wHtml = await wRes.text();
    debug.workerHtmlLen = wHtml.length;
    
    // Check what meta tags are in the page
    const ogTitle = wHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogUrl = wHtml.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const title = wHtml.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    
    debug.ogTitle = ogTitle ? ogTitle.slice(0, 80) : "NONE";
    debug.ogUrl = ogUrl ? ogUrl.slice(0, 80) : "NONE";
    debug.title = title ? title.slice(0, 80) : "NONE";
    debug.hasAntiBot = wHtml.includes("Security verification");
    
    // If we have og:title, construct SEO URL from it
    if (ogTitle) {
      // Extract product name from og:title (remove " - Temu XXX")
      const productName = ogTitle.replace(/\s*[-|]\s*Temu.*$/i, "").trim();
      // Slugify: lowercase, replace spaces with dashes, remove special chars
      const slug = productName.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 200);
      const constructedUrl = `https://www.temu.com/${slug}-g-${goodsId}.html`;
      debug.constructedSeoUrl = constructedUrl.slice(0, 100);
      debug.steps.push(`Constructed SEO URL from og:title`);
      
      // Step 3: Call Apify with constructed URL
      const apifyToken = process.env.APIFY_API_TOKEN;
      if (apifyToken) {
        debug.steps.push("Calling Apify...");
        const startRes = await fetch(
          `https://api.apify.com/v2/acts/apivault_labs~temu-product-scraper/runs?token=${apifyToken}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productUrls: [constructedUrl] }), signal: AbortSignal.timeout(10000) }
        );
        const startData = await startRes.json();
        const runId = startData?.data?.id;
        const datasetId = startData?.data?.defaultDatasetId;
        debug.runId = runId;
        
        // Poll
        for (let i = 0; i < 13; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const sRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`, { signal: AbortSignal.timeout(5000) });
          const sData = await sRes.json();
          const status = sData?.data?.status;
          debug.steps.push(`Poll ${i+1}: ${status}`);
          if (status === "SUCCEEDED") break;
          if (status === "FAILED" || status === "ABORTED") { debug.steps.push("FAILED"); break; }
        }
        
        // Get results
        const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}`, { signal: AbortSignal.timeout(5000) });
        const items = await itemsRes.json();
        if (items.length > 0) {
          debug.priceUsd = items[0].priceUsd;
          debug.title = items[0].title?.slice(0, 60);
          debug.availability = items[0].availability;
          debug.steps.push(`✓ Price: $${items[0].priceUsd}`);
        } else {
          debug.steps.push("No items returned");
        }
      }
    } else if (title) {
      // Use title to construct SEO URL
      const productName = title.replace(/\s*[-|]\s*Temu.*$/i, "").trim();
      const slug = productName.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 200);
      const constructedUrl = `https://www.temu.com/${slug}-g-${goodsId}.html`;
      debug.constructedSeoUrl = constructedUrl.slice(0, 100);
      debug.steps.push(`Constructed SEO URL from <title>`);
    } else {
      debug.steps.push("No title or og:title found");
    }
  } catch (e: any) {
    debug.error = e.message;
  }

  return NextResponse.json(debug);
}
