'use client';

import { useState, useCallback } from 'react';
import { BROKERS, formatCurrency } from '@/lib/constants';
import { downloadCGTReport } from '@/lib/pdf-generator';

export default function CGTStep({ taxYear, cgtResult, setCgtResult, incomeData, onBack, onNext, onSkip }) {
  const [brokerUploads, setBrokerUploads] = useState([]);
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [currentFiles, setCurrentFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const totalFilesCount = brokerUploads.reduce((sum, u) => sum + u.files.length, 0) + currentFiles.length;

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
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.name.endsWith('.csv') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    );
    if (files.length) setCurrentFiles(prev => [...prev, ...files]);
  }, [selectedBroker]);

  const handleFileChange = (e) => setCurrentFiles(prev => [...prev, ...Array.from(e.target.files)]);

  const addBrokerFiles = () => {
    if (!selectedBroker || !currentFiles.length) return;
    const idx = brokerUploads.findIndex(u => u.broker.id === selectedBroker.id);
    if (idx >= 0) {
      setBrokerUploads(prev => prev.map((u, i) => i === idx ? { ...u, files: [...u.files, ...currentFiles] } : u));
    } else {
      setBrokerUploads(prev => [...prev, { broker: selectedBroker, files: currentFiles }]);
    }
    setSelectedBroker(null);
    setCurrentFiles([]);
  };

  const calculate = async () => {
    if (selectedBroker && currentFiles.length) addBrokerFiles();
    if (!brokerUploads.length && !currentFiles.length) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();

      // Pass files with their associated broker info
      brokerUploads.forEach(u => {
        u.files.forEach(f => {
          formData.append('files', f);
          formData.append('brokers', u.broker.id); // Pass broker ID for each file
        });
      });

      // Handle any remaining current files (shouldn't happen as addBrokerFiles is called above)
      currentFiles.forEach(f => {
        formData.append('files', f);
        formData.append('brokers', selectedBroker?.id || 'unknown');
      });

      const res = await fetch('/api/calculate', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to calculate');
      setCgtResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const yearData = cgtResult?.report?.taxYears?.find(y => y.taxYear === taxYear);

  // Results view
  if (cgtResult && yearData) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">✅ CGT Calculated</h2>
          <p className="text-slate-400">Tax Year {taxYear}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Disposals" value={yearData.numberOfDisposals} />
          <StatCard label="Net Gain" value={formatCurrency(yearData.netGain)} color={yearData.netGain >= 0 ? 'green' : 'red'} />
          <StatCard label="Taxable" value={formatCurrency(yearData.taxableGain)} />
          <StatCard label="Exemption" value={formatCurrency(yearData.annualExemption)} />
        </div>

        {/* Download PDF Button */}
        <div className="flex justify-center">
          <button
            onClick={() => downloadCGTReport(yearData, taxYear)}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transition-all"
          >
            <span className="text-xl">📄</span>
            <span>Download CGT Report (PDF)</span>
          </button>
        </div>

        {yearData.rateChange && (
          <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
            <p className="text-blue-400 font-medium mb-2">⚠️ CGT Rates Changed 30 Oct 2024</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-400">Before 30 Oct</p>
                <p className="text-white">{yearData.rateChange.preOctober.disposalCount} disposals</p>
                <p className="text-green-400">Gains: {formatCurrency(yearData.rateChange.preOctober.gains)}</p>
                <p className="text-red-400">Losses: {formatCurrency(yearData.rateChange.preOctober.losses)}</p>
                <p className="text-white font-medium">Net: {formatCurrency(yearData.rateChange.preOctober.netGain)}</p>
                <p className="text-slate-500 text-xs mt-1">10% / 20%</p>
              </div>
              <div>
                <p className="text-slate-400">From 30 Oct</p>
                <p className="text-white">{yearData.rateChange.postOctober.disposalCount} disposals</p>
                <p className="text-green-400">Gains: {formatCurrency(yearData.rateChange.postOctober.gains)}</p>
                <p className="text-red-400">Losses: {formatCurrency(yearData.rateChange.postOctober.losses)}</p>
                <p className="text-white font-medium">Net: {formatCurrency(yearData.rateChange.postOctober.netGain)}</p>
                <p className="text-slate-500 text-xs mt-1">18% / 24%</p>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 rounded-lg text-white font-medium transition-all flex items-center justify-center gap-2"
        >
          <span className="text-lg">{showDetails ? '📊' : '🔍'}</span>
          {showDetails ? 'Hide Transaction Details' : 'View Transaction Details'}
          <span className="text-slate-400 text-sm">{showDetails ? '▲' : '▼'}</span>
        </button>

        {showDetails && (
          <div className="space-y-6">
            {/* Section 104 Holdings at Start of Tax Year */}
            {yearData.section104Start && yearData.section104Start.length > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                  <span className="text-purple-400">📊</span>
                  Section 104 Holdings at Start of Tax Year
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="p-2">Symbol</th>
                        <th className="p-2 text-right">Quantity</th>
                        <th className="p-2 text-right">Total Cost</th>
                        <th className="p-2 text-right">Avg Cost/Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearData.section104Start.map((pool, i) => (
                        <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="p-2 text-white font-medium">{pool.symbol}</td>
                          <td className="p-2 text-slate-300 text-right">{pool.quantity.toLocaleString()}</td>
                          <td className="p-2 text-slate-300 text-right">{formatCurrency(pool.totalCost)}</td>
                          <td className="p-2 text-slate-300 text-right">{formatCurrency(pool.averageCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Disposals Table */}
            <div className="overflow-x-auto overflow-y-visible">
              <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                <span className="text-blue-400">📋</span>
                Disposals
              </h3>
              <table className="w-full text-sm" style={{ overflow: 'visible' }}>
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="p-2">Date</th>
                    <th className="p-2">Symbol</th>
                    <th className="p-2">Broker</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Proceeds</th>
                    <th className="p-2 text-right">Cost</th>
                    <th className="p-2 text-right">Gain/Loss</th>
                    <th className="p-2">Matching Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {yearData.disposals.map((d, i) => (
                    <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="p-2 text-white">{d.date}</td>
                      <td className="p-2 text-white font-medium">{d.symbol}</td>
                      <td className="p-2 text-slate-400 text-xs">{d.broker || '—'}</td>
                      <td className="p-2 text-slate-300 text-right">{d.quantity}</td>
                      <td className="p-2 text-slate-300 text-right">{formatCurrency(d.proceeds)}</td>
                      <td className="p-2 text-slate-300 text-right">{formatCurrency(d.cost)}</td>
                      <td className={`p-2 text-right font-medium ${d.gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(d.gain)}</td>
                      <td className="p-2">
                        <MatchingRuleBadges matchDetails={d.matchDetails} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section 104 Holdings at End of Tax Year */}
            {yearData.section104End && yearData.section104End.length > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                  <span className="text-green-400">📊</span>
                  Section 104 Holdings at End of Tax Year
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="p-2">Symbol</th>
                        <th className="p-2 text-right">Quantity</th>
                        <th className="p-2 text-right">Total Cost</th>
                        <th className="p-2 text-right">Avg Cost/Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearData.section104End.map((pool, i) => (
                        <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="p-2 text-white font-medium">{pool.symbol}</td>
                          <td className="p-2 text-slate-300 text-right">{pool.quantity.toLocaleString()}</td>
                          <td className="p-2 text-slate-300 text-right">{formatCurrency(pool.totalCost)}</td>
                          <td className="p-2 text-slate-300 text-right">{formatCurrency(pool.averageCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between pt-4">
          <button onClick={onBack} className="px-4 py-2 text-slate-400 hover:text-white">← Back</button>
          <button onClick={onNext} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500">
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // Upload view
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">📈 Capital Gains</h2>
        <p className="text-slate-400">Upload your broker transaction history</p>
        <p className="text-amber-400 text-sm mt-2 font-medium">
          ⚠️ Include all past years for accurate average cost per share calculations
        </p>
      </div>

      {/* Info banner about multiple brokers - compact */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🏦</div>
          <div className="flex-1">
            <span className="font-semibold">Multiple Brokers?</span>
            <span className="text-blue-100 text-sm ml-2">Add statements from Schwab, Trading 212, IBKR & more — we'll combine everything automatically.</span>
          </div>
        </div>
        <div className="mt-2 px-2 py-1.5 bg-amber-500/20 rounded border border-amber-400/40 flex items-center gap-2">
          <span>🛡️</span>
          <span className="text-amber-200 text-xs"><strong className="text-amber-300">ISA:</strong> No need to upload — ISA investments are tax-free.</span>
        </div>
      </div>

      {/* Already uploaded brokers */}
      {brokerUploads.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-white font-medium">📁 Uploaded Statements</p>
            <span className="text-slate-400 text-sm">{brokerUploads.length} broker(s), {totalFilesCount} file(s)</span>
          </div>

          {brokerUploads.map((u, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-green-900/20 border border-green-700/50 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{u.broker.icon}</span>
                <div>
                  <p className="text-white font-medium">{u.broker.name}</p>
                  <p className="text-slate-400 text-sm">{u.files.length} file(s): {u.files.map(f => f.name).join(', ')}</p>
                </div>
              </div>
              <button
                onClick={() => setBrokerUploads(prev => prev.filter((_, idx) => idx !== i))}
                className="text-red-400 hover:text-red-300 p-2"
              >
                ✕
              </button>
            </div>
          ))}

        </div>
      )}

      {/* Broker selection */}
      {!selectedBroker && brokerUploads.length === 0 && (
        <div>
          <p className="text-white font-medium mb-3">🏦 Select Your Broker</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {BROKERS.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedBroker(b)}
                className="p-4 bg-slate-700 rounded-lg hover:bg-slate-600 text-left border border-slate-600 hover:border-slate-500"
              >
                <span className="text-2xl">{b.icon}</span>
                <p className="text-white font-medium mt-1">{b.name}</p>
                <p className="text-slate-400 text-xs">{b.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add another broker - show broker grid */}
      {!selectedBroker && brokerUploads.length > 0 && (
        <div>
          <p className="text-white font-medium mb-3">➕ Add Another Broker</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {BROKERS.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedBroker(b)}
                className="p-4 bg-slate-700 rounded-lg hover:bg-slate-600 text-left border border-slate-600 hover:border-slate-500"
              >
                <span className="text-2xl">{b.icon}</span>
                <p className="text-white font-medium mt-1">{b.name}</p>
                <p className="text-slate-400 text-xs">{b.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* File upload for selected broker */}
      {selectedBroker && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-blue-900/30 border border-blue-600 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{selectedBroker.icon}</span>
              <div>
                <p className="text-blue-400 font-medium">{selectedBroker.name}</p>
                <p className="text-slate-400 text-xs">{selectedBroker.description}</p>
              </div>
            </div>
            <button
              onClick={() => { setSelectedBroker(null); setCurrentFiles([]); }}
              className="text-slate-400 hover:text-white text-sm px-3 py-1 border border-slate-600 rounded"
            >
              Change
            </button>
          </div>

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer ${
              dragActive ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => document.getElementById('fileInput').click()}
          >
            <p className="text-3xl mb-2">📤</p>
            <p className="text-white">Drag & drop CSV or Excel files</p>
            <p className="text-slate-400 text-sm">or click to browse (.csv, .xlsx, .xls)</p>
          </div>
          <input type="file" id="fileInput" className="hidden" multiple accept=".csv,.xlsx,.xls" onChange={handleFileChange} />

          {currentFiles.length > 0 && (
            <div className="space-y-2">
              {currentFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-700 rounded-lg">
                  <span className="text-white text-sm">📄 {f.name}</span>
                  <button onClick={() => setCurrentFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300">✕</button>
                </div>
              ))}

              {/* Prominent Add Files button */}
              <button
                onClick={addBrokerFiles}
                className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500"
              >
                ✓ Add {currentFiles.length} file(s) from {selectedBroker.name}
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-red-400">⚠️ {error}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="border-t border-slate-700 pt-6 mt-6">
        <div className="flex justify-between items-center">
          <button onClick={onBack} className="px-4 py-2 text-slate-400 hover:text-white">
            ← Back
          </button>

          <div className="flex items-center gap-3">
            <button onClick={onSkip} className="px-4 py-2 text-slate-400 hover:text-white">
              Skip CGT →
            </button>

            <button
              onClick={calculate}
              disabled={totalFilesCount === 0 || loading}
              className={`px-6 py-3 rounded-lg font-medium ${
                totalFilesCount > 0 && !loading
                  ? 'bg-green-600 text-white hover:bg-green-500'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Calculating...
                </span>
              ) : (
                `🧮 Calculate CGT${brokerUploads.length > 0 ? ` (${brokerUploads.length} broker${brokerUploads.length > 1 ? 's' : ''})` : ''}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  const textColor = color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-400' : 'text-white';
  return (
    <div className="bg-slate-700 rounded-lg p-3 text-center">
      <p className={`text-lg font-bold ${textColor}`}>{value}</p>
      <p className="text-slate-400 text-xs">{label}</p>
    </div>
  );
}

function MatchingRuleBadges({ matchDetails }) {
  if (!matchDetails || matchDetails.length === 0) {
    return <span className="text-slate-500 text-xs">—</span>;
  }

  const ruleConfig = {
    SAME_DAY: {
      label: 'Same Day',
      shortLabel: 'SD',
      bgColor: 'bg-purple-500/20',
      textColor: 'text-purple-400',
      borderColor: 'border-purple-500/50',
      hoverBg: 'hover:bg-purple-500/30',
      hmrcUrl: 'https://www.gov.uk/hmrc-internal-manuals/capital-gains-manual/cg51560#IDATX33F',
      description: 'Shares sold are matched with shares of the same class acquired on the same day.',
    },
    BED_AND_BREAKFAST: {
      label: 'Bed & Breakfast',
      shortLabel: 'B&B',
      bgColor: 'bg-orange-500/20',
      textColor: 'text-orange-400',
      borderColor: 'border-orange-500/50',
      hoverBg: 'hover:bg-orange-500/30',
      hmrcUrl: 'https://www.gov.uk/hmrc-internal-manuals/capital-gains-manual/cg51560#IDATR33F',
      description: 'You re-purchased this stock within 30 days of selling. HMRC requires using the cost of the NEW purchase (not your Section 104 pool) to calculate your gain/loss.',
    },
    SECTION_104: {
      label: 'Section 104',
      shortLabel: 'S104',
      bgColor: 'bg-blue-500/20',
      textColor: 'text-blue-400',
      borderColor: 'border-blue-500/50',
      hoverBg: 'hover:bg-blue-500/30',
      hmrcUrl: 'https://www.gov.uk/tax-sell-shares/work-out-your-gain',
      description: 'Shares matched from the Section 104 holding (pooled average cost basis).',
    },
  };

  // Group matchDetails by rule type
  const groupedByRule = matchDetails.reduce((acc, detail) => {
    const rule = detail.rule;
    if (!acc[rule]) {
      acc[rule] = {
        rule,
        details: [],
        totalQuantity: 0,
        totalCost: 0,
      };
    }
    acc[rule].details.push(detail);
    acc[rule].totalQuantity += detail.quantity;
    acc[rule].totalCost += detail.cost;
    return acc;
  }, {});

  return (
    <div className="flex flex-wrap gap-1">
      {Object.values(groupedByRule).map((group) => {
        const config = ruleConfig[group.rule] || {
          label: group.rule,
          shortLabel: group.rule,
          bgColor: 'bg-slate-500/20',
          textColor: 'text-slate-400',
          borderColor: 'border-slate-500/50',
          hoverBg: 'hover:bg-slate-500/30',
        };

        // For the tooltip, use combined data or first detail for some fields
        const firstDetail = group.details[0];

        return (
          <div key={group.rule} className="group relative inline-block">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border cursor-help ${config.bgColor} ${config.textColor} ${config.borderColor} ${config.hoverBg}`}
            >
              {config.shortLabel}
            </span>

            {/* Invisible bridge to keep hover when moving to tooltip */}
            <div className="hidden group-hover:block absolute right-full top-0 w-4 h-full"></div>

            {/* Hover tooltip - positioned to the LEFT of badge, aligned to top */}
            <div className="hidden group-hover:block absolute right-full top-0 mr-2 z-[9999] w-80 pr-2">
              <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl p-4 text-xs">
                <div className={`font-bold ${config.textColor} mb-1 text-sm`}>
                  {config.label} Rule
                </div>

                {config.description && (
                  <p className="text-slate-400 text-xs mb-3">{config.description}</p>
                )}

                {config.hmrcUrl && (
                  <a
                    href={config.hmrcUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs mb-3 underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    📖 Read HMRC guidance →
                  </a>
                )}

                <div className="space-y-2 text-slate-300">
                  {firstDetail.broker && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Broker:</span>
                      <span className="text-white">{firstDetail.broker}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-slate-400">Quantity matched:</span>
                    <span className="text-white font-medium">{group.totalQuantity} shares</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Total cost:</span>
                    <span className="text-white font-medium">{formatCurrency(group.totalCost)}</span>
                  </div>

                  {/* Show individual acquisitions if multiple */}
                  {group.details.length > 1 && (
                    <div className="border-t border-slate-700 pt-2 mt-2">
                      <p className="text-slate-400 mb-2">Matched from {group.details.length} acquisitions:</p>
                      {group.details.map((detail, i) => (
                        <div key={i} className="py-2 border-b border-slate-700/50 last:border-0">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">{detail.acquisitionDate || 'Unknown date'}</span>
                            <span className="text-white">{detail.quantity} shares</span>
                          </div>
                          <div className="flex justify-between text-xs mt-1">
                            <span className="text-slate-500">Cost/Proceeds/Gain per share:</span>
                            <span className="text-slate-300">
                              {formatCurrency(detail.costPerShare)} / {formatCurrency(detail.proceedsPerShare)} /
                              <span className={detail.gainPerShare >= 0 ? ' text-green-400' : ' text-red-400'}>
                                {formatCurrency(detail.gainPerShare)}
                              </span>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Show single acquisition details */}
                  {group.details.length === 1 && firstDetail.acquisitionDate && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">
                        {group.rule === 'BED_AND_BREAKFAST' ? 'Re-purchase date:' : 'Acquisition date:'}
                      </span>
                      <span className="text-white font-medium">{firstDetail.acquisitionDate}</span>
                    </div>
                  )}

                  {group.details.length === 1 && firstDetail.daysDifference !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Days after sale:</span>
                      <span className="text-orange-400 font-medium">{firstDetail.daysDifference} days</span>
                    </div>
                  )}

                  {/* B&B Explanation Box - Show all matched purchases */}
                  {group.rule === 'BED_AND_BREAKFAST' && (
                    <div className="mt-3 p-3 bg-orange-900/30 border border-orange-500/40 rounded-lg">
                      <div className="text-orange-300 font-medium text-xs mb-2">
                        📌 Cost taken from {group.details.length > 1 ? `${group.details.length} re-purchases` : 're-purchase'}:
                      </div>
                      <div className="space-y-2">
                        {group.details.map((detail, idx) => (
                          <div key={idx} className={`${group.details.length > 1 ? 'p-2 bg-slate-800/50 rounded' : ''}`}>
                            <p className="text-white text-sm font-medium">
                              {detail.quantity} units{detail.broker ? ` on ${detail.broker}` : ''}
                            </p>
                            {/* Show original currency if not GBP */}
                            {detail.originalCurrency && detail.originalCurrency !== 'GBP' ? (
                              <div className="text-xs mt-1">
                                <span className="text-slate-400">Price: </span>
                                <span className="text-blue-400">${detail.originalCostPerShare?.toFixed(2)}</span>
                                <span className="text-slate-500"> → </span>
                                <span className="text-white">{formatCurrency(detail.costPerShare)}</span>
                                <span className="text-slate-500 text-xs ml-1">(FX: {detail.exchangeRate?.toFixed(4)})</span>
                              </div>
                            ) : (
                              <p className="text-slate-300 text-xs mt-1">
                                @ {formatCurrency(detail.costPerShare)}/share
                              </p>
                            )}
                            {detail.acquisitionDate && (
                              <p className="text-slate-400 text-xs mt-0.5">
                                Bought on {detail.acquisitionDate}
                                {detail.daysDifference !== undefined && (
                                  <span className="text-orange-400"> ({detail.daysDifference} days after sale)</span>
                                )}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      {group.details.length > 1 && (
                        <div className="mt-2 pt-2 border-t border-orange-500/30 text-xs text-slate-400">
                          Total: {group.totalQuantity} units, avg cost {formatCurrency(group.totalCost / group.totalQuantity)}/share
                        </div>
                      )}
                    </div>
                  )}

                  {group.details.length === 1 && (
                    <div className="border-t border-slate-700 pt-2 mt-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Cost per share:</span>
                        <span className="text-white">{formatCurrency(firstDetail.costPerShare)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Proceeds per share:</span>
                        <span className="text-white">{formatCurrency(firstDetail.proceedsPerShare)}</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span className="text-slate-400">Gain per share:</span>
                        <span className={firstDetail.gainPerShare >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatCurrency(firstDetail.gainPerShare)}
                        </span>
                      </div>
                    </div>
                  )}

                  {firstDetail.isRSU && (
                    <div className="mt-2 px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs font-medium">
                      📊 RSU Vesting
                    </div>
                  )}

                  {/* B&B specific impact analysis */}
                  {firstDetail.bnbImpact && (
                    <div className="mt-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                      <div className="text-orange-400 font-bold mb-2">⚠️ B&B Impact Analysis</div>
                      <div className="text-slate-300 space-y-1">
                        <div className="flex justify-between">
                          <span>S104 cost would be:</span>
                          <span className="text-white">{formatCurrency(firstDetail.bnbImpact.s104CostPerShareWouldBe)}/share</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Actual B&B cost:</span>
                          <span className="text-white">{formatCurrency(firstDetail.bnbImpact.actualCostPerShare)}/share</span>
                        </div>
                        <div className={`mt-2 pt-2 border-t border-orange-500/30 font-medium ${firstDetail.bnbImpact.costDifference > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {firstDetail.bnbImpact.explanation}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* S104 pool info */}
                  {group.rule === 'SECTION_104' && firstDetail.poolQuantityBefore !== undefined && (
                    <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <div className="text-blue-400 font-bold mb-2">📊 Section 104 Pool</div>
                      <div className="text-slate-300 space-y-1">
                        <div className="flex justify-between">
                          <span>Pool before disposal:</span>
                          <span className="text-white">{firstDetail.poolQuantityBefore} shares</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Pool after disposal:</span>
                          <span className="text-white">{firstDetail.poolQuantityAfter} shares</span>
                        </div>
                        <div className="flex justify-between font-medium border-t border-blue-500/30 pt-2 mt-2">
                          <span>Average cost used:</span>
                          <span className="text-white">{formatCurrency(firstDetail.averageCost)}/share</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Arrow pointer on right side */}
                <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 border-r border-t border-slate-600 transform rotate-45"></div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
