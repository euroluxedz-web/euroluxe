import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function trySearch(engine: string, query: string) {
  let url: string;
  if (engine === "google") {
    url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20&hl=en`;
  } else if (engine === "bing") {
    url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20&setlang=en&cc=us`;
  } else if (engine === "duckduckgo") {
    url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  } else if (engine === "yandex") {
    url = `https://yandex.com/search/?text=${encodeURIComponent(query)}`;
  } else {
    return { engine, error: "unknown engine" };
  }

  try {
    const start = Date.now();
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    const time = Date.now() - start;
    const html = await res.text();

    // Find temu URLs
    const temuUrls = [...html.matchAll(/https?:\/\/(?:www\.)?temu\.com\/[^\s"'<>\\]+/gi)]
      .map(m => m[0])
      .filter((v, i, a) => a.indexOf(v) === i);

    // Find prices
    const prices = [...html.matchAll(/(?:QAR|OMR|BHD|Rs|MUR|SAR|AED|EUR|USD|\$|NOK|SEK|NZD|AUD|GBP)\s?\d+(?:[.,]\d+)?/gi)]
      .map(m => m[0])
      .filter((v, i, a) => a.indexOf(v) === i);

    // Check if goods_id appears in the text
    const hasGoodsId = html.includes("601105214745191");

    // Check for captcha/anti-bot
    const hasCaptcha = html.includes("captcha") || html.includes("CAPTCHA") || html.includes("unusual traffic") || html.includes("verify");

    return {
      engine,
      query,
      time: `${time}ms`,
      status: res.status,
      htmlLen: html.length,
      temuUrlsCount: temuUrls.length,
      temuUrls: temuUrls.slice(0, 5),
      prices: prices.slice(0, 10),
      hasGoodsId,
      hasCaptcha,
    };
  } catch (e: any) {
    return { engine, query, error: e.message?.slice(0, 100) };
  }
}

export async function GET() {
  const goodsId = "601105214745191";
  const query = `temu ${goodsId}`;

  const engines = ["google", "bing", "duckduckgo"];
  const results = [];
  for (const engine of engines) {
    results.push(await trySearch(engine, query));
  }

  return NextResponse.json({ ok: true, results });
}
