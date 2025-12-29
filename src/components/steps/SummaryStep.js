'use client';

import { useState, useEffect, useRef } from 'react';
import { formatCurrency } from '@/lib/constants';
import FeedbackWidget from '@/components/ui/FeedbackWidget';
import { trackStepCompleted, trackEditIncome, trackEditCGT } from '@/lib/analytics';
import { trackSummaryReached } from '@/lib/meta-pixel';

export default function SummaryStep({ taxYear, incomeData, cgtResult, interestData, onStartOver, onEditStep }) {
  const [taxCalc, setTaxCalc] = useState(null);
  const [loading, setLoading] = useState(true);
  const pixelFired = useRef(false);

  const yearData = cgtResult?.report?.taxYears?.find(y => y.taxYear === taxYear);
  const hasIncome = !incomeData.skipped && parseFloat(incomeData.grossPay) > 0;

  useEffect(() => {
    calculateTax();
    // Track reaching the final step
    trackStepCompleted(5, { taxYear, hasIncome, hasCGT: !!yearData });
  }, [taxYear, incomeData, cgtResult]);

  // Fire Meta Pixel event after tax calculation completes (only once)
  useEffect(() => {
    if (taxCalc && !pixelFired.current) {
      pixelFired.current = true;
      const totalBalance = taxCalc?.summary?.balanceToPay || (taxCalc?.capitalGainsTax?.tax || 0);
      trackSummaryReached({
        taxYear,
        hasIncome,
        hasCGT: !!yearData,
        totalBalance,
      });
    }
  }, [taxCalc, taxYear, hasIncome, yearData]);

  const calculateTax = async () => {
    setLoading(true);

    const grossPay = parseFloat(incomeData.grossPay) || 0;
    const taxPaid = parseFloat(incomeData.taxPaid) || 0;
    const niPaid = parseFloat(incomeData.niPaid) || 0;
    const pensionContributions = parseFloat(incomeData.pensionContributions) || 0;

    let capitalGains = 0;
    let capitalGainsSplit = { pre: 0, post: 0 };

    if (yearData) {
      capitalGains = yearData.netGain;
      if (yearData.rateChange) {
        capitalGainsSplit = {
          pre: yearData.rateChange.preOctober.netGain,
          post: yearData.rateChange.postOctober.netGain,
        };
      } else {
        capitalGainsSplit.pre = yearData.netGain;
      }
    }

    try {
      const res = await fetch('/api/tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taxYear,
          grossPay,
          taxPaid,
          niPaid,
          pensionContributions,
          capitalGains,
          capitalGainsSplit,
          incomeSkipped: incomeData.skipped,
        }),
      });
      const data = await res.json();
      if (res.ok) setTaxCalc(data);
    } catch (err) {
      console.error('Tax calculation error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
        <p className="text-slate-400">Calculating...</p>
      </div>
    );
  }

  const summary = taxCalc?.summary;
  const hasCGTData = !!yearData; // Has CGT data (even if no taxable gain)
  const hasTaxableGain = yearData && yearData.taxableGain > 0;
  const totalBalance = summary?.balanceToPay || (taxCalc?.capitalGainsTax?.tax || 0);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">🧮 Tax Summary</h2>
        <p className="text-slate-400">Tax Year {taxYear}</p>
      </div>

      {/* Income Summary */}
      {hasIncome && summary && (
        <Section title="📊 Income Summary">
          <Row label="Gross Pay" value={summary.totalGrossIncome} />
          {summary.pensionContributions > 0 && <Row label="Pension" value={-summary.pensionContributions} />}
          <Row label="Personal Allowance" value={-summary.personalAllowance} />
          <Row label="Taxable Income" value={summary.taxableIncome} bold />
        </Section>
      )}

      {/* Income Tax */}
      {hasIncome && taxCalc?.incomeTax && (
        <Section title="💰 Income Tax">
          {taxCalc.incomeTax.breakdown.map((band, i) => (
            <Row key={i} label={`${band.band} (${(band.rate*100)}%)`} value={band.tax} />
          ))}
          <div className="border-t border-slate-600 my-2" />
          <Row label="Tax Due" value={summary.incomeTaxDue} bold />
          <Row label="Tax Paid (PAYE)" value={-summary.incomeTaxPaid} />
          <Row
            label="Balance"
            value={summary.incomeTaxBalance}
            bold
            color={summary.incomeTaxBalance < 0 ? 'green' : summary.incomeTaxBalance > 0 ? 'red' : ''}
          />
        </Section>
      )}

      {/* NI */}
      {hasIncome && taxCalc?.nationalInsurance && (
        <Section title="🛡️ National Insurance">
          {taxCalc.nationalInsurance.breakdown.map((band, i) => (
            <Row key={i} label={`${band.band} (${(band.rate*100)}%)`} value={band.ni} />
          ))}
          <div className="border-t border-slate-600 my-2" />
          <Row label="NI Due" value={summary.nationalInsuranceDue} />
          <Row label="NI Paid" value={-summary.nationalInsurancePaid} />
          <Row label="Balance" value={summary.niBalance} bold />
        </Section>
      )}

      {/* CGT */}
      {hasCGTData && (
        <Section title="📈 Capital Gains Tax">
          <Row label="Total Gains" value={yearData.totalGains} color="green" />
          <Row label="Total Losses" value={-yearData.totalLosses} color="red" />
          <Row label="Net Gain" value={yearData.netGain} bold />
          <Row label="Annual Exemption" value={-yearData.annualExemption} />
          <Row label="Taxable Gains" value={yearData.taxableGain} bold />

          {/* Show message if gains are within exemption */}
          {!hasTaxableGain && yearData.netGain > 0 && (
            <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3 my-3">
              <p className="text-green-400 text-sm">
                ✅ Your net gains ({formatCurrency(yearData.netGain)}) are within the £{yearData.annualExemption.toLocaleString()} annual exemption - no CGT to pay!
              </p>
            </div>
          )}

          {/* Show message if there was a net loss */}
          {yearData.netGain < 0 && (
            <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 my-3">
              <p className="text-blue-400 text-sm">
                📉 You made a net loss of {formatCurrency(Math.abs(yearData.netGain))}. This can be carried forward to offset future gains.
              </p>
            </div>
          )}

          {/* Show message if exactly breakeven */}
          {yearData.netGain === 0 && yearData.totalGains === 0 && (
            <div className="bg-slate-800/50 rounded-lg p-3 my-3">
              <p className="text-slate-400 text-sm">
                No gains or losses recorded for this tax year.
              </p>
            </div>
          )}

          {hasTaxableGain && (
            <>
              <div className="border-t border-slate-600 my-3" />

          {/* Rate determination explanation */}
          {hasIncome && summary && (
            <div className="bg-slate-800/50 rounded-lg p-3 my-2">
              <p className="text-sm text-slate-300 mb-1">
                <span className="text-slate-400">Your taxable income:</span> {formatCurrency(summary.taxableIncome)}
              </p>
              <p className="text-sm text-slate-300 mb-1">
                <span className="text-slate-400">Basic rate band:</span> £37,700
              </p>
              <p className="text-sm font-medium">
                {summary.taxableIncome > 37700
                  ? <span className="text-orange-400">→ Higher rate CGT applies (income exceeds basic rate band)</span>
                  : <span className="text-green-400">→ Basic rate CGT applies (income within basic rate band)</span>
                }
              </p>
            </div>
          )}

          {incomeData.skipped && (
            <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-3 my-2">
              <p className="text-amber-400 text-sm">⚠️ Income not provided - using higher rate estimates</p>
            </div>
          )}

          {/* 2024/25 Split rate calculation */}
          {yearData.rateChange && (
            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3 my-2">
              <p className="text-blue-400 font-medium text-sm mb-2">⚠️ 2024/25 Split Rate Calculation</p>
              <p className="text-slate-400 text-xs mb-3">CGT rates changed on 30 Oct 2024. Your gains are calculated separately for each period.</p>

              <div className="space-y-3">
                {/* Pre-October */}
                <div className="bg-slate-800/50 rounded p-2">
                  <p className="text-slate-300 text-xs font-medium mb-1">Before 30 Oct (10%/20%)</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Net gain:</span>
                      <span className="text-white ml-1">{formatCurrency(yearData.rateChange.preOctober.netGain)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Rate:</span>
                      <span className="text-white ml-1">
                        {hasIncome && summary?.taxableIncome <= 37700 ? '10%' : '20%'}
                      </span>
                    </div>
                  </div>
                  {taxCalc?.capitalGainsTax?.preOctTax !== undefined && (
                    <div className="text-xs mt-1">
                      <span className="text-slate-500">Tax:</span>
                      <span className="text-orange-400 ml-1 font-medium">{formatCurrency(taxCalc.capitalGainsTax.preOctTax)}</span>
                    </div>
                  )}
                </div>

                {/* Post-October */}
                <div className="bg-slate-800/50 rounded p-2">
                  <p className="text-slate-300 text-xs font-medium mb-1">From 30 Oct (18%/24%)</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Net gain:</span>
                      <span className="text-white ml-1">{formatCurrency(yearData.rateChange.postOctober.netGain)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Rate:</span>
                      <span className="text-white ml-1">
                        {hasIncome && summary?.taxableIncome <= 37700 ? '18%' : '24%'}
                      </span>
                    </div>
                  </div>
                  {taxCalc?.capitalGainsTax?.postOctTax !== undefined && (
                    <div className="text-xs mt-1">
                      <span className="text-slate-500">Tax:</span>
                      <span className="text-orange-400 ml-1 font-medium">{formatCurrency(taxCalc.capitalGainsTax.postOctTax)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Standard breakdown for non-split years */}
          {!yearData.rateChange && taxCalc?.capitalGainsTax?.breakdown?.map((band, i) => (
            <Row key={i} label={band.band} value={band.tax} />
          ))}

          <div className="border-t border-slate-600 my-2" />
          <Row label="CGT Due" value={taxCalc?.capitalGainsTax?.tax || yearData.estimatedTaxHigherRate} bold color="red" />
            </>
          )}
        </Section>
      )}

      {!hasCGTData && (
        <Section title="📈 Capital Gains Tax">
          <p className="text-slate-400 text-center py-4">No CGT data for this tax year</p>
        </Section>
      )}

      {/* Dividends Section */}
      {cgtResult?.dividends?.byTaxYear?.find(d => d.taxYear === taxYear) && (
        <DividendSummarySection
          dividendData={cgtResult.dividends.byTaxYear.find(d => d.taxYear === taxYear)}
          taxYear={taxYear}
          taxableIncome={summary?.taxableIncome || 0}
        />
      )}

      {/* Interest Income Section */}
      {interestData && !interestData.skipped && (interestData.ukInterest > 0 || interestData.foreignInterest > 0) && (
        <InterestIncomeSummarySection
          interestData={interestData}
          taxableIncome={summary?.taxableIncome || 0}
        />
      )}

      {/* Total */}
      <div className="bg-slate-700 rounded-xl p-6 text-center">
        <p className="text-slate-400 mb-2">Total Balance</p>
        <p className={`text-4xl font-bold ${totalBalance < 0 ? 'text-green-400' : 'text-red-400'}`}>
          {formatCurrency(Math.abs(totalBalance))}
        </p>
        <p className={`text-sm mt-1 ${totalBalance < 0 ? 'text-green-400' : 'text-red-400'}`}>
          {totalBalance < 0 ? '🎉 Refund Due' : '💳 To Pay'}
        </p>
      </div>

      {/* Edit Previous Steps */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
        <h3 className="text-white font-medium mb-3">📝 Need to make changes?</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => { trackEditIncome(); onEditStep(2); }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 rounded-lg text-slate-300 hover:text-white transition-all text-sm"
          >
            <span>💼</span>
            <span>Edit Income</span>
          </button>
          <button
            onClick={() => { trackEditCGT(); onEditStep(3); }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 rounded-lg text-slate-300 hover:text-white transition-all text-sm"
          >
            <span>📈</span>
            <span>Edit Capital Gains</span>
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap justify-center gap-3 pt-4">
        <button onClick={onStartOver} className="px-4 py-2 text-slate-400 hover:text-white">← Start Over</button>
      </div>

      <p className="text-amber-400/70 text-xs text-center">
        ⚠️ For guidance only - verify with a qualified tax professional
      </p>

      {/* Feedback Widget */}
      <FeedbackWidget
        taxYear={taxYear}
        hadIncome={hasIncome}
        hadCGT={!!yearData}
      />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-slate-700/50 rounded-xl p-4">
      <h3 className="text-white font-semibold mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, bold, color }) {
  const textColor = color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-400' : 'text-white';
  return (
    <div className="flex justify-between text-sm">
      <span className={bold ? 'text-white font-medium' : 'text-slate-400'}>{label}</span>
      <span className={`${textColor} ${bold ? 'font-semibold' : ''}`}>{formatCurrency(value)}</span>
    </div>
  );
}

function DividendSummarySection({ dividendData, taxYear, taxableIncome }) {
  if (!dividendData || dividendData.totalDividends === 0) {
    return null;
  }

  // UK dividend allowance for 2024/25
  const DIVIDEND_ALLOWANCE = 500;

  // Calculate taxable dividends
  const taxableDividends = Math.max(0, dividendData.totalDividends - DIVIDEND_ALLOWANCE);

  // Determine dividend tax rate based on taxable income
  // Basic rate band extends to £37,700 of taxable income
  const BASIC_RATE_LIMIT = 37700;
  const HIGHER_RATE_LIMIT = 125140;

  let dividendTax = 0;
  let rateUsed = '';
  let ratePercent = 0;

  if (taxableDividends > 0) {
    if (taxableIncome <= BASIC_RATE_LIMIT) {
      ratePercent = 8.75;
      rateUsed = 'Basic rate';
    } else if (taxableIncome <= HIGHER_RATE_LIMIT) {
      ratePercent = 33.75;
      rateUsed = 'Higher rate';
    } else {
      ratePercent = 39.35;
      rateUsed = 'Additional rate';
    }
    dividendTax = taxableDividends * (ratePercent / 100);
  }

  return (
    <Section title="💰 Dividend Income">
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span>🇬🇧</span>
            <span className="text-slate-400 text-xs">UK Dividends</span>
          </div>
          <p className="text-white font-bold">{formatCurrency(dividendData.ukDividends)}</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span>🌍</span>
            <span className="text-slate-400 text-xs">Foreign Dividends</span>
          </div>
          <p className="text-white font-bold">{formatCurrency(dividendData.foreignDividends)}</p>
          {dividendData.withholdingTax > 0 && (
            <p className="text-amber-400 text-xs mt-1">
              Withholding: {formatCurrency(dividendData.withholdingTax)}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-slate-600 pt-3 space-y-2">
        <Row label="Total Dividends" value={dividendData.totalDividends} bold />
        <Row label="Dividend Allowance" value={-DIVIDEND_ALLOWANCE} />
        <Row label="Taxable Dividends" value={taxableDividends} bold />

        {taxableDividends > 0 && (
          <>
            <div className="bg-slate-800/50 rounded-lg p-2 my-2">
              <p className="text-sm text-slate-400">
                <span className="text-white font-medium">{rateUsed}</span> dividend tax ({ratePercent}%)
              </p>
            </div>
            <Row label="Dividend Tax Due" value={dividendTax} bold color="red" />
          </>
        )}

        {taxableDividends === 0 && (
          <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3 mt-2">
            <p className="text-green-400 text-sm">
              ✅ Your dividends are within the £{DIVIDEND_ALLOWANCE} tax-free allowance
            </p>
          </div>
        )}
      </div>

      {dividendData.withholdingTax > 0 && (
        <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 mt-3">
          <p className="text-blue-400 text-sm">
            💡 You may be able to claim foreign tax credit relief for the {formatCurrency(dividendData.withholdingTax)}
            {' '}withholding tax paid on foreign dividends.
          </p>
        </div>
      )}
    </Section>
  );
}

function InterestIncomeSummarySection({ interestData, taxableIncome }) {
  const totalInterest = interestData.ukInterest + interestData.foreignInterest;
  
  if (totalInterest === 0) {
    return null;
  }

  // Personal Savings Allowance based on tax band
  const BASIC_RATE_LIMIT = 37700;
  const HIGHER_RATE_LIMIT = 125140;
  
  let PSA = 0;
  let rateUsed = '';
  let taxRate = 0;

  if (taxableIncome <= BASIC_RATE_LIMIT) {
    PSA = 1000;
    rateUsed = 'Basic rate';
    taxRate = 20;
  } else if (taxableIncome <= HIGHER_RATE_LIMIT) {
    PSA = 500;
    rateUsed = 'Higher rate';
    taxRate = 40;
  } else {
    PSA = 0;
    rateUsed = 'Additional rate';
    taxRate = 45;
  }

  const taxableInterest = Math.max(0, totalInterest - PSA);
  const interestTax = taxableInterest * (taxRate / 100);

  return (
    <Section title="💰 Interest Income">
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span>🇬🇧</span>
            <span className="text-slate-400 text-xs">UK Interest</span>
          </div>
          <p className="text-white font-bold">{formatCurrency(interestData.ukInterest)}</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span>🌍</span>
            <span className="text-slate-400 text-xs">Foreign Interest</span>
          </div>
          <p className="text-white font-bold">{formatCurrency(interestData.foreignInterest)}</p>
          {interestData.foreignTaxPaid > 0 && (
            <p className="text-amber-400 text-xs mt-1">
              Tax paid: {formatCurrency(interestData.foreignTaxPaid)}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-slate-600 pt-3 space-y-2">
        <Row label="Total Interest" value={totalInterest} bold />
        <Row label={`Personal Savings Allowance (${rateUsed})`} value={-PSA} />
        <Row label="Taxable Interest" value={taxableInterest} bold />

        {taxableInterest > 0 && (
          <>
            <div className="bg-slate-800/50 rounded-lg p-2 my-2">
              <p className="text-sm text-slate-400">
                <span className="text-white font-medium">{rateUsed}</span> interest tax ({taxRate}%)
              </p>
            </div>
            <Row label="Interest Tax Due" value={interestTax} bold color="red" />
          </>
        )}

        {taxableInterest === 0 && PSA > 0 && (
          <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3 mt-2">
            <p className="text-green-400 text-sm">
              ✅ Your interest is within the £{PSA.toLocaleString()} Personal Savings Allowance
            </p>
          </div>
        )}

        {PSA === 0 && (
          <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3 mt-2">
            <p className="text-amber-400 text-sm">
              ⚠️ Additional rate taxpayers have no Personal Savings Allowance
            </p>
          </div>
        )}
      </div>

      {interestData.foreignTaxPaid > 0 && (
        <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 mt-3">
          <p className="text-blue-400 text-sm">
            💡 You may be able to claim foreign tax credit relief for the {formatCurrency(interestData.foreignTaxPaid)}
            {' '}tax paid on foreign interest.
          </p>
        </div>
      )}
    </Section>
  );
}
