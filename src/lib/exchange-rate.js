/**
 * Exchange Rate Service
 * Fetches historical GBP/USD exchange rates for CGT calculations
 *
 * Uses multiple APIs with fallback:
 * 1. Frankfurter API (free, reliable, no API key)
 * 2. Fallback to yearly averages
 *
 * Optimized for parallel fetching with caching and deduplication
 */

// Cache exchange rates to avoid repeated API calls
const rateCache = new Map();

// HMRC-aligned approximate historical GBP/USD rates as fallback
// These are approximate yearly average rates
const FALLBACK_RATES = {
  '2025': 0.79,  // 1 USD = 0.79 GBP
  '2024': 0.79,
  '2023': 0.81,
  '2022': 0.81,
  '2021': 0.73,
  '2020': 0.78,
  '2019': 0.78,
  '2018': 0.75,
  '2017': 0.78,
  '2016': 0.74,
  '2015': 0.65,
};

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(date) {
  if (typeof date === 'string') {
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    // Handle MM/DD/YYYY format
    const parts = date.split('/');
    if (parts.length === 3) {
      const [month, day, year] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    date = new Date(date);
  }
  return date.toISOString().split('T')[0];
}

/**
 * Fetch single rate from Frankfurter API
 */
async function fetchSingleRate(dateStr) {
  const url = `https://api.frankfurter.app/${dateStr}?from=USD&to=GBP`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  const data = await response.json();

  if (data.rates && data.rates.GBP) {
    return data.rates.GBP;
  }

  throw new Error('Invalid response');
}

/**
 * Get exchange rate for a specific date (with cache check)
 * Returns GBP per USD (e.g., 0.79 means $1 USD = £0.79 GBP)
 */
export async function getExchangeRate(dateStr) {
  // Check cache first
  if (rateCache.has(dateStr)) {
    return rateCache.get(dateStr);
  }

  try {
    const rate = await fetchSingleRate(dateStr);
    rateCache.set(dateStr, rate);
    return rate;
  } catch (error) {
    // Use fallback rate based on year
    const year = dateStr.substring(0, 4);
    const rate = FALLBACK_RATES[year] || 0.79;
    console.warn(`[FX] Failed to fetch rate for ${dateStr}: ${error.message}. Using fallback: ${rate}`);
    rateCache.set(dateStr, rate);
    return rate;
  }
}

/**
 * Fetch a batch of rates in parallel with concurrency limit
 * @param {Array} requests - Array of {dateStr, cacheKey}
 * @param {number} concurrency - Max concurrent requests
 * @returns {Promise<Map>} - Map of dateStr -> rate
 */
async function fetchBatch(requests, concurrency = 10) {
  const results = new Map();

  // Process in chunks for controlled concurrency
  for (let i = 0; i < requests.length; i += concurrency) {
    const chunk = requests.slice(i, i + concurrency);

    const chunkPromises = chunk.map(async ({ dateStr }) => {
      const rate = await getExchangeRate(dateStr);
      return { dateStr, rate };
    });

    const chunkResults = await Promise.all(chunkPromises);

    for (const { dateStr, rate } of chunkResults) {
      results.set(dateStr, rate);
    }
  }

  return results;
}

/**
 * Apply exchange rates to transactions
 * Optimized with deduplication and parallel fetching
 */
export async function applyExchangeRates(transactions) {
  // Find all USD transactions that need exchange rates
  const usdTransactions = transactions.filter(t =>
    t.currency === 'USD' && (t.exchangeRate === 1 || !t.exchangeRate)
  );

  if (usdTransactions.length === 0) {
    console.log('[FX] No USD transactions need exchange rates');
    return transactions;
  }

  console.log(`[FX] Found ${usdTransactions.length} USD transactions needing exchange rates`);

  // Deduplicate requests - same date only needs one fetch
  const uniqueRequests = new Map();

  for (const txn of usdTransactions) {
    const dateStr = formatDate(txn.date);
    if (!uniqueRequests.has(dateStr) && !rateCache.has(dateStr)) {
      uniqueRequests.set(dateStr, { dateStr });
    }
  }

  const requestsToFetch = Array.from(uniqueRequests.values());
  console.log(`[FX] ${requestsToFetch.length} unique dates to fetch (after deduplication & cache check)`);

  // Fetch all unique rates in parallel batches
  if (requestsToFetch.length > 0) {
    const startTime = Date.now();
    await fetchBatch(requestsToFetch, 10); // 10 concurrent requests
    console.log(`[FX] Fetched ${requestsToFetch.length} exchange rates in ${Date.now() - startTime}ms`);
  }

  // Apply rates to transactions
  let successCount = 0;
  for (const txn of transactions) {
    if (txn.currency === 'USD') {
      const dateStr = formatDate(txn.date);
      const rate = rateCache.get(dateStr);

      if (rate) {
        // Rate is GBP per USD (e.g., 0.79 means 1 USD = 0.79 GBP)
        // In the CGT engine, we divide by exchangeRate to convert to GBP
        // So we need to store USD per GBP (1/rate) for the engine to work correctly
        txn.exchangeRate = 1 / rate;
        txn.exchangeRateSource = 'api';
        successCount++;
      }
    }
  }

  console.log(`[FX] Successfully applied ${successCount}/${usdTransactions.length} exchange rates`);
  return transactions;
}

/**
 * Clear the rate cache (useful for testing)
 */
export function clearRateCache() {
  rateCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: rateCache.size,
    keys: Array.from(rateCache.keys()),
  };
}
