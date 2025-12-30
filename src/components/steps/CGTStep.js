'use client';

import { useState, useCallback } from 'react';
import { BROKERS, formatCurrency } from '@/lib/constants';
import { downloadCGTReport } from '@/lib/pdf-generator';
import {
  trackBrokerSelected,
  trackBrokerFileUpload,
  trackFilesAdded,
  trackCalculationStarted,
  trackCalculationResult
} from '@/lib/analytics';
import { trackCGTCalculationComplete } from '@/lib/meta-pixel';

export default function CGTStep({ taxYear, cgtResult, setCgtResult, incomeData, onBack, onNext, onSkip }) {
  const [brokerUploads, setBrokerUploads] = useState([]);
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [currentFiles, setCurrentFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [viewMode, setViewMode] = useState('disposals'); // 'disposals' or 'all-transactions'
  const [transactionAdjustments, setTransactionAdjustments] = useState({}); // { 'brokerId_index': { pricePerUnit, totalAmount } }
  const [manualTransactions, setManualTransactions] = useState([]); // New manual transactions
  const [deletedTransactionIds, setDeletedTransactionIds] = useState(new Set()); // Track deleted transactions
  const [showAddTransactionForm, setShowAddTransactionForm] = useState(false);

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

  const handleBrokerSelect = (broker) => {
    setSelectedBroker(broker);
    // Track broker selection
    trackBrokerSelected(broker.id);
  };

  const addBrokerFiles = () => {
    if (!selectedBroker || !currentFiles.length) return;

    // Track file upload for this broker
    const fileTypes = [...new Set(currentFiles.map(f => f.name.split('.').pop()?.toLowerCase()))];
    trackBrokerFileUpload({
      brokerId: selectedBroker.id,
      fileCount: currentFiles.length,
      fileTypes,
    });

    const idx = brokerUploads.findIndex(u => u.broker.id === selectedBroker.id);
    let updatedBrokerUploads;
    if (idx >= 0) {
      updatedBrokerUploads = brokerUploads.map((u, i) => i === idx ? { ...u, files: [...u.files, ...currentFiles] } : u);
      setBrokerUploads(updatedBrokerUploads);
    } else {
      updatedBrokerUploads = [...brokerUploads, { broker: selectedBroker, files: currentFiles }];
      setBrokerUploads(updatedBrokerUploads);
    }

    // Track that user clicked "Add Files" (after files are added to the list)
    const totalFilesAfterAdd = updatedBrokerUploads.reduce((sum, u) => sum + u.files.length, 0);
    trackFilesAdded({
      brokerId: selectedBroker.id,
      fileCount: currentFiles.length,
      totalBrokers: updatedBrokerUploads.length,
      totalFiles: totalFilesAfterAdd,
    });

    setSelectedBroker(null);
    setCurrentFiles([]);
  };

  const calculate = async () => {
    // First, add any pending files to brokerUploads
    let finalBrokerUploads = [...brokerUploads];
    if (selectedBroker && currentFiles.length) {
      const idx = finalBrokerUploads.findIndex(u => u.broker.id === selectedBroker.id);
      if (idx >= 0) {
        finalBrokerUploads[idx] = { ...finalBrokerUploads[idx], files: [...finalBrokerUploads[idx].files, ...currentFiles] };
      } else {
        finalBrokerUploads.push({ broker: selectedBroker, files: currentFiles });
      }
      setBrokerUploads(finalBrokerUploads);
      setSelectedBroker(null);
      setCurrentFiles([]);
    }

    if (!finalBrokerUploads.length) return;

    // Get broker IDs for tracking
    const brokerIds = finalBrokerUploads.map(u => u.broker.id);
    const totalFiles = finalBrokerUploads.reduce((sum, u) => sum + u.files.length, 0);

    // Track calculation started
    trackCalculationStarted({
      brokers: brokerIds,
      totalFiles,
    });

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();

      // Pass files with their associated broker info
      finalBrokerUploads.forEach(u => {
        u.files.forEach(f => {
          formData.append('files', f);
          formData.append('brokers', u.broker.id); // Pass broker ID for each file
        });
      });

      // Pass transaction adjustments as JSON
      formData.append('adjustments', JSON.stringify(transactionAdjustments));

      // Pass deleted transaction IDs
      formData.append('deletedTransactionIds', JSON.stringify(Array.from(deletedTransactionIds)));

      // Pass manual transactions
      formData.append('manualTransactions', JSON.stringify(manualTransactions));

      const res = await fetch('/api/calculate', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to calculate');
      setCgtResult(data);

      // Track successful calculation
      const resultYear = data?.report?.taxYears?.find(y => y.taxYear === taxYear);
      trackCalculationResult({
        success: true,
        disposals: resultYear?.numberOfDisposals || 0,
        netGain: resultYear?.netGain || 0,
        taxableGain: resultYear?.taxableGain || 0,
        brokers: brokerIds,
      });

      // Fire Meta Pixel conversion event
      trackCGTCalculationComplete({
        taxYear,
        brokers: brokerIds,
        disposals: resultYear?.numberOfDisposals || 0,
        netGain: resultYear?.netGain || 0,
        taxableGain: resultYear?.taxableGain || 0,
      });
    } catch (err) {
      setError(err.message);

      // Track failed calculation
      trackCalculationResult({
        success: false,
        error: err.message,
        brokers: brokerIds,
      });
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

              {/* Transaction View Toggle */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setViewMode('disposals')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                    viewMode === 'disposals'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  📋 Disposals ({yearData.disposals.length})
                </button>
                <button
                  onClick={() => setViewMode('all-transactions')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                    viewMode === 'all-transactions'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  📊 All Transactions ({cgtResult?.totalTransactions || 0})
                </button>
              </div>

              {/* Disposals Table - responsive */}
              {viewMode === 'disposals' && (
              <div className="overflow-x-auto overflow-y-visible">
                <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                  <span className="text-blue-400">📋</span>
                  Disposals
                </h3>

                {/* Desktop table - hidden on mobile */}
                <table className="hidden md:table w-full text-sm" style={{ overflow: 'visible' }}>
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

                {/* Mobile cards - shown only on mobile */}
                <div className="md:hidden space-y-3">
                  {yearData.disposals.map((d, i) => (
                    <div key={i} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600/50">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-white font-bold text-lg">{d.symbol}</span>
                          <span className="text-slate-400 text-xs ml-2">{d.broker}</span>
                        </div>
                        <span className={`text-lg font-bold ${d.gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(d.gain)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div>
                          <span className="text-slate-400 text-xs">Date</span>
                          <p className="text-white">{d.date}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 text-xs">Quantity</span>
                          <p className="text-white">{d.quantity}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 text-xs">Proceeds</span>
                          <p className="text-white">{formatCurrency(d.proceeds)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 text-xs">Cost</span>
                          <p className="text-white">{formatCurrency(d.cost)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-600/50">
                        <span className="text-slate-400 text-xs">Matching Rule</span>
                        <MatchingRuleBadges matchDetails={d.matchDetails} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {/* All Transactions View */}
              {viewMode === 'all-transactions' && (
                <div className="space-y-6">
                  <div className="p-3 bg-blue-900/30 border border-blue-700 rounded text-blue-200 text-sm">
                    💡 <strong>Tip:</strong> Click on Price values to adjust them. Amount is calculated automatically from price × quantity. Click "Recalculate" to apply adjustments and recalculate CGT.
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowAddTransactionForm(!showAddTransactionForm)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium text-sm"
                    >
                      {showAddTransactionForm ? '✕ Cancel' : '+ Add Transaction'}
                    </button>
                  </div>

                  {showAddTransactionForm && (
                    <AddTransactionForm
                      onAdd={(txn) => {
                        setManualTransactions(prev => [...prev, { ...txn, __txnId: `manual_${Date.now()}_${Math.random()}` }]);
                        setShowAddTransactionForm(false);
                      }}
                      onCancel={() => setShowAddTransactionForm(false)}
                    />
                  )}

                  {cgtResult?.parsedFiles && cgtResult.parsedFiles.length > 0 ? (
                    cgtResult.parsedFiles.map((file, fileIdx) => (
                      <div key={fileIdx} className="bg-slate-800/50 rounded-lg p-4">
                        <h4 className="text-white font-medium mb-3">{file.broker} - {file.fileName}</h4>
                        {file.transactions && file.transactions.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-slate-400 border-b border-slate-700">
                                  <th className="p-2">Date</th>
                                  <th className="p-2">Action</th>
                                  <th className="p-2">Symbol</th>
                                  <th className="p-2 text-right">Quantity</th>
                                  <th className="p-2 text-right">Price</th>
                                  <th className="p-2 text-right">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {file.transactions.map((txn, txnIdx) => {
                                  const adjustKey = `${file.broker}_${fileIdx}_${txnIdx}`;
                                  const adjustment = transactionAdjustments[adjustKey];
                                  const displayPrice = adjustment?.pricePerUnit !== undefined ? adjustment.pricePerUnit : (txn.pricePerUnit || txn.price || 0);
                                  const displayAmount = adjustment?.totalAmount !== undefined ? adjustment.totalAmount : (txn.totalAmount || txn.amount || 0);
                                  const hasAdjustment = adjustment !== undefined;
                                  const isFetchedPrice = txn.priceSource === 'yahoo_finance_historical';
                                  const isDeleted = deletedTransactionIds.has(txn.__txnId);

                                  if (isDeleted) return null;

                                  return (
                              <tr key={txnIdx} className={`border-b border-slate-700/50 hover:bg-slate-700/30 ${hasAdjustment ? 'bg-amber-900/20' : ''}`}>
                                <td className="p-2 text-white">{txn.date}</td>
                                <td className="p-2 text-slate-300 text-sm">
                                  <div className="flex items-center gap-1">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      txn.type === 'BUY' ? 'bg-green-900/30 text-green-400' :
                                      txn.type === 'SELL' ? 'bg-red-900/30 text-red-400' :
                                      'bg-slate-700 text-slate-300'
                                    }`}>
                                      {txn.type}
                                    </span>
                                    {isFetchedPrice && (
                                      <span title="Price fetched from Yahoo Finance" className="text-yellow-500 text-xs">⚠️</span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2 text-white font-medium">{txn.symbol}</td>
                                <td className="p-2 text-slate-300 text-right">{txn.quantity}</td>
                                <td className="p-2 text-right">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={displayPrice}
                                    onChange={(e) => {
                                      const newPrice = parseFloat(e.target.value) || 0;
                                      const newAmount = newPrice * txn.quantity;
                                      setTransactionAdjustments(prev => ({
                                        ...prev,
                                        [adjustKey]: {
                                          ...adjustment,
                                          pricePerUnit: newPrice,
                                          totalAmount: newAmount
                                        }
                                      }));
                                    }}
                                    className="w-20 px-2 py-1 bg-slate-700 text-white text-right rounded border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
                                  />
                                </td>
                                <td className="p-2 text-slate-300 text-right flex items-center justify-between">
                                  <span>{formatCurrency(displayPrice * txn.quantity)}</span>
                                  <button
                                    onClick={() => setDeletedTransactionIds(prev => new Set([...prev, txn.__txnId]))}
                                    className="ml-2 text-red-400 hover:text-red-300 text-xs font-medium px-1"
                                    title="Delete transaction"
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                                  );
                                })}
                          </tbody>
                        </table>
                      </div>
                        ) : (
                          <p className="text-slate-400 text-sm">No transactions in this file</p>
                        )}
                    </div>
                    ))
                  ) : (
                    <p className="text-slate-400 text-center py-8">No transaction data available</p>
                  )}

                  {manualTransactions.length > 0 && (
                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <h4 className="text-white font-medium mb-3">Manual Entries</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-slate-400 border-b border-slate-700">
                              <th className="p-2">Date</th>
                              <th className="p-2">Action</th>
                              <th className="p-2">Symbol</th>
                              <th className="p-2 text-right">Quantity</th>
                              <th className="p-2 text-right">Price</th>
                              <th className="p-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {manualTransactions.map((txn, txnIdx) => {
                              const adjustKey = `manual_${txnIdx}`;
                              const adjustment = transactionAdjustments[adjustKey];
                              const displayPrice = adjustment?.pricePerUnit !== undefined ? adjustment.pricePerUnit : txn.pricePerUnit;
                              const isDeleted = deletedTransactionIds.has(txn.__txnId);

                              if (isDeleted) return null;

                              return (
                                <tr key={txnIdx} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                                  <td className="p-2 text-white">{txn.date}</td>
                                  <td className="p-2 text-slate-300 text-sm">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      txn.type === 'BUY' ? 'bg-green-900/30 text-green-400' :
                                      txn.type === 'SELL' ? 'bg-red-900/30 text-red-400' :
                                      'bg-slate-700 text-slate-300'
                                    }`}>
                                      {txn.type}
                                    </span>
                                  </td>
                                  <td className="p-2 text-white font-medium">{txn.symbol}</td>
                                  <td className="p-2 text-slate-300 text-right">{txn.quantity}</td>
                                  <td className="p-2 text-right">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={displayPrice}
                                      onChange={(e) => {
                                        const newPrice = parseFloat(e.target.value) || 0;
                                        const newAmount = newPrice * txn.quantity;
                                        setTransactionAdjustments(prev => ({
                                          ...prev,
                                          [adjustKey]: {
                                            pricePerUnit: newPrice,
                                            totalAmount: newAmount
                                          }
                                        }));
                                      }}
                                      className="w-20 px-2 py-1 bg-slate-700 text-white text-right rounded border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
                                    />
                                  </td>
                                  <td className="p-2 text-slate-300 text-right flex items-center justify-between">
                                    <span>{formatCurrency(displayPrice * txn.quantity)}</span>
                                    <button
                                      onClick={() => setDeletedTransactionIds(prev => new Set([...prev, txn.__txnId]))}
                                      className="ml-2 text-red-400 hover:text-red-300 text-xs font-medium px-1"
                                      title="Delete transaction"
                                    >
                                      ✕
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {(Object.keys(transactionAdjustments).length > 0 || deletedTransactionIds.size > 0) && (
                    <div className="flex justify-center pt-4">
                      <button
                        onClick={() => {
                          setViewMode('disposals');
                          calculate();
                        }}
                        disabled={loading}
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-600 disabled:to-slate-600 text-white font-medium rounded-lg transition-all flex items-center gap-2"
                      >
                        <span>🔄</span>
                        <span>{loading ? 'Recalculating...' : 'Recalculate CGT'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

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

          {/* Dividend Summary */}
          {cgtResult?.dividends?.byTaxYear?.length > 0 && (
            <DividendSection
              dividendData={cgtResult.dividends.byTaxYear.find(d => d.taxYear === taxYear)}
              taxYear={taxYear}
            />
          )}

          <div className="flex justify-between items-center gap-3 pt-4">
            <button onClick={onBack} className="px-4 py-2 text-slate-400 hover:text-white">← Back</button>
            <button
              onClick={() => setCgtResult(null)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <span>➕</span>
              Add More
            </button>
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
                onClick={() => handleBrokerSelect(b)}
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
                onClick={() => handleBrokerSelect(b)}
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
                (() => {
                  // Only count selectedBroker if it's not already in brokerUploads
                  const alreadyUploaded = brokerUploads.some(u => u.broker.id === selectedBroker?.id);
                  const brokerCount = brokerUploads.length + (selectedBroker && !alreadyUploaded ? 1 : 0);
                  return `🧮 Calculate CGT${brokerCount > 0 ? ` (${brokerCount} broker${brokerCount > 1 ? 's' : ''})` : ''}`;
                })()
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
  const [activeTooltip, setActiveTooltip] = useState(null);

  if (!matchDetails || matchDetails.length === 0) {
    return <span className="text-slate-500 text-xs">—</span>;
  }

  const handleBadgeClick = (e, rule) => {
    e.preventDefault();
    e.stopPropagation();
    // Toggle tooltip on tap/click
    setActiveTooltip(activeTooltip === rule ? null : rule);
  };

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
    <>
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

          const isActive = activeTooltip === group.rule;

          return (
            <button
              key={group.rule}
              type="button"
              onClick={(e) => handleBadgeClick(e, group.rule)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border cursor-pointer transition-all ${config.bgColor} ${config.textColor} ${config.borderColor} ${config.hoverBg} ${isActive ? 'ring-2 ring-white/30' : ''}`}
            >
              {config.shortLabel}
              <span className="text-[10px] opacity-70">ⓘ</span>
            </button>
          );
        })}
      </div>

      {/* Modal - same for both mobile and desktop */}
      {activeTooltip && (() => {
        const group = groupedByRule[activeTooltip];
        const config = ruleConfig[activeTooltip] || {};
        const firstDetail = group.details[0];

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setActiveTooltip(null)} />
            <div className="relative bg-slate-900 border border-slate-600 rounded-xl shadow-2xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto">
              {/* Close button */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveTooltip(null); }}
                className="absolute top-3 right-3 text-slate-400 hover:text-white text-xl transition-colors"
              >
                ✕
              </button>

              {/* Header */}
              <div className={`font-bold ${config.textColor} mb-2 text-xl pr-8`}>
                {config.label} Rule
              </div>

              {/* Description */}
              {config.description && (
                <p className="text-slate-300 text-sm mb-4 leading-relaxed">{config.description}</p>
              )}

              {/* HMRC Link */}
              {config.hmrcUrl && (
                <a
                  href={config.hmrcUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm mb-5 underline transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  📖 Read HMRC guidance →
                </a>
              )}

              {/* Details */}
              <div className="space-y-3 text-slate-300">
                {firstDetail.broker && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Broker:</span>
                    <span className="text-white">{firstDetail.broker}</span>
                  </div>
                )}

                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Quantity matched:</span>
                  <span className="text-white font-medium">{group.totalQuantity} shares</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Total cost:</span>
                  <span className="text-white font-medium">{formatCurrency(group.totalCost)}</span>
                </div>

                {group.details.length === 1 && firstDetail.acquisitionDate && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">
                      {group.rule === 'BED_AND_BREAKFAST' ? 'Re-purchase date:' : 'Acquisition date:'}
                    </span>
                    <span className="text-white">{firstDetail.acquisitionDate}</span>
                  </div>
                )}

                {group.details.length === 1 && firstDetail.daysDifference !== undefined && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Days after sale:</span>
                    <span className="text-orange-400 font-medium">{firstDetail.daysDifference} days</span>
                  </div>
                )}

                {/* Multiple acquisitions */}
                {group.details.length > 1 && (
                  <div className="border-t border-slate-700 pt-3 mt-3">
                    <p className="text-slate-400 mb-3 text-sm">Matched from {group.details.length} acquisitions:</p>
                    <div className="space-y-3">
                      {group.details.map((detail, i) => (
                        <div key={i} className="p-3 bg-slate-800/50 rounded-lg">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">{detail.acquisitionDate || 'Unknown date'}</span>
                            <span className="text-white font-medium">{detail.quantity} shares</span>
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
                  </div>
                )}

                {/* B&B Explanation Box */}
                {group.rule === 'BED_AND_BREAKFAST' && (
                  <div className="mt-4 p-4 bg-orange-900/30 border border-orange-500/40 rounded-lg">
                    <div className="text-orange-300 font-medium text-sm mb-3">
                      📌 Cost taken from {group.details.length > 1 ? `${group.details.length} re-purchases` : 're-purchase'}:
                    </div>
                    <div className="space-y-3">
                      {group.details.map((detail, idx) => (
                        <div key={idx} className={`${group.details.length > 1 ? 'p-3 bg-slate-800/50 rounded' : ''}`}>
                          <p className="text-white text-sm font-medium">
                            {detail.quantity} units{detail.broker ? ` on ${detail.broker}` : ''}
                          </p>
                          {detail.originalCurrency && detail.originalCurrency !== 'GBP' ? (
                            <div className="text-sm mt-1">
                              <span className="text-slate-400">Price: </span>
                              <span className="text-blue-400">${detail.originalCostPerShare?.toFixed(2)}</span>
                              <span className="text-slate-500"> → </span>
                              <span className="text-white">{formatCurrency(detail.costPerShare)}</span>
                              <span className="text-slate-500 text-xs ml-1">(FX: {detail.exchangeRate?.toFixed(4)})</span>
                            </div>
                          ) : (
                            <p className="text-slate-300 text-sm mt-1">
                              @ {formatCurrency(detail.costPerShare)}/share
                            </p>
                          )}
                          {detail.acquisitionDate && (
                            <p className="text-slate-400 text-xs mt-1">
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
                      <div className="mt-3 pt-3 border-t border-orange-500/30 text-sm text-slate-400">
                        Total: {group.totalQuantity} units, avg cost {formatCurrency(group.totalCost / group.totalQuantity)}/share
                      </div>
                    )}
                  </div>
                )}

                {/* B&B Impact Analysis */}
                {firstDetail.bnbImpact && (
                  <div className="mt-4 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                    <div className="text-orange-400 font-bold mb-3">⚠️ B&B Impact Analysis</div>
                    <div className="text-slate-300 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>S104 cost would be:</span>
                        <span className="text-white">{formatCurrency(firstDetail.bnbImpact.s104CostPerShareWouldBe)}/share</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Actual B&B cost:</span>
                        <span className="text-white">{formatCurrency(firstDetail.bnbImpact.actualCostPerShare)}/share</span>
                      </div>
                      <div className={`mt-3 pt-3 border-t border-orange-500/30 font-medium text-sm ${firstDetail.bnbImpact.costDifference > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {firstDetail.bnbImpact.explanation}
                      </div>
                    </div>
                  </div>
                )}

                {/* Per share breakdown for single match */}
                {group.details.length === 1 && (
                  <div className="border-t border-slate-700 pt-3 mt-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Cost per share:</span>
                      <span className="text-white">{formatCurrency(firstDetail.costPerShare)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Proceeds per share:</span>
                      <span className="text-white">{formatCurrency(firstDetail.proceedsPerShare)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-slate-400">Gain per share:</span>
                      <span className={firstDetail.gainPerShare >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {formatCurrency(firstDetail.gainPerShare)}
                      </span>
                    </div>
                  </div>
                )}

                {firstDetail.isRSU && (
                  <div className="mt-3 px-3 py-2 bg-purple-500/20 text-purple-400 rounded text-sm font-medium">
                    📊 RSU Vesting
                  </div>
                )}

                {/* S104 pool info */}
                {group.rule === 'SECTION_104' && firstDetail.poolQuantityBefore !== undefined && (
                  <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <div className="text-blue-400 font-bold mb-3">📊 Section 104 Pool</div>
                    <div className="text-slate-300 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Pool before disposal:</span>
                        <span className="text-white">{firstDetail.poolQuantityBefore} shares</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Pool after disposal:</span>
                        <span className="text-white">{firstDetail.poolQuantityAfter} shares</span>
                      </div>
                      <div className="flex justify-between font-medium border-t border-blue-500/30 pt-3 mt-3 text-sm">
                        <span>Average cost used:</span>
                        <span className="text-white">{formatCurrency(firstDetail.averageCost)}/share</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Close button at bottom */}
              <button
                type="button"
                onClick={() => setActiveTooltip(null)}
                className="mt-6 w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}
    </>
  );
}

function DividendSection({ dividendData, taxYear }) {
  const [showDetails, setShowDetails] = useState(false);

  if (!dividendData || dividendData.totalDividends === 0) {
    return null;
  }

  // UK dividend allowance
  const DIVIDEND_ALLOWANCE = 500; // 2024/25 tax year

  return (
    <div className="bg-gradient-to-r from-emerald-900/30 to-green-900/30 border border-emerald-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💰</span>
          <div>
            <h3 className="text-white font-bold text-lg">Dividend Income</h3>
            <p className="text-slate-400 text-sm">Tax Year {taxYear}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-emerald-400">{formatCurrency(dividendData.totalDividends)}</p>
          <p className="text-slate-400 text-xs">{dividendData.dividendCount} payments</p>
        </div>
      </div>

      {/* UK vs Foreign Split */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🇬🇧</span>
            <span className="text-slate-400 text-sm">UK Dividends</span>
          </div>
          <p className="text-white text-xl font-bold">{formatCurrency(dividendData.ukDividends)}</p>
          <p className="text-slate-500 text-xs mt-1">No withholding tax</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🌍</span>
            <span className="text-slate-400 text-sm">Foreign Dividends</span>
          </div>
          <p className="text-white text-xl font-bold">{formatCurrency(dividendData.foreignDividends)}</p>
          {dividendData.withholdingTax > 0 && (
            <p className="text-amber-400 text-xs mt-1">
              Withholding tax: {formatCurrency(dividendData.withholdingTax)}
            </p>
          )}
        </div>
      </div>

      {/* Dividend Allowance Info */}
      <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 mb-4">
        <div className="flex items-start gap-2">
          <span className="text-blue-400">ℹ️</span>
          <div className="text-sm">
            <p className="text-blue-400 font-medium">Dividend Allowance: £{DIVIDEND_ALLOWANCE}</p>
            <p className="text-slate-400 text-xs mt-1">
              {dividendData.totalDividends <= DIVIDEND_ALLOWANCE
                ? `Your dividends (${formatCurrency(dividendData.totalDividends)}) are within the tax-free allowance.`
                : `${formatCurrency(dividendData.totalDividends - DIVIDEND_ALLOWANCE)} exceeds the allowance and is taxable.`
              }
            </p>
          </div>
        </div>
      </div>

      {/* HMRC Rates Info */}
      <div className="text-xs text-slate-500 mb-4">
        <p>Dividend tax rates (2024/25): Basic rate: 8.75% | Higher rate: 33.75% | Additional rate: 39.35%</p>
      </div>

      {/* Show/Hide Details */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full py-2 px-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-300 text-sm transition-all flex items-center justify-center gap-2"
      >
        {showDetails ? '▲ Hide Details' : '▼ Show All Dividends'}
      </button>

      {/* Dividend Details Table */}
      {showDetails && dividendData.dividends && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="p-2">Date</th>
                <th className="p-2">Symbol</th>
                <th className="p-2">Source</th>
                <th className="p-2 text-right">Amount (GBP)</th>
                <th className="p-2 text-right">Withheld</th>
                <th className="p-2">Broker</th>
              </tr>
            </thead>
            <tbody>
              {dividendData.dividends.slice(0, 50).map((d, i) => (
                <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="p-2 text-white">{d.date}</td>
                  <td className="p-2 text-white font-medium">{d.symbol}</td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      d.source === 'UK'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-orange-500/20 text-orange-400'
                    }`}>
                      {d.source === 'UK' ? '🇬🇧 UK' : '🌍 Foreign'}
                    </span>
                  </td>
                  <td className="p-2 text-emerald-400 text-right font-medium">{formatCurrency(d.amountGBP)}</td>
                  <td className="p-2 text-slate-400 text-right">
                    {d.withholdingTax > 0 ? formatCurrency(d.withholdingTax) : '—'}
                  </td>
                  <td className="p-2 text-slate-400 text-xs">{d.broker}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {dividendData.dividends.length > 50 && (
            <p className="text-slate-500 text-sm text-center py-2">
              ... and {dividendData.dividends.length - 50} more dividends
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AddTransactionForm({ onAdd, onCancel }) {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'BUY',
    symbol: '',
    quantity: '',
    pricePerUnit: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.symbol || !formData.quantity || !formData.pricePerUnit) {
      alert('Please fill in all fields');
      return;
    }
    onAdd({
      ...formData,
      quantity: parseFloat(formData.quantity),
      pricePerUnit: parseFloat(formData.pricePerUnit),
      totalAmount: parseFloat(formData.quantity) * parseFloat(formData.pricePerUnit),
      broker: 'Manual Entry',
      type: formData.type,
    });
    setFormData({
      date: new Date().toISOString().split('T')[0],
      type: 'BUY',
      symbol: '',
      quantity: '',
      pricePerUnit: '',
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Date</label>
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            className="w-full px-2 py-1 bg-slate-700 text-white rounded border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Type</label>
          <select
            name="type"
            value={formData.type}
            onChange={handleChange}
            className="w-full px-2 py-1 bg-slate-700 text-white rounded border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
          >
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Symbol</label>
          <input
            type="text"
            name="symbol"
            value={formData.symbol}
            onChange={handleChange}
            placeholder="e.g., GOOG"
            className="w-full px-2 py-1 bg-slate-700 text-white rounded border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Quantity</label>
          <input
            type="number"
            name="quantity"
            step="0.01"
            value={formData.quantity}
            onChange={handleChange}
            placeholder="0"
            className="w-full px-2 py-1 bg-slate-700 text-white rounded border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Price</label>
          <input
            type="number"
            name="pricePerUnit"
            step="0.01"
            value={formData.pricePerUnit}
            onChange={handleChange}
            placeholder="0.00"
            className="w-full px-2 py-1 bg-slate-700 text-white rounded border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium text-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-medium text-sm"
        >
          Add Transaction
        </button>
      </div>
    </form>
  );
}

