/**
 * Currency conversion utility using Frankfurter API
 * Caches rates per day to minimize API calls
 */

const FALLBACK_USD_TO_ILS = 3.6;
const VAT_RATE = 1.18; // 18% Israeli VAT

// In-memory cache: { 'USD_ILS_2026-04-16': { rate: 3.012, fetchedAt: ... } }
const rateCache = new Map();

function getTodayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Fetch exchange rate from Frankfurter API
 * @param {string} from - Base currency (e.g. 'USD')
 * @param {string} to - Target currency (e.g. 'ILS')
 * @returns {Promise<number>} Exchange rate
 */
export async function getExchangeRate(from = 'USD', to = 'ILS') {
  if (from === to) return 1;

  const today = getTodayStr();
  const cacheKey = `${from}_${to}_${today}`;

  if (rateCache.has(cacheKey)) {
    return rateCache.get(cacheKey).rate;
  }

  try {
    const url = `https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(from)}&quotes=${encodeURIComponent(to)}&from=${today}&to=${today}`;
    const res = await fetch(url, { next: { revalidate: 3600 } }); // Cache 1 hour in Next.js

    if (!res.ok) {
      console.warn(`[currency] Frankfurter API returned ${res.status}, using fallback`);
      return FALLBACK_USD_TO_ILS;
    }

    const data = await res.json();
    // Response format: [{"date":"2026-04-16","base":"USD","quote":"ILS","rate":3.012}]
    const rate = Array.isArray(data) && data[0]?.rate ? data[0].rate : FALLBACK_USD_TO_ILS;

    rateCache.set(cacheKey, { rate, fetchedAt: Date.now() });
    return rate;
  } catch (err) {
    console.warn(`[currency] Failed to fetch exchange rate:`, err.message);
    return FALLBACK_USD_TO_ILS;
  }
}

/**
 * Convert a USD price to ILS including VAT
 * @param {number} usdAmount - Amount in USD
 * @param {number} rate - USD to ILS exchange rate
 * @returns {number} Rounded ILS amount including 18% VAT
 */
export function convertUsdToIlsWithVat(usdAmount, rate) {
  return Math.round(usdAmount * rate * VAT_RATE);
}

export { VAT_RATE, FALLBACK_USD_TO_ILS };
