import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function tryProxy(label: string, proxyUrl: string) {
  try {
    const start = Date.now();
    const res = await fetch(proxyUrl, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(12000),
    });
    const time = Date.now() - start;
    const html = await res.text();

    const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const hasAntiBot = html.includes("Security verification");

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
    };
  } catch (e: any) {
    return { label, error: e.message?.slice(0, 100) };
  }
}

export async function GET() {
  const goodsId = "601105214745191";
  const targetUrl = `https://www.temu.com/qa/-g-${goodsId}.html`;
  const results = [];

  // Try various free proxy services
  const proxies = [
    ["allorigins-raw", `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`],
    ["allorigins-get", `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`],
    ["codetabs", `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(targetUrl)}`],
    ["corsproxy", `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`],
    ["thingproxy", `https://thingproxy.freeboard.io/fetch/${targetUrl}`],
    ["whateverorigin", `https://api.whateverorigin.org/get?url=${encodeURIComponent(targetUrl)}`],
    ["proxyhost", `https://api.proxyhost.org/raw?url=${encodeURIComponent(targetUrl)}`],
    ["cors eu", `https://cors.eu.org/${targetUrl}`],
    ["vsp", `https://vsp.js.org/proxy/?${encodeURIComponent(targetUrl)}`],
  ];

  for (const [label, url] of proxies) {
    results.push(await tryProxy(label, url));
  }

  return NextResponse.json({ ok: true, results });
}
