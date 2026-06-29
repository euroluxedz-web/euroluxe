import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET() {
  const results: any = { env: {
    ZAI_BASE_URL: process.env.ZAI_BASE_URL,
    ZAI_API_KEY: process.env.ZAI_API_KEY ? "set" : "missing",
  }};

  // Test 1: direct fetch to ZAI base URL
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${process.env.ZAI_BASE_URL}/models`, {
      headers: { "Authorization": `Bearer ${process.env.ZAI_API_KEY}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    results.directFetch = { status: res.status, ok: res.ok, statusText: res.statusText };
  } catch (e: any) {
    results.directFetch = { error: e.message?.slice(0, 150) };
  }

  // Test 2: DNS lookup
  try {
    const url = new URL(process.env.ZAI_BASE_URL || "");
    const dns = await fetch(`https://dns.google/resolve?name=${url.hostname}&type=A`);
    const dnsData = await dns.json();
    results.dns = { hostname: url.hostname, status: dns.status, answer: dnsData.Answer?.[0]?.data || "none" };
  } catch (e: any) {
    results.dns = { error: e.message?.slice(0, 100) };
  }

  // Test 3: Try alternative — fetch a public API
  try {
    const res = await fetch("https://httpbin.org/get", { signal: AbortSignal.timeout(5000) });
    results.publicFetch = { status: res.status, ok: res.ok };
  } catch (e: any) {
    results.publicFetch = { error: e.message?.slice(0, 100) };
  }

  return NextResponse.json(results);
}
