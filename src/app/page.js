'use client';

import { useState, useCallback, useMemo } from 'react';

const BROKERS = [
  { id: 'schwab', name: 'Charles Schwab', icon: '🏦', description: 'Stock Plan Activity, RSU vestings' },
  { id: 'trading212', name: 'Trading 212', icon: '📈', description: 'UK investment platform' },
  { id: 'ibkr', name: 'Interactive Brokers', icon: '🌐', description: 'International broker' },
  { id: 'freetrade', name: 'Freetrade', icon: '📱', description: 'Commission-free trading' },
  { id: 'hl', name: 'Hargreaves Lansdown', icon: '🇬🇧', description: 'UK ISA & SIPP provider' },
  { id: 'generic', name: 'Generic CSV', icon: '📄', description: 'Custom CSV format' },
];

const BROKER_ICONS = {
  'Charles Schwab': '🏦',
  'Trading 212': '📈',
  'Interactive Brokers': '🌐',
  'Freetrade': '📱',
  'Hargreaves Lansdown': '🇬🇧',
  'Unknown': '📄',
};

export default function Home() {
  const [brokerUploads, setBrokerUploads] = useState([]);
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [currentFiles, setCurrentFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedBrokerFilter, setSelectedBrokerFilter] = useState('all');

  const currentFilingYear = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    if (month >= 4 && day >= 6) {
      return `${year - 1}/${String(year).slice(2)}`;
    } else {
      return `${year - 2}/${String(year - 1).slice(2)}`;
    }
  }, []);

  const availableBrokers = useMemo(() => {
    if (!result?.report?.allDisposals) return [];
    return [...new Set(result.report.allDisposals.map(d => d.broker))].sort();
  }, [result]);

  const availableYears = useMemo(() => {
    if (!result?.report?.taxYears) return [];
    return result.report.taxYears.map(y => y.taxYear);
  }, [result]);

  const filteredYearData = useMemo(() => {
    if (!result?.report?.taxYears || !selectedYear) return null;
    const yearData = result.report.taxYears.find(y => y.taxYear === selectedYear);
    if (!yearData) return null;
    if (selectedBrokerFilter === 'all') return yearData;

    const filteredDisposals = yearData.disposals.filter(d => d.broker === selectedBrokerFilter);
    const totalGains = filteredDisposals.reduce((sum, d) => d.gain >= 0 ? sum + d.gain : sum, 0);
    const totalLosses = filteredDisposals.reduce((sum, d) => d.gain < 0 ? sum + Math.abs(d.gain) : sum, 0);
    const netGain = totalGains - totalLosses;
    const taxableGain = Math.max(0, netGain - yearData.annualExemption);

    return {
      ...yearData,
      disposals: filteredDisposals,
      numberOfDisposals: filteredDisposals.length,
      totalProceeds: Math.round(filteredDisposals.reduce((sum, d) => sum + d.proceeds, 0) * 100) / 100,
      totalCost: Math.round(filteredDisposals.reduce((sum, d) => sum + d.cost, 0) * 100) / 100,
      totalGains: Math.round(totalGains * 100) / 100,
      totalLosses: Math.round(totalLosses * 100) / 100,
      netGain: Math.round(netGain * 100) / 100,
      taxableGain: Math.round(taxableGain * 100) / 100,
      estimatedTaxBasicRate: Math.round(taxableGain * 0.10 * 100) / 100,
      estimatedTaxHigherRate: Math.round(taxableGain * 0.20 * 100) / 100,
    };
  }, [result, selectedYear, selectedBrokerFilter]);

  const brokerSummary = useMemo(() => {
    if (!result?.report?.taxYears || !selectedYear) return [];
    const yearData = result.report.taxYears.find(y => y.taxYear === selectedYear);
    if (!yearData) return [];

    const byBroker = {};
    for (const disposal of yearData.disposals) {
      const broker = disposal.broker;
      if (!byBroker[broker]) {
        byBroker[broker] = { broker, disposals: 0, proceeds: 0, cost: 0, gains: 0, losses: 0 };
      }
      byBroker[broker].disposals++;
      byBroker[broker].proceeds += disposal.proceeds;
      byBroker[broker].cost += disposal.cost;
      if (disposal.gain >= 0) byBroker[broker].gains += disposal.gain;
      else byBroker[broker].losses += Math.abs(disposal.gain);
    }

    return Object.values(byBroker).map(b => ({
      ...b,
      proceeds: Math.round(b.proceeds * 100) / 100,
      cost: Math.round(b.cost * 100) / 100,
      gains: Math.round(b.gains * 100) / 100,
      losses: Math.round(b.losses * 100) / 100,
      netGain: Math.round((b.gains - b.losses) * 100) / 100,
    })).sort((a, b) => b.netGain - a.netGain);
  }, [result, selectedYear]);

  useMemo(() => {
    if (availableYears.length > 0 && !selectedYear) {
      setSelectedYear(availableYears.includes(currentFilingYear) ? currentFilingYear : availableYears[0]);
    }
  }, [availableYears, currentFilingYear, selectedYear]);

  const totalFilesCount = useMemo(() => {
    return brokerUploads.reduce((sum, upload) => sum + upload.files.length, 0) + currentFiles.length;
  }, [brokerUploads, currentFiles]);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (!selectedBroker) return;
    const droppedFiles = Array.from(e.dataTransfer.files).filter(file => file.name.endsWith('.csv'));
    if (droppedFiles.length > 0) setCurrentFiles(prev => [...prev, ...droppedFiles]);
  }, [selectedBroker]);

  const handleFileChange = (e) => setCurrentFiles(prev => [...prev, ...Array.from(e.target.files)]);
  const removeCurrentFile = (index) => setCurrentFiles(prev => prev.filter((_, i) => i !== index));

  const addBrokerFiles = () => {
    if (!selectedBroker || currentFiles.length === 0) return;
    const existingIndex = brokerUploads.findIndex(u => u.broker.id === selectedBroker.id);
    if (existingIndex >= 0) {
      setBrokerUploads(prev => prev.map((upload, idx) =>
        idx === existingIndex ? { ...upload, files: [...upload.files, ...currentFiles] } : upload
      ));
    } else {
      setBrokerUploads(prev => [...prev, { broker: selectedBroker, files: currentFiles }]);
    }
    setSelectedBroker(null);
    setCurrentFiles([]);
  };

  const removeBrokerUpload = (brokerIndex) => setBrokerUploads(prev => prev.filter((_, i) => i !== brokerIndex));

  const removeBrokerFile = (brokerIndex, fileIndex) => {
    setBrokerUploads(prev => prev.map((upload, idx) => {
      if (idx !== brokerIndex) return upload;
      return { ...upload, files: upload.files.filter((_, i) => i !== fileIndex) };
    }).filter(upload => upload.files.length > 0));
  };

  const handleSubmit = async () => {
    if (totalFilesCount === 0) return;
    if (selectedBroker && currentFiles.length > 0) addBrokerFiles();

    setLoading(true);
    setError(null);
    setSelectedYear(null);
    setSelectedBrokerFilter('all');

    try {
      const formData = new FormData();
      brokerUploads.forEach(upload => upload.files.forEach(file => formData.append('files', file)));
      currentFiles.forEach(file => formData.append('files', file));

      const response = await fetch('/api/calculate', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to calculate');
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

  const resetAll = () => {
    setResult(null);
    setBrokerUploads([]);
    setSelectedBroker(null);
    setCurrentFiles([]);
    setSelectedYear(null);
    setSelectedBrokerFilter('all');
    setError(null);
  };

  const renderS104Table = (pools, title, subtitle) => (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      <div className="p-4 bg-slate-700/30 border-b border-slate-700">
        <h4 className="text-lg font-semibold text-white">📊 {title}</h4>
        <p className="text-slate-400 text-sm mt-1">{subtitle}</p>
      </div>
      <div className="p-4">
        {pools.length === 0 ? (
          <p className="text-slate-500 text-sm italic">No holdings at this point</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-slate-400 text-sm border-b border-slate-700">
                <th className="pb-2">Symbol</th>
                <th className="pb-2 text-right">Quantity</th>
                <th className="pb-2 text-right">Total Cost</th>
                <th className="pb-2 text-right">Avg Cost/Share</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((pool, idx) => (
                <tr key={idx} className="border-b border-slate-700/30 text-sm">
                  <td className="py-2 text-white font-medium">{pool.symbol}</td>
                  <td className="py-2 text-slate-300 text-right">{pool.quantity.toLocaleString()}</td>
                  <td className="py-2 text-slate-300 text-right">{formatCurrency(pool.totalCost)}</td>
                  <td className="py-2 text-slate-300 text-right">{formatCurrency(pool.averageCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">🇬🇧 UK Capital Gains Tax Calculator</h1>
          <p className="text-slate-400">Calculate your CGT with HMRC-compliant share matching rules</p>
        </header>

        {!result && (
          <div className="space-y-6">
            {brokerUploads.length > 0 && (
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4">✅ Added Transactions</h3>
                <div className="space-y-3">
                  {brokerUploads.map((upload, brokerIdx) => (
                    <div key={brokerIdx} className="bg-slate-700/50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{upload.broker.icon}</span>
                          <div>
                            <div className="text-white font-medium">{upload.broker.name}</div>
                            <div className="text-slate-400 text-sm">{upload.files.length} file(s)</div>
                          </div>
                        </div>
                        <button onClick={() => removeBrokerUpload(brokerIdx)} className="text-red-400 hover:text-red-300 text-sm">Remove All</button>
                      </div>
                      <div className="space-y-1">
                        {upload.files.map((file, fileIdx) => (
                          <div key={fileIdx} className="flex items-center justify-between py-1 px-2 bg-slate-600/30 rounded text-sm">
                            <span className="text-slate-300">📄 {file.name}</span>
                            <button onClick={() => removeBrokerFile(brokerIdx, fileIdx)} className="text-red-400 hover:text-red-300">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-4">{brokerUploads.length > 0 ? '➕ Add Another Broker' : '📁 Select Broker & Upload'}</h3>
              {!selectedBroker ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {BROKERS.map(broker => (
                    <button key={broker.id} onClick={() => setSelectedBroker(broker)} className="p-4 bg-slate-700/50 rounded-xl border border-slate-600 hover:border-green-500 hover:bg-slate-700 transition-all text-left group">
                      <div className="text-3xl mb-2">{broker.icon}</div>
                      <div className="text-white font-medium group-hover:text-green-400 transition-colors">{broker.name}</div>
                      <div className="text-slate-400 text-xs mt-1">{broker.description}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{selectedBroker.icon}</span>
                      <div>
                        <div className="text-green-400 font-medium">{selectedBroker.name}</div>
                        <div className="text-slate-400 text-xs">{selectedBroker.description}</div>
                      </div>
                    </div>
                    <button onClick={() => { setSelectedBroker(null); setCurrentFiles([]); }} className="text-slate-400 hover:text-white text-sm">Change Broker</button>
                  </div>
                  <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${dragActive ? 'border-green-500 bg-green-500/10' : 'border-slate-600 hover:border-slate-500'}`}
                    onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                    onClick={() => document.getElementById('fileInput').click()}>
                    <div className="text-4xl mb-2">📤</div>
                    <h4 className="text-white font-medium mb-1">Upload {selectedBroker.name} CSV Files</h4>
                    <p className="text-slate-400 text-sm">Drag & drop or click to browse</p>
                  </div>
                  <input type="file" id="fileInput" className="hidden" multiple accept=".csv" onChange={handleFileChange} />
                  {currentFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {currentFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-slate-700/50 rounded-lg text-sm">
                          <span className="text-white">📄 {file.name}</span>
                          <button onClick={() => removeCurrentFile(index)} className="text-red-400 hover:text-red-300">✕</button>
                        </div>
                      ))}
                      <button onClick={addBrokerFiles} className="w-full mt-2 py-3 bg-green-600/20 text-green-400 font-medium rounded-xl border border-green-500/30 hover:bg-green-600/30 transition-all">
                        ✓ Add {currentFiles.length} file(s) from {selectedBroker.name}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button onClick={handleSubmit} disabled={totalFilesCount === 0 || loading}
              className="w-full py-4 bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold rounded-xl hover:from-green-500 hover:to-green-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg">
              {loading ? <span className="flex items-center justify-center gap-2"><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>Calculating...</span>
                : `Calculate Capital Gains Tax ${totalFilesCount > 0 ? `(${totalFilesCount} files)` : ''}`}
            </button>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <p className="text-blue-400 text-sm"><strong className="block mb-1">💡 Tip</strong>You can upload multiple CSV files from different brokers. The calculator will automatically detect the format and combine all transactions for accurate CGT calculation.</p>
            </div>
          </div>
        )}

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6"><p className="text-red-400">{error}</p></div>}

        {result && (
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
              <button onClick={resetAll} className="text-slate-400 hover:text-white transition-colors">← Calculate Again</button>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-slate-400 text-sm">Tax Year:</label>
                  <select value={selectedYear || ''} onChange={(e) => setSelectedYear(e.target.value)}
                    className="bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-green-500 outline-none text-sm">
                    {availableYears.map(year => <option key={year} value={year}>{year} {year === currentFilingYear ? '⏰' : ''}</option>)}
                  </select>
                </div>
                {availableBrokers.length > 1 && (
                  <div className="flex items-center gap-2">
                    <label className="text-slate-400 text-sm">Broker:</label>
                    <select value={selectedBrokerFilter} onChange={(e) => setSelectedBrokerFilter(e.target.value)}
                      className="bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-green-500 outline-none text-sm">
                      <option value="all">All Brokers</option>
                      {availableBrokers.map(broker => <option key={broker} value={broker}>{BROKER_ICONS[broker] || '📄'} {broker}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <button onClick={exportJSON} className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors text-sm">📄 Export JSON</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700">
                <div className="text-2xl font-bold text-white">{result.report.summary.totalDisposals}</div>
                <div className="text-slate-400 text-sm">Total Disposals</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700">
                <div className="text-2xl font-bold text-white">{result.report.summary.totalSymbolsTraded}</div>
                <div className="text-slate-400 text-sm">Assets Traded</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700">
                <div className={`text-2xl font-bold ${result.report.summary.overallGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(result.report.summary.overallGain)}</div>
                <div className="text-slate-400 text-sm">Overall Gain/Loss</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700">
                <div className="text-2xl font-bold text-white">{availableBrokers.length}</div>
                <div className="text-slate-400 text-sm">Brokers</div>
              </div>
            </div>

            {selectedBrokerFilter === 'all' && brokerSummary.length > 1 && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <div className="p-4 bg-slate-700/30 border-b border-slate-700">
                  <h4 className="text-lg font-semibold text-white">🏦 Broker-wise Summary</h4>
                  <p className="text-slate-400 text-sm mt-1">Click on a broker to filter results</p>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {brokerSummary.map((broker, idx) => (
                      <button key={idx} onClick={() => setSelectedBrokerFilter(broker.broker)}
                        className="p-4 bg-slate-700/30 rounded-xl border border-slate-600 hover:border-green-500 hover:bg-slate-700/50 transition-all text-left group">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-2xl">{BROKER_ICONS[broker.broker] || '📄'}</span>
                          <div>
                            <div className="text-white font-medium group-hover:text-green-400 transition-colors">{broker.broker}</div>
                            <div className="text-slate-400 text-xs">{broker.disposals} disposals</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div><div className="text-slate-500 text-xs">Gains</div><div className="text-green-400 font-medium">{formatCurrency(broker.gains)}</div></div>
                          <div><div className="text-slate-500 text-xs">Losses</div><div className="text-red-400 font-medium">{formatCurrency(broker.losses)}</div></div>
                          <div className="col-span-2 pt-2 border-t border-slate-600">
                            <div className="text-slate-500 text-xs">Net Gain/Loss</div>
                            <div className={`font-semibold ${broker.netGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(broker.netGain)}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {filteredYearData && (
              <div className="space-y-6">
                <div className={`bg-slate-800/50 rounded-2xl border overflow-hidden ${selectedYear === currentFilingYear ? 'border-green-500/50 ring-2 ring-green-500/20' : 'border-slate-700'}`}>
                  <div className={`p-4 border-b border-slate-700 ${selectedYear === currentFilingYear ? 'bg-green-900/30' : 'bg-slate-700/50'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="text-2xl font-bold text-white">📅 Tax Year {filteredYearData.taxYear}</h3>
                        <p className="text-slate-400 mt-1">6 April {filteredYearData.taxYear.split('/')[0]} - 5 April 20{filteredYearData.taxYear.split('/')[1]}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedBrokerFilter !== 'all' && (
                          <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-sm rounded-full font-medium flex items-center gap-1">
                            {BROKER_ICONS[selectedBrokerFilter] || '📄'} {selectedBrokerFilter}
                            <button onClick={() => setSelectedBrokerFilter('all')} className="ml-1 hover:text-white">✕</button>
                          </span>
                        )}
                        {selectedYear === currentFilingYear && <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded-full font-medium">⏰ Due Jan 31st</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {selectedBrokerFilter === 'all' && renderS104Table(filteredYearData.section104Start || [], 'Section 104 Holdings - Start of Year', `Your share pools as of 6 April ${filteredYearData.taxYear.split('/')[0]}`)}

                <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="p-4 bg-slate-700/30 border-b border-slate-700">
                    <h4 className="text-lg font-semibold text-white">📈 Capital Gains Summary {selectedBrokerFilter !== 'all' && <span className="ml-2 text-sm font-normal text-slate-400">({selectedBrokerFilter} only)</span>}</h4>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                      <div><div className="text-slate-400 text-sm">Total Proceeds</div><div className="text-white font-semibold text-lg">{formatCurrency(filteredYearData.totalProceeds)}</div></div>
                      <div><div className="text-slate-400 text-sm">Total Cost</div><div className="text-white font-semibold text-lg">{formatCurrency(filteredYearData.totalCost)}</div></div>
                      <div><div className="text-slate-400 text-sm">Total Gains</div><div className="text-green-400 font-semibold text-lg">{formatCurrency(filteredYearData.totalGains)}</div></div>
                      <div><div className="text-slate-400 text-sm">Total Losses</div><div className="text-red-400 font-semibold text-lg">{formatCurrency(filteredYearData.totalLosses)}</div></div>
                      <div><div className="text-slate-400 text-sm">Net Gain/Loss</div><div className={`font-semibold text-lg ${filteredYearData.netGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(filteredYearData.netGain)}</div></div>
                      <div><div className="text-slate-400 text-sm">Annual Exemption</div><div className="text-white font-semibold text-lg">{formatCurrency(filteredYearData.annualExemption)}</div></div>
                    </div>
                    <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 rounded-xl p-4 border border-amber-700/50">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-amber-200 font-medium">Taxable Gain</span>
                        <span className="text-2xl font-bold text-white">{formatCurrency(filteredYearData.taxableGain)}</span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center"><span className="text-slate-400">Estimated Tax (Basic Rate 10%)</span><span className="text-amber-400 font-medium">{formatCurrency(filteredYearData.estimatedTaxBasicRate)}</span></div>
                        <div className="flex justify-between items-center"><span className="text-slate-400">Estimated Tax (Higher Rate 20%)</span><span className="text-amber-400 font-medium">{formatCurrency(filteredYearData.estimatedTaxHigherRate)}</span></div>
                      </div>
                      {selectedBrokerFilter !== 'all' && <p className="text-amber-400/60 text-xs mt-3 italic">* Tax calculations shown for this broker only. View "All Brokers" for combined tax liability.</p>}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="p-4 bg-slate-700/30 border-b border-slate-700">
                    <h4 className="text-lg font-semibold text-white">📋 Disposals Detail</h4>
                    <p className="text-slate-400 text-sm mt-1">{filteredYearData.numberOfDisposals} disposals in this tax year</p>
                  </div>
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-slate-400 text-sm border-b border-slate-700">
                          <th className="pb-3 pr-4">Date</th>
                          <th className="pb-3 pr-4">Symbol</th>
                          {selectedBrokerFilter === 'all' && <th className="pb-3 pr-4">Broker</th>}
                          <th className="pb-3 pr-4 text-right">Qty</th>
                          <th className="pb-3 pr-4 text-right">Proceeds</th>
                          <th className="pb-3 pr-4 text-right">Cost</th>
                          <th className="pb-3 pr-4 text-right">Gain/Loss</th>
                          <th className="pb-3">Match Rule</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredYearData.disposals.map((disposal, idx) => (
                          <tr key={idx} className="border-b border-slate-700/50 text-sm">
                            <td className="py-3 pr-4 text-white">{disposal.date}</td>
                            <td className="py-3 pr-4 text-white font-medium">{disposal.symbol}</td>
                            {selectedBrokerFilter === 'all' && <td className="py-3 pr-4 text-slate-400"><span title={disposal.broker}>{BROKER_ICONS[disposal.broker] || '📄'}</span></td>}
                            <td className="py-3 pr-4 text-slate-300 text-right">{disposal.quantity}</td>
                            <td className="py-3 pr-4 text-slate-300 text-right">{formatCurrency(disposal.proceeds)}</td>
                            <td className="py-3 pr-4 text-slate-300 text-right">{formatCurrency(disposal.cost)}</td>
                            <td className={`py-3 pr-4 font-medium text-right ${disposal.gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(disposal.gain)}</td>
                            <td className="py-3">
                              <div className="flex flex-wrap gap-1">
                                {disposal.matchDetails.map((match, mIdx) => (
                                  <div key={mIdx} className="group/match relative">
                                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium cursor-help ${match.rule === 'SAME_DAY' ? 'bg-blue-500/20 text-blue-400' : match.rule === 'BED_AND_BREAKFAST' ? 'bg-orange-500/20 text-orange-400' : 'bg-purple-500/20 text-purple-400'}`}>
                                      {match.rule === 'SAME_DAY' ? 'Same Day' : match.rule === 'BED_AND_BREAKFAST' ? 'B&B' : 'S104'}{match.isRSU && ' 🏢'}
                                    </span>
                                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover/match:block z-50">
                                      <div className={`p-3 rounded-lg text-xs w-64 shadow-xl ${match.rule === 'SAME_DAY' ? 'bg-blue-900 border border-blue-700' : match.rule === 'BED_AND_BREAKFAST' ? 'bg-orange-900 border border-orange-700' : 'bg-purple-900 border border-purple-700'}`}>
                                        <div className="font-semibold mb-2 text-white">{match.rule === 'SAME_DAY' ? '📅 Same Day Rule' : match.rule === 'BED_AND_BREAKFAST' ? '🛏️ Bed & Breakfast' : '📊 Section 104 Pool'}{match.isRSU && <span className="ml-2 text-green-400">(RSU)</span>}</div>
                                        <div className="space-y-1 text-slate-300">
                                          <div>Qty: <span className="text-white">{match.quantity}</span></div>
                                          <div>Cost/Share: <span className="text-white">{formatCurrency(match.costPerShare || 0)}</span></div>
                                          <div>Proceeds/Share: <span className="text-white">{formatCurrency(match.proceedsPerShare || 0)}</span></div>
                                          <div className={(match.gainPerShare || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>Gain/Share: {formatCurrency(match.gainPerShare || 0)}</div>
                                          {match.acquisitionDate && <div className="pt-1 border-t border-slate-600 mt-1">Acquired: {match.acquisitionDate}{match.daysDifference && <span className="text-orange-400"> ({match.daysDifference}d after sale)</span>}</div>}
                                          {match.bnbImpact && <div className="pt-1 border-t border-slate-600 mt-1"><div className="text-orange-300 font-medium">B&B Impact:</div><div>S104 would be: {formatCurrency(match.bnbImpact.s104CostPerShareWouldBe)}/sh</div><div className={match.bnbImpact.costDifference > 0 ? 'text-green-400' : 'text-red-400'}>{match.bnbImpact.costDifference > 0 ? '↑' : '↓'} {formatCurrency(Math.abs(match.bnbImpact.costDifference))}/sh</div></div>}
                                          {match.rule === 'SECTION_104' && <div className="pt-1 border-t border-slate-600 mt-1">Pool: {match.poolQuantityBefore} → {match.poolQuantityAfter} shares<div>Avg: {formatCurrency(match.averageCost)}/share</div></div>}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedBrokerFilter === 'all' && renderS104Table(filteredYearData.section104End || [], 'Section 104 Holdings - End of Year', `Your share pools as of 5 April 20${filteredYearData.taxYear.split('/')[1]}`)}
              </div>
            )}

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <p className="text-amber-400 text-sm"><strong className="block mb-1">⚠️ Disclaimer</strong>This calculator is for informational purposes only and does not constitute tax advice. Please consult a qualified tax professional or HMRC for official guidance.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
