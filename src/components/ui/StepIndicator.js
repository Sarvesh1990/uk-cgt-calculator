'use client';

const STEPS = [
  { id: 1, title: 'Employment Income', subtitle: 'P60 / Payslip', icon: '💼' },
  { id: 2, title: 'Capital Gains', subtitle: 'Transactions', icon: '📈' },
  { id: 3, title: 'Tax Summary', subtitle: 'Results', icon: '🧮' },
];

export default function StepIndicator({ currentStep, onStepClick }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between max-w-xl mx-auto">
        {STEPS.map((step, idx) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isClickable = onStepClick && isCompleted;

          return (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex flex-col items-center ${isClickable ? 'cursor-pointer group' : ''}`}
                onClick={() => isClickable && onStepClick(step.id)}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl mb-2 transition-all ${
                  isCompleted
                    ? 'bg-green-600 text-white'
                    : isCurrent
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-400'
                } ${isClickable ? 'group-hover:ring-2 group-hover:ring-green-400 group-hover:ring-offset-2 group-hover:ring-offset-slate-900' : ''}`}>
                  {isCompleted ? '✓' : step.icon}
                </div>
                <div className="text-center">
                  <div className={`text-sm font-medium transition-colors ${
                    currentStep >= step.id ? 'text-white' : 'text-slate-500'
                  } ${isClickable ? 'group-hover:text-green-400' : ''}`}>
                    {step.title}
                  </div>
                  <div className={`text-xs text-slate-500 ${isClickable ? 'group-hover:text-slate-400' : ''}`}>
                    {isClickable ? 'Click to edit' : step.subtitle}
                  </div>
                </div>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`w-16 md:w-24 h-0.5 mx-4 ${currentStep > step.id ? 'bg-green-600' : 'bg-slate-700'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
