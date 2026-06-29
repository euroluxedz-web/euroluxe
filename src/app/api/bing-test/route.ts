import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function tryFetch(label: string, url: string) {
  try {
    const start = Date.now();
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
    const time = Date.now() - start;
    const html = await res.text();

    const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const hasAntiBot = html.includes("Security verification") || html.includes("Just a moment");
    const hasGoodsId = html.includes("601105214745191");

    return {
      label,
      time: `${time}ms`,
      status: res.status,
      htmlLen: html.length,
      ogPrice: ogPrice || null,
      ogCurrency: ogCurrency || null,
      ogTitle: ogTitle?.slice(0, 80) || null,
      hasImage: !!ogImage,
      hasAntiBot,
      hasGoodsId,
    };
  } catch (e: any) {
    return { label, error: e.message?.slice(0, 100) };
  }
}

export async function GET() {
  const goodsId = "601105214745191";
  const results = [];

  // 1. Google Cache of Temu product page
  results.push(await tryFetch(
    "google-cache-qa",
    `https://webcache.googleusercontent.com/search?q=cache:www.temu.com/qa/-g-${goodsId}.html`
  ));

  // 2. Direct fetch with different user agents
  results.push(await tryFetch(
    "direct-qa",
    `https://www.temu.com/qa/-g-${goodsId}.html`
  ));

  // 3. Try via different proxy services
  results.push(await tryFetch(
    "allorigins-qa",
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.temu.com/qa/-g-${goodsId}.html`)}`
  ));

  // 4. Try codetabs proxy
  results.push(await tryFetch(
    "codetabs-qa",
    `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(`https://www.temu.com/qa/-g-${goodsId}.html`)}`
  ));

  // 5. Try via corsproxy.io
  results.push(await tryFetch(
    "corsproxy-qa",
    `https://corsproxy.io/?url=${encodeURIComponent(`https://www.temu.com/qa/-g-${goodsId}.html`)}`
  ));

  // 6. Try thingproxy
  results.push(await tryFetch(
    "thingproxy-qa",
    `https://thingproxy.freeboard.io/fetch/https://www.temu.com/qa/-g-${goodsId}.html`
  ));

  return NextResponse.json({ ok: true, results });
}
