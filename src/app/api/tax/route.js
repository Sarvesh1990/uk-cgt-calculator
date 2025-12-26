import { NextResponse } from 'next/server';
import { calculateFullTax } from '@/lib/tax-engine';

export async function POST(request) {
  try {
    const data = await request.json();

    const {
      taxYear,
      grossPay,
      taxPaid,
      niPaid,
      pensionContributions,
      capitalGains,
      capitalGainsSplit,
      incomeSkipped,
      studentLoanPlan,
      additionalIncome,
    } = data;

    // Validate required fields
    if (!taxYear) {
      return NextResponse.json(
        { error: 'Tax year is required' },
        { status: 400 }
      );
    }

    // Calculate full tax
    const result = calculateFullTax({
      taxYear,
      grossPay: parseFloat(grossPay) || 0,
      taxPaid: parseFloat(taxPaid) || 0,
      niPaid: parseFloat(niPaid) || 0,
      pensionContributions: parseFloat(pensionContributions) || 0,
      capitalGains: parseFloat(capitalGains) || 0,
      capitalGainsSplit,
      incomeSkipped,
      studentLoanPlan,
      additionalIncome: parseFloat(additionalIncome) || 0,
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('Tax calculation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to calculate tax' },
      { status: 500 }
    );
  }
}
