/**
 * UK Tax Calculator Engine
 * Calculates Income Tax, National Insurance, and integrates with CGT
 * Includes pension contribution relief
 */

// UK Tax Year configurations
// Tax bands are defined as widths applied to TAXABLE INCOME (after PA deduction)
// This is how HMRC calculates: first £37,700 at 20%, next chunk at 40%, rest at 45%
export const UK_TAX_CONFIG = {
  "2024/25": {
    personalAllowance: 12570,
    personalAllowanceTaperThreshold: 100000, // PA reduces above this
    personalAllowanceTaperRate: 0.5, // £1 reduction for every £2 over threshold

    // Income tax bands - applied to taxable income (after PA)
    // Band widths: Basic £37,700, Higher up to £125,140 threshold, Additional above
    incomeTaxBands: [
      { name: "Basic Rate", width: 37700, rate: 0.20 },
      { name: "Higher Rate", threshold: 125140, rate: 0.40 }, // Up to £125,140 of gross (minus PA gives the band)
      { name: "Additional Rate", width: Infinity, rate: 0.45 },
    ],
    // For reference: with full PA, basic = £12,571-£50,270, higher = £50,271-£125,140
    basicRateBandWidth: 37700,
    higherRateThreshold: 125140, // Gross income threshold where additional rate starts

    // National Insurance Class 1 (Employee)
    nationalInsurance: {
      primaryThreshold: 12570, // Per year
      upperEarningsLimit: 50270,
      mainRate: 0.08, // 8% between PT and UEL (reduced from 12% in Jan 2024)
      upperRate: 0.02, // 2% above UEL
    },

    // Student Loan thresholds (annual)
    studentLoan: {
      plan1Threshold: 24990,
      plan2Threshold: 27295,
      plan4Threshold: 31395, // Scotland
      plan5Threshold: 25000,
      postgraduateThreshold: 21000,
      rate: 0.09, // 9% for all plans
      postgraduateRate: 0.06, // 6% for postgraduate
    },

    // CGT rates - CHANGED 30 October 2024 (Autumn Budget 2024)
    // Before 30 Oct 2024: 10% basic, 20% higher
    // From 30 Oct 2024: 18% basic, 24% higher
    cgtRates: {
      // Pre-30 Oct 2024 rates
      basicRatePre: 0.10,
      higherRatePre: 0.20,
      // Post-30 Oct 2024 rates
      basicRatePost: 0.18,
      higherRatePost: 0.24,
      // Rate change date
      rateChangeDate: '2024-10-30',
    },

    cgtAnnualExemption: 3000,

    // Pension annual allowance
    pensionAnnualAllowance: 60000,
    pensionLifetimeAllowance: null, // Abolished from 2024/25
  },

  "2023/24": {
    personalAllowance: 12570,
    personalAllowanceTaperThreshold: 100000,
    personalAllowanceTaperRate: 0.5,

    incomeTaxBands: [
      { name: "Basic Rate", width: 37700, rate: 0.20 },
      { name: "Higher Rate", threshold: 125140, rate: 0.40 },
      { name: "Additional Rate", width: Infinity, rate: 0.45 },
    ],
    basicRateBandWidth: 37700,
    higherRateThreshold: 125140,

    nationalInsurance: {
      primaryThreshold: 12570,
      upperEarningsLimit: 50270,
      mainRate: 0.10, // Changed mid-year
      upperRate: 0.02,
    },

    studentLoan: {
      plan1Threshold: 22015,
      plan2Threshold: 27295,
      plan4Threshold: 27660,
      plan5Threshold: 25000,
      postgraduateThreshold: 21000,
      rate: 0.09,
      postgraduateRate: 0.06,
    },

    cgtRates: {
      basicRate: 0.10,
      higherRate: 0.20,
    },

    cgtAnnualExemption: 6000,
    pensionAnnualAllowance: 60000,
    pensionLifetimeAllowance: 1073100,
  },
};

/**
 * Parse P60 data - P60s can come in various formats
 * This handles both manual entry and potential PDF extraction
 */
