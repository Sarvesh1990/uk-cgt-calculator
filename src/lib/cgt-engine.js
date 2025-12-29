/**
 * UK Capital Gains Tax Calculator Engine
 * Implements HMRC share matching rules:
 * 1. Same-day rule - Match with acquisitions on the same day
 * 2. Bed and Breakfast rule - Match with acquisitions within 30 days AFTER disposal
 * 3. Section 104 Pool - Average cost basis for remaining shares
 */

export const TAX_YEARS = {
  "2025/26": {
    start: new Date("2025-04-06"),
    end: new Date("2026-04-05"),
    annualExemption: 3000,
    basicRateShares: 0.10,
    higherRateShares: 0.20,
    basicRateProperty: 0.18,
    higherRateProperty: 0.24,
  },
  "2024/25": {
    start: new Date("2024-04-06"),
    end: new Date("2025-04-05"),
    annualExemption: 3000,
    // CGT rates changed 30 October 2024 (Autumn Budget 2024)
    rateChangeDate: new Date("2024-10-30"),
    // Before 30 Oct 2024
    basicRateSharesPre: 0.10,
    higherRateSharesPre: 0.20,
    // From 30 Oct 2024
    basicRateSharesPost: 0.18,
    higherRateSharesPost: 0.24,
    // Legacy fields for compatibility
    basicRateShares: 0.18,  // Post-Oct rates as default
    higherRateShares: 0.24,
    basicRateProperty: 0.18,
    higherRateProperty: 0.24,
  },
  "2023/24": {
    start: new Date("2023-04-06"),
    end: new Date("2024-04-05"),
    annualExemption: 6000,
    basicRateShares: 0.10,
    higherRateShares: 0.20,
    basicRateProperty: 0.18,
    higherRateProperty: 0.28,
  },
  "2022/23": {
    start: new Date("2022-04-06"),
    end: new Date("2023-04-05"),
    annualExemption: 12300,
    basicRateShares: 0.10,
    higherRateShares: 0.20,
    basicRateProperty: 0.18,
    higherRateProperty: 0.28,
  },
  "2021/22": {
    start: new Date("2021-04-06"),
    end: new Date("2022-04-05"),
    annualExemption: 12300,
    basicRateShares: 0.10,
    higherRateShares: 0.20,
    basicRateProperty: 0.18,
    higherRateProperty: 0.28,
  },
  "2020/21": {
    start: new Date("2020-04-06"),
    end: new Date("2021-04-05"),
    annualExemption: 12300,
    basicRateShares: 0.10,
    higherRateShares: 0.20,
    basicRateProperty: 0.18,
    higherRateProperty: 0.28,
  },
  "2019/20": {
    start: new Date("2019-04-06"),
    end: new Date("2020-04-05"),
    annualExemption: 12000,
    basicRateShares: 0.10,
    higherRateShares: 0.20,
    basicRateProperty: 0.18,
    higherRateProperty: 0.28,
  },
  "2018/19": {
    start: new Date("2018-04-06"),
    end: new Date("2019-04-05"),
    annualExemption: 11700,
    basicRateShares: 0.10,
    higherRateShares: 0.20,
    basicRateProperty: 0.18,
    higherRateProperty: 0.28,
  },
  "2017/18": {
    start: new Date("2017-04-06"),
    end: new Date("2018-04-05"),
    annualExemption: 11300,
    basicRateShares: 0.10,
    higherRateShares: 0.20,
    basicRateProperty: 0.18,
    higherRateProperty: 0.28,
  },
};

/**
 * Format date to YYYY-MM-DD string using local time (not UTC)
 * This avoids timezone issues where toISOString() shifts dates
 */
