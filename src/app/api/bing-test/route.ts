import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export async function GET() {
  const query = "temu 601105214745191";
  const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20&setlang=en&cc=us`;
  
  const res = await fetch(bingUrl, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const html = await res.text();

  // Save a snippet of the HTML to inspect
  // Find the main content area
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;

  // Find all <a> tags with href containing temu
  const aTags = [...html.matchAll(/<a[^>]*href="([^"]*temu[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .slice(0, 10)
    .map(m => ({ href: m[1].slice(0, 120), text: m[2].replace(/<[^>]+>/g, "").trim().slice(0, 100) }));

  // Find all class names containing "result" or "algo" or "caption"
  const classes = [...html.matchAll(/class="([^"]*(?:result|algo|caption|snippet|b_[a-z]+)[^"]*)"/gi)]
    .map(m => m[1])
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 20);

  // Find all text that contains "temu"
  const temuText = [...html.matchAll(/[^<>]{0,100}temu[^<>]{0,100}/gi)]
    .map(m => m[0].replace(/\s+/g, " ").trim())
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 10);

  // Get first 2000 chars of body text (stripped of tags)
  const bodyText = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  return NextResponse.json({
    ok: true,
    htmlLen: html.length,
    aTagsWithTemu: aTags,
    classNames: classes,
    temuTextSnippets: temuText,
    bodyTextStart: bodyText.slice(0, 1000),
    bodyTextHas601105214745191: bodyText.includes("601105214745191"),
  });
}
