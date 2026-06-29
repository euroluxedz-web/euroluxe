import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET() {
  const goodsId = "601105214745191";
  
  // Test 1: Bing with Edge UA (Windows)
  const queries = [
    `site:temu.com ${goodsId} price`,
    `temu ${goodsId}`,
    `temu "${goodsId}" price`,
  ];
  
  const results = [];
  
  for (const query of queries) {
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20`;
    try {
      const start = Date.now();
      const res = await fetch(bingUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(10000),
      });
      const time = Date.now() - start;
      const html = await res.text();
      
      // Find Temu URLs
      const temuUrls = [...html.matchAll(/href="(https?:\/\/(?:www\.)?temu\.com\/([^"']+))/gi)]
        .map(m => m[1].replace(/&amp;/g, "&"))
        .filter(u => u.includes("-g-") || u.includes("goods.html") || u.includes(goodsId));
      const uniqueUrls = [...new Set(temuUrls)];
      
      // Find prices in snippets
      const pricePatterns = [
        { regex: /AU\$\s*(\d+\.?\d*)/gi, currency: "AUD" },
        { regex: /OMR\s*(\d+\.?\d*)/gi, currency: "OMR" },
        { regex: /BHD\s*(\d+\.?\d*)/gi, currency: "BHD" },
        { regex: /SAR\s*(\d+\.?\d*)/gi, currency: "SAR" },
        { regex: /AED\s*(\d+\.?\d*)/gi, currency: "AED" },
        { regex: /Rs\.?\s*(\d+\.?\d*)/gi, currency: "MUR" },
        { regex: /\$\s*(\d+\.?\d*)/gi, currency: "USD" },
      ];
      
      const foundPrices = [];
      for (const { regex, currency } of pricePatterns) {
        const matches = [...html.matchAll(regex)];
        for (const m of matches) {
          const amount = parseFloat(m[1]);
          if (amount > 0.3 && amount < 500) {
            foundPrices.push({ currency, amount });
          }
        }
      }
      
      // Check if goods_id appears in text
      const hasGoodsId = html.includes(goodsId);
      
      results.push({
        query,
        time: `${time}ms`,
        status: res.status,
        htmlLen: html.length,
        temuUrlsCount: uniqueUrls.length,
        temuUrls: uniqueUrls.slice(0, 5),
        prices: foundPrices.slice(0, 10),
        hasGoodsId,
      });
    } catch (e: any) {
      results.push({ query, error: e.message?.slice(0, 100) });
    }
  }
  
  return NextResponse.json({ ok: true, results });
}