export function parseP60Data(data) {
  // If it's already structured data
  if (typeof data === 'object' && data.grossPay !== undefined) {
    return {
      taxYear: data.taxYear || "2024/25",
      employerName: data.employerName || "Unknown",
      employerPAYE: data.employerPAYE || "",
      grossPay: parseFloat(data.grossPay) || 0,
      taxDeducted: parseFloat(data.taxDeducted) || 0,
      nationalInsurance: parseFloat(data.nationalInsurance) || 0,
      studentLoan: parseFloat(data.studentLoan) || 0,
      studentLoanPlan: data.studentLoanPlan || null,
      pensionContributions: parseFloat(data.pensionContributions) || 0,
    };
  }

  return null;
}

/**
 * Calculate adjusted personal allowance
 * PA reduces by £1 for every £2 of income over £100,000
 */
function calculatePersonalAllowance(grossIncome, config) {
  const basePA = config.personalAllowance;
  const threshold = config.personalAllowanceTaperThreshold;

  if (grossIncome <= threshold) {
    return basePA;
  }

  const reduction = Math.floor((grossIncome - threshold) * config.personalAllowanceTaperRate);
  return Math.max(0, basePA - reduction);
}

/**
 * Calculate Income Tax
 * Tax bands are applied to TAXABLE income (gross income minus personal allowance)
 * Band widths: Basic Rate = £37,700, Higher Rate up to £125,140 gross threshold, Additional = rest
 */
function calculateIncomeTax(grossIncome, config, pensionContributions = 0, personalAllowance = null) {
  // Calculate PA if not provided
  if (personalAllowance === null) {
    personalAllowance = calculatePersonalAllowance(grossIncome - pensionContributions, config);
  }

  // Taxable income = gross - PA - pension (pension contributions extend basic rate band)
  const taxableIncome = Math.max(0, grossIncome - personalAllowance - pensionContributions);

  if (taxableIncome <= 0) {
    return { total: 0, breakdown: [] };
  }

  // Calculate band widths based on config
  // Basic rate band width is fixed at £37,700
  // Higher rate band goes from end of basic to £125,140 - PA threshold
  const basicRateBandWidth = config.basicRateBandWidth || 37700;
  const higherRateThreshold = config.higherRateThreshold || 125140;

  // When PA is reduced, the taxable amount increases, but the band widths remain the same
  // Higher rate band width = higherRateThreshold - PA - basicRateBandWidth
  const higherRateBandWidth = Math.max(0, higherRateThreshold - personalAllowance - basicRateBandWidth);

  // Build effective bands
  const bands = [
    { name: "Basic Rate", width: basicRateBandWidth, rate: 0.20 },
    { name: "Higher Rate", width: higherRateBandWidth, rate: 0.40 },
    { name: "Additional Rate", width: Infinity, rate: 0.45 },
  ];

  let remainingIncome = taxableIncome;
  let totalTax = 0;
  const breakdown = [];

  for (const band of bands) {
    if (remainingIncome <= 0) break;

    const incomeInBand = Math.min(remainingIncome, band.width);

    if (incomeInBand > 0) {
      const taxInBand = incomeInBand * band.rate;
      totalTax += taxInBand;

      breakdown.push({
        band: band.name,
        income: Math.round(incomeInBand * 100) / 100,
        rate: band.rate,
        tax: Math.round(taxInBand * 100) / 100,
      });

      remainingIncome -= incomeInBand;
    }
  }

  return {
    total: Math.round(totalTax * 100) / 100,
    breakdown,
  };
}

/**
 * Calculate National Insurance
 */
function calculateNationalInsurance(grossPay, config) {
  const ni = config.nationalInsurance;
  let totalNI = 0;
  const breakdown = [];

  // Below primary threshold - no NI
  if (grossPay <= ni.primaryThreshold) {
    return { total: 0, breakdown: [] };
  }

  // Between primary threshold and upper earnings limit
  const incomeInMainBand = Math.min(grossPay, ni.upperEarningsLimit) - ni.primaryThreshold;
  if (incomeInMainBand > 0) {
    const niMain = incomeInMainBand * ni.mainRate;
    totalNI += niMain;
    breakdown.push({
      band: "Main Rate",
      income: Math.round(incomeInMainBand * 100) / 100,
      rate: ni.mainRate,
      ni: Math.round(niMain * 100) / 100,
    });
  }

  // Above upper earnings limit
  if (grossPay > ni.upperEarningsLimit) {
    const incomeAboveUEL = grossPay - ni.upperEarningsLimit;
    const niUpper = incomeAboveUEL * ni.upperRate;
    totalNI += niUpper;
    breakdown.push({
      band: "Upper Rate",
      income: Math.round(incomeAboveUEL * 100) / 100,
      rate: ni.upperRate,
      ni: Math.round(niUpper * 100) / 100,
    });
  }

  return {
    total: Math.round(totalNI * 100) / 100,
    breakdown,
  };
}

