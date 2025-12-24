'use client';

import { useState, useCallback } from 'react';

export default function Home() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.name.endsWith('.csv')
    );
    if (droppedFiles.length > 0) {
      setFiles(prev => [...prev, ...droppedFiles]);
    }
  }, []);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(prev => [...prev, ...selectedFiles]);
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      files.forEach(file => {
        console.log('Appending file:', file.name, 'Size:', file.size, 'Type:', file.type);
        formData.append('files', file);
      });

      console.log('Sending request with', files.length, 'files');

      const response = await fetch('/api/calculate', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to calculate');
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    const sign = amount < 0 ? '-' : '';
    return `${sign}£${Math.abs(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const exportJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cgt-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🇬🇧 UK Capital Gains Tax Calculator
          </h1>
          <p className="text-slate-400">
            Calculate your CGT with HMRC-compliant share matching rules
          </p>
        </header>

        {/* Upload Section */}
        {!result && (
          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 mb-6">
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-slate-600 hover:border-slate-500'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('fileInput').click()}
            >
              <div className="text-5xl mb-4">📁</div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Upload Transaction CSV Files
              </h3>
              <p className="text-slate-400 mb-4">
                Drag & drop files here or click to browse
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {['Trading 212', 'Interactive Brokers', 'Freetrade', 'Hargreaves Lansdown', 'Generic CSV'].map(broker => (
                  <span key={broker} className="px-3 py-1 bg-slate-700/50 rounded-full text-sm text-slate-400">
                    {broker}
                  </span>
                ))}
              </div>
            </div>
            <input
              type="file"
              id="fileInput"
              className="hidden"
              multiple
              accept=".csv"
              onChange={handleFileChange}
            />

            {/* File List */}
            {files.length > 0 && (
              <div className="mt-6 space-y-2">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                    <span className="text-white">📄 {file.name}</span>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={files.length === 0 || loading}
              className="w-full mt-6 py-4 bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold rounded-xl hover:from-green-500 hover:to-green-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Calculating...' : 'Calculate Capital Gains Tax'}
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-slate-600 border-t-green-500 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-400">Calculating your capital gains...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Actions */}
            <div className="flex justify-between items-center">
              <button
                onClick={() => {
                  setResult(null);
                  setFiles([]);
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ← Calculate Again
              </button>
              <button
                onClick={exportJSON}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
              >
                📄 Export JSON
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700">
                <div className="text-2xl font-bold text-white">
                  {result.report.summary.totalDisposals}
                </div>
                <div className="text-slate-400 text-sm">Total Disposals</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700">
                <div className="text-2xl font-bold text-white">
                  {result.report.summary.totalSymbolsTraded}
                </div>
                <div className="text-slate-400 text-sm">Assets Traded</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700">
                <div className={`text-2xl font-bold ${result.report.summary.overallGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(result.report.summary.overallGain)}
                </div>
                <div className="text-slate-400 text-sm">Overall Gain/Loss</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700">
                <div className="text-2xl font-bold text-white">
                  {result.parsedFiles.length}
                </div>
                <div className="text-slate-400 text-sm">Files Processed</div>
              </div>
            </div>

            {/* Tax Year Breakdown */}
            {result.report.taxYears.map((yearData) => (
              <div key={yearData.taxYear} className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
                <div className="p-4 bg-slate-700/50 border-b border-slate-700">
                  <h3 className="text-xl font-semibold text-white">
                    📅 Tax Year {yearData.taxYear}
                  </h3>
                </div>
                <div className="p-6">
                  {/* Tax Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    <div>
                      <div className="text-slate-400 text-sm">Total Proceeds</div>
                      <div className="text-white font-semibold">{formatCurrency(yearData.totalProceeds)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Total Cost</div>
                      <div className="text-white font-semibold">{formatCurrency(yearData.totalCost)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Total Gains</div>
                      <div className="text-green-400 font-semibold">{formatCurrency(yearData.totalGains)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Total Losses</div>
                      <div className="text-red-400 font-semibold">{formatCurrency(yearData.totalLosses)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Net Gain</div>
                      <div className={`font-semibold ${yearData.netGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(yearData.netGain)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Annual Exemption</div>
                      <div className="text-white font-semibold">{formatCurrency(yearData.annualExemption)}</div>
                    </div>
                  </div>

                  {/* Taxable Amount */}
                  <div className="bg-slate-700/50 rounded-xl p-4 mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-slate-400">Taxable Gain</span>
                      <span className="text-xl font-bold text-white">{formatCurrency(yearData.taxableGain)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Estimated Tax (Basic Rate 10%)</span>
                      <span className="text-amber-400">{formatCurrency(yearData.estimatedTaxBasicRate)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Estimated Tax (Higher Rate 20%)</span>
                      <span className="text-amber-400">{formatCurrency(yearData.estimatedTaxHigherRate)}</span>
                    </div>
                  </div>

                  {/* Disposals Table */}
                  <h4 className="text-lg font-semibold text-white mb-3">Disposals</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-slate-400 text-sm border-b border-slate-700">
                          <th className="pb-3">Date</th>
                          <th className="pb-3">Symbol</th>
                          <th className="pb-3">Qty</th>
                          <th className="pb-3">Proceeds</th>
                          <th className="pb-3">Cost</th>
                          <th className="pb-3">Gain/Loss</th>
                          <th className="pb-3">Match Rule</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearData.disposals.map((disposal, idx) => (
                          <tr key={idx} className="border-b border-slate-700/50 text-sm">
                            <td className="py-3 text-white">{disposal.date}</td>
                            <td className="py-3 text-white font-medium">{disposal.symbol}</td>
                            <td className="py-3 text-slate-300">{disposal.quantity}</td>
                            <td className="py-3 text-slate-300">{formatCurrency(disposal.proceeds)}</td>
                            <td className="py-3 text-slate-300">{formatCurrency(disposal.cost)}</td>
                            <td className={`py-3 font-medium ${disposal.gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {formatCurrency(disposal.gain)}
                            </td>
                            <td className="py-3">
                              {disposal.matchDetails.map((match, mIdx) => (
                                <span
                                  key={mIdx}
                                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-1 ${
                                    match.rule === 'SAME_DAY' ? 'bg-blue-500/20 text-blue-400' :
                                    match.rule === 'BED_AND_BREAKFAST' ? 'bg-orange-500/20 text-orange-400' :
                                    'bg-purple-500/20 text-purple-400'
                                  }`}
                                >
                                  {match.rule === 'SAME_DAY' ? 'Same Day' :
                                   match.rule === 'BED_AND_BREAKFAST' ? 'B&B' : 'S104'}
                                </span>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}

            {/* Section 104 Holdings */}
            {result.report.section104Pools.length > 0 && (
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
                <h3 className="text-xl font-semibold text-white mb-4">📊 Section 104 Holdings</h3>
                <p className="text-slate-400 text-sm mb-4">Your current share pools with average cost basis</p>
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-slate-400 text-sm border-b border-slate-700">
                      <th className="pb-3">Symbol</th>
                      <th className="pb-3">Quantity</th>
                      <th className="pb-3">Total Cost</th>
                      <th className="pb-3">Avg Cost/Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.report.section104Pools.map((pool, idx) => (
                      <tr key={idx} className="border-b border-slate-700/50">
                        <td className="py-3 text-white font-medium">{pool.symbol}</td>
                        <td className="py-3 text-slate-300">{pool.quantity}</td>
                        <td className="py-3 text-slate-300">{formatCurrency(pool.totalCost)}</td>
                        <td className="py-3 text-slate-300">{formatCurrency(pool.averageCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Disclaimer */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <p className="text-amber-400 text-sm">
                <strong className="block mb-1">⚠️ Disclaimer</strong>
                This calculator is for informational purposes only and does not constitute tax advice.
                Please consult a qualified tax professional or HMRC for official guidance.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
