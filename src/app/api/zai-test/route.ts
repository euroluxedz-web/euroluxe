import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET() {
  // Test just one AllOrigins request
  const testUrl = "https://www.temu.com/qa/-g-601105214745191.html";
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(testUrl)}`;
  
  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeout);
    const time = Date.now() - start;
    
    if (res.ok) {
      const data = await res.json();
      const html = data?.contents || "";
      const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      
      return NextResponse.json({
        ok: true,
        time: `${time}ms`,
        htmlLen: html.length,
        hasAntiBot: html.includes("Security verification"),
        ogPrice,
        ogCurrency,
        ogTitle: ogTitle?.slice(0, 80),
      });
    } else {
      return NextResponse.json({ ok: false, time: `${time}ms`, status: res.status });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message?.slice(0, 100) });
  }
}
