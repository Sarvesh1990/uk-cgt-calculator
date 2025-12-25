/**
 * Historical Price Fetcher
 * Fetches closing prices from Yahoo Finance for RSU vesting transactions
 */

/**
 * Parse date string to Date object
 * Handles multiple formats: MM/DD/YYYY, YYYY-MM-DD, DD/MM/YYYY
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Try MM/DD/YYYY format (US format - Schwab uses this)
  const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Try YYYY-MM-DD format (ISO)
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Try DD/MM/YYYY format (UK format)
  const ukMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ukMatch) {
    const [, day, month, year] = ukMatch;
    // Heuristic: if first number > 12, it's likely day
    if (parseInt(ukMatch[1]) > 12) {
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  }

  // Fallback to Date.parse
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Fetch historical closing price from Yahoo Finance
 * @param {string} ticker - Stock ticker symbol
 * @param {string} dateStr - Date string in various formats
 * @returns {Promise<number|null>} - Closing price or null if not found
 */
export async function fetchHistoricalPrice(ticker, dateStr) {
  const date = parseDate(dateStr);
  if (!date) {
    console.error(`[HISTORICAL-PRICE] Invalid date: ${dateStr}`);
    return null;
  }

  const dateFormatted = date.toISOString().split('T')[0];
  console.log(`[HISTORICAL-PRICE] Fetching close price for ${ticker} on ${dateFormatted}`);

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
        console.log(`[HISTORICAL-PRICE] ✅ Got close price for ${ticker} on ${dateFormatted}: $${closePrice.toFixed(2)}`);
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
 * Fetch historical prices for multiple transactions in parallel
 * @param {Array} transactions - Array of transactions with needsHistoricalPrice flag
 * @returns {Promise<Array>} - Updated transactions with prices filled in
 */
export async function fetchHistoricalPricesForTransactions(transactions) {
  const transactionsNeedingPrice = transactions.filter(txn => txn.needsHistoricalPrice);

  if (transactionsNeedingPrice.length === 0) {
    return transactions;
  }

  console.log(`[HISTORICAL-PRICE] Found ${transactionsNeedingPrice.length} transactions needing historical prices`);

  // Fetch prices in parallel with a small delay to avoid rate limiting
  const pricePromises = transactionsNeedingPrice.map(async (txn, index) => {
    // Add small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, index * 100));

    const price = await fetchHistoricalPrice(txn.symbol, txn.date);
    return { txn, price };
  });

  const results = await Promise.all(pricePromises);

  // Update transactions with fetched prices
  const updatedTransactions = transactions.map(txn => {
    if (!txn.needsHistoricalPrice) {
      return txn;
    }

    const result = results.find(r => r.txn === txn);
    if (result && result.price !== null) {
      return {
        ...txn,
        pricePerUnit: result.price,
        totalAmount: txn.quantity * result.price,
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

  const successCount = results.filter(r => r.price !== null).length;
  console.log(`[HISTORICAL-PRICE] Successfully fetched ${successCount}/${transactionsNeedingPrice.length} historical prices`);

  return updatedTransactions;
}
