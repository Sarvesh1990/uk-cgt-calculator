'use client';

const STEPS = [
  { id: 1, title: 'Tax Year', shortTitle: 'Year', subtitle: 'Select period', icon: '📅' },
  { id: 2, title: 'Employment Income', shortTitle: 'Income', subtitle: 'P60 / Payslip', icon: '💼' },
  { id: 3, title: 'Capital Gains', shortTitle: 'CGT', subtitle: 'Transactions', icon: '📈' },
  { id: 4, title: 'Interest Income', shortTitle: 'Interest', subtitle: 'Savings', icon: '💰' },
  { id: 5, title: 'Tax Summary', shortTitle: 'Summary', subtitle: 'Results', icon: '🧮' },
];

export default function StepIndicator({ currentStep, onStepClick }) {
  return (
    <div className="mb-6 md:mb-8">
      <div className="flex items-center justify-between max-w-2xl mx-auto px-2">
        {STEPS.map((step, idx) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isClickable = onStepClick && isCompleted;

          return (
            <div key={step.id} className="flex items-center flex-1">
              <div
                className={`flex flex-col items-center flex-1 ${isClickable ? 'cursor-pointer group' : ''}`}
                onClick={() => isClickable && onStepClick(step.id)}
              >
                {/* Circle - smaller on mobile */}
                <div className={`w-9 h-9 md:w-12 md:h-12 rounded-full flex items-center justify-center text-base md:text-xl mb-1 md:mb-2 transition-all ${
                  isCompleted
                    ? 'bg-green-600 text-white'
                    : isCurrent
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-400'
                } ${isClickable ? 'group-hover:ring-2 group-hover:ring-green-400 group-hover:ring-offset-2 group-hover:ring-offset-slate-900' : ''}`}>
                  {isCompleted ? '✓' : step.icon}
                </div>
                {/* Text - hide on very small screens, short title on mobile */}
                <div className="text-center">
                  <div className={`text-[10px] md:text-sm font-medium transition-colors ${
                    currentStep >= step.id ? 'text-white' : 'text-slate-500'
                  } ${isClickable ? 'group-hover:text-green-400' : ''}`}>
                    <span className="hidden sm:inline">{step.title}</span>
                    <span className="sm:hidden">{step.shortTitle}</span>
                  </div>
                  <div className={`hidden sm:block text-xs text-slate-500 ${isClickable ? 'group-hover:text-slate-400' : ''}`}>
                    {isClickable ? 'Tap to edit' : step.subtitle}
                  </div>
                </div>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`w-6 sm:w-10 md:w-16 h-0.5 mx-1 sm:mx-2 md:mx-3 flex-shrink-0 ${currentStep > step.id ? 'bg-green-600' : 'bg-slate-700'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
