/**
 * Meta Pixel + Conversions API Integration
 * Tracks conversion events for Meta Ads using both client-side pixel and server-side API
 */

// Check if Meta Pixel is loaded
function isPixelLoaded() {
  return typeof window !== 'undefined' && typeof window.fbq === 'function';
}

/**
 * Get Meta cookies for deduplication
 */
function getMetaCookies() {
  if (typeof document === 'undefined') return {};

  const cookies = document.cookie.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});

  return {
    fbp: cookies._fbp || null,
    fbc: cookies._fbc || null,
  };
}

/**
 * Generate a unique event ID for deduplication between pixel and API
 */
function generateEventId(eventName) {
  return `${eventName}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Send event to Conversions API (server-side)
 */
async function sendToConversionsAPI(eventName, eventId, customData = {}) {
  try {
    const metaCookies = getMetaCookies();

    await fetch('/api/meta-conversion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName,
        eventId,
        customData,
        userData: {
          fbp: metaCookies.fbp,
          fbc: metaCookies.fbc,
        },
        eventSourceUrl: window.location.href,
      }),
    });
  } catch (error) {
    console.warn('[Conversions API] Error:', error);
  }
}

/**
 * Track a standard or custom event (pixel + API)
 * @param {string} eventName - Event name (e.g., 'Lead', 'CompleteRegistration', or custom)
 * @param {Object} params - Event parameters
 */
export function trackPixelEvent(eventName, params = {}) {
  const eventId = generateEventId(eventName);

  // Client-side pixel
  if (isPixelLoaded()) {
    try {
      window.fbq('track', eventName, params, { eventID: eventId });
      console.log(`[Meta Pixel] Tracked: ${eventName}`, params);
    } catch (error) {
      console.warn(`[Meta Pixel] Error tracking ${eventName}:`, error);
    }
  } else {
    console.log(`[Meta Pixel] Not loaded, skipping client event: ${eventName}`);
  }

  // Server-side Conversions API
  sendToConversionsAPI(eventName, eventId, params);
}

/**
 * Track a custom event (pixel + API)
 * @param {string} eventName - Custom event name
 * @param {Object} params - Event parameters
 */
export function trackCustomEvent(eventName, params = {}) {
  const eventId = generateEventId(eventName);

  // Client-side pixel
  if (isPixelLoaded()) {
    try {
      window.fbq('trackCustom', eventName, params, { eventID: eventId });
      console.log(`[Meta Pixel] Tracked Custom: ${eventName}`, params);
    } catch (error) {
      console.warn(`[Meta Pixel] Error tracking custom ${eventName}:`, error);
    }
  } else {
    console.log(`[Meta Pixel] Not loaded, skipping custom event: ${eventName}`);
  }

  // Server-side Conversions API
  sendToConversionsAPI(eventName, eventId, params);
}

// ============================================
// Conversion Events for UK CGT Calculator
// ============================================

/**
 * Track CGT Calculation Complete
 * Fire when user successfully calculates their CGT
 * @param {Object} data - Calculation data
 */
export function trackCGTCalculationComplete(data = {}) {
  // Using 'Lead' as standard event - good for "user showed intent"
  trackPixelEvent('Lead', {
    content_name: 'CGT Calculation',
    content_category: 'Tax Calculator',
    tax_year: data.taxYear,
    brokers_used: data.brokers?.join(', ') || '',
    disposals_count: data.disposals || 0,
    value: data.netGain || 0,
    currency: 'GBP',
  });

  // Also fire custom event for more specific tracking
  trackCustomEvent('CGTCalculationComplete', {
    tax_year: data.taxYear,
    brokers: data.brokers,
    disposals: data.disposals,
    net_gain: data.netGain,
    taxable_gain: data.taxableGain,
  });
}

/**
 * Track Summary Page Reached
 * Fire when user reaches the final tax summary
 * @param {Object} data - Summary data
 */
export function trackSummaryReached(data = {}) {
  // Using 'CompleteRegistration' as it signifies completing a flow
  trackPixelEvent('CompleteRegistration', {
    content_name: 'Tax Summary',
    status: 'complete',
    tax_year: data.taxYear,
    has_income: data.hasIncome,
    has_cgt: data.hasCGT,
    value: data.totalBalance || 0,
    currency: 'GBP',
  });

  // Also fire custom event
  trackCustomEvent('TaxSummaryReached', {
    tax_year: data.taxYear,
    has_income: data.hasIncome,
    has_cgt: data.hasCGT,
    total_balance: data.totalBalance,
  });
}