/**
 * Calculate CGT rate based on income
 * For 2024/25: Split rates due to Autumn Budget 2024
 * - Before 30 Oct 2024: 10% basic, 20% higher
 * - From 30 Oct 2024: 18% basic, 24% higher
 *
 * @param {number} taxableIncome - Taxable income after allowances
 * @param {number} capitalGain - Total capital gain (or object with pre/post breakdown)
 * @param {object} config - Tax year configuration
 * @param {number} pensionContributions - Pension contributions to extend basic rate band
 */
function calculateCGTRate(taxableIncome, capitalGain, config, pensionContributions = 0) {
  const basicRateLimit = 50270 + pensionContributions; // Extended by pension
  const exemption = config.cgtAnnualExemption;

  // Handle split gains for 2024/25 (pre and post 30 Oct 2024)
  let gainsPre = 0;
  let gainsPost = 0;

  if (typeof capitalGain === 'object' && capitalGain !== null) {
    // If passed as object with pre/post breakdown
    gainsPre = capitalGain.pre || 0;
    gainsPost = capitalGain.post || 0;
  } else {
    // Simple number - check if we have split rates
    if (config.cgtRates.rateChangeDate) {
      // For tax page without detailed breakdown, assume all gains are post-change
      // (conservative approach - user should use CGT calculator for accurate split)
      gainsPost = capitalGain;
    } else {
      // Old tax year with single rate
      gainsPre = capitalGain;
    }
  }

  const totalGain = gainsPre + gainsPost;
  const taxableGain = Math.max(0, totalGain - exemption);

  if (taxableGain === 0) {
    return {
      rate: 0,
      taxableGain: 0,
      tax: 0,
      breakdown: [],
    };
  }

  // Check how much of basic rate band is unused
  const unusedBasicRate = Math.max(0, basicRateLimit - taxableIncome);

  const breakdown = [];
  let totalCGT = 0;
  let remainingBasicBand = unusedBasicRate;

  // Allocate exemption proportionally
  const exemptionPre = totalGain > 0 ? (gainsPre / totalGain) * exemption : 0;
  const exemptionPost = totalGain > 0 ? (gainsPost / totalGain) * exemption : 0;

  const taxableGainsPre = Math.max(0, gainsPre - exemptionPre);
  const taxableGainsPost = Math.max(0, gainsPost - exemptionPost);

  // Process pre-30 Oct gains first (at old rates)
  if (taxableGainsPre > 0 && config.cgtRates.basicRatePre !== undefined) {
    const preBasicRate = config.cgtRates.basicRatePre;
    const preHigherRate = config.cgtRates.higherRatePre;

    // Gains at basic rate
    const preGainsAtBasic = Math.min(taxableGainsPre, remainingBasicBand);
    if (preGainsAtBasic > 0) {
      const tax = preGainsAtBasic * preBasicRate;
      totalCGT += tax;
      breakdown.push({
        band: `Pre-30 Oct Basic Rate (${preBasicRate * 100}%)`,
        gain: Math.round(preGainsAtBasic * 100) / 100,
        rate: preBasicRate,
        tax: Math.round(tax * 100) / 100,
      });
      remainingBasicBand -= preGainsAtBasic;
    }

    // Gains at higher rate
    const preGainsAtHigher = taxableGainsPre - preGainsAtBasic;
    if (preGainsAtHigher > 0) {
      const tax = preGainsAtHigher * preHigherRate;
      totalCGT += tax;
      breakdown.push({
        band: `Pre-30 Oct Higher Rate (${preHigherRate * 100}%)`,
        gain: Math.round(preGainsAtHigher * 100) / 100,
        rate: preHigherRate,
        tax: Math.round(tax * 100) / 100,
      });
    }
  } else if (taxableGainsPre > 0) {
    // Fallback for old config format
    const basicRate = config.cgtRates.basicRate || 0.10;
    const higherRate = config.cgtRates.higherRate || 0.20;

    const gainsAtBasic = Math.min(taxableGainsPre, remainingBasicBand);
    if (gainsAtBasic > 0) {
      const tax = gainsAtBasic * basicRate;
      totalCGT += tax;
      breakdown.push({
        band: `Basic Rate (${basicRate * 100}%)`,
        gain: Math.round(gainsAtBasic * 100) / 100,
        rate: basicRate,
        tax: Math.round(tax * 100) / 100,
      });
      remainingBasicBand -= gainsAtBasic;
    }

    const gainsAtHigher = taxableGainsPre - gainsAtBasic;
    if (gainsAtHigher > 0) {
      const tax = gainsAtHigher * higherRate;
      totalCGT += tax;
      breakdown.push({
        band: `Higher Rate (${higherRate * 100}%)`,
        gain: Math.round(gainsAtHigher * 100) / 100,
        rate: higherRate,
        tax: Math.round(tax * 100) / 100,
      });
    }
  }

  // Process post-30 Oct gains (at new rates)
  if (taxableGainsPost > 0) {
    const postBasicRate = config.cgtRates.basicRatePost || config.cgtRates.basicRate || 0.18;
    const postHigherRate = config.cgtRates.higherRatePost || config.cgtRates.higherRate || 0.24;

    // Gains at basic rate
    const postGainsAtBasic = Math.min(taxableGainsPost, remainingBasicBand);
    if (postGainsAtBasic > 0) {
      const tax = postGainsAtBasic * postBasicRate;
      totalCGT += tax;
      breakdown.push({
        band: config.cgtRates.rateChangeDate
          ? `Post-30 Oct Basic Rate (${postBasicRate * 100}%)`
          : `Basic Rate (${postBasicRate * 100}%)`,
        gain: Math.round(postGainsAtBasic * 100) / 100,
        rate: postBasicRate,
        tax: Math.round(tax * 100) / 100,
      });
      remainingBasicBand -= postGainsAtBasic;
    }

    // Gains at higher rate
    const postGainsAtHigher = taxableGainsPost - postGainsAtBasic;
    if (postGainsAtHigher > 0) {
      const tax = postGainsAtHigher * postHigherRate;
      totalCGT += tax;
      breakdown.push({
        band: config.cgtRates.rateChangeDate
          ? `Post-30 Oct Higher Rate (${postHigherRate * 100}%)`
          : `Higher Rate (${postHigherRate * 100}%)`,
        gain: Math.round(postGainsAtHigher * 100) / 100,
        rate: postHigherRate,
        tax: Math.round(tax * 100) / 100,
      });
    }
  }

  return {
    taxableGain: Math.round(taxableGain * 100) / 100,
    exemptionUsed: Math.min(totalGain, exemption),
    tax: Math.round(totalCGT * 100) / 100,
    breakdown,
    effectiveRate: taxableGain > 0 ? Math.round((totalCGT / taxableGain) * 10000) / 100 : 0,
    // Additional info for 2024/25
    gainsPre: Math.round(gainsPre * 100) / 100,
    gainsPost: Math.round(gainsPost * 100) / 100,
    hasRateChange: !!config.cgtRates.rateChangeDate,
  };
}

