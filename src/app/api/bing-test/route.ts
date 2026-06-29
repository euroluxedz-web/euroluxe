import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export async function GET() {
  const goodsId = "601105214745191";
  const query = `site:temu.com ${goodsId}`;
  const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20&setlang=en&cc=us`;

  try {
    const start = Date.now();
    const res = await fetch(bingUrl, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
      },
    });
    const time = Date.now() - start;
    const html = await res.text();

    // Find all temu.com URLs in the HTML
    const temuUrls = [...html.matchAll(/https?:\/\/(?:www\.)?temu\.com\/[^\s"'<>]+/gi)]
      .map(m => m[0])
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 20);

    // Find prices in the HTML (various currency patterns)
    const allPrices = [...html.matchAll(/(?:QAR|OMR|BHD|Rs|MUR|SAR|AED|EUR|USD|\$|DA|DZD|NOK|SEK|NZD|AUD|GBP|CAD)\s?\d+(?:[.,]\d+)?/gi)]
      .map(m => m[0])
      .filter((v, i, a) => a.indexOf(v) === i);

    // Find snippet-like blocks containing the goods_id
    const snippetsWithContext = [];
    const gidPattern = new RegExp(`.{0,200}${goodsId}.{0,200}`, "g");
    const gidMatches = html.match(gidPattern) || [];
    for (const m of gidMatches.slice(0, 5)) {
      snippetsWithContext.push(m.replace(/\s+/g, " ").trim());
    }

    // Find all <li class="b_algo"> blocks (Bing search result items)
    const resultBlocks = html.match(/<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>[\s\S]*?<\/li>/gi) || [];

    // Extract text from first 3 result blocks
    const resultTexts: string[] = [];
    for (const block of resultBlocks.slice(0, 5)) {
      const text = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      resultTexts.push(text.slice(0, 300));
    }

    return NextResponse.json({
      ok: true,
      time: `${time}ms`,
      htmlLen: html.length,
      status: res.status,
      temuUrlsFound: temuUrls.length,
      temuUrls: temuUrls.slice(0, 10),
      pricesFound: allPrices.length,
      uniquePrices: allPrices.slice(0, 20),
      snippetsWithGoodsId: snippetsWithContext,
      resultBlockCount: resultBlocks.length,
      resultTexts,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message?.slice(0, 200) });
  }
}
