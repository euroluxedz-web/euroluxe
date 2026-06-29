import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET() {
  const goodsId = "601105214745191";
  const results: any = {};
  
  // Test 1: AllOrigins on Qatar locale
  try {
    const start = Date.now();
    const res = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.temu.com/qa/-g-${goodsId}.html`)}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const html = await res.text();
    const time = Date.now() - start;
    
    const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
    
    results.allOriginsQa = {
      time: `${time}ms`,
      status: res.status,
      htmlLen: html.length,
      hasAntiBot: html.includes("Security verification"),
      ogPrice: ogPrice || null,
      ogCurrency: ogCurrency || null,
      ogTitle: ogTitle?.slice(0, 80) || null,
      ogImage: ogImage ? "yes" : "no",
    };
  } catch (e: any) {
    results.allOriginsQa = { error: e.message?.slice(0, 100) };
  }
  
  // Test 2: AllOrigins on Oman locale
  try {
    const start = Date.now();
    const res = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.temu.com/om/-g-${goodsId}.html`)}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const html = await res.text();
    const time = Date.now() - start;
    
    const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    
    results.allOriginsOm = {
      time: `${time}ms`,
      status: res.status,
      htmlLen: html.length,
      hasAntiBot: html.includes("Security verification"),
      ogPrice: ogPrice || null,
      ogCurrency: ogCurrency || null,
      ogTitle: ogTitle?.slice(0, 80) || null,
    };
  } catch (e: any) {
    results.allOriginsOm = { error: e.message?.slice(0, 100) };
  }
  
  // Test 3: AllOrigins on US locale
  try {
    const start = Date.now();
    const res = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.temu.com/-g-${goodsId}.html`)}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const html = await res.text();
    const time = Date.now() - start;
    
    const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    
    results.allOriginsUs = {
      time: `${time}ms`,
      status: res.status,
      htmlLen: html.length,
      hasAntiBot: html.includes("Security verification"),
      ogPrice: ogPrice || null,
      ogCurrency: ogCurrency || null,
      ogTitle: ogTitle?.slice(0, 80) || null,
    };
  } catch (e: any) {
    results.allOriginsUs = { error: e.message?.slice(0, 100) };
  }
  
  // Test 4: AllOrigins on Mauritius locale
  try {
    const start = Date.now();
    const res = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.temu.com/mu/-g-${goodsId}.html`)}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const html = await res.text();
    const time = Date.now() - start;
    
    const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    
    results.allOriginsMu = {
      time: `${time}ms`,
      status: res.status,
      htmlLen: html.length,
      hasAntiBot: html.includes("Security verification"),
      ogPrice: ogPrice || null,
      ogCurrency: ogCurrency || null,
      ogTitle: ogTitle?.slice(0, 80) || null,
    };
  } catch (e: any) {
    results.allOriginsMu = { error: e.message?.slice(0, 100) };
  }
  
  return NextResponse.json({ ok: true, results });
}
