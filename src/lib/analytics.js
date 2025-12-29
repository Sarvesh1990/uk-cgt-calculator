/**
 * Analytics Service
 * Tracks user session and events, updating a single document per session
 */

// Session ID - generated fresh on each page load
let sessionId = null;

function getSessionId() {
  if (typeof window === 'undefined') return null;

  // Generate new session ID if not exists (fresh on each page load/refresh)
  if (!sessionId) {
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }
  return sessionId;
}

/**
 * Reset session ID (e.g., when user clicks "Start Over")
 */
export function resetSession() {
  sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Track an analytics event (updates session document)
 * @param {string} event - Event name
 * @param {Object} data - Additional event data
 */
export async function trackEvent(event, data = {}) {
  try {
    const sessionId = getSessionId();
    if (!sessionId) return;

    // Don't block the UI - fire and forget
    fetch('/api/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        event,
        data: {
          ...data,
          timestamp: new Date().toISOString(),
        },
      }),
    }).catch((err) => {
      // Silently fail - analytics shouldn't break the app
      console.warn('[Analytics] Failed to track event:', err.message);
    });
  } catch (error) {
    console.warn('[Analytics] Error:', error.message);
  }
}

/**
 * Track page visit (creates session)
 * @param {string} taxYear - Selected tax year
 */
export function trackPageVisit(taxYear) {
  trackEvent('page_visit', { taxYear });
}

/**
 * Track step completion
 * @param {number} step - Step number (1, 2, or 3)
 * @param {Object} data - Step-specific data
 */
export function trackStepCompleted(step, data = {}) {
  trackEvent('step_completed', { step, ...data });
}

/**
 * Track step skipped
 * @param {number} step - Step number
 */
export function trackStepSkipped(step) {
  trackEvent('step_skipped', { step });
}

/**
 * Track CGT calculation
 * @param {Object} data - Calculation summary
 */
export function trackCGTCalculated(data = {}) {
  trackEvent('cgt_calculated', data);
}

/**
 * Track PDF download
 * @param {string} taxYear - Tax year of the report
 */
export function trackPDFDownload(taxYear) {
  trackEvent('pdf_downloaded', { taxYear });
}

/**
 * Track feedback submitted
 * @param {number} rating - Star rating
 */
export function trackFeedbackSubmitted(rating) {
  trackEvent('feedback_submitted', { rating });
}

/**
 * Track edit income click
 */
export function trackEditIncome() {
  trackEvent('edit_income');
}

/**
 * Track edit CGT click
 */
export function trackEditCGT() {
  trackEvent('edit_cgt');
}

// ============================================
// Step 1: Income Step Tracking
// ============================================

/**
 * Track P60 upload attempt
 * @param {Object} data - Upload details
 */
export function trackP60Upload(data = {}) {
  trackEvent('p60_upload', {
    success: data.success,
    confidence: data.confidence,
    hasWarnings: data.warnings?.length > 0,
    fileType: data.fileType, // pdf, png, jpg
    error: data.error,
  });
}

/**
 * Track manual income entry
 * @param {Object} data - What fields were entered
 */
export function trackIncomeEntry(data = {}) {
  trackEvent('income_entry', {
    hasGrossPay: !!data.grossPay,
    hasTaxPaid: !!data.taxPaid,
    hasNIPaid: !!data.niPaid,
    entryMethod: data.entryMethod, // 'p60_upload' or 'manual'
  });
}

// ============================================
// Step 2: CGT Step Tracking
// ============================================

/**
 * Track broker selection
 * @param {string} brokerId - The broker ID selected
 */
export function trackBrokerSelected(brokerId) {
  trackEvent('broker_selected', { brokerId });
}

/**
 * Track broker file upload
 * @param {Object} data - Upload details
 */
export function trackBrokerFileUpload(data = {}) {
  trackEvent('broker_file_upload', {
    brokerId: data.brokerId,
    fileCount: data.fileCount,
    fileTypes: data.fileTypes, // e.g., ['csv', 'xlsx']
  });
}

/**
 * Track CGT calculation initiated with broker details
 * @param {Object} data - Brokers used
 */
export function trackCalculationStarted(data = {}) {
  trackEvent('calculation_started', {
    brokers: data.brokers, // Array of broker IDs used
    totalFiles: data.totalFiles,
  });
}

/**
 * Track CGT calculation result
 * @param {Object} data - Calculation result summary
 */
export function trackCalculationResult(data = {}) {
  trackEvent('calculation_result', {
    success: data.success,
    error: data.error,
    disposals: data.disposals,
    netGain: data.netGain,
    taxableGain: data.taxableGain,
    brokers: data.brokers,
  });
}
