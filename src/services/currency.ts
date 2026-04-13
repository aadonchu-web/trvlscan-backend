const CACHE_TTL_MS = 60 * 60 * 1000;
const GBP_USD_FALLBACK_RATE = 1.27;

type CachedRate = {
  rate: number;
  timestamp: number;
};

const rateCache = new Map<string, CachedRate>();

const getFallbackRate = (from: string, to: string): number | null => {
  if (from === "GBP" && to === "USD") {
    return GBP_USD_FALLBACK_RATE;
  }

  return null;
};

export const getCurrencyRate = async (from: string, to: string): Promise<number> => {
  const fromCurrency = from.trim().toUpperCase();
  const toCurrency = to.trim().toUpperCase();

  if (!fromCurrency || !toCurrency) {
    throw new Error("Both from and to currency codes are required");
  }

  if (fromCurrency === toCurrency) {
    return 1;
  }

  const cacheKey = `${fromCurrency}_${toCurrency}`;
  const now = Date.now();
  const cached = rateCache.get(cacheKey);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.rate;
  }

  try {
    const response = await fetch(
      `https://api.frankfurter.app/latest?from=${fromCurrency}&to=${toCurrency}`,
    );

    if (!response.ok) {
      throw new Error(`Rate API request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      rates?: Record<string, number>;
    };
    const rate = payload.rates?.[toCurrency];

    if (typeof rate !== "number" || !Number.isFinite(rate)) {
      throw new Error("Rate API response missing requested currency rate");
    }

    rateCache.set(cacheKey, { rate, timestamp: now });
    return rate;
  } catch (error) {
    const fallbackRate = getFallbackRate(fromCurrency, toCurrency);

    if (fallbackRate !== null) {
      return fallbackRate;
    }

    throw error;
  }
};
