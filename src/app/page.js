'use client';

import { useState, useEffect } from 'react';
import StepIndicator from '@/components/ui/StepIndicator';
import IncomeStep from '@/components/steps/IncomeStep';
import CGTStep from '@/components/steps/CGTStep';
import SummaryStep from '@/components/steps/SummaryStep';
import { TAX_YEARS } from '@/lib/constants';
import { trackPageVisit, trackStepCompleted, trackStepSkipped, resetSession } from '@/lib/analytics';

export default function Home() {
  const [currentStep, setCurrentStep] = useState(1);
  const [taxYear, setTaxYear] = useState('2024/25');

  const [incomeData, setIncomeData] = useState({
    firstName: '',
    lastName: '',
    grossPay: '',
    taxPaid: '',
    niPaid: '',
    pensionContributions: '',
    skipped: false,
  });

  const [cgtResult, setCgtResult] = useState(null);

  // Track page visit on mount
  useEffect(() => {
    trackPageVisit(taxYear);
  }, []);

  const goToStep = (step) => setCurrentStep(step);

  const handleIncomeNext = () => {
    setIncomeData({ ...incomeData, skipped: false });
    trackStepCompleted(1, { hasIncome: true });
    goToStep(2);
  };

  const handleIncomeSkip = () => {
    setIncomeData({ ...incomeData, skipped: true });
    trackStepSkipped(1);
    goToStep(2);
  };

  const handleCGTNext = () => {
    trackStepCompleted(2, { hasCGT: !!cgtResult });
    goToStep(3);
  };

  const handleCGTSkip = () => {
    trackStepSkipped(2);
    goToStep(3);
  };

  const handleStartOver = () => {
    resetSession(); // Generate new session ID
    setCurrentStep(1);
    setIncomeData({ firstName: '', lastName: '', grossPay: '', taxPaid: '', niPaid: '', pensionContributions: '', skipped: false });
    setCgtResult(null);
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">🇬🇧 UK Tax Calculator</h1>
          <p className="text-slate-400">Calculate Income Tax, National Insurance & Capital Gains Tax</p>
        </header>

        {/* Step Indicator */}
        <StepIndicator currentStep={currentStep} onStepClick={goToStep} />

        {/* Tax Year Selector */}
        <div className="flex justify-center mb-6">
          <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 flex items-center gap-3">
            <span className="text-slate-400 text-sm">Tax Year:</span>
            <div className="flex gap-2">
              {TAX_YEARS.map(year => (
                <button
                  key={year}
                  onClick={() => setTaxYear(year)}
                  disabled={currentStep === 3}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    taxYear === year
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Step Summary Banner */}
        {currentStep >= 2 && !incomeData.skipped && incomeData.grossPay && (
          <div className="mb-6 p-4 bg-green-900/30 border border-green-700/50 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-green-400 font-medium">✓ Step 1</span>
                <span className="text-slate-300">
                  Gross: <span className="text-white font-semibold">£{parseFloat(incomeData.grossPay).toLocaleString()}</span>
                </span>
                {incomeData.taxPaid && (
                  <span className="text-slate-300">
                    Tax Paid: <span className="text-white font-semibold">£{parseFloat(incomeData.taxPaid).toLocaleString()}</span>
                  </span>
                )}
              </div>
              {currentStep === 2 && (
                <button onClick={() => goToStep(1)} className="text-blue-400 hover:text-blue-300 text-sm">Edit</button>
              )}
            </div>
          </div>
        )}

        {currentStep >= 2 && incomeData.skipped && (
          <div className="mb-6 p-4 bg-slate-800 border border-slate-700 rounded-xl">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Step 1 skipped - CGT will use basic rate</span>
              {currentStep === 2 && (
                <button onClick={() => goToStep(1)} className="text-blue-400 hover:text-blue-300">Add income</button>
              )}
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
          {currentStep === 1 && (
            <IncomeStep
              data={incomeData}
              onChange={setIncomeData}
              onNext={handleIncomeNext}
              onSkip={handleIncomeSkip}
            />
          )}

          {currentStep === 2 && (
            <CGTStep
              taxYear={taxYear}
              cgtResult={cgtResult}
              setCgtResult={setCgtResult}
              incomeData={incomeData}
              onBack={() => goToStep(1)}
              onNext={handleCGTNext}
              onSkip={handleCGTSkip}
            />
          )}

          {currentStep === 3 && (
            <SummaryStep
              taxYear={taxYear}
              incomeData={incomeData}
              cgtResult={cgtResult}
              onStartOver={handleStartOver}
              onEditStep={goToStep}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-slate-500 text-sm">
          <p>Follows HMRC share matching rules (Same Day, Bed & Breakfast, Section 104 Pool)</p>
          <p className="mt-1">For guidance only - please verify with a qualified tax professional</p>
        </footer>
      </div>
    </div>
  );
}
