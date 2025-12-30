/**
 * Historical Price Fetcher
 * Fetches closing prices from Yahoo Finance for RSU vesting transactions
 * Optimized for parallel fetching with caching and deduplication
 */

// In-memory cache for prices (persists across requests in same server instance)
const priceCache = new Map();

/**
 * Parse date string to Date object in UTC
 * Handles multiple formats: MM/DD/YYYY, YYYY-MM-DD, DD/MM/YYYY
 * IMPORTANT: Always returns UTC dates to avoid timezone issues between servers
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Try MM/DD/YYYY format (US format - Schwab uses this)
  const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    // Use Date.UTC to avoid timezone issues
    return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0));
  }

  // Try YYYY-MM-DD format (ISO)
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    // Use Date.UTC to avoid timezone issues
    return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0));
  }

  // Try DD/MM/YYYY format (UK format)
  const ukMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ukMatch) {
    const [, day, month, year] = ukMatch;
    // Heuristic: if first number > 12, it's likely day
    if (parseInt(ukMatch[1]) > 12) {
      // Use Date.UTC to avoid timezone issues
      return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0));
    }
  }

  // Fallback to Date.parse - add time to ensure we get the right day
  const parsed = new Date(dateStr + 'T12:00:00Z');
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Generate cache key for a symbol+date combination
 */
function getCacheKey(ticker, dateStr) {
  const date = parseDate(dateStr);
  if (!date) return null;
  return `${ticker}:${date.toISOString().split('T')[0]}`;
}

/**
 * Fetch historical closing price from Yahoo Finance
 * @param {string} ticker - Stock ticker symbol
 * @param {string} dateStr - Date string in various formats
 * @returns {Promise<number|null>} - Closing price or null if not found
 */
