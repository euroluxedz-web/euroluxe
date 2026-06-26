/**
 * Live currency exchange rate utilities
 * Fetches USD → DZD (Algerian Dinar) rates from multiple free APIs
 * Falls back to a sensible default if all APIs fail
 */

// Cache the rate for 1 hour to avoid excessive API calls
let cachedRate: { rate: number; timestamp: number; officialRate: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Default fallback rate (USD → DZD, parallel market rate)
// Official rate ~133 DZD/USD, but parallel market rate in Algeria is ~250-270 DZD/USD
// We use the parallel market rate since that's what Algerian consumers actually pay
const DEFAULT_PARALLEL_RATE = 270;

// Multiplier to convert official rate to parallel market rate
// As of 2025, parallel market rate is roughly 2x the official rate in Algeria
const PARALLEL_MARKET_MULTIPLIER = 2.0;

/**
 * Fetch USD → DZD exchange rate from free APIs
 * Returns the parallel market rate (what Algerians actually pay)
 * Tries multiple sources for reliability
 */
export async function getUsdToDzdRate(): Promise<{ rate: number; officialRate: number; source: string; cached: boolean }> {
  // Return cached rate if still fresh
  if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_TTL) {
    return {
      rate: cachedRate.rate,
      officialRate: cachedRate.officialRate,
      source: "cached",
      cached: true,
    };
  }

  // Try multiple free exchange rate APIs
  const apis = [
    {
      name: "open.er-api.com",
      url: "https://open.er-api.com/v6/latest/USD",
      parse: (data: any) => data?.rates?.DZD,
    },
    {
      name: "api.exchangerate-api.com",
      url: "https://api.exchangerate-api.com/v4/latest/USD",
      parse: (data: any) => data?.rates?.DZD,
    },
  ];

  for (const api of apis) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(api.url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeout);

      if (!response.ok) continue;

      const data = await response.json();
      const officialRate = api.parse(data);

      if (officialRate && typeof officialRate === "number" && officialRate > 50 && officialRate < 1000) {
        // Convert official rate to parallel market rate
        const parallelRate = Math.round(officialRate * PARALLEL_MARKET_MULTIPLIER);

        // Cache the result
        cachedRate = {
          rate: parallelRate,
          officialRate,
          timestamp: Date.now(),
        };
        return { rate: parallelRate, officialRate, source: api.name, cached: false };
      }
    } catch {
      // Try next API
      continue;
    }
  }

  // All APIs failed - use default
  cachedRate = {
    rate: DEFAULT_PARALLEL_RATE,
    officialRate: DEFAULT_PARALLEL_RATE / PARALLEL_MARKET_MULTIPLIER,
    timestamp: Date.now(),
  };
  return {
    rate: DEFAULT_PARALLEL_RATE,
    officialRate: DEFAULT_PARALLEL_RATE / PARALLEL_MARKET_MULTIPLIER,
    source: "default-fallback",
    cached: false,
  };
}

/**
 * Algeria-specific pricing formula
 *
 * IMPORTANT: As of 2025, Temu ships to Algeria for FREE on virtually all
 * orders, and small parcels (under ~$125 / 10000 DZD) clear customs with
 * no duty. The user explicitly requested that we do NOT add shipping,
 * customs, or service margin to the displayed price — they only want the
 * pure currency conversion (USD × parallel-market rate).
 *
 * @param basePriceUSD - The product price in USD
 * @returns Breakdown with base price = total price
 */
export function calculateAlgeriaPrice(basePriceUSD: number) {
  const rate = cachedRate?.rate || DEFAULT_PARALLEL_RATE;

  // Pure conversion: USD → DZD using parallel market rate.
  const basePriceDZD = basePriceUSD * rate;

  // Shipping is FREE to Algeria on Temu.
  const shippingUSD = 0;
  const shippingDZD = 0;

  // Customs are NOT added — Temu handles small parcels as gifts/duty-free.
  const customsDZD = 0;

  // No service margin — user wants the pure price.
  const marginDZD = 0;

  const totalDZD = basePriceDZD + shippingDZD + customsDZD + marginDZD;

  return {
    basePriceUSD: Math.round(basePriceUSD * 100) / 100,
    basePriceDZD: Math.round(basePriceDZD * 100) / 100,
    shippingUSD: Math.round(shippingUSD * 100) / 100,
    shippingDZD: Math.round(shippingDZD * 100) / 100,
    customsDZD: Math.round(customsDZD * 100) / 100,
    marginDZD: Math.round(marginDZD * 100) / 100,
    totalDZD: Math.round(totalDZD * 100) / 100,
    exchangeRate: rate,
  };
}
