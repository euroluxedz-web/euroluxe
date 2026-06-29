import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

async function createZAI() {
  try {
    return await ZAI.create();
  } catch {
    const baseUrl = process.env.ZAI_BASE_URL;
    const apiKey = process.env.ZAI_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error("ZAI not configured");
    }
    const config: Record<string, string> = { baseUrl, apiKey };
    if (process.env.ZAI_CHAT_ID) config.chatId = process.env.ZAI_CHAT_ID;
    if (process.env.ZAI_USER_ID) config.userId = process.env.ZAI_USER_ID;
    if (process.env.ZAI_TOKEN) config.token = process.env.ZAI_TOKEN;
    return new ZAI(config);
  }
}

export async function GET() {
  const results: any = {
    env: {
      ZAI_BASE_URL: !!process.env.ZAI_BASE_URL,
      ZAI_API_KEY: !!process.env.ZAI_API_KEY,
      ZAI_CHAT_ID: !!process.env.ZAI_CHAT_ID,
      ZAI_TOKEN: !!process.env.ZAI_TOKEN,
    },
  };

  // Test 1: ZAI web_search
  try {
    const zai = await createZAI();
    results.zaiCreated = true;
    
    const searchResults = await (zai as any).invokeFunction("web_search", {
      query: "site:temu.com 601105214745191",
      num: 5,
    });
    
    let arr: any[] = [];
    if (Array.isArray(searchResults)) arr = searchResults;
    else if (searchResults && typeof searchResults === "object")
      arr = searchResults.results || searchResults.data || searchResults.items || [];
    
    results.webSearch = {
      success: true,
      resultCount: arr.length,
      results: arr.slice(0, 3).map((r: any) => ({
        name: (r.name || r.title || "").slice(0, 80),
        url: (r.url || r.link || "").slice(0, 100),
        snippet: (r.snippet || r.description || "").slice(0, 200),
      })),
    };
    
    // Check snippets for prices
    const allSnippets = arr.map((r: any) => `${r.name || ""} ${r.snippet || ""}`).join(" ");
    const prices = allSnippets.match(/(?:AU\$|OMR|BHD|SAR|AED|Rs\.?|\$|€|£)\s?\d+\.?\d*/gi) || [];
    results.webSearch.pricesFound = [...new Set(prices)].slice(0, 10);
  } catch (e: any) {
    results.webSearch = { success: false, error: e.message?.slice(0, 200) };
  }

  // Test 2: AllOrigins on Qatar locale
  try {
    const start = Date.now();
    const res = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent("https://www.temu.com/qa/-g-601105214745191.html")}`,
      { signal: AbortSignal.timeout(12000) }
    );
    const html = await res.text();
    const time = Date.now() - start;
    
    const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogCurrency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
    
    results.allOrigins = {
      time: `${time}ms`,
      status: res.status,
      htmlLen: html.length,
      hasAntiBot: html.includes("Security verification"),
      ogPrice: ogPrice || null,
      ogCurrency: ogCurrency || null,
      ogTitle: ogTitle?.slice(0, 80) || null,
    };
  } catch (e: any) {
    results.allOrigins = { error: e.message?.slice(0, 100) };
  }

  return NextResponse.json(results);
}