function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(dateStr) {
  if (dateStr instanceof Date) return dateStr;

  // Handle null/undefined/empty
  if (!dateStr) {
    console.warn('[CGT] parseDate received null/undefined/empty date');
    return null;
  }

  // Handle string conversion
  const str = String(dateStr).trim();

  // Skip empty strings
  if (!str) {
    console.warn('[CGT] parseDate received empty string');
    return null;
  }

  // ISO format: YYYY-MM-DD (e.g., "2025-07-06")
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Slash format: could be MM/DD/YYYY (US) or DD/MM/YYYY (UK)
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, first, second, year] = slashMatch;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);
    const yearNum = parseInt(year);

    // Heuristic to detect format:
    // - If first number > 12, it MUST be day (UK format: DD/MM/YYYY)
    // - If second number > 12, it MUST be day (US format: MM/DD/YYYY)
    // - Otherwise, assume US format (MM/DD/YYYY) since Schwab uses this

    if (firstNum > 12) {
      // UK format: DD/MM/YYYY (first is day, second is month)
      return new Date(yearNum, secondNum - 1, firstNum);
    } else if (secondNum > 12) {
      // US format: MM/DD/YYYY (first is month, second is day)
      return new Date(yearNum, firstNum - 1, secondNum);
    } else {
      // Ambiguous - assume US format (MM/DD/YYYY) since Schwab uses this
      return new Date(yearNum, firstNum - 1, secondNum);
    }
  }

  // Dash format: DD-MM-YYYY
  const dashMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dashMatch) {
    const [, day, month, year] = dashMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Try datetime with space (YYYY-MM-DD HH:MM:SS)
  if (str.includes(' ') && str.match(/^\d{4}-\d{2}-\d{2}/)) {
    const datePart = str.split(' ')[0];
    const isoMatch2 = datePart.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch2) {
      const [, year, month, day] = isoMatch2;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  }

  // Fallback to Date.parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed;

  console.warn(`[CGT] Unable to parse date: "${dateStr}"`);
  return null;
}

function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function getDaysDifference(date1, date2) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((date2.getTime() - date1.getTime()) / oneDay);
}

function getTaxYear(date) {
  for (const [year, config] of Object.entries(TAX_YEARS)) {
    if (date >= config.start && date <= config.end) {
      return { year, ...config };
    }
  }

  // Generate tax year dynamically for dates outside predefined range
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();

  // UK tax year runs from April 6 to April 5
  // If before April 6, it's the previous year's tax year (e.g., Jan 2017 is in 2016/17)
  // If April 6 or after, it's the current year's tax year (e.g., May 2017 is in 2017/18)
  let taxYearStart;
  if (month < 3 || (month === 3 && day < 6)) {
    // Before April 6 - belongs to previous tax year
    taxYearStart = year - 1;
  } else {
    // April 6 or after - belongs to current tax year
    taxYearStart = year;
  }

  const taxYearLabel = `${taxYearStart}/${(taxYearStart + 1).toString().slice(-2)}`;

  console.warn(`[CGT-ENGINE] Date ${formatDateLocal(date)} outside predefined tax years, calculated as ${taxYearLabel}`);

  // Use default rates for older years
  return {
    year: taxYearLabel,
    start: new Date(`${taxYearStart}-04-06`),
    end: new Date(`${taxYearStart + 1}-04-05`),
    annualExemption: 11300, // Default to older exemption amount
    basicRateShares: 0.10,
    higherRateShares: 0.20,
    basicRateProperty: 0.18,
    higherRateProperty: 0.28,
  };
}

function round2dp(num) {
  return Math.round(num * 100) / 100;
}

