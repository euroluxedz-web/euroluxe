import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let zai;
    try {
      zai = await ZAI.create();
    } catch {
      const baseUrl = process.env.ZAI_BASE_URL;
      const apiKey = process.env.ZAI_API_KEY;
      if (!baseUrl || !apiKey) {
        return NextResponse.json({ ok: false, error: "No ZAI config", env: { baseUrl: !!process.env.ZAI_BASE_URL, apiKey: !!process.env.ZAI_API_KEY } });
      }
      const config: Record<string, string> = { baseUrl, apiKey };
      if (process.env.ZAI_CHAT_ID) config.chatId = process.env.ZAI_CHAT_ID;
      if (process.env.ZAI_USER_ID) config.userId = process.env.ZAI_USER_ID;
      if (process.env.ZAI_TOKEN) config.token = process.env.ZAI_TOKEN;
      zai = new ZAI(config);
    }

    // Test 1: web_search
    let searchStatus = "unknown";
    let searchResults = 0;
    try {
      const results = await (zai as any).invokeFunction("web_search", { query: "site:temu.com 601105214745191", num: 5 });
      if (Array.isArray(results)) searchResults = results.length;
      else if (results && typeof results === "object") {
        const arr = results.results || results.data || results.items || [];
        searchResults = Array.isArray(arr) ? arr.length : 0;
      }
      searchStatus = "ok";
    } catch (e: any) {
      searchStatus = `error: ${e.message?.slice(0, 100)}`;
    }

    // Test 2: page_reader
    let readerStatus = "unknown";
    let readerLen = 0;
    try {
      const result = await (zai as any).invokeFunction("page_reader", { url: "https://www.temu.com/-g-601105214745191.html" });
      const data = typeof result === "string" ? JSON.parse(result) : result;
      const content = data?.data?.content || data?.content || "";
      readerLen = content.length;
      readerStatus = "ok";
    } catch (e: any) {
      readerStatus = `error: ${e.message?.slice(0, 100)}`;
    }

    return NextResponse.json({
      ok: true,
      env: {
        ZAI_BASE_URL: !!process.env.ZAI_BASE_URL,
        ZAI_API_KEY: !!process.env.ZAI_API_KEY,
        ZAI_CHAT_ID: !!process.env.ZAI_CHAT_ID,
        ZAI_TOKEN: !!process.env.ZAI_TOKEN,
        ZAI_USER_ID: !!process.env.ZAI_USER_ID,
      },
      web_search: { status: searchStatus, results: searchResults },
      page_reader: { status: readerStatus, contentLength: readerLen },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
