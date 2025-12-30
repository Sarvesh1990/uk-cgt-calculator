import { NextResponse } from 'next/server';
import { parseCSV, parseXLSX, brokerParsers, dividendParsers } from '@/lib/csv-parser';
import { calculateCGT } from '@/lib/cgt-engine';
import { fetchHistoricalPricesForTransactions } from '@/lib/historical-price';
import { applyExchangeRates } from '@/lib/exchange-rate';

// Map broker IDs to parser keys
const BROKER_ID_TO_PARSER = {
  'schwab': 'schwab',
  'trading212': 'trading212',
  'morgan-stanley': 'morganStanley',
  'freetrade': 'freetrade',
  'other': 'generic',
};

// Map broker IDs to display names
const BROKER_ID_TO_NAME = {
  'schwab': 'Charles Schwab',
  'trading212': 'Trading 212',
  'morgan-stanley': 'Morgan Stanley',
  'freetrade': 'Freetrade',
  'other': 'Other',
};

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files');
    const brokers = formData.getAll('brokers'); // Get broker IDs for each file

    console.log('Files received:', files.length);
    console.log('Brokers received:', brokers);

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files uploaded' },
        { status: 400 }
      );
    }

    let allTransactions = [];
    const parsedFiles = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const brokerId = brokers[i] || 'other'; // Get corresponding broker ID
      const fileName = file.name?.toLowerCase() || '';
      const isXLSX = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

      // Get the parser for this broker
      const parserKey = BROKER_ID_TO_PARSER[brokerId] || 'generic';
      const parser = brokerParsers[parserKey];
      const brokerName = BROKER_ID_TO_NAME[brokerId] || 'Unknown';

      console.log(`Processing file: ${file.name} with broker: ${brokerName} (${brokerId})`);

      let headers, rows;

      if (isXLSX) {
        // Handle XLSX/XLS files
        const buffer = await file.arrayBuffer();
        const parsed = parseXLSX(buffer);
        headers = parsed.headers;
        rows = parsed.rows;
      } else {
        // Handle CSV files
        let content;
        if (typeof file === 'string') {
          content = file;
        } else if (file instanceof Blob || file instanceof File) {
          content = await file.text();
        } else {
          console.log('Unknown file type:', typeof file, file);
          continue;
        }

        if (!content || content.trim().length === 0) {
          console.log('Empty file content for:', file.name);
          continue;
        }

        // Remove BOM if present
        if (content.charCodeAt(0) === 0xFEFF) {
          content = content.slice(1);
        }

        const parsed = parseCSV(content);
        headers = parsed.headers;
        rows = parsed.rows;
      }

      console.log('Parsed headers:', headers);
      console.log('Parsed rows count:', rows.length);

      if (headers.length === 0 || rows.length === 0) {
        console.log(`File ${file.name} is empty or invalid`);
        continue;
      }

      // Use the selected broker's parser
      let transactions;
      try {
        transactions = parser.parse(rows, headers);

        // Override broker name with the user-selected broker
        transactions = transactions.map(t => ({
          ...t,
          broker: brokerName,
        }));
      } catch (parseError) {
        console.error(`Error parsing file ${file.name} with ${brokerName} parser:`, parseError);
        // Fall back to generic parser
        transactions = brokerParsers.generic.parse(rows, headers);
        transactions = transactions.map(t => ({
          ...t,
          broker: brokerName,
        }));
      }

      parsedFiles.push({
        filename: file.name,
        broker: brokerName,
        transactionCount: transactions.length,
      });

      allTransactions = allTransactions.concat(transactions);
    }

    if (allTransactions.length === 0) {
      return NextResponse.json(
        { error: 'No valid transactions found in uploaded files' },
        { status: 400 }
      );
    }

    // Now parse dividends from the same files
    let allDividends = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const brokerId = brokers[i] || 'other';
      const fileName = file.name?.toLowerCase() || '';
      const isXLSX = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

      const parserKey = BROKER_ID_TO_PARSER[brokerId] || 'generic';
      const dividendParser = dividendParsers[parserKey] || dividendParsers.generic;
      const brokerName = BROKER_ID_TO_NAME[brokerId] || 'Unknown';

      let headers, rows;

      try {
        if (isXLSX) {
          const buffer = await file.arrayBuffer();
          const parsed = parseXLSX(buffer);
          headers = parsed.headers;
          rows = parsed.rows;
        } else {
          let content;
          if (typeof file === 'string') {
            content = file;
          } else if (file instanceof Blob || file instanceof File) {
            content = await file.text();
          } else {
            continue;
          }

          if (!content || content.trim().length === 0) continue;

          if (content.charCodeAt(0) === 0xFEFF) {
            content = content.slice(1);
          }

          const parsed = parseCSV(content);
          headers = parsed.headers;
          rows = parsed.rows;
        }

        if (dividendParser.detect(headers)) {
          let dividends = dividendParser.parse(rows, headers);
          dividends = dividends.map(d => ({ ...d, broker: brokerName }));
          allDividends = allDividends.concat(dividends);
        }
      } catch (err) {
        console.error(`Error parsing dividends from ${file.name}:`, err);
      }
    }

    console.log(`[API] Found ${allDividends.length} dividend transactions`);

    // Fetch historical prices for RSU vesting transactions (Schwab Stock Plan Activity)
    const transactionsNeedingPrice = allTransactions.filter(txn => txn.needsHistoricalPrice);
    if (transactionsNeedingPrice.length > 0) {
      console.log(`[API] Fetching historical prices for ${transactionsNeedingPrice.length} RSU vesting transactions...`);
      allTransactions = await fetchHistoricalPricesForTransactions(allTransactions);

      // Log any transactions that still have missing prices
      const missingPrices = allTransactions.filter(txn => txn.priceMissing);
      if (missingPrices.length > 0) {
        console.warn(`[API] ${missingPrices.length} transactions have missing prices:`,
          missingPrices.map(txn => `${txn.symbol} on ${txn.date}`));
      }
    }

    // Fetch exchange rates for USD transactions
    console.log('[API] Applying exchange rates for USD transactions...');
    allTransactions = await applyExchangeRates(allTransactions);

    // Apply exchange rates to dividends too
    if (allDividends.length > 0) {
      console.log('[API] Applying exchange rates for USD dividends...');
      allDividends = await applyExchangeRates(allDividends.map(d => ({
        ...d,
        date: d.date,
        currency: d.currency,
        totalAmount: d.netAmount,
      })));

      // Convert back and update amountGBP
      allDividends = allDividends.map(d => ({
        ...d,
        // exchangeRate is stored as (1/rate), so we divide by it to convert USD to GBP
        // e.g., if rate is 0.79 GBP per USD, exchangeRate is 1/0.79 = 1.266
        // so USD 100 / 1.266 = GBP 78.99
        amountGBP: d.currency === 'GBP' ? d.netAmount : (d.netAmount / (d.exchangeRate || 1)),
      }));
    }

    // Calculate dividend summary by tax year
    const dividendSummary = {};
    for (const dividend of allDividends) {
      // Parse date and determine tax year
      let dateStr = dividend.date;
      let parsedDate;

      if (dateStr.includes('/')) {
        // Handle MM/DD/YYYY format
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          parsedDate = new Date(parts[2], parts[0] - 1, parts[1]);
        }
      } else if (dateStr.includes('-')) {
        parsedDate = new Date(dateStr);
      } else {
        parsedDate = new Date(dateStr);
      }

      if (isNaN(parsedDate)) continue;

      const year = parsedDate.getFullYear();
      const month = parsedDate.getMonth(); // 0-11
      const day = parsedDate.getDate();

      // UK tax year runs April 6 to April 5
      let taxYear;
      if (month < 3 || (month === 3 && day < 6)) {
        taxYear = `${year - 1}/${year.toString().slice(-2)}`;
      } else {
        taxYear = `${year}/${(year + 1).toString().slice(-2)}`;
      }

      if (!dividendSummary[taxYear]) {
        dividendSummary[taxYear] = {
          taxYear,
          ukDividends: 0,
          foreignDividends: 0,
          totalDividends: 0,
          withholdingTax: 0,
          dividendCount: 0,
          dividends: [],
        };
      }

      const amountGBP = dividend.amountGBP || dividend.netAmount;

      if (dividend.source === 'UK') {
        dividendSummary[taxYear].ukDividends += amountGBP;
      } else {
        dividendSummary[taxYear].foreignDividends += amountGBP;
      }

      dividendSummary[taxYear].totalDividends += amountGBP;
      dividendSummary[taxYear].withholdingTax += dividend.withholdingTax || 0;
      dividendSummary[taxYear].dividendCount += 1;
      dividendSummary[taxYear].dividends.push({
        ...dividend,
        amountGBP,
        taxYear,
      });
    }

    const report = calculateCGT(allTransactions);

    return NextResponse.json({
      success: true,
      parsedFiles,
      totalTransactions: allTransactions.length,
      report,
      dividends: {
        total: allDividends.length,
        byTaxYear: Object.values(dividendSummary),
      },
    });

  } catch (error) {
    console.error('Calculation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process files' },
      { status: 500 }
    );
  }
}
