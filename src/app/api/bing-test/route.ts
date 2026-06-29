import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export async function GET() {
  const goodsId = "601105214745191";
  const query = `temu ${goodsId}`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20&hl=en`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const html = await res.text();

  // Find ALL temu mentions (any format)
  const temuMentions = [...html.matchAll(/[^a-zA-Z0-9](temu[^a-zA-Z0-9][^<>"'\s]{0,80})/gi)]
    .map(m => m[1])
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 20);

  // Find all href attributes
  const hrefs = [...html.matchAll(/href="([^"]*)"/gi)]
    .map(m => m[1])
    .filter(h => h.includes("temu") || h.includes("601105214745191"))
    .slice(0, 20);

  // Find all /url?q= patterns (Google redirects)
  const googleUrls = [...html.matchAll(/\/url\?q=([^&]+)/gi)]
    .map(m => m[1])
    .slice(0, 20);

  // Find all data-href attributes
  const dataHrefs = [...html.matchAll(/data-href="([^"]*)"/gi)]
    .map(m => m[1])
    .filter(h => h.includes("temu"))
    .slice(0, 10);

  // Find text snippets containing goods_id
  const gidSnippets = [...html.matchAll(new RegExp(`[^<>]{0,150}${goodsId}[^<>]{0,150}`, "g"))]
    .map(m => m[0].replace(/\s+/g, " ").trim())
    .slice(0, 10);

  // Find prices near goods_id
  const priceNearGid = [];
  for (const snip of gidSnippets) {
    const prices = snip.match(/(?:QAR|OMR|BHD|Rs|MUR|SAR|AED|EUR|USD|\$|NOK|SEK|NZD|AUD|GBP)\s?\d+(?:[.,]\d+)?/gi);
    if (prices) priceNearGid.push({ snippet: snip.slice(0, 200), prices });
  }

  // Find all div/span/p with class containing "result" or "snippet"
  const resultClasses = [...html.matchAll(/class="([^"]*(?:result|snippet|b_algo|rc|g)[^"]*)"/gi)]
    .map(m => m[1])
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 15);

  return NextResponse.json({
    ok: true,
    htmlLen: html.length,
    temuMentions,
    hrefsWithTemuOrGid: hrefs,
    googleUrlRedirects: googleUrls,
    dataHrefs,
    gidSnippetsCount: gidSnippets.length,
    gidSnippets: gidSnippets.slice(0, 5),
    priceNearGid,
    resultClasses,
  });
}
