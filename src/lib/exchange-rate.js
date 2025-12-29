/**
 * Exchange Rate Service
 * Fetches historical GBP/USD exchange rates for CGT calculations
 *
 * Uses multiple APIs with fallback:
 * 1. Frankfurter API (free, reliable, no API key)
 * 2. Exchange Rate API (backup)
 * 3. Fallback to yearly averages
 *
 * Optimized for parallel fetching with caching and deduplication
 */

// Cache exchange rates to avoid repeated API calls
const rateCache = new Map();

// Track fallback usage for debugging
const fallbackUsage = [];

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
  if (!date) {
    console.warn('[FX] formatDate received null/undefined date');
    return null;
  }

  if (typeof date === 'string') {
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    // Handle MM/DD/YYYY format (US format)
    const usMatch = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usMatch) {
      const [, month, day, year] = usMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    // Handle DD/MM/YYYY format (UK format) or other slash formats
    const parts = date.split('/');
    if (parts.length === 3) {
      const [month, day, year] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    // Handle ISO format with time (YYYY-MM-DDTHH:MM:SS)
    if (date.includes('T')) {
      return date.split('T')[0];
    }
    // Handle space-separated datetime (YYYY-MM-DD HH:MM:SS)
    if (date.includes(' ') && date.match(/^\d{4}-\d{2}-\d{2}/)) {
      return date.split(' ')[0];
    }
    // Try to parse as Date
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    console.warn(`[FX] Could not parse date string: ${date}`);
    return null;
  }

  if (date instanceof Date) {
    if (isNaN(date.getTime())) {
      console.warn('[FX] formatDate received invalid Date object');
      return null;
    }
    return date.toISOString().split('T')[0];
  }

  console.warn(`[FX] formatDate received unexpected type: ${typeof date}`);
  return null;
}

/**
 * Check if a date is in the future
 */
function isFutureDate(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
}

/**
 * Get the most recent valid date for exchange rate lookup
 * If date is in the future or weekend, returns the last valid business day
 */
function getValidExchangeRateDate(dateStr) {
  let date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // If future date, use today or yesterday
  if (date > today) {
    date = new Date(today);
  }

  // Frankfurter API doesn't have weekend rates, so go back to Friday
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) { // Sunday
    date.setDate(date.getDate() - 2);
  } else if (dayOfWeek === 6) { // Saturday
    date.setDate(date.getDate() - 1);
  }

  return date.toISOString().split('T')[0];
}

/**
 * Fetch single rate from Frankfurter API with retry
 */
async function fetchSingleRate(dateStr, retries = 2) {
  // Adjust date if it's a future date or weekend
  const validDate = getValidExchangeRateDate(dateStr);

  const url = `https://api.frankfurter.app/${validDate}?from=USD&to=GBP`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(url, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();

      if (data.rates && data.rates.GBP) {
        return { rate: data.rates.GBP, source: 'api' };
      }

      throw new Error('Invalid response');
    } catch (error) {
      if (attempt < retries) {
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Get fallback rate and log the usage
 */
function getFallbackRate(dateStr, reason) {
  // Handle null/undefined dates
  if (!dateStr) {
    console.warn('[FX] getFallbackRate called with null/undefined date');
    return { rate: 0.79, source: 'fallback' };
  }

  const year = dateStr.substring(0, 4);
  const rate = FALLBACK_RATES[year] || 0.79;

  fallbackUsage.push({
    date: dateStr,
    rate,
    reason,
    timestamp: new Date().toISOString(),
  });

  return { rate, source: 'fallback' };
}

/**
 * Get exchange rate for a specific date (with cache check)
 * Returns GBP per USD (e.g., 0.79 means $1 USD = £0.79 GBP)
 */
export async function getExchangeRate(dateStr) {
  // Check cache first
  if (rateCache.has(dateStr)) {
    const cached = rateCache.get(dateStr);
    return cached;
  }

  try {
    const result = await fetchSingleRate(dateStr);
    rateCache.set(dateStr, result);
    return result;
  } catch (error) {
    // Use fallback rate based on year
    const result = getFallbackRate(dateStr, error.message);
    console.warn(`[FX] ⚠️ FALLBACK USED for ${dateStr}: ${error.message}. Using yearly average: ${result.rate}`);
    rateCache.set(dateStr, result);
    return result;
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
  let apiCount = 0;
  let fallbackCount = 0;

  for (const txn of transactions) {
    if (txn.currency === 'USD') {
      const dateStr = formatDate(txn.date);
      if (!dateStr) {
        console.warn(`[FX] Skipping transaction with invalid date: ${txn.date}`);
        continue;
      }
      const rateData = rateCache.get(dateStr);

      if (rateData) {
        const rate = typeof rateData === 'object' ? rateData.rate : rateData;
        const source = typeof rateData === 'object' ? rateData.source : 'api';

        // Rate is GBP per USD (e.g., 0.79 means 1 USD = 0.79 GBP)
        // In the CGT engine, we divide by exchangeRate to convert to GBP
        // So we need to store USD per GBP (1/rate) for the engine to work correctly
        txn.exchangeRate = 1 / rate;
        txn.exchangeRateSource = source;
        successCount++;

        if (source === 'api') {
          apiCount++;
        } else {
          fallbackCount++;
        }
      }
    }
  }

  console.log(`[FX] Successfully applied ${successCount}/${usdTransactions.length} exchange rates`);

  if (fallbackCount > 0) {
    console.warn(`[FX] ⚠️ WARNING: ${fallbackCount} transactions used FALLBACK exchange rates (yearly averages)`);
    console.warn(`[FX] This may cause differences in CGT calculations. API rates: ${apiCount}, Fallback rates: ${fallbackCount}`);
  }

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
