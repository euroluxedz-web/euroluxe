/**
 * Currency exchange rate utility for USD → DZD (Algerian Dinar)
 *
 * IMPORTANT: The site owner has chosen a FIXED conversion rate of
 * 300 DZD per 1 USD (instead of a live API-fetched rate). This is a
 * business decision — the rate is what the site charges customers,
 * not necessarily the parallel-market or official rate. To change it,
 * edit FIXED_RATE below. All API calls and cache logic have been
 * removed because the rate no longer fluctuates.
 */

// ─────────────────────────────────────────────────────────────
// FIXED business rate: 1 USD = 300 DZD
// Change this single constant to update every price on the site.
// ─────────────────────────────────────────────────────────────
export const FIXED_RATE = 300;

// For backwards compatibility with code that expects a "cached" object
// (calculateAlgeriaPrice reads cachedRate?.rate).
let cachedRate: { rate: number; timestamp: number; officialRate: number } = {
  rate: FIXED_RATE,
  officialRate: FIXED_RATE,
  timestamp: Date.now(),
};

/**
 * Returns the fixed USD → DZD rate.
 * Kept async for backwards compatibility with callers that `await` it.
 */
export async function getUsdToDzdRate(): Promise<{ rate: number; officialRate: number; source: string; cached: boolean }> {
  return {
    rate: FIXED_RATE,
    officialRate: FIXED_RATE,
    source: "fixed-business-rate",
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
  const rate = FIXED_RATE;

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
