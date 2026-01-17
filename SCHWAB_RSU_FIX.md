# Schwab RSU Vesting Price Fix

## Problem

The vesting price for Meta RSUs from Schwab accounts was incorrect. The calculator was using the closing price from the vesting date itself, but Schwab uses the closing price from the **previous trading day (T-1)** before the vesting date.

## Root Cause

Schwab CSV exports show RSU vestings with dates in the format:
```
11/18/2025 as of 11/17/2025
```

Where:
- The first date (11/18/2025) is the transaction date
- The "as of" date (11/17/2025) is the effective vesting date

**Schwab's cost basis = Closing price on the day BEFORE the "as of" date**

For example:
- CSV shows: "11/18/2025 as of 11/17/2025"
- Schwab uses: Closing price from 11/16/2025 (T-1)

## Solution

Updated the logic in two files:

### 1. csv-parser.js (Schwab Parser)

When parsing Schwab RSU vesting transactions (Stock Plan Activity), the code now:
1. Extracts the "as of" date
2. Calculates T-1 (one day before the "as of" date)
3. Stores this T-1 date in a new field `historicalPriceDate`
4. Uses this date for fetching the historical price

```javascript
// For RSU vestings, Schwab uses the PREVIOUS trading day's closing price (T-1)
if (needsHistoricalPrice) {
  const asOfDateObj = new Date(asOfDate);
  asOfDateObj.setDate(asOfDateObj.getDate() - 1); // Go back 1 day
  dateForHistoricalPrice = asOfDateObj.toLocaleDateString('en-US', { 
    month: '2-digit', day: '2-digit', year: 'numeric' 
  });
}
```

### 2. historical-price.js

Updated the price fetching logic to use `historicalPriceDate` when provided:

```javascript
// Use historicalPriceDate if provided (for Schwab RSU T-1 logic), otherwise use transaction date
const dateToFetch = txn.historicalPriceDate || txn.date;
```

## Verification

This fix is based on analysis from the stock-portfolio-app which correctly implements this logic. The verification shows that:

- 11/15/2025 vesting → uses 11/14/2025 close price
- 08/15/2025 vesting → uses 08/14/2025 close price
- 05/15/2025 vesting → uses 05/14/2025 close price
- 02/15/2025 vesting → uses 02/14/2025 close price

## Impact

- Only affects Schwab RSU vesting transactions (Stock Plan Activity)
- Regular buy/sell transactions are not affected
- Dividends are not affected
- The transaction date remains the "as of" date for reporting purposes
- Only the price fetching uses the T-1 date

## Files Modified

1. `/src/lib/csv-parser.js` - Schwab parser logic
2. `/src/lib/historical-price.js` - Historical price fetching logic

## Testing

To test:
1. Upload a Schwab CSV with RSU vestings (Stock Plan Activity)
2. Check the console logs for: `[SCHWAB] RSU vesting "as of" X - will fetch T-1 price from Y`
3. Verify the fetched price matches Schwab's Lot Details cost basis
