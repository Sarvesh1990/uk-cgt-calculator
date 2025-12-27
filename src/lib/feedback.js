/**
 * Feedback Service
 * Submits user feedback through API route (which logs IP and stores in Firestore)
 */

/**
 * Submit feedback via API
 * @param {Object} feedback - Feedback data
 * @param {number} feedback.rating - Star rating (1-5)
 * @param {string} feedback.comment - Optional detailed comment
 * @param {string} feedback.taxYear - Tax year calculated
 * @param {boolean} feedback.hadIncome - Whether user entered income data
 * @param {boolean} feedback.hadCGT - Whether user had CGT data
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function submitFeedback(feedback) {
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rating: feedback.rating,
        comment: feedback.comment || '',
        taxYear: feedback.taxYear || '',
        hadIncome: feedback.hadIncome || false,
        hadCGT: feedback.hadCGT || false,
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : '',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to submit feedback');
    }

    console.log('[Feedback] Submitted successfully:', data.id);

    return {
      success: true,
      id: data.id,
    };
  } catch (error) {
    console.error('[Feedback] Error submitting feedback:', error);

    return {
      success: false,
      error: error.message,
    };
  }
}
