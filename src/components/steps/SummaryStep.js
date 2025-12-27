'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/constants';
import FeedbackWidget from '@/components/ui/FeedbackWidget';
import { trackStepCompleted } from '@/lib/analytics';

export default function SummaryStep({ taxYear, incomeData, cgtResult, onStartOver, onEditStep }) {
  const [taxCalc, setTaxCalc] = useState(null);
  const [loading, setLoading] = useState(true);

  const yearData = cgtResult?.report?.taxYears?.find(y => y.taxYear === taxYear);
  const hasIncome = !incomeData.skipped && parseFloat(incomeData.grossPay) > 0;

  useEffect(() => {
    calculateTax();
    // Track reaching the final step
    trackStepCompleted(3, { taxYear, hasIncome, hasCGT: !!yearData });
  }, [taxYear, incomeData, cgtResult]);

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
  const hasCGT = yearData && yearData.taxableGain > 0;
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
      {hasCGT && (
        <Section title="📈 Capital Gains Tax">
          <Row label="Total Gains" value={yearData.totalGains} color="green" />
          <Row label="Total Losses" value={-yearData.totalLosses} color="red" />
          <Row label="Net Gain" value={yearData.netGain} bold />
          <Row label="Annual Exemption" value={-yearData.annualExemption} />
          <Row label="Taxable Gains" value={yearData.taxableGain} bold />

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
        </Section>
      )}

      {!hasCGT && !yearData && (
        <Section title="📈 Capital Gains Tax">
          <p className="text-slate-400 text-center py-4">No CGT data for this tax year</p>
        </Section>
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
            onClick={() => onEditStep(1)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 rounded-lg text-slate-300 hover:text-white transition-all text-sm"
          >
            <span>💼</span>
            <span>Edit Income</span>
          </button>
          <button
            onClick={() => onEditStep(2)}
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
