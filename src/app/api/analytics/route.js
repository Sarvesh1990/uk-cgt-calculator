import { NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// Firebase client config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
let db = null;

function getDb() {
  if (db) return db;

  const isConfigured = firebaseConfig.apiKey && firebaseConfig.projectId;
  if (!isConfigured) {
    console.warn('[Analytics API] Firebase not configured');
    return null;
  }

  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(app);
    return db;
  } catch (error) {
    console.error('[Analytics API] Failed to initialize Firebase:', error);
    return null;
  }
}

/**
 * Get client IP from request headers
 */
function getClientIP(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();

  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP;

  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) return cfIP;

  const vercelIP = request.headers.get('x-vercel-forwarded-for');
  if (vercelIP) return vercelIP.split(',')[0].trim();

  return 'unknown';
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { sessionId, event, data = {} } = body;

    // Validate
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const validEvents = [
      'page_visit',
      'step_completed',
      'step_skipped',
      'cgt_calculated',
      'pdf_downloaded',
      'feedback_submitted',
      'edit_income',
      'edit_cgt',
      // Step 1: Tax Year selection
      'tax_year_selected',
      // Step 2: Income details
      'p60_upload',
      'income_entry',
      // Step 3: CGT details
      'broker_selected',
      'broker_file_upload',
      'calculation_started',
      'calculation_result',
    ];
    if (!event || !validEvents.includes(event)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
    }

    // Get client IP
    const clientIP = getClientIP(request);

    // Log to console
    console.log(`[Analytics] Session: ${sessionId} | IP: ${clientIP} | Event: ${event} | Data: ${JSON.stringify(data)}`);

    const firestore = getDb();

    if (!firestore) {
      return NextResponse.json({ success: true, logged: 'console-only' });
    }

    // Get or create session document
    const sessionRef = doc(firestore, 'sessions', sessionId);
    const sessionDoc = await getDoc(sessionRef);

    const now = new Date().toISOString();
    const eventEntry = {
      event,
      ...data,
      timestamp: now,
    };

    if (sessionDoc.exists()) {
      // Update existing session - add event to events array
      const existingData = sessionDoc.data();
      const events = existingData.events || [];
      events.push(eventEntry);

      // Update funnel flags based on event
      const updates = {
        events,
        lastActivity: now,
      };

      // Update funnel progress
      // Step 1: Tax Year, Step 2: Income, Step 3: CGT, Step 4: Interest, Step 5: Summary
      if (event === 'step_completed') {
        if (data.step === 1) updates.completedStep1_TaxYear = true;
        if (data.step === 2) updates.completedStep2_Income = true;
        if (data.step === 3) updates.completedStep3_CGT = true;
        if (data.step === 4) updates.completedStep4_Interest = true;
        if (data.step === 5) updates.completedStep5_Summary = true;
      }
      if (event === 'step_skipped') {
        if (data.step === 2) updates.skippedStep2_Income = true;
        if (data.step === 3) updates.skippedStep3_CGT = true;
        if (data.step === 4) updates.skippedStep4_Interest = true;
      }
      if (event === 'feedback_submitted') {
        updates.feedbackRating = data.rating;
      }

      await setDoc(sessionRef, updates, { merge: true });
    } else {
      // Create new session document
      const sessionData = {
        sessionId,
        clientIP,
        userAgent: request.headers.get('user-agent') || '',
        createdAt: now,
        lastActivity: now,
        taxYear: data.taxYear || '',
        events: [eventEntry],
        // Funnel flags (Step 1: Tax Year, Step 2: Income, Step 3: CGT, Step 4: Interest, Step 5: Summary)
        completedStep1_TaxYear: event === 'step_completed' && data.step === 1,
        completedStep2_Income: event === 'step_completed' && data.step === 2,
        completedStep3_CGT: event === 'step_completed' && data.step === 3,
        completedStep4_Interest: event === 'step_completed' && data.step === 4,
        completedStep5_Summary: event === 'step_completed' && data.step === 5,
        skippedStep2_Income: event === 'step_skipped' && data.step === 2,
        skippedStep3_CGT: event === 'step_skipped' && data.step === 3,
        skippedStep4_Interest: event === 'step_skipped' && data.step === 4,
        feedbackRating: event === 'feedback_submitted' ? data.rating : null,
      };

      await setDoc(sessionRef, sessionData);
    }

    return NextResponse.json({ success: true, sessionId });

  } catch (error) {
    console.error('[Analytics API] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to log event' }, { status: 500 });
  }
}
