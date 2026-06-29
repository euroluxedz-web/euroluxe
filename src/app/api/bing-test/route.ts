import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export async function GET() {
  const goodsId = "601105214745191";
  const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:www.temu.com/qa/-g-${goodsId}.html`;
  
  const res = await fetch(cacheUrl, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  const html = await res.text();

  // Strip tags to get visible text
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  // Find the first 2000 chars of visible text
  const textStart = text.slice(0, 2000);

  // Check if it's a Google cache page or an actual Temu page
  const isGoogleCachePage = html.includes("cache") && html.includes("googleusercontent");
  const isTemuPage = html.includes("temu.com") || html.includes("Temu Qatar");

  // Check title
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];

  return NextResponse.json({
    ok: true,
    htmlLen: html.length,
    title: title?.slice(0, 200),
    isGoogleCachePage,
    isTemuPage,
    textStart,
    textHasGoodsId: text.includes(goodsId),
    textHasPrice: /\$\s?\d|\bQAR\s?\d|\bOMR\s?\d/i.test(text),
  });
}
