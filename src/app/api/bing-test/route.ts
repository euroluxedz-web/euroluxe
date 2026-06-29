import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET() {
  const goodsId = "601105214745191";
  const query = `site:temu.com ${goodsId} price`;
  const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20`;
  
  const res = await fetch(bingUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const html = await res.text();
  
  // Find ALL temu mentions (any format)
  const temuMentions = [...html.matchAll(/temu[^a-z]/gi)].length;
  
  // Find ALL href links
  const allHrefs = [...html.matchAll(/href="([^"]+)"/gi)].map(m => m[1]);
  const temuHrefs = allHrefs.filter(h => h.includes("temu"));
  
  // Find ALL links (including without href, like data-href or js attributes)
  const temuInHtml = [...html.matchAll(/temu\.com[^\s"'<>]*/gi)].map(m => m[0]);
  const uniqueTemuUrls = [...new Set(temuInHtml)];
  
  // Find the position of goods_id
  const gidPositions = [];
  let idx = 0;
  while ((idx = html.indexOf(goodsId, idx)) !== -1) {
    gidPositions.push(idx);
    idx += goodsId.length;
  }
  
  // Get context around first goods_id occurrence
  let gidContext = "";
  if (gidPositions.length > 0) {
    const pos = gidPositions[0];
    gidContext = html.slice(Math.max(0, pos - 200), pos + 200).replace(/\s+/g, " ");
  }
  
  // Check if Bing is showing a "no results" or different page
  const hasNoResults = html.includes("no results") || html.includes("There are no results");
  const hasCaptcha = html.includes("captcha") || html.includes("verify");
  
  // Find b_algo result blocks (Bing's result items)
  const bAlgoCount = (html.match(/class="[^"]*b_algo[^"]*"/gi) || []).length;
  
  // Find result snippet text
  const snippets = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, "").trim())
    .filter(s => s.length > 20 && s.length < 500)
    .slice(0, 10);
  
  return NextResponse.json({
    htmlLen: html.length,
    temuMentions,
    temuHrefsCount: temuHrefs.length,
    temuHrefs: temuHrefs.slice(0, 5),
    uniqueTemuUrls: uniqueTemuUrls.slice(0, 10),
    gidPositionsCount: gidPositions.length,
    gidContext,
    hasNoResults,
    hasCaptcha,
    bAlgoCount,
    snippetsCount: snippets.length,
    snippets,
  });
}
