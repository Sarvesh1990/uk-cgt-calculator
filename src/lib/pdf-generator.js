import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generate HMRC-compatible CGT Computation PDF
 * Includes all required information for Self Assessment
 */
export function generateCGTReport(yearData, taxYear) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Helper functions
  const formatCurrency = (amount) => {
    const sign = amount < 0 ? '-' : '';
    return `${sign}£${Math.abs(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const addTitle = (text, y, size = 16) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', 'bold');
    doc.text(text, 14, y);
    return y + 8;
  };

  const addText = (text, y, size = 10) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', 'normal');
    doc.text(text, 14, y);
    return y + 6;
  };

  const addKeyValue = (key, value, y) => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(key, 14, y);
    doc.setFont('helvetica', 'bold');
    doc.text(value, 120, y);
    return y + 6;
  };

  let y = 20;

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Capital Gains Tax Computation', pageWidth / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`Tax Year ${taxYear}`, pageWidth / 2, y, { align: 'center' });
  y += 6;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`6 April ${taxYear.split('/')[0]} - 5 April 20${taxYear.split('/')[1]}`, pageWidth / 2, y, { align: 'center' });
  doc.setTextColor(0);
  y += 15;

  // Summary Section
  y = addTitle('Summary', y);

  doc.setDrawColor(200);
  doc.setFillColor(245, 245, 245);
  doc.rect(14, y, pageWidth - 28, 50, 'F');
  y += 8;

  y = addKeyValue('Number of Disposals:', String(yearData.numberOfDisposals), y);
  y = addKeyValue('Total Disposal Proceeds:', formatCurrency(yearData.totalProceeds), y);
  y = addKeyValue('Total Allowable Costs:', formatCurrency(yearData.totalCost), y);
  y = addKeyValue('Total Gains:', formatCurrency(yearData.totalGains), y);
  y = addKeyValue('Total Losses:', formatCurrency(yearData.totalLosses), y);
  y = addKeyValue('Net Gain/(Loss):', formatCurrency(yearData.netGain), y);
  y += 5;

  // Tax Calculation
  y = addTitle('Tax Calculation', y + 5);

  doc.setFillColor(255, 250, 240);
  doc.rect(14, y, pageWidth - 28, yearData.rateChange ? 60 : 30, 'F');
  y += 8;

  y = addKeyValue('Net Gain:', formatCurrency(yearData.netGain), y);
  y = addKeyValue('Annual Exempt Amount:', formatCurrency(yearData.annualExemption), y);

  doc.setFont('helvetica', 'bold');
  y = addKeyValue('Taxable Gain:', formatCurrency(yearData.taxableGain), y);
  y += 3;

  // Show rate change breakdown for 2024/25
  if (yearData.rateChange) {
    y += 2;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 51, 102);
    doc.text('CGT Rate Change - 30 October 2024', 14, y);
    doc.setTextColor(0);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    // Pre-30 Oct
    doc.text(`Before 30 Oct 2024: ${yearData.rateChange.preOctober.disposalCount} disposal(s), Gains: ${formatCurrency(yearData.rateChange.preOctober.gains)}, Rates: 10%/20%`, 18, y);
    y += 4;

    // Post-30 Oct
    doc.text(`From 30 Oct 2024: ${yearData.rateChange.postOctober.disposalCount} disposal(s), Gains: ${formatCurrency(yearData.rateChange.postOctober.gains)}, Rates: 18%/24%`, 18, y);
    y += 6;
  }

  // Estimated Tax
  doc.setFontSize(10);
  y = addText(`Estimated CGT at Basic Rate: ${formatCurrency(yearData.estimatedTaxBasicRate)}${yearData.rateChange ? ' (blended)' : ' (10%)'}`, y);
  y = addText(`Estimated CGT at Higher Rate: ${formatCurrency(yearData.estimatedTaxHigherRate)}${yearData.rateChange ? ' (blended)' : ' (20%)'}`, y);
  y += 10;

  // Disposals Table
  y = addTitle('Schedule of Disposals', y);

  const disposalRows = yearData.disposals.map((d, idx) => [
    idx + 1,
    d.date,
    d.symbol,
    d.quantity.toString(),
    formatCurrency(d.proceeds),
    formatCurrency(d.cost),
    formatCurrency(d.gain),
    d.matchDetails.map(m =>
      m.rule === 'SAME_DAY' ? 'Same Day' :
      m.rule === 'BED_AND_BREAKFAST' ? 'B&B' : 'S104'
    ).join(', ')
  ]);

  // Use autoTable directly
  autoTable(doc, {
    startY: y,
    head: [['#', 'Date', 'Asset', 'Qty', 'Proceeds', 'Cost', 'Gain/Loss', 'Matching']],
    body: disposalRows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [51, 65, 85], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 22 },
      2: { cellWidth: 20 },
      3: { cellWidth: 15, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 25, halign: 'right' },
      6: { cellWidth: 25, halign: 'right' },
      7: { cellWidth: 25 }
    },
    margin: { left: 14, right: 14 }
  });

  y = doc.lastAutoTable.finalY + 10;

  // Check if we need a new page for Section 104
  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  // Section 104 Holdings at Start of Year (if available)
  if (yearData.section104Start && yearData.section104Start.length > 0) {
    y = addTitle('Section 104 Holdings at Start of Tax Year', y);

    const s104StartRows = yearData.section104Start.map(pool => [
      pool.symbol,
      pool.quantity.toLocaleString(),
      formatCurrency(pool.totalCost),
      formatCurrency(pool.averageCost)
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Asset', 'Quantity', 'Total Cost', 'Average Cost per Share']],
      body: s104StartRows,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [107, 33, 168], textColor: 255 },
      alternateRowStyles: { fillColor: [250, 245, 255] },
      margin: { left: 14, right: 14 }
    });

    y = doc.lastAutoTable.finalY + 10;
  }

  // Check if we need a new page for Section 104 End
  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  // Section 104 Holdings at End of Year (if available)
  if (yearData.section104End && yearData.section104End.length > 0) {
    y = addTitle('Section 104 Holdings at End of Tax Year', y);

    const s104EndRows = yearData.section104End.map(pool => [
      pool.symbol,
      pool.quantity.toLocaleString(),
      formatCurrency(pool.totalCost),
      formatCurrency(pool.averageCost)
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Asset', 'Quantity', 'Total Cost', 'Average Cost per Share']],
      body: s104EndRows,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [22, 101, 52], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      margin: { left: 14, right: 14 }
    });

    y = doc.lastAutoTable.finalY + 10;
  }

  // Footer - Disclaimer
  if (y > 260) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('IMPORTANT NOTICE', 14, y);
  y += 5;
  doc.setFontSize(7);
  const disclaimer = [
    'This computation has been prepared using the HMRC share matching rules (Same Day, Bed & Breakfast, Section 104 Pool).',
    'This document is for guidance purposes only and should be verified before submission to HMRC.',
    'Please consult a qualified tax professional for advice specific to your circumstances.',
    `Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}`
  ];
  disclaimer.forEach(line => {
    doc.text(line, 14, y);
    y += 4;
  });

  // Page numbers
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 25, doc.internal.pageSize.getHeight() - 10);
  }

  return doc;
}

/**
 * Download the CGT PDF report
 */
export function downloadCGTReport(yearData, taxYear) {
  const doc = generateCGTReport(yearData, taxYear);
  doc.save(`CGT-Computation-${taxYear.replace('/', '-')}.pdf`);
}

/**
 * Generate detailed disposal report for a specific asset
 */
export function generateAssetReport(disposals, symbol, taxYear) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const formatCurrency = (amount) => {
    const sign = amount < 0 ? '-' : '';
    return `${sign}£${Math.abs(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Filter disposals for this symbol
  const assetDisposals = disposals.filter(d => d.symbol === symbol);

  let y = 20;

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(`Capital Gains - ${symbol}`, pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Tax Year ${taxYear}`, pageWidth / 2, y, { align: 'center' });
  y += 15;

  // Summary
  const totalProceeds = assetDisposals.reduce((sum, d) => sum + d.proceeds, 0);
  const totalCost = assetDisposals.reduce((sum, d) => sum + d.cost, 0);
  const totalGain = assetDisposals.reduce((sum, d) => sum + d.gain, 0);

  doc.setFontSize(10);
  y = doc.text(`Total Disposals: ${assetDisposals.length}`, 14, y).y + 6;
  y = doc.text(`Total Proceeds: ${formatCurrency(totalProceeds)}`, 14, y).y + 6;
  y = doc.text(`Total Cost: ${formatCurrency(totalCost)}`, 14, y).y + 6;
  y = doc.text(`Total Gain/Loss: ${formatCurrency(totalGain)}`, 14, y).y + 15;

  // Detailed disposals
  assetDisposals.forEach((disposal, idx) => {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Disposal ${idx + 1}: ${disposal.date}`, 14, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Quantity: ${disposal.quantity}`, 20, y);
    y += 5;
    doc.text(`Proceeds: ${formatCurrency(disposal.proceeds)}`, 20, y);
    y += 5;
    doc.text(`Cost: ${formatCurrency(disposal.cost)}`, 20, y);
    y += 5;
    doc.text(`Gain/Loss: ${formatCurrency(disposal.gain)}`, 20, y);
    y += 8;

    // Match details
    doc.setFont('helvetica', 'bold');
    doc.text('Matching Details:', 20, y);
    y += 5;
    doc.setFont('helvetica', 'normal');

    disposal.matchDetails.forEach(match => {
      const ruleName = match.rule === 'SAME_DAY' ? 'Same Day Rule' :
                       match.rule === 'BED_AND_BREAKFAST' ? 'Bed & Breakfast Rule' :
                       'Section 104 Pool';
      doc.text(`• ${ruleName}: ${match.quantity} shares @ ${formatCurrency(match.costPerShare || 0)}/share`, 25, y);
      y += 5;
    });

    y += 5;
  });

  return doc;
}