function normalizeTransactions(transactions) {
  return transactions
    .map((t, index) => {
      const parsedDate = parseDate(t.date);
      // Skip transactions with invalid dates
      if (!parsedDate) {
        console.warn(`[CGT] Skipping transaction with invalid date: ${t.date}`);
        return null;
      }
      return {
        id: `txn-${index}-${Date.now()}`,
        date: parsedDate,
        type: t.type.toUpperCase(),
        symbol: t.symbol.toUpperCase().trim(),
        assetName: t.assetName || t.symbol,
        quantity: Math.abs(parseFloat(t.quantity) || 0),
        pricePerUnit: parseFloat(t.pricePerUnit) || 0,
        totalAmount: t.totalAmount !== null ? parseFloat(t.totalAmount) : null,
        fees: parseFloat(t.fees) || 0,
        currency: t.currency || "GBP",
        exchangeRate: parseFloat(t.exchangeRate) || 1,
        broker: t.broker || "Unknown",
        used: false,
        remainingQty: Math.abs(parseFloat(t.quantity) || 0),
      };
    })
    .filter((t) => t !== null && t.quantity > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function calculateCost(transaction, quantity) {
  const proportion = quantity / transaction.quantity;
  const baseCost = transaction.totalAmount !== null
    ? transaction.totalAmount * proportion
    : quantity * transaction.pricePerUnit;
  const fees = transaction.fees * proportion;
  return round2dp((baseCost + fees) / transaction.exchangeRate);
}

function calculateProceeds(transaction, quantity) {
  const proportion = quantity / transaction.quantity;
  const baseProceeds = transaction.totalAmount !== null
    ? transaction.totalAmount * proportion
    : quantity * transaction.pricePerUnit;
  const fees = transaction.fees * proportion;
  return round2dp((baseProceeds - fees) / transaction.exchangeRate);
}

export class CGTCalculator {
  constructor() {
    this.section104Pools = {};
    this.section104History = {}; // Track history of pool changes
    this.section104Snapshots = {}; // Track S104 state at start/end of each tax year
    this.disposals = [];
    this.acquisitions = []; // Track all acquisitions for display
    this.errors = [];
  }

  calculate(rawTransactions) {
    const transactions = normalizeTransactions(rawTransactions);

    const bySymbol = {};
    for (const t of transactions) {
      if (!bySymbol[t.symbol]) bySymbol[t.symbol] = [];
      bySymbol[t.symbol].push(t);
    }

    for (const symbol of Object.keys(bySymbol)) {
      this.processSymbol(symbol, bySymbol[symbol]);
    }

    return this.generateReport();
  }

  processSymbol(symbol, transactions) {
    if (!this.section104Pools[symbol]) {
      this.section104Pools[symbol] = { quantity: 0, cost: 0 };
    }
    if (!this.section104History[symbol]) {
      this.section104History[symbol] = [];
    }

    const buys = transactions.filter((t) => t.type === "BUY");
    const sells = transactions.filter((t) => t.type === "SELL");

    // Track acquisitions (including RSU vestings)
    for (const buy of buys) {
      const cost = calculateCost(buy, buy.quantity);
      const costPerShare = round2dp(cost / buy.quantity);

      this.acquisitions.push({
        symbol,
        date: formatDateLocal(buy.date),
        quantity: buy.quantity,
        totalCost: round2dp(cost),
        costPerShare,
        broker: buy.broker,
        isRSU: buy.broker === 'Charles Schwab' && buy.pricePerUnit > 0, // RSU vesting from Schwab
        priceSource: buy.priceSource || 'csv',
      });
    }

    for (const disposal of sells) {
      this.processDisposal(symbol, disposal, buys, transactions);
    }

    for (const buy of buys) {
      if (buy.remainingQty > 0) {
        const cost = calculateCost(buy, buy.remainingQty);
        const poolBefore = {
          quantity: this.section104Pools[symbol].quantity,
          cost: this.section104Pools[symbol].cost,
          avgCost: this.section104Pools[symbol].quantity > 0
            ? round2dp(this.section104Pools[symbol].cost / this.section104Pools[symbol].quantity)
            : 0,
        };

        this.section104Pools[symbol].quantity += buy.remainingQty;
        this.section104Pools[symbol].cost += cost;

        const poolAfter = {
          quantity: this.section104Pools[symbol].quantity,
          cost: this.section104Pools[symbol].cost,
          avgCost: round2dp(this.section104Pools[symbol].cost / this.section104Pools[symbol].quantity),
        };

        // Record pool history for RSU vestings
        this.section104History[symbol].push({
          date: buy.date.toISOString().split('T')[0],
          type: 'ACQUISITION',
          quantity: buy.remainingQty,
          cost: round2dp(cost),
          costPerShare: round2dp(cost / buy.remainingQty),
          poolBefore,
          poolAfter,
          isRSU: buy.broker === 'Charles Schwab',
          broker: buy.broker,
        });
      }
    }
  }

  processDisposal(symbol, disposal, buys) {
    let remainingQty = disposal.quantity;
    const proceeds = calculateProceeds(disposal, disposal.quantity);
    const proceedsPerShare = round2dp(proceeds / disposal.quantity);
    let totalCost = 0;
    const matchDetails = [];

    // 1. SAME-DAY RULE
    const sameDayBuys = buys.filter(
      (b) => isSameDay(b.date, disposal.date) && b.remainingQty > 0
    );

    for (const buy of sameDayBuys) {
      if (remainingQty <= 0) break;

      const matchQty = Math.min(remainingQty, buy.remainingQty);
      const matchCost = calculateCost(buy, matchQty);
      const costPerShare = round2dp(matchCost / matchQty);

      totalCost += matchCost;
      remainingQty -= matchQty;
      buy.remainingQty -= matchQty;

      matchDetails.push({
        rule: "SAME_DAY",
        quantity: matchQty,
        cost: matchCost,
        costPerShare,
        proceedsPerShare,
        gainPerShare: round2dp(proceedsPerShare - costPerShare),
        acquisitionDate: formatDateLocal(buy.date),
        broker: buy.broker,
        isRSU: buy.broker === 'Charles Schwab',
      });
    }

    // 2. BED AND BREAKFAST RULE (30 days AFTER disposal)
    if (remainingQty > 0) {
      const bnbBuys = buys.filter((b) => {
        const daysDiff = getDaysDifference(disposal.date, b.date);
        return daysDiff > 0 && daysDiff <= 30 && b.remainingQty > 0;
      }).sort((a, b) => a.date.getTime() - b.date.getTime());

      for (const buy of bnbBuys) {
        if (remainingQty <= 0) break;

        const matchQty = Math.min(remainingQty, buy.remainingQty);
        const matchCost = calculateCost(buy, matchQty);
        const costPerShare = round2dp(matchCost / matchQty);
        const daysDiff = getDaysDifference(disposal.date, buy.date);

        // Calculate what the S104 cost would have been (for comparison)
        const pool = this.section104Pools[symbol];
        const s104AvgCost = pool.quantity > 0 ? round2dp(pool.cost / pool.quantity) : 0;

        // Original currency info
        const originalCurrency = buy.currency || 'GBP';
        const originalCostPerShare = round2dp(buy.pricePerUnit);
        const exchangeRate = buy.exchangeRate || 1;

        totalCost += matchCost;
        remainingQty -= matchQty;
        buy.remainingQty -= matchQty;

        matchDetails.push({
          rule: "BED_AND_BREAKFAST",
          quantity: matchQty,
          cost: matchCost,
          costPerShare,
          proceedsPerShare,
          gainPerShare: round2dp(proceedsPerShare - costPerShare),
          acquisitionDate: formatDateLocal(buy.date),
          daysDifference: daysDiff,
          broker: buy.broker,
          isRSU: buy.broker === 'Charles Schwab',
          // Original currency info
          originalCurrency,
          originalCostPerShare,
          exchangeRate,
          // B&B impact analysis
          bnbImpact: {
            s104CostPerShareWouldBe: s104AvgCost,
            actualCostPerShare: costPerShare,
            costDifference: round2dp(costPerShare - s104AvgCost),
            explanation: costPerShare > s104AvgCost
              ? `B&B increased cost basis by £${round2dp(costPerShare - s104AvgCost)}/share (reduced gain)`
              : `B&B decreased cost basis by £${round2dp(s104AvgCost - costPerShare)}/share (increased gain)`,
          },
        });
      }
    }

    // 3. SECTION 104 POOL
    if (remainingQty > 0) {
      const pool = this.section104Pools[symbol];

      const earlierBuys = buys.filter(
        (b) => b.date < disposal.date && b.remainingQty > 0
      );

      for (const buy of earlierBuys) {
        const cost = calculateCost(buy, buy.remainingQty);
        pool.quantity += buy.remainingQty;
        pool.cost += cost;
        buy.remainingQty = 0;
      }

      if (pool.quantity > 0) {
        const matchQty = Math.min(remainingQty, pool.quantity);
        const avgCost = pool.cost / pool.quantity;
        const matchCost = round2dp(matchQty * avgCost);
        const costPerShare = round2dp(avgCost);

        totalCost += matchCost;
        pool.quantity -= matchQty;
        pool.cost -= matchCost;
        remainingQty -= matchQty;

        matchDetails.push({
          rule: "SECTION_104",
          quantity: matchQty,
          cost: matchCost,
          costPerShare,
          proceedsPerShare,
          gainPerShare: round2dp(proceedsPerShare - costPerShare),
          averageCost: round2dp(avgCost),
          poolQuantityBefore: round2dp(pool.quantity + matchQty),
          poolQuantityAfter: round2dp(pool.quantity),
        });
      }
    }

    if (remainingQty > 0) {
      this.errors.push({
        type: "UNMATCHED_DISPOSAL",
        symbol,
date: formatDateLocal(disposal.date),
        unmatchedQuantity: remainingQty,
        message: `Warning: ${remainingQty} shares of ${symbol} sold on ${formatDateLocal(disposal.date)} could not be matched`,
      });
    }

    const gain = round2dp(proceeds - totalCost);
    const taxYear = getTaxYear(disposal.date);
    const costPerShare = disposal.quantity > 0 ? round2dp(totalCost / disposal.quantity) : 0;

    this.disposals.push({
      id: disposal.id,
      symbol,
      assetName: disposal.assetName,
date: formatDateLocal(disposal.date),
      quantity: disposal.quantity,
      proceeds: round2dp(proceeds),
      proceedsPerShare,
      cost: round2dp(totalCost),
      costPerShare,
      gain,
      gainPerShare: round2dp(gain / disposal.quantity),
      taxYear: taxYear.year,
      matchDetails,
      broker: disposal.broker,
    });
  }

  generateReport() {
    const byTaxYear = {};

    for (const disposal of this.disposals) {
      if (!byTaxYear[disposal.taxYear]) {
        byTaxYear[disposal.taxYear] = {
          year: disposal.taxYear,
          config: TAX_YEARS[disposal.taxYear],
          disposals: [],
          totalGains: 0,
          totalLosses: 0,
        };
      }

      byTaxYear[disposal.taxYear].disposals.push(disposal);

      if (disposal.gain >= 0) {
        byTaxYear[disposal.taxYear].totalGains += disposal.gain;
      } else {
        byTaxYear[disposal.taxYear].totalLosses += Math.abs(disposal.gain);
      }
    }

    // Calculate S104 snapshots for each tax year
    const taxYearSnapshots = this.calculateSection104Snapshots();

    const taxYearSummaries = Object.values(byTaxYear).map((yearData) => {
      const netGain = round2dp(yearData.totalGains - yearData.totalLosses);
      const annualExemption = yearData.config?.annualExemption || 3000;
      const taxableGain = Math.max(0, netGain - annualExemption);

      // Check for rate change date (2024/25 tax year)
      const rateChangeDate = yearData.config?.rateChangeDate;
      let preOctGains = 0;
      let preOctLosses = 0;
      let postOctGains = 0;
      let postOctLosses = 0;

      if (rateChangeDate) {
        // Split gains between pre and post 30 October 2024
        for (const disposal of yearData.disposals) {
          const disposalDate = parseDate(disposal.date);
          if (disposalDate < rateChangeDate) {
            if (disposal.gain >= 0) {
              preOctGains += disposal.gain;
            } else {
              preOctLosses += Math.abs(disposal.gain);
            }
          } else {
            if (disposal.gain >= 0) {
              postOctGains += disposal.gain;
            } else {
              postOctLosses += Math.abs(disposal.gain);
            }
          }
        }
      }

      // Get rates based on tax year
      const basicRatePre = yearData.config?.basicRateSharesPre || yearData.config?.basicRateShares || 0.10;
      const higherRatePre = yearData.config?.higherRateSharesPre || yearData.config?.higherRateShares || 0.20;
      const basicRatePost = yearData.config?.basicRateSharesPost || yearData.config?.basicRateShares || 0.18;
      const higherRatePost = yearData.config?.higherRateSharesPost || yearData.config?.higherRateShares || 0.24;

      // Calculate estimated tax with split rates for 2024/25
      let estimatedTaxBasicRate, estimatedTaxHigherRate;

      if (rateChangeDate && (preOctGains > 0 || postOctGains > 0)) {
        // Allocate exemption proportionally to pre/post gains
        const totalGainsForAllocation = preOctGains + postOctGains;
        const preExemption = totalGainsForAllocation > 0
          ? round2dp((preOctGains / totalGainsForAllocation) * Math.min(annualExemption, totalGainsForAllocation))
          : 0;
        const postExemption = totalGainsForAllocation > 0
          ? round2dp((postOctGains / totalGainsForAllocation) * Math.min(annualExemption, totalGainsForAllocation))
          : 0;

        const taxablePreGain = Math.max(0, preOctGains - preOctLosses - preExemption);
        const taxablePostGain = Math.max(0, postOctGains - postOctLosses - postExemption);

        estimatedTaxBasicRate = round2dp(
          (taxablePreGain * basicRatePre) + (taxablePostGain * basicRatePost)
        );
        estimatedTaxHigherRate = round2dp(
          (taxablePreGain * higherRatePre) + (taxablePostGain * higherRatePost)
        );
      } else {
        // Standard calculation for years without rate change
        const basicRate = yearData.config?.basicRateShares || 0.10;
        const higherRate = yearData.config?.higherRateShares || 0.20;
        estimatedTaxBasicRate = round2dp(taxableGain * basicRate);
        estimatedTaxHigherRate = round2dp(taxableGain * higherRate);
      }

      const result = {
        taxYear: yearData.year,
        numberOfDisposals: yearData.disposals.length,
        totalProceeds: round2dp(yearData.disposals.reduce((sum, d) => sum + d.proceeds, 0)),
        totalCost: round2dp(yearData.disposals.reduce((sum, d) => sum + d.cost, 0)),
        totalGains: round2dp(yearData.totalGains),
        totalLosses: round2dp(yearData.totalLosses),
        netGain: round2dp(netGain),
        annualExemption,
        taxableGain: round2dp(taxableGain),
        estimatedTaxBasicRate,
        estimatedTaxHigherRate,
        disposals: yearData.disposals,
        section104Start: taxYearSnapshots[yearData.year]?.start || [],
        section104End: taxYearSnapshots[yearData.year]?.end || [],
      };

      // Add split info for 2024/25 tax year
      if (rateChangeDate) {
        result.rateChange = {
          date: '2024-10-30',
          preOctober: {
            gains: round2dp(preOctGains),
            losses: round2dp(preOctLosses),
            netGain: round2dp(preOctGains - preOctLosses),
            basicRate: basicRatePre,
            higherRate: higherRatePre,
            disposalCount: yearData.disposals.filter(d => parseDate(d.date) < rateChangeDate).length,
          },
          postOctober: {
            gains: round2dp(postOctGains),
            losses: round2dp(postOctLosses),
            netGain: round2dp(postOctGains - postOctLosses),
            basicRate: basicRatePost,
            higherRate: higherRatePost,
            disposalCount: yearData.disposals.filter(d => parseDate(d.date) >= rateChangeDate).length,
          },
        };
      }

      return result;
    }).sort((a, b) => b.taxYear.localeCompare(a.taxYear));

    const section104Summary = Object.entries(this.section104Pools)
      .filter(([_, pool]) => pool.quantity > 0)
      .map(([symbol, pool]) => ({
        symbol,
        quantity: round2dp(pool.quantity),
        totalCost: round2dp(pool.cost),
        averageCost: round2dp(pool.cost / pool.quantity),
      }));

    return {
      generatedAt: new Date().toISOString(),
      taxYears: taxYearSummaries,
      section104Pools: section104Summary,
      allDisposals: this.disposals,
      acquisitions: this.acquisitions,
      errors: this.errors,
      summary: {
        totalDisposals: this.disposals.length,
        totalSymbolsTraded: new Set(this.disposals.map((d) => d.symbol)).size,
        overallGain: round2dp(this.disposals.reduce((sum, d) => sum + d.gain, 0)),
      },
    };
  }

  // Calculate S104 snapshots at start and end of each tax year
  calculateSection104Snapshots() {
    const snapshots = {};

    // Collect all events (acquisitions and disposals) with dates
    const allEvents = [];

    // Add acquisitions
    for (const acq of this.acquisitions) {
      allEvents.push({
        date: parseDate(acq.date),
        type: 'ACQ',
        symbol: acq.symbol,
        quantity: acq.quantity,
        cost: acq.totalCost,
      });
    }

    // Add disposals
    for (const disp of this.disposals) {
      allEvents.push({
        date: parseDate(disp.date),
        type: 'DISP',
        symbol: disp.symbol,
        quantity: disp.quantity,
        cost: disp.cost,
      });
    }

    // Sort by date
    allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Get all unique tax years from disposals
    const taxYears = [...new Set(this.disposals.map(d => d.taxYear))].sort();

    // For each tax year, calculate S104 at start and end
    for (const taxYear of taxYears) {
      const config = TAX_YEARS[taxYear];
      if (!config) continue;

      const yearStart = config.start;
      const yearEnd = config.end;

      // Calculate S104 at start of tax year (process all events before yearStart)
      const s104AtStart = {};
      for (const event of allEvents) {
        if (event.date >= yearStart) break;

        if (!s104AtStart[event.symbol]) {
          s104AtStart[event.symbol] = { quantity: 0, cost: 0 };
        }

        if (event.type === 'ACQ') {
          s104AtStart[event.symbol].quantity += event.quantity;
          s104AtStart[event.symbol].cost += event.cost;
        } else {
          s104AtStart[event.symbol].quantity -= event.quantity;
          s104AtStart[event.symbol].cost -= event.cost;
        }
      }

      // Calculate S104 at end of tax year (process all events up to yearEnd)
      const s104AtEnd = {};
      for (const event of allEvents) {
        if (event.date > yearEnd) break;

        if (!s104AtEnd[event.symbol]) {
          s104AtEnd[event.symbol] = { quantity: 0, cost: 0 };
        }

        if (event.type === 'ACQ') {
          s104AtEnd[event.symbol].quantity += event.quantity;
          s104AtEnd[event.symbol].cost += event.cost;
        } else {
          s104AtEnd[event.symbol].quantity -= event.quantity;
          s104AtEnd[event.symbol].cost -= event.cost;
        }
      }

      // Convert to array format
      snapshots[taxYear] = {
        start: Object.entries(s104AtStart)
          .filter(([_, pool]) => pool.quantity > 0.001)
          .map(([symbol, pool]) => ({
            symbol,
            quantity: round2dp(pool.quantity),
            totalCost: round2dp(pool.cost),
            averageCost: pool.quantity > 0 ? round2dp(pool.cost / pool.quantity) : 0,
          }))
          .sort((a, b) => a.symbol.localeCompare(b.symbol)),
        end: Object.entries(s104AtEnd)
          .filter(([_, pool]) => pool.quantity > 0.001)
          .map(([symbol, pool]) => ({
            symbol,
            quantity: round2dp(pool.quantity),
            totalCost: round2dp(pool.cost),
            averageCost: pool.quantity > 0 ? round2dp(pool.cost / pool.quantity) : 0,
          }))
          .sort((a, b) => a.symbol.localeCompare(b.symbol)),
      };
    }

    return snapshots;
  }
}

export function calculateCGT(transactions) {
  const calculator = new CGTCalculator();
  return calculator.calculate(transactions);
}
