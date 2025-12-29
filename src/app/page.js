'use client';

import { useState, useEffect } from 'react';
import StepIndicator from '@/components/ui/StepIndicator';
import TaxYearStep from '@/components/steps/TaxYearStep';
import IncomeStep from '@/components/steps/IncomeStep';
import CGTStep from '@/components/steps/CGTStep';
import InterestIncomeStep from '@/components/steps/InterestIncomeStep';
import SummaryStep from '@/components/steps/SummaryStep';
import { trackPageVisit, trackStepCompleted, trackStepSkipped, resetSession } from '@/lib/analytics';

export default function Home() {
  const [currentStep, setCurrentStep] = useState(1);
  const [taxYear, setTaxYear] = useState('2024/25');

  const [incomeData, setIncomeData] = useState({
    grossPay: '',
    taxPaid: '',
    niPaid: '',
    skipped: false,
  });

  const [cgtResult, setCgtResult] = useState(null);

  const [interestData, setInterestData] = useState({
    ukInterest: 0,
    foreignInterest: 0,
    foreignTaxPaid: 0,
    skipped: false,
  });

  // Track page visit on mount
  useEffect(() => {
    trackPageVisit(taxYear);
  }, []);

  const goToStep = (step) => setCurrentStep(step);

  // Step 1: Tax Year
  const handleTaxYearNext = () => {
    trackStepCompleted(1, { taxYear });
    goToStep(2);
  };

  // Step 2: Income
  const handleIncomeNext = () => {
    setIncomeData({ ...incomeData, skipped: false });
    trackStepCompleted(2, { hasIncome: true });
    goToStep(3);
  };

  const handleIncomeSkip = () => {
    setIncomeData({ ...incomeData, skipped: true });
    trackStepSkipped(2);
    goToStep(3);
  };

  // Step 3: CGT
  const handleCGTNext = () => {
    trackStepCompleted(3, { hasCGT: !!cgtResult });
    goToStep(4);
  };

  const handleCGTSkip = () => {
    trackStepSkipped(3);
    goToStep(4);
  };

  // Step 4: Interest Income
  const handleInterestNext = () => {
    trackStepCompleted(4, { hasInterest: !interestData.skipped });
    goToStep(5);
  };

  const handleInterestSkip = () => {
    setInterestData({ ukInterest: 0, foreignInterest: 0, foreignTaxPaid: 0, skipped: true });
    trackStepSkipped(4);
    goToStep(5);
  };

  const handleStartOver = () => {
    resetSession(); // Generate new session ID
    setCurrentStep(1);
    setTaxYear('2024/25');
    setIncomeData({ grossPay: '', taxPaid: '', niPaid: '', skipped: false });
    setCgtResult(null);
    setInterestData({ ukInterest: 0, foreignInterest: 0, foreignTaxPaid: 0, skipped: false });
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Header - responsive sizing */}
        <header className="text-center mb-6 md:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1 sm:mb-2">🇬🇧 UK Tax Calculator</h1>
          <p className="text-slate-400 text-sm sm:text-base">Calculate Income Tax, NI & Capital Gains Tax</p>
        </header>

        {/* Step Indicator */}
        <StepIndicator currentStep={currentStep} onStepClick={goToStep} />

        {/* Selected Tax Year Badge - show after step 1 */}
        {currentStep > 1 && (
          <div className="flex justify-center mb-4 sm:mb-6">
            <div className="bg-slate-800 rounded-xl px-4 py-2 border border-slate-700 flex items-center gap-3">
              <span className="text-slate-400 text-sm">Tax Year:</span>
              <span className="text-white font-semibold">{taxYear}</span>
              {currentStep < 4 && (
                <button
                  onClick={() => goToStep(1)}
                  className="text-blue-400 hover:text-blue-300 text-sm ml-2"
                >
                  Change
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step Summary Banner - show after step 2 */}
        {currentStep >= 3 && !incomeData.skipped && incomeData.grossPay && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-green-900/30 border border-green-700/50 rounded-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                <span className="text-green-400 font-medium">✓ Income</span>
                <span className="text-slate-300">
                  Gross: <span className="text-white font-semibold">£{parseFloat(incomeData.grossPay).toLocaleString()}</span>
                </span>
                {incomeData.taxPaid && (
                  <span className="text-slate-300 hidden sm:inline">
                    Tax: <span className="text-white font-semibold">£{parseFloat(incomeData.taxPaid).toLocaleString()}</span>
                  </span>
                )}
              </div>
              {currentStep === 3 && (
                <button onClick={() => goToStep(2)} className="text-blue-400 hover:text-blue-300 text-xs sm:text-sm self-start sm:self-center">Edit</button>
              )}
            </div>
          </div>
        )}

        {currentStep >= 3 && incomeData.skipped && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-slate-800 border border-slate-700 rounded-xl">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-slate-400">Income skipped - using basic rate CGT</span>
              {currentStep === 3 && (
                <button onClick={() => goToStep(2)} className="text-blue-400 hover:text-blue-300">Add</button>
              )}
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
          {currentStep === 1 && (
            <TaxYearStep
              taxYear={taxYear}
              onTaxYearChange={setTaxYear}
              onNext={handleTaxYearNext}
            />
          )}

          {currentStep === 2 && (
            <IncomeStep
              data={incomeData}
              onChange={setIncomeData}
              onNext={handleIncomeNext}
              onSkip={handleIncomeSkip}
            />
          )}

          {currentStep === 3 && (
            <CGTStep
              taxYear={taxYear}
              cgtResult={cgtResult}
              setCgtResult={setCgtResult}
              incomeData={incomeData}
              onBack={() => goToStep(2)}
              onNext={handleCGTNext}
              onSkip={handleCGTSkip}
            />
          )}

          {currentStep === 4 && (
            <InterestIncomeStep
              data={interestData}
              onChange={setInterestData}
              onBack={() => goToStep(3)}
              onNext={handleInterestNext}
              onSkip={handleInterestSkip}
            />
          )}

          {currentStep === 5 && (
            <SummaryStep
              taxYear={taxYear}
              incomeData={incomeData}
              cgtResult={cgtResult}
              interestData={interestData}
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
