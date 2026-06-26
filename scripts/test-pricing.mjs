/**
 * Quick test for exchange rate and Algeria price calculation
 */

// Inline the functions for testing
let cachedRate  = null;
const CACHE_TTL = 60 * 60 * 1000;
const DEFAULT_RATE = 270;

async function getUsdToDzdRate() {
  if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_TTL) {
    return { rate: cachedRate.rate, source: "cached", cached: true };
  }

  const apis = [
    {
      name: "open.er-api.com",
      url: "https://open.er-api.com/v6/latest/USD",
      parse: (data) => data?.rates?.DZD,
    },
    {
      name: "api.frankfurter.app",
      url: "https://api.frankfurter.app/latest?from=USD&to=DZD",
      parse: (data) => data?.rates?.DZD,
    },
    {
      name: "api.exchangerate-api.com",
      url: "https://api.exchangerate-api.com/v4/latest/USD",
      parse: (data) => data?.rates?.DZD,
    },
  ];

  for (const api of apis) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(api.url, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeout);
      if (!response.ok) continue;
      const data = await response.json();
      const rate = api.parse(data);
      if (rate && typeof rate === "number" && rate > 50 && rate < 1000) {
        cachedRate = { rate, timestamp: Date.now() };
        return { rate, source: api.name, cached: false };
      }
    } catch {
      continue;
    }
  }

  cachedRate = { rate: DEFAULT_RATE, timestamp: Date.now() };
  return { rate: DEFAULT_RATE, source: "default-fallback", cached: false };
}

function calculateAlgeriaPrice(basePriceUSD) {
  const rate = cachedRate?.rate || DEFAULT_RATE;
  const basePriceDZD = basePriceUSD * rate;

  let shippingUSD;
  if (basePriceUSD < 5) shippingUSD = 6;
  else if (basePriceUSD < 15) shippingUSD = 8;
  else if (basePriceUSD < 50) shippingUSD = 12;
  else if (basePriceUSD < 100) shippingUSD = 18;
  else shippingUSD = Math.min(basePriceUSD * 0.2, 40);
  const shippingDZD = shippingUSD * rate;

  let customsDZD;
  if (basePriceDZD < 8000) customsDZD = 0;
  else if (basePriceDZD < 30000) customsDZD = basePriceDZD * 0.15;
  else customsDZD = basePriceDZD * 0.30;

  const marginDZD = Math.max(basePriceDZD * 0.15, 200);
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

async function test() {
  console.log("Testing exchange rate fetching...\n");
  const rateResult = await getUsdToDzdRate();
  console.log(`Rate: 1 USD = ${rateResult.rate} DZD (source: ${rateResult.source})`);
  console.log();

  // Test price calculations for various product prices
  const testPrices = [2.99, 5.99, 12.99, 25.99, 49.99, 99.99, 199.99];
  console.log("Price calculation breakdown:");
  console.log("Base USD | Base DZD | Shipping | Customs | Margin | Total DZD");
  console.log("-".repeat(70));
  for (const price of testPrices) {
    const b = calculateAlgeriaPrice(price);
    console.log(
      `$${b.basePriceUSD.toFixed(2).padStart(7)} | ${String(b.basePriceDZD).padStart(8)} | ${String(b.shippingDZD).padStart(7)} | ${String(b.customsDZD).padStart(7)} | ${String(b.marginDZD).padStart(6)} | ${String(b.totalDZD).padStart(9)} DA`
    );
  }
}

test().catch(console.error);
