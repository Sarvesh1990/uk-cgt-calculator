import { NextResponse } from 'next/server';
import { detectAndParseCSV } from '@/lib/csv-parser';
import { calculateCGT } from '@/lib/cgt-engine';
import { fetchHistoricalPricesForTransactions } from '@/lib/historical-price';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files');

    console.log('Files received:', files.length);

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files uploaded' },
        { status: 400 }
      );
    }

    let allTransactions = [];
    const parsedFiles = [];

    for (const file of files) {
      // Handle both File objects and Blob objects
      let content;
      if (typeof file === 'string') {
        content = file;
      } else if (file instanceof Blob || file instanceof File) {
        content = await file.text();
      } else {
        console.log('Unknown file type:', typeof file, file);
        continue;
      }

      console.log('File content length:', content?.length, 'First 100 chars:', content?.substring(0, 100));

      if (!content || content.trim().length === 0) {
        console.log('Empty file content for:', file.name);
        continue;
      }

      const { broker, transactions } = detectAndParseCSV(content);

      parsedFiles.push({
        filename: file.name,
        broker,
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
