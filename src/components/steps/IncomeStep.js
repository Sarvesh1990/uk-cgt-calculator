'use client';

export default function IncomeStep({ data, onChange, onNext, onSkip }) {
  const handleChange = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  const hasData = data.grossPay || data.taxPaid || data.niPaid || data.pensionContributions;

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">💼 Employment Income Details</h2>
        <p className="text-slate-400">Enter details from your P60 or final payslip</p>
      </div>

      <div className="max-w-md mx-auto space-y-4">
        <InputField
          label="Gross Pay"
          value={data.grossPay}
          onChange={(v) => handleChange('grossPay', v)}
          placeholder="85000"
        />
        <InputField
          label="Tax Deducted (PAYE)"
          value={data.taxPaid}
          onChange={(v) => handleChange('taxPaid', v)}
          placeholder="22500"
        />
        <InputField
          label="National Insurance Paid"
          value={data.niPaid}
          onChange={(v) => handleChange('niPaid', v)}
          placeholder="4500"
        />
        <InputField
          label="Pension Contributions"
          value={data.pensionContributions}
          onChange={(v) => handleChange('pensionContributions', v)}
          placeholder="5000"
        />
        <p className="text-slate-500 text-xs">Pension contributions extend your basic rate band for CGT</p>
      </div>

      <div className="flex justify-center gap-4 mt-8">
        <button onClick={onSkip} className="px-6 py-3 text-slate-400 hover:text-white">
          Skip this step →
        </button>
        <button
          onClick={onNext}
          disabled={!hasData}
          className={`px-6 py-3 rounded-lg font-medium ${
            hasData
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          Continue →
        </button>
      </div>

      <p className="text-center text-slate-500 text-xs mt-4">
        💡 If you skip, CGT will be calculated assuming basic rate band is available
      </p>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-slate-300 text-sm font-medium mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">£</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-8 pr-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        />
      </div>
    </div>
  );
}
