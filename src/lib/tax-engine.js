/**
 * UK Tax Calculator Engine
 * Calculates Income Tax, National Insurance, and integrates with CGT
 * Includes pension contribution relief
 */

// UK Tax Year configurations
export const UK_TAX_CONFIG = {
  "2024/25": {
    personalAllowance: 12570,
    personalAllowanceTaperThreshold: 100000, // PA reduces above this
    personalAllowanceTaperRate: 0.5, // £1 reduction for every £2 over threshold

    incomeTaxBands: [
      { name: "Personal Allowance", min: 0, max: 12570, rate: 0 },
      { name: "Basic Rate", min: 12571, max: 50270, rate: 0.20 },
      { name: "Higher Rate", min: 50271, max: 125140, rate: 0.40 },
      { name: "Additional Rate", min: 125141, max: Infinity, rate: 0.45 },
    ],

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

    // CGT rates based on income
    cgtRates: {
      basicRate: 0.10, // If total income + gains in basic rate band
      higherRate: 0.20, // If in higher/additional rate band
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
      { name: "Personal Allowance", min: 0, max: 12570, rate: 0 },
      { name: "Basic Rate", min: 12571, max: 50270, rate: 0.20 },
      { name: "Higher Rate", min: 50271, max: 125140, rate: 0.40 },
      { name: "Additional Rate", min: 125141, max: Infinity, rate: 0.45 },
    ],

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
 */
function calculateIncomeTax(taxableIncome, config, pensionContributions = 0) {
  // Pension contributions extend the basic rate band
  const adjustedBands = config.incomeTaxBands.map((band, index) => {
    if (band.name === "Basic Rate") {
      return { ...band, max: band.max + pensionContributions };
    }
    if (band.name === "Higher Rate") {
      return {
        ...band,
        min: band.min + pensionContributions,
        max: band.max + pensionContributions
      };
    }
    if (band.name === "Additional Rate") {
      return { ...band, min: band.min + pensionContributions };
    }
    return band;
  });

  let remainingIncome = taxableIncome;
  let totalTax = 0;
  const breakdown = [];

  for (const band of adjustedBands) {
    if (remainingIncome <= 0) break;

    const bandWidth = band.max - band.min + 1;
    const incomeInBand = Math.min(remainingIncome, band.min === 0 ? band.max : bandWidth);

    if (taxableIncome > band.min || band.min === 0) {
      const taxInBand = incomeInBand * band.rate;
      totalTax += taxInBand;

      if (incomeInBand > 0) {
        breakdown.push({
          band: band.name,
          income: Math.round(incomeInBand * 100) / 100,
          rate: band.rate,
          tax: Math.round(taxInBand * 100) / 100,
        });
      }

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
 * Basic rate taxpayers: 10%
 * Higher/Additional rate: 20%
 */
function calculateCGTRate(taxableIncome, capitalGain, config, pensionContributions = 0) {
  const basicRateLimit = 50270 + pensionContributions; // Extended by pension
  const exemption = config.cgtAnnualExemption;
  const taxableGain = Math.max(0, capitalGain - exemption);

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

  // Gains that fit in basic rate band
  const gainsAtBasicRate = Math.min(taxableGain, unusedBasicRate);
  if (gainsAtBasicRate > 0) {
    const cgtBasic = gainsAtBasicRate * config.cgtRates.basicRate;
    totalCGT += cgtBasic;
    breakdown.push({
      band: "Basic Rate (10%)",
      gain: Math.round(gainsAtBasicRate * 100) / 100,
      rate: config.cgtRates.basicRate,
      tax: Math.round(cgtBasic * 100) / 100,
    });
  }

  // Gains that exceed basic rate band
  const gainsAtHigherRate = taxableGain - gainsAtBasicRate;
  if (gainsAtHigherRate > 0) {
    const cgtHigher = gainsAtHigherRate * config.cgtRates.higherRate;
    totalCGT += cgtHigher;
    breakdown.push({
      band: "Higher Rate (20%)",
      gain: Math.round(gainsAtHigherRate * 100) / 100,
      rate: config.cgtRates.higherRate,
      tax: Math.round(cgtHigher * 100) / 100,
    });
  }

  return {
    taxableGain: Math.round(taxableGain * 100) / 100,
    exemptionUsed: Math.min(capitalGain, exemption),
    tax: Math.round(totalCGT * 100) / 100,
    breakdown,
    effectiveRate: taxableGain > 0 ? Math.round((totalCGT / taxableGain) * 10000) / 100 : 0,
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

  // Income Tax calculation
  const incomeTax = calculateIncomeTax(taxableIncome + personalAllowance, config, pensionContributions);

  // National Insurance
  const nationalInsurance = calculateNationalInsurance(grossPay, config);

  // Pension relief
  const pensionRelief = calculatePensionRelief(grossPay, pensionContributions, config);

  // CGT calculation with correct rate based on income
  const cgt = calculateCGTRate(taxableIncome, capitalGains, config, pensionContributions);

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
    capitalGainsTax: cgt,

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
