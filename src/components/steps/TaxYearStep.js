'use client';

import { TAX_YEARS } from '@/lib/constants';

export default function TaxYearStep({ taxYear, onTaxYearChange, onNext }) {
  // Get current date to determine which tax year we're in
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-11
  const currentYear = now.getFullYear();

  // UK tax year runs April 6 to April 5
  // If we're before April 6, we're in the previous tax year
  const taxYearStart = currentMonth >= 3 && now.getDate() >= 6 ? currentYear : currentYear - 1;
  const currentTaxYear = `${taxYearStart}/${(taxYearStart + 1).toString().slice(-2)}`;

  const getTaxYearInfo = (year) => {
    const [startYear] = year.split('/');
    const start = parseInt(startYear);

    // Check if this is a future, current, or past tax year
    if (year === currentTaxYear) {
      return { status: 'current', label: 'Current Year', color: 'blue' };
    } else if (start > taxYearStart) {
      return { status: 'future', label: 'Future Year', color: 'amber' };
    } else {
      return { status: 'past', label: 'Completed', color: 'green' };
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">📅 Select Tax Year</h2>
        <p className="text-slate-400">Which tax year are you calculating for?</p>
      </div>

      <div className="max-w-lg mx-auto space-y-3">
        {TAX_YEARS.map((year) => {
          const info = getTaxYearInfo(year);
          const isSelected = taxYear === year;

          return (
            <button
              key={year}
              onClick={() => onTaxYearChange(year)}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-center justify-between ${
                isSelected
                  ? 'bg-blue-600/20 border-blue-500 text-white'
                  : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  isSelected ? 'border-blue-500 bg-blue-500' : 'border-slate-500'
                }`}>
                  {isSelected && <span className="text-white text-xs">✓</span>}
                </div>
                <div>
                  <span className="text-lg font-semibold">{year}</span>
                  <p className="text-sm text-slate-400">
                    6 April {year.split('/')[0]} – 5 April {parseInt(year.split('/')[0]) + 1}
                  </p>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${
                info.color === 'blue'
                  ? 'bg-blue-500/20 text-blue-400'
                  : info.color === 'amber'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-green-500/20 text-green-400'
              }`}>
                {info.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Info box for future year */}
      {taxYear === '2025/26' && (
        <div className="max-w-lg mx-auto mt-4 p-4 bg-amber-900/30 border border-amber-700/50 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-amber-400 text-lg">⚠️</span>
            <div className="text-sm">
              <p className="text-amber-400 font-medium">Tax Year Not Yet Complete</p>
              <p className="text-slate-400 mt-1">
                The 2025/26 tax year is still in progress. Your calculations will be based on transactions up to today's date.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-center mt-8">
        <button
          onClick={onNext}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
        >
          Continue →
        </button>
      </div>

      <div className="max-w-lg mx-auto mt-6 p-4 bg-green-900/20 rounded-xl border border-green-700/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-600/20 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-xl">🔒</span>
          </div>
          <div>
            <p className="text-green-400 font-medium text-sm">Your data is private</p>
            <p className="text-slate-400 text-xs mt-0.5">
              We don't store your financial information. All calculations happen in your browser and data is cleared when you close the page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