/**
 * Calculate pension tax relief
 */
function calculatePensionRelief(grossPay, pensionContributions, config) {
  // Limit to annual allowance
  const allowedContributions = Math.min(pensionContributions, config.pensionAnnualAllowance);

  // Also limit to 100% of earnings
  const maxContributions = Math.min(allowedContributions, grossPay);

  // Relief at source contributions get basic rate relief automatically
  // Additional relief for higher/additional rate taxpayers needs to be claimed

  return {
    grossContributions: pensionContributions,
    allowedContributions: maxContributions,
    excessContributions: Math.max(0, pensionContributions - maxContributions),
    basicRateRelief: Math.round(maxContributions * 0.20 * 100) / 100, // 20% already received
  };
}

/**
 * Main tax calculation function
 */
export function calculateFullTax(params) {
  const {
    taxYear = "2024/25",
    grossPay = 0,
    taxPaid = 0,
    niPaid = 0,
    pensionContributions = 0,
    capitalGains = 0,
    capitalGainsSplit = null,
    incomeSkipped = false,
    studentLoanPlan = null,
    additionalIncome = 0, // Self-employment, rental, etc.
  } = params;

  const config = UK_TAX_CONFIG[taxYear];
  if (!config) {
    throw new Error(`Tax year ${taxYear} not supported`);
  }

  // Total gross income
  const totalGrossIncome = grossPay + additionalIncome;

  // Calculate adjusted personal allowance
  const personalAllowance = calculatePersonalAllowance(totalGrossIncome - pensionContributions, config);

  // Taxable income (after PA and pension)
  const taxableIncome = Math.max(0, totalGrossIncome - personalAllowance - pensionContributions);

  // Income Tax calculation - pass gross income, the function calculates PA internally
  const incomeTax = calculateIncomeTax(totalGrossIncome, config, pensionContributions, personalAllowance);

  // National Insurance
  const nationalInsurance = calculateNationalInsurance(grossPay, config);

  // Pension relief
  const pensionRelief = calculatePensionRelief(grossPay, pensionContributions, config);

  // CGT calculation with correct rate based on income
  // Use capitalGainsSplit if provided, otherwise use capitalGains
  const cgtInput = capitalGainsSplit && (capitalGainsSplit.pre !== undefined || capitalGainsSplit.post !== undefined)
    ? capitalGainsSplit
    : capitalGains;

  const cgt = calculateCGTRate(taxableIncome, cgtInput, config, pensionContributions);

  // Calculate pre/post October tax separately for display
  let preOctTax = 0;
  let postOctTax = 0;

  if (cgt.breakdown) {
    for (const band of cgt.breakdown) {
      if (band.band.includes('Pre-30 Oct')) {
        preOctTax += band.tax;
      } else if (band.band.includes('Post-30 Oct')) {
        postOctTax += band.tax;
      }
    }
  }

  // Total tax liability
  const totalTaxDue = incomeTax.total + cgt.tax;
  const totalNIDue = nationalInsurance.total;

  // What's already been paid via PAYE
  const taxAlreadyPaid = taxPaid;
  const niAlreadyPaid = niPaid;

  // Balance to pay (or refund if negative)
  const incomeTaxBalance = Math.round((incomeTax.total - taxAlreadyPaid) * 100) / 100;
  const niBalance = Math.round((nationalInsurance.total - niAlreadyPaid) * 100) / 100;
  const totalBalance = Math.round((incomeTaxBalance + cgt.tax) * 100) / 100;

  return {
    taxYear,
    summary: {
      totalGrossIncome: Math.round(totalGrossIncome * 100) / 100,
      personalAllowance,
      pensionContributions,
      taxableIncome: Math.round(taxableIncome * 100) / 100,

      incomeTaxDue: incomeTax.total,
      incomeTaxPaid: taxAlreadyPaid,
      incomeTaxBalance,

      nationalInsuranceDue: nationalInsurance.total,
      nationalInsurancePaid: niAlreadyPaid,
      niBalance,

      capitalGains,
      cgtExemption: config.cgtAnnualExemption,
      cgtTaxableGain: cgt.taxableGain,
      cgtDue: cgt.tax,
      cgtEffectiveRate: cgt.effectiveRate,

      totalTaxDue: Math.round((incomeTax.total + cgt.tax) * 100) / 100,
      totalAlreadyPaid: taxAlreadyPaid,
      balanceToPay: totalBalance,
    },

    incomeTax: {
      ...incomeTax,
      personalAllowanceUsed: personalAllowance,
      personalAllowanceReduced: personalAllowance < config.personalAllowance,
    },

    nationalInsurance,
    pensionRelief,
    capitalGainsTax: {
      ...cgt,
      preOctTax: Math.round(preOctTax * 100) / 100,
      postOctTax: Math.round(postOctTax * 100) / 100,
    },

    config: {
      taxYear,
      personalAllowanceBase: config.personalAllowance,
      basicRateLimit: 50270,
      higherRateLimit: 125140,
      cgtAnnualExemption: config.cgtAnnualExemption,
    },
  };
}

/**
 * Format currency for display
 */
export function formatGBP(amount) {
  const sign = amount < 0 ? '-' : '';
  return `${sign}£${Math.abs(amount).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
