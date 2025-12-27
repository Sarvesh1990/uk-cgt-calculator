import { NextResponse } from 'next/server';
import { parseCSV, parseXLSX, brokerParsers } from '@/lib/csv-parser';
import { calculateCGT } from '@/lib/cgt-engine';
import { fetchHistoricalPricesForTransactions } from '@/lib/historical-price';
import { applyExchangeRates } from '@/lib/exchange-rate';

// Map broker IDs to parser keys
const BROKER_ID_TO_PARSER = {
  'schwab': 'schwab',
  'trading212': 'trading212',
  'morgan-stanley': 'morganStanley',
  'ibkr': 'interactiveBrokers',
  'freetrade': 'freetrade',
  'hl': 'hargreavesLansdown',
  'ig': 'ig',
  'generic': 'generic',
  'other': 'generic',
};

// Map broker IDs to display names
const BROKER_ID_TO_NAME = {
  'schwab': 'Charles Schwab',
  'trading212': 'Trading 212',
  'morgan-stanley': 'Morgan Stanley',
  'ibkr': 'Interactive Brokers',
  'freetrade': 'Freetrade',
  'hl': 'Hargreaves Lansdown',
  'ig': 'IG',
  'generic': 'Generic CSV',
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

    const report = calculateCGT(allTransactions);

    return NextResponse.json({
      success: true,
      parsedFiles,
      totalTransactions: allTransactions.length,
      report,
    });

  } catch (error) {
    console.error('Calculation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process files' },
      { status: 500 }
    );
  }
}
