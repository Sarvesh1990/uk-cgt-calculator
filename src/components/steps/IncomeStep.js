'use client';

import { useState, useRef } from 'react';
import { trackP60Upload, trackIncomeEntry } from '@/lib/analytics';

export default function IncomeStep({ data, onChange, onNext, onSkip }) {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [entryMethod, setEntryMethod] = useState(null); // 'p60_upload' or 'manual'
  const fileInputRef = useRef(null);

  const handleChange = (field, value) => {
    onChange({ ...data, [field]: value });
    // Mark as manual entry if user types in fields
    if (!entryMethod) {
      setEntryMethod('manual');
    }
  };

  const handleP60Upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileType = file.name.split('.').pop()?.toLowerCase();
    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse-p60', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        setUploadResult({
          success: false,
          error: result.error,
          isScannedImage: result.isScannedImage
        });

        // Track failed upload
        trackP60Upload({
          success: false,
          fileType,
          error: result.error,
        });
        return;
      }

      if (result.success) {
        // Auto-fill the form with extracted data
        const newData = { ...data };
        if (result.data.grossPay) newData.grossPay = result.data.grossPay;
        if (result.data.taxPaid) newData.taxPaid = result.data.taxPaid;
        if (result.data.niPaid) newData.niPaid = result.data.niPaid;
        onChange(newData);

        setUploadResult({
          success: true,
          confidence: result.confidence,
          warnings: result.warnings,
          taxYear: result.data.taxYear,
        });

        setEntryMethod('p60_upload');

        // Track successful upload
        trackP60Upload({
          success: true,
          confidence: result.confidence,
          warnings: result.warnings,
          fileType,
        });
      } else {
        setUploadResult({
          success: false,
          error: result.message || 'Could not extract data from P60',
          warnings: result.warnings,
        });

        // Track failed extraction
        trackP60Upload({
          success: false,
          fileType,
          error: result.message,
        });
      }
    } catch (error) {
      setUploadResult({
        success: false,
        error: 'Failed to upload file. Please try again.',
      });

      // Track upload error
      trackP60Upload({
        success: false,
        fileType,
        error: 'upload_failed',
      });
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const hasData = data.grossPay || data.taxPaid || data.niPaid;

  const handleNext = () => {
    // Track income entry on continue
    trackIncomeEntry({
      grossPay: data.grossPay,
      taxPaid: data.taxPaid,
      niPaid: data.niPaid,
      entryMethod: entryMethod || 'manual',
    });
    onNext();
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">💼 Income Details</h2>
        <p className="text-slate-400">Upload your P60 or enter information manually</p>
      </div>

      {/* P60 Upload Section */}
      <div className="max-w-md mx-auto mb-6">
        <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600 border-dashed">
          <div className="text-center">
            <div className="text-3xl mb-2">📄</div>
            <p className="text-white font-medium mb-1">Upload P60</p>
            <p className="text-slate-400 text-sm mb-3">We'll extract the details automatically</p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleP60Upload}
              className="hidden"
              id="p60-upload"
            />
            <label
              htmlFor="p60-upload"
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-all ${
                uploading
                  ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-500'
              }`}
            >
              {uploading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Processing...
                </>
              ) : (
                <>
                  <span>📤</span>
                  Choose File
                </>
              )}
            </label>
            <p className="text-slate-500 text-xs mt-2">Supports PDF, PNG, JPG</p>
          </div>

          {/* Upload Result */}
          {uploadResult && (
            <div className={`mt-4 p-3 rounded-lg ${
              uploadResult.success
                ? 'bg-green-900/30 border border-green-700/50'
                : 'bg-red-900/30 border border-red-700/50'
            }`}>
              {uploadResult.success ? (
                <div>
                  <p className="text-green-400 font-medium flex items-center gap-2">
                    <span>✓</span> P60 data extracted
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      uploadResult.confidence === 'high'
                        ? 'bg-green-700 text-green-200'
                        : uploadResult.confidence === 'medium'
                        ? 'bg-yellow-700 text-yellow-200'
                        : 'bg-orange-700 text-orange-200'
                    }`}>
                      {uploadResult.confidence} confidence
                    </span>
                  </p>
                  {uploadResult.taxYear && (
                    <p className="text-slate-300 text-sm mt-1">Tax Year: {uploadResult.taxYear}</p>
                  )}
                  {uploadResult.warnings?.length > 0 && (
                    <p className="text-yellow-400 text-sm mt-1">⚠️ {uploadResult.warnings.join(', ')}</p>
                  )}
                  <p className="text-slate-400 text-xs mt-2">Please verify the values below are correct</p>
                </div>
              ) : (
                <div>
                  <p className="text-red-400 font-medium">✗ {uploadResult.error}</p>
                  {uploadResult.isScannedImage && (
                    <p className="text-slate-400 text-sm mt-1">
                      Tip: If your P60 is a scanned image, please enter the details manually below.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-slate-700"></div>
          <span className="text-slate-500 text-sm">or enter manually</span>
          <div className="flex-1 h-px bg-slate-700"></div>
        </div>
      </div>

      {/* Manual Entry Fields */}
      <div className="max-w-md mx-auto space-y-4">
        <InputField
          label="Gross Pay (from P60)"
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
      </div>

      <div className="flex justify-center gap-4 mt-8">
        <button onClick={onSkip} className="px-6 py-3 text-slate-400 hover:text-white">
          Skip this step →
        </button>
        <button
          onClick={handleNext}
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

      <div className="max-w-md mx-auto mt-6 p-4 bg-green-900/20 rounded-xl border border-green-700/40">
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