export async function fetchHistoricalPrice(ticker, dateStr) {
  const cacheKey = getCacheKey(ticker, dateStr);

  // Check cache first
  if (cacheKey && priceCache.has(cacheKey)) {
    const cached = priceCache.get(cacheKey);
    console.log(`[HISTORICAL-PRICE] ✅ Cache hit for ${cacheKey}: $${cached.toFixed(2)}`);
    return cached;
  }

  const date = parseDate(dateStr);
  if (!date) {
    console.error(`[HISTORICAL-PRICE] Invalid date: ${dateStr}`);
    return null;
  }

  const dateFormatted = date.toISOString().split('T')[0];

  try {
    // Calculate timestamps for Yahoo Finance API
    const startTimestamp = Math.floor(date.getTime() / 1000);
    const endTimestamp = startTimestamp + (24 * 60 * 60); // Next day

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${startTimestamp}&period2=${endTimestamp}&interval=1d`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[HISTORICAL-PRICE] Yahoo Finance API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.chart && data.chart.result && data.chart.result[0]) {
      const result = data.chart.result[0];
      const closes = result.indicators?.quote?.[0]?.close;

      if (closes && closes.length > 0 && closes[0] !== null) {
        const closePrice = closes[0];
        console.log(`[HISTORICAL-PRICE] ✅ Fetched ${ticker} on ${dateFormatted}: $${closePrice.toFixed(2)} (Yahoo Finance close price)`);
        console.log(`[HISTORICAL-PRICE] DEBUG: timestamps=${JSON.stringify(result.timestamp)}, closes=${JSON.stringify(closes)}`);

        // Cache the result
        if (cacheKey) {
          priceCache.set(cacheKey, closePrice);
        }

        return closePrice;
      }
    }

    console.warn(`[HISTORICAL-PRICE] ⚠️ No close price found for ${ticker} on ${dateFormatted}`);
    return null;
  } catch (error) {
    console.error(`[HISTORICAL-PRICE] Error fetching price for ${ticker} on ${dateFormatted}:`, error.message);
    return null;
  }
}

/**
 * Fetch a batch of prices in parallel with concurrency limit
 * @param {Array} requests - Array of {ticker, dateStr, cacheKey}
 * @param {number} concurrency - Max concurrent requests
 * @returns {Promise<Map>} - Map of cacheKey -> price
 */
async function fetchBatch(requests, concurrency = 10) {
  const results = new Map();

  // Process in chunks for controlled concurrency
  for (let i = 0; i < requests.length; i += concurrency) {
    const chunk = requests.slice(i, i + concurrency);

    const chunkPromises = chunk.map(async ({ ticker, dateStr, cacheKey }) => {
      const price = await fetchHistoricalPrice(ticker, dateStr);
      return { cacheKey, price };
    });

    const chunkResults = await Promise.all(chunkPromises);

    for (const { cacheKey, price } of chunkResults) {
      results.set(cacheKey, price);
    }
  }

  return results;
}

/**
 * Fetch historical prices for multiple transactions in parallel
 * Optimized with deduplication and batched concurrency
 * @param {Array} transactions - Array of transactions with needsHistoricalPrice flag
 * @returns {Promise<Array>} - Updated transactions with prices filled in
 */
export async function fetchHistoricalPricesForTransactions(transactions) {
  const transactionsNeedingPrice = transactions.filter(txn => txn.needsHistoricalPrice && !txn.__isAdjusted);

  if (transactionsNeedingPrice.length === 0) {
    return transactions;
  }

  console.log(`[HISTORICAL-PRICE] Found ${transactionsNeedingPrice.length} transactions needing historical prices`);

  // Deduplicate requests - same symbol+date only needs one fetch
  const uniqueRequests = new Map();

  for (const txn of transactionsNeedingPrice) {
    const cacheKey = getCacheKey(txn.symbol, txn.date);
    if (cacheKey && !uniqueRequests.has(cacheKey) && !priceCache.has(cacheKey)) {
      uniqueRequests.set(cacheKey, { ticker: txn.symbol, dateStr: txn.date, cacheKey });
    }
  }

  const requestsToFetch = Array.from(uniqueRequests.values());
  console.log(`[HISTORICAL-PRICE] ${requestsToFetch.length} unique symbol+date combinations to fetch (after deduplication & cache check)`);

  // Fetch all unique prices in parallel batches
  if (requestsToFetch.length > 0) {
    const startTime = Date.now();
    await fetchBatch(requestsToFetch, 10); // 10 concurrent requests
    console.log(`[HISTORICAL-PRICE] Fetched ${requestsToFetch.length} prices in ${Date.now() - startTime}ms`);
  }

  // Update transactions with fetched/cached prices
  let successCount = 0;
  const updatedTransactions = transactions.map(txn => {
    // Skip adjusted transactions - don't overwrite their prices
    if (txn.__isAdjusted) {
      return txn;
    }
    
    if (!txn.needsHistoricalPrice) {
      return txn;
    }

    const cacheKey = getCacheKey(txn.symbol, txn.date);
    const price = cacheKey ? priceCache.get(cacheKey) : null;

    if (price !== null && price !== undefined) {
      successCount++;
      return {
        ...txn,
        pricePerUnit: price,
        totalAmount: txn.quantity * price,
        needsHistoricalPrice: false,
        priceSource: 'yahoo_finance_historical',
      };
    }

    // If we couldn't fetch the price, mark it but keep the transaction
    console.warn(`[HISTORICAL-PRICE] Could not fetch price for ${txn.symbol} on ${txn.date}`);
    return {
      ...txn,
      pricePerUnit: 0,
      totalAmount: 0,
      needsHistoricalPrice: false,
      priceSource: 'missing',
      priceMissing: true,
    };
  });

  console.log(`[HISTORICAL-PRICE] Successfully resolved ${successCount}/${transactionsNeedingPrice.length} historical prices`);

  return updatedTransactions;
}

/**
 * Clear the price cache (useful for testing)
 */
export function clearPriceCache() {
  priceCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: priceCache.size,
    keys: Array.from(priceCache.keys()),
  };
}
