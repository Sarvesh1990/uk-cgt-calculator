'use client';

import { useState } from 'react';
import { submitFeedback } from '@/lib/feedback';
import { trackFeedbackSubmitted } from '@/lib/analytics';

export default function FeedbackWidget({ taxYear, hadIncome, hadCGT }) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (rating === 0) return;

    setSubmitting(true);
    setError(null);

    const result = await submitFeedback({
      rating,
      comment,
      taxYear,
      hadIncome,
      hadCGT,
    });

    setSubmitting(false);

    if (result.success) {
      trackFeedbackSubmitted(rating);
      setSubmitted(true);
    } else {
      setError('Failed to submit feedback. Please try again.');
    }
  };

  if (submitted) {
    return (
      <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-700/50 rounded-xl p-6 text-center">
        <div className="text-4xl mb-3">🎉</div>
        <h3 className="text-white font-semibold text-lg mb-2">Thank You!</h3>
        <p className="text-slate-300 text-sm">Your feedback helps us improve the calculator.</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-blue-900/20 to-indigo-900/20 border border-blue-700/50 rounded-xl p-6">
      <div className="text-center mb-4">
        <h3 className="text-white font-semibold text-lg mb-1">How was your experience?</h3>
        <p className="text-slate-400 text-sm">Your feedback helps us improve</p>
      </div>

      {/* Star Rating */}
      <div className="flex justify-center gap-2 mb-4">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoveredRating(star)}
            onMouseLeave={() => setHoveredRating(0)}
            className="text-3xl transition-transform hover:scale-110 focus:outline-none"
            aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
          >
            {star <= (hoveredRating || rating) ? (
              <span className="text-yellow-400">★</span>
            ) : (
              <span className="text-slate-600">☆</span>
            )}
          </button>
        ))}
      </div>

      {/* Rating Label */}
      {rating > 0 && (
        <p className="text-center text-sm mb-4">
          {rating === 1 && <span className="text-red-400">Poor</span>}
          {rating === 2 && <span className="text-orange-400">Fair</span>}
          {rating === 3 && <span className="text-yellow-400">Good</span>}
          {rating === 4 && <span className="text-green-400">Very Good</span>}
          {rating === 5 && <span className="text-emerald-400">Excellent!</span>}
        </p>
      )}

      {/* Comment Box (shown after rating) */}
      {rating > 0 && (
        <div className="space-y-4">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Any suggestions or comments? (optional)"
            className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
            rows={3}
            maxLength={1000}
          />

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`w-full py-3 rounded-lg font-medium transition-all ${
              submitting
                ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Submitting...
              </span>
            ) : (
              'Submit Feedback'
            )}
          </button>
        </div>
      )}

      {/* Prompt to rate */}
      {rating === 0 && (
        <p className="text-center text-slate-500 text-xs mt-2">
          Click a star to rate
        </p>
      )}
    </div>
  );
}
