import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let cachedRate: { rate: number; source: string; updatedAt: string } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchUsdToDzdRate(): Promise<{ rate: number; source: string }> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const rate = data?.rates?.DZD;
      if (rate && rate > 0) return { rate: Math.round(rate * 100) / 100, source: 'open.er-api.com' };
    }
  } catch {}
  return { rate: 300, source: 'fallback' };
}

export async function GET() {
  try {
    if (cachedRate && Date.now() - new Date(cachedRate.updatedAt).getTime() < CACHE_TTL_MS) {
      return NextResponse.json({ ok: true, data: cachedRate });
    }
    const { rate, source } = await fetchUsdToDzdRate();
    cachedRate = { rate, source, updatedAt: new Date().toISOString() };
    return NextResponse.json({ ok: true, data: cachedRate });
  } catch (e: any) {
    return NextResponse.json({ ok: true, data: { rate: 300, source: 'fallback', updatedAt: new Date().toISOString() } });
  }
}
