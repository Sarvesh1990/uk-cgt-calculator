/**
 * UK Capital Gains Tax Calculator Engine
 * Implements HMRC share matching rules:
 * 1. Same-day rule - Match with acquisitions on the same day
 * 2. Bed and Breakfast rule - Match with acquisitions within 30 days AFTER disposal
 * 3. Section 104 Pool - Average cost basis for remaining shares
 */

export const TAX_YEARS = {
  "2024/25": {
    start: new Date("2024-04-06"),
    end: new Date("2025-04-05"),
    annualExemption: 3000,
    basicRateShares: 0.10,
    higherRateShares: 0.20,
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
};

function parseDate(dateStr) {
  if (dateStr instanceof Date) return dateStr;

  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})/,
    /^(\d{2})\/(\d{2})\/(\d{4})/,
    /^(\d{2})-(\d{2})-(\d{4})/,
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[0]) {
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      } else {
        return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
      }
    }
  }

  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;

  throw new Error(`Unable to parse date: ${dateStr}`);
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
  return { year: "2024/25", ...TAX_YEARS["2024/25"] };
}

function round2dp(num) {
  return Math.round(num * 100) / 100;
}

function normalizeTransactions(transactions) {
  return transactions
    .map((t, index) => ({
      id: `txn-${index}-${Date.now()}`,
      date: parseDate(t.date),
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
    }))
    .filter((t) => t.quantity > 0)
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
    this.disposals = [];
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

    const buys = transactions.filter((t) => t.type === "BUY");
    const sells = transactions.filter((t) => t.type === "SELL");

    for (const disposal of sells) {
      this.processDisposal(symbol, disposal, buys, transactions);
    }

    for (const buy of buys) {
      if (buy.remainingQty > 0) {
        const cost = calculateCost(buy, buy.remainingQty);
        this.section104Pools[symbol].quantity += buy.remainingQty;
        this.section104Pools[symbol].cost += cost;
      }
    }
  }

  processDisposal(symbol, disposal, buys) {
    let remainingQty = disposal.quantity;
    const proceeds = calculateProceeds(disposal, disposal.quantity);
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

      totalCost += matchCost;
      remainingQty -= matchQty;
      buy.remainingQty -= matchQty;

      matchDetails.push({
        rule: "SAME_DAY",
        quantity: matchQty,
        cost: matchCost,
        acquisitionDate: buy.date.toISOString().split('T')[0],
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

        totalCost += matchCost;
        remainingQty -= matchQty;
        buy.remainingQty -= matchQty;

        matchDetails.push({
          rule: "BED_AND_BREAKFAST",
          quantity: matchQty,
          cost: matchCost,
          acquisitionDate: buy.date.toISOString().split('T')[0],
          daysDifference: getDaysDifference(disposal.date, buy.date),
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

        totalCost += matchCost;
        pool.quantity -= matchQty;
        pool.cost -= matchCost;
        remainingQty -= matchQty;

        matchDetails.push({
          rule: "SECTION_104",
          quantity: matchQty,
          cost: matchCost,
          averageCost: round2dp(avgCost),
        });
      }
    }

    if (remainingQty > 0) {
      this.errors.push({
        type: "UNMATCHED_DISPOSAL",
        symbol,
        date: disposal.date.toISOString().split('T')[0],
        unmatchedQuantity: remainingQty,
        message: `Warning: ${remainingQty} shares of ${symbol} sold on ${disposal.date.toISOString().split('T')[0]} could not be matched`,
      });
    }

    const gain = round2dp(proceeds - totalCost);
    const taxYear = getTaxYear(disposal.date);

    this.disposals.push({
      id: disposal.id,
      symbol,
      assetName: disposal.assetName,
      date: disposal.date.toISOString().split('T')[0],
      quantity: disposal.quantity,
      proceeds: round2dp(proceeds),
      cost: round2dp(totalCost),
      gain,
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

    const taxYearSummaries = Object.values(byTaxYear).map((yearData) => {
      const netGain = round2dp(yearData.totalGains - yearData.totalLosses);
      const annualExemption = yearData.config?.annualExemption || 3000;
      const taxableGain = Math.max(0, netGain - annualExemption);

      const basicRate = yearData.config?.basicRateShares || 0.10;
      const higherRate = yearData.config?.higherRateShares || 0.20;

      return {
        taxYear: yearData.year,
        numberOfDisposals: yearData.disposals.length,
        totalProceeds: round2dp(yearData.disposals.reduce((sum, d) => sum + d.proceeds, 0)),
        totalCost: round2dp(yearData.disposals.reduce((sum, d) => sum + d.cost, 0)),
        totalGains: round2dp(yearData.totalGains),
        totalLosses: round2dp(yearData.totalLosses),
        netGain: round2dp(netGain),
        annualExemption,
        taxableGain: round2dp(taxableGain),
        estimatedTaxBasicRate: round2dp(taxableGain * basicRate),
        estimatedTaxHigherRate: round2dp(taxableGain * higherRate),
        disposals: yearData.disposals,
      };
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
      errors: this.errors,
      summary: {
        totalDisposals: this.disposals.length,
        totalSymbolsTraded: new Set(this.disposals.map((d) => d.symbol)).size,
        overallGain: round2dp(this.disposals.reduce((sum, d) => sum + d.gain, 0)),
      },
    };
  }
}

export function calculateCGT(transactions) {
  const calculator = new CGTCalculator();
  return calculator.calculate(transactions);
}
