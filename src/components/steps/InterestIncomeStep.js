'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/constants';

export default function InterestIncomeStep({ data, onChange, onBack, onNext, onSkip }) {
  const [ukInterest, setUkInterest] = useState(data?.ukInterest || '');
  const [foreignInterest, setForeignInterest] = useState(data?.foreignInterest || '');
  const [foreignTaxPaid, setForeignTaxPaid] = useState(data?.foreignTaxPaid || '');

  const handleNext = () => {
    onChange({
      ukInterest: parseFloat(ukInterest) || 0,
      foreignInterest: parseFloat(foreignInterest) || 0,
      foreignTaxPaid: parseFloat(foreignTaxPaid) || 0,
      skipped: false,
    });
    onNext();
  };

  const handleSkip = () => {
    onChange({
      ukInterest: 0,
      foreignInterest: 0,
      foreignTaxPaid: 0,
      skipped: true,
    });
    onSkip();
  };

  const totalInterest = (parseFloat(ukInterest) || 0) + (parseFloat(foreignInterest) || 0);
  const canContinue = totalInterest > 0;

  // Personal Savings Allowance
  const PSA_BASIC = 1000;
  const PSA_HIGHER = 500;
  const PSA_ADDITIONAL = 0;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">💰 Interest Income</h2>
        <p className="text-slate-400">Enter any interest earned from savings and investments</p>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="text-2xl">ℹ️</div>
          <div className="flex-1">
            <span className="font-semibold">Personal Savings Allowance</span>
            <p className="text-blue-100 text-sm mt-1">
              Basic rate taxpayers: £{PSA_BASIC.toLocaleString()} tax-free<br/>
              Higher rate taxpayers: £{PSA_HIGHER.toLocaleString()} tax-free<br/>
              Additional rate taxpayers: £{PSA_ADDITIONAL} tax-free
            </p>
          </div>
        </div>
      </div>

      {/* UK Interest */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🇬🇧</span>
          <h3 className="text-white font-medium">UK Bank & Savings Interest</h3>
        </div>
        <div className="bg-slate-700 rounded-lg p-4">
          <label className="block text-slate-400 text-sm mb-2">
            Interest from UK banks, building societies, savings accounts
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">£</span>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={ukInterest}
              onChange={(e) => setUkInterest(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-10 py-3 text-white text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
            />
          </div>
          <p className="text-slate-500 text-xs mt-2">
            💡 This is usually shown on your bank statements or annual interest certificates
          </p>
        </div>
      </div>

      {/* Foreign Interest */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🌍</span>
          <h3 className="text-white font-medium">Foreign Interest Income</h3>
        </div>
        <div className="bg-slate-700 rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-slate-400 text-sm mb-2">
              Interest from foreign banks or accounts (in GBP)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">£</span>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={foreignInterest}
                onChange={(e) => setForeignInterest(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-10 py-3 text-white text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
              />
            </div>
          </div>

          {parseFloat(foreignInterest) > 0 && (
            <div>
              <label className="block text-slate-400 text-sm mb-2">
                Foreign tax already paid (optional)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">£</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={foreignTaxPaid}
                  onChange={(e) => setForeignTaxPaid(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-10 py-3 text-white text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                />
              </div>
              <p className="text-blue-400 text-xs mt-2">
                💡 You may be able to claim foreign tax credit relief on this amount
              </p>
            </div>
          )}

          <p className="text-slate-500 text-xs">
            ⚠️ Convert foreign currency amounts to GBP using the exchange rate on the date received
          </p>
        </div>
      </div>

      {/* Total Preview */}
      {totalInterest > 0 && (
        <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-400">Total Interest Income</span>
            <span className="text-2xl font-bold text-green-400">{formatCurrency(totalInterest)}</span>
          </div>
          <div className="text-sm text-slate-400 space-y-1">
            {parseFloat(ukInterest) > 0 && (
              <div className="flex justify-between">
                <span>🇬🇧 UK Interest:</span>
                <span className="text-white">{formatCurrency(parseFloat(ukInterest))}</span>
              </div>
            )}
            {parseFloat(foreignInterest) > 0 && (
              <div className="flex justify-between">
                <span>🌍 Foreign Interest:</span>
                <span className="text-white">{formatCurrency(parseFloat(foreignInterest))}</span>
              </div>
            )}
            {parseFloat(foreignTaxPaid) > 0 && (
              <div className="flex justify-between text-amber-400">
                <span>Foreign tax paid:</span>
                <span>{formatCurrency(parseFloat(foreignTaxPaid))}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tax Information */}
      <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-amber-400 text-xl">💡</span>
          <div className="flex-1 text-sm">
            <p className="text-amber-400 font-medium mb-1">Tax on Interest Income</p>
            <p className="text-slate-300">
              Interest above your Personal Savings Allowance is taxed at your marginal income tax rate
              (20%, 40%, or 45%). The calculator will include this in your final tax calculation.
            </p>
          </div>
        </div>
      </div>

      {/* Common Scenarios */}
      <details className="bg-slate-800/50 rounded-lg">
        <summary className="px-4 py-3 text-white font-medium cursor-pointer hover:bg-slate-800 rounded-lg transition-colors">
          📖 Common Scenarios & Examples
        </summary>
        <div className="px-4 pb-4 space-y-3 text-sm">
          <div className="border-l-2 border-blue-500 pl-3 py-1">
            <p className="text-white font-medium">High street bank savings</p>
            <p className="text-slate-400">Enter the total interest shown on your annual statement under UK Interest</p>
          </div>
          <div className="border-l-2 border-purple-500 pl-3 py-1">
            <p className="text-white font-medium">Premium Bonds prizes</p>
            <p className="text-slate-400">Premium Bond prizes are tax-free - no need to include them</p>
          </div>
          <div className="border-l-2 border-orange-500 pl-3 py-1">
            <p className="text-white font-medium">ISA interest</p>
            <p className="text-slate-400">ISA interest is tax-free - don't include it here</p>
          </div>
          <div className="border-l-2 border-green-500 pl-3 py-1">
            <p className="text-white font-medium">US savings account</p>
            <p className="text-slate-400">Enter the GBP value under Foreign Interest. If tax was withheld, enter it in the foreign tax field</p>
          </div>
        </div>
      </details>

      {/* Navigation */}
      <div className="border-t border-slate-700 pt-6 mt-6">
        <div className="flex justify-between items-center">
          <button
            onClick={onBack}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            ← Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Skip Interest →
            </button>

            <button
              onClick={handleNext}
              disabled={!canContinue}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                canContinue
                  ? 'bg-green-600 text-white hover:bg-green-500'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              Continue →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
