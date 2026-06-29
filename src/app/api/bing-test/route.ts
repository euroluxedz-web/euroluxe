import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export async function GET() {
  const goodsId = "601105214745191";
  
  // Try Google Cache on multiple locale URLs
  const locales = ["qa", "om", "mu", "bh", "no-en", "se-en", "dz-en"];
  const results = [];

  for (const locale of locales) {
    const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:www.temu.com/${locale}/-g-${goodsId}.html`;
    try {
      const start = Date.now();
      const res = await fetch(cacheUrl, {
        headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(10000),
      });
      const time = Date.now() - start;
      const html = await res.text();

      // Extract ALL meta tags
      const metaTags: string[] = [];
      const metaMatches = [...html.matchAll(/<meta[^>]+>/gi)];
      for (const m of metaMatches) {
        const tag = m[0];
        if (tag.includes("og:") || tag.includes("product:") || tag.includes("price")) {
          metaTags.push(tag.slice(0, 200));
        }
      }

      // Extract OG price with flexible patterns
      const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];

      // Find prices in the HTML text
      const prices = [...html.matchAll(/(?:QAR|OMR|BHD|Rs|MUR|SAR|AED|EUR|USD|\$|NOK|SEK|NZD|AUD|GBP)\s?\d+(?:[.,]\d+)?/gi)]
        .map(m => m[0])
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 10);

      // Check for rawData
      const rawDataMatch = html.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})/);
      const hasRawData = !!rawDataMatch;
      let rawDataPrices: string[] = [];
      if (rawDataMatch) {
        const rd = rawDataMatch[1];
        const gidIdx = rd.indexOf(goodsId);
        if (gidIdx >= 0) {
          const win = rd.slice(Math.max(0, gidIdx - 2000), Math.min(rd.length, gidIdx + 10000));
          const matches = [...win.matchAll(/"(minPrice|salePrice|price|marketPrice|appPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
          rawDataPrices = matches.slice(0, 5).map(m => `${m[1]}=${m[2]}`);
        }
      }

      results.push({
        locale,
        time: `${time}ms`,
        status: res.status,
        htmlLen: html.length,
        ogPrice: ogPrice || null,
        ogCurrency: ogCurrency || null,
        ogTitle: ogTitle?.slice(0, 80) || null,
        hasImage: !!ogImage,
        pricesFound: prices,
        hasRawData,
        rawDataPrices,
        metaTagsCount: metaTags.length,
        metaTags: metaTags.slice(0, 10),
      });
    } catch (e: any) {
      results.push({ locale, error: e.message?.slice(0, 80) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
