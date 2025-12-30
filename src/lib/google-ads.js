/**
 * Google Ads Conversion Tracking
 * Tracks conversion events for Google Ads campaigns
 */

/**
 * Check if gtag is loaded
 */
function isGtagLoaded() {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

/**
 * Track a Google Ads conversion event
 * @param {string} conversionLabel - The conversion label from Google Ads
 * @param {Object} params - Additional conversion parameters
 */
export function trackConversion(conversionLabel, params = {}) {
  if (!isGtagLoaded()) {
    console.log('[Google Ads] gtag not loaded, skipping conversion event');
    return;
  }

  try {
    window.gtag('event', 'conversion', {
      'send_to': `AW-939500252/${conversionLabel}`,
      ...params,
    });
    console.log(`[Google Ads] Conversion tracked: ${conversionLabel}`, params);
  } catch (error) {
    console.warn(`[Google Ads] Error tracking conversion:`, error);
  }
}

/**
 * Track a custom event
 * @param {string} eventName - Event name
 * @param {Object} params - Event parameters
 */
export function trackEvent(eventName, params = {}) {
  if (!isGtagLoaded()) {
    console.log('[Google Ads] gtag not loaded, skipping event');
    return;
  }

  try {
    window.gtag('event', eventName, params);
    console.log(`[Google Ads] Event tracked: ${eventName}`, params);
  } catch (error) {
    console.warn(`[Google Ads] Error tracking event:`, error);
  }
}

// ============================================
// Conversion Events for UK CGT Calculator
// ============================================

/**
 * Track CGT Calculation Conversion
 * Fire when user successfully calculates their CGT
 * 
 * NOTE: You need to create a conversion action in Google Ads and replace
 * 'CONVERSION_LABEL' with the actual conversion label from Google Ads.
 * 
 * To get the conversion label:
 * 1. Go to Google Ads > Goals > Conversions
 * 2. Create a new conversion action (or use existing)
 * 3. Get the conversion label (looks like: 'abc123xyz')
 * 4. Replace 'CONVERSION_LABEL' below with your actual label
 * 
 * @param {Object} data - Calculation data
 */
export function trackCGTCalculationConversion(data = {}) {
  // Conversion label from Google Ads: AW-939500252/O_lgCKTtitobENzF_r8D
  const conversionLabel = 'O_lgCKTtitobENzF_r8D';

  trackConversion(conversionLabel, {
    'value': data.netGain || 0,
    'currency': 'GBP',
    'transaction_id': `cgt_${Date.now()}`,
  });

  // Also track as a custom event for additional analytics
  trackEvent('cgt_calculation_complete', {
    'tax_year': data.taxYear,
    'brokers_count': data.brokers?.length || 0,
    'disposals_count': data.disposals || 0,
    'net_gain': data.netGain || 0,
    'taxable_gain': data.taxableGain || 0,
  });
}

/**
 * Track Summary Page Reached
 * @param {Object} data - Summary data
 */
export function trackSummaryReachedConversion(data = {}) {
  trackEvent('tax_summary_reached', {
    'tax_year': data.taxYear,
    'has_income': data.hasIncome,
    'has_cgt': data.hasCGT,
    'total_balance': data.totalBalance || 0,
  });
}

/**
 * Track PDF Download
 * @param {string} taxYear - Tax year
 */
export function trackPDFDownloadEvent(taxYear) {
  trackEvent('pdf_download', {
    'tax_year': taxYear,
  });
}
