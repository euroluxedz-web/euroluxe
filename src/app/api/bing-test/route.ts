import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function searchBing(query: string) {
  const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20&setlang=en&cc=us`;
  const start = Date.now();
  const res = await fetch(bingUrl, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
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

  // Find result blocks (b_algo)
  const resultBlocks = html.match(/<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>[\s\S]*?<\/li>/gi) || [];

  // Also try b_caption blocks
  const captionBlocks = html.match(/<div[^>]*class="[^"]*b_caption[^"]*"[^>]*>[\s\S]*?<\/div>/gi) || [];

  return { query, time: `${time}ms`, htmlLen: html.length, temuUrls: temuUrls.slice(0, 10), prices: prices.slice(0, 15), resultBlocks: resultBlocks.length, captionBlocks: captionBlocks.length };
}

export async function GET() {
  const goodsId = "601105214745191";
  const queries = [
    `site:temu.com ${goodsId}`,
    `temu ${goodsId}`,
    `temu "${goodsId}"`,
    `temu -g-${goodsId}`,
    `"601105214745191" temu.com`,
  ];

  const results = [];
  for (const q of queries) {
    try {
      const r = await searchBing(q);
      results.push(r);
    } catch (e: any) {
      results.push({ query: q, error: e.message?.slice(0, 100) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
