'use client';

import { useState } from 'react';

const TAX_YEARS = ['2024/25', '2023/24'];

export default function TaxCalculator() {
  const [p60, setP60] = useState({ taxYear: '2024/25', grossPay: '', taxPaid: '', niPaid: '' });
  const [pension, setPension] = useState({ contributions: '' });
  const [cgt, setCgt] = useState({ gains: '' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const calculate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taxYear: p60.taxYear,
          grossPay: parseFloat(p60.grossPay) || 0,
          taxPaid: parseFloat(p60.taxPaid) || 0,
          niPaid: parseFloat(p60.niPaid) || 0,
          pensionContributions: parseFloat(pension.contributions) || 0,
          capitalGains: parseFloat(cgt.gains) || 0,
        }),
      });
      const data = await res.json();
      if (data.success) setResult(data.result);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const fmt = (n) => `£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">🇬🇧 UK Tax Calculator</h1>
        <p className="text-slate-400 text-center mb-8">Income Tax + NI + Capital Gains</p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* P60 Section */}
          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
            <h2 className="text-xl font-semibold text-white mb-4">📄 P60 Details</h2>
            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-sm">Tax Year</label>
                <select value={p60.taxYear} onChange={e => setP60({...p60, taxYear: e.target.value})}
                  className="w-full mt-1 bg-slate-700 text-white p-3 rounded-lg border border-slate-600">
                  {TAX_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-sm">Gross Pay (Total Pay)</label>
                <input type="number" value={p60.grossPay} onChange={e => setP60({...p60, grossPay: e.target.value})}
                  placeholder="e.g. 85000" className="w-full mt-1 bg-slate-700 text-white p-3 rounded-lg border border-slate-600"/>
              </div>
              <div>
                <label className="text-slate-400 text-sm">Tax Deducted (PAYE)</label>
                <input type="number" value={p60.taxPaid} onChange={e => setP60({...p60, taxPaid: e.target.value})}
                  placeholder="e.g. 25000" className="w-full mt-1 bg-slate-700 text-white p-3 rounded-lg border border-slate-600"/>
              </div>
              <div>
                <label className="text-slate-400 text-sm">National Insurance Paid</label>
                <input type="number" value={p60.niPaid} onChange={e => setP60({...p60, niPaid: e.target.value})}
                  placeholder="e.g. 5000" className="w-full mt-1 bg-slate-700 text-white p-3 rounded-lg border border-slate-600"/>
              </div>
            </div>
          </div>

          {/* Pension & CGT Section */}
          <div className="space-y-6">
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4">🏦 Pension Contributions</h2>
              <div>
                <label className="text-slate-400 text-sm">Total Contributions (Annual)</label>
                <input type="number" value={pension.contributions} onChange={e => setPension({contributions: e.target.value})}
                  placeholder="e.g. 10000" className="w-full mt-1 bg-slate-700 text-white p-3 rounded-lg border border-slate-600"/>
                <p className="text-slate-500 text-xs mt-2">Extends basic rate band & reduces taxable income</p>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4">📈 Capital Gains</h2>
              <div>
                <label className="text-slate-400 text-sm">Net Capital Gains</label>
                <input type="number" value={cgt.gains} onChange={e => setCgt({gains: e.target.value})}
                  placeholder="e.g. 15000" className="w-full mt-1 bg-slate-700 text-white p-3 rounded-lg border border-slate-600"/>
                <p className="text-slate-500 text-xs mt-2">From CGT calculator or self-assessment</p>
              </div>
            </div>
          </div>
        </div>

        <button onClick={calculate} disabled={loading || !p60.grossPay}
          className="w-full mt-6 py-4 bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold rounded-xl disabled:opacity-50">
          {loading ? 'Calculating...' : 'Calculate Tax'}
        </button>

        {/* Results */}
        {result && (
          <div className="mt-8 space-y-6">
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-6">📊 Tax Summary - {result.taxYear}</h2>

              <div className="grid md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-700/30 p-4 rounded-xl">
                  <div className="text-slate-400 text-sm">Gross Income</div>
                  <div className="text-white text-xl font-bold">{fmt(result.summary.totalGrossIncome)}</div>
                </div>
                <div className="bg-slate-700/30 p-4 rounded-xl">
                  <div className="text-slate-400 text-sm">Personal Allowance</div>
                  <div className="text-green-400 text-xl font-bold">{fmt(result.summary.personalAllowance)}</div>
                </div>
                <div className="bg-slate-700/30 p-4 rounded-xl">
                  <div className="text-slate-400 text-sm">Taxable Income</div>
                  <div className="text-white text-xl font-bold">{fmt(result.summary.taxableIncome)}</div>
                </div>
              </div>

              {/* Income Tax Breakdown */}
              <div className="bg-slate-700/20 rounded-xl p-4 mb-4">
                <h3 className="text-white font-medium mb-3">🧾 Income Tax</h3>
                {result.incomeTax.breakdown.map((b, i) => (
                  <div key={i} className="flex justify-between text-sm py-1">
                    <span className="text-slate-400">{b.band} @ {(b.rate*100)}%</span>
                    <span className="text-white">{fmt(b.tax)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 mt-2 border-t border-slate-600">
                  <span className="text-white font-medium">Total Due</span>
                  <span className="text-white font-bold">{fmt(result.summary.incomeTaxDue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Paid via PAYE</span>
                  <span className="text-green-400">-{fmt(result.summary.incomeTaxPaid)}</span>
                </div>
              </div>

              {/* CGT Breakdown */}
              {result.summary.capitalGains > 0 && (
                <div className="bg-slate-700/20 rounded-xl p-4 mb-4">
                  <h3 className="text-white font-medium mb-3">📈 Capital Gains Tax</h3>
                  <div className="flex justify-between text-sm py-1">
                    <span className="text-slate-400">Total Gains</span>
                    <span className="text-white">{fmt(result.summary.capitalGains)}</span>
                  </div>
                  <div className="flex justify-between text-sm py-1">
                    <span className="text-slate-400">Annual Exemption</span>
                    <span className="text-green-400">-{fmt(result.summary.cgtExemption)}</span>
                  </div>
                  <div className="flex justify-between text-sm py-1">
                    <span className="text-slate-400">Taxable Gain</span>
                    <span className="text-white">{fmt(result.summary.cgtTaxableGain)}</span>
                  </div>
                  {result.capitalGainsTax.breakdown.map((b, i) => (
                    <div key={i} className="flex justify-between text-sm py-1">
                      <span className="text-slate-400">{b.band}</span>
                      <span className="text-white">{fmt(b.tax)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 mt-2 border-t border-slate-600">
                    <span className="text-white font-medium">CGT Due</span>
                    <span className="text-amber-400 font-bold">{fmt(result.summary.cgtDue)}</span>
                  </div>
                </div>
              )}

              {/* Final Balance */}
              <div className={`rounded-xl p-6 ${result.summary.balanceToPay > 0 ? 'bg-red-900/30 border border-red-700/50' : 'bg-green-900/30 border border-green-700/50'}`}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className={`text-lg font-semibold ${result.summary.balanceToPay > 0 ? 'text-red-300' : 'text-green-300'}`}>
                      {result.summary.balanceToPay > 0 ? '⚠️ Additional Tax to Pay' : '🎉 Tax Refund Due'}
                    </div>
                    <div className="text-slate-400 text-sm">Including CGT on share disposals</div>
                  </div>
                  <div className={`text-3xl font-bold ${result.summary.balanceToPay > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {result.summary.balanceToPay < 0 ? '-' : ''}{fmt(Math.abs(result.summary.balanceToPay))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <p className="text-amber-400 text-sm">⚠️ This is for guidance only. Consult HMRC or a tax professional for official advice.</p>
            </div>
          </div>
        )}

        <div className="mt-6 text-center">
          <a href="/" className="text-slate-400 hover:text-white text-sm">← Back to CGT Calculator</a>
        </div>
      </div>
    </div>
  );
}
