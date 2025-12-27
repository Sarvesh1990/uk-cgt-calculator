import { NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

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
    console.warn('[Feedback API] Firebase not configured');
    return null;
  }

  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(app);
    return db;
  } catch (error) {
    console.error('[Feedback API] Failed to initialize Firebase:', error);
    return null;
  }
}

/**
 * Get client IP from request headers
 */
function getClientIP(request) {
  // Try various headers that might contain the real IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  const cfIP = request.headers.get('cf-connecting-ip'); // Cloudflare
  if (cfIP) {
    return cfIP;
  }

  const vercelIP = request.headers.get('x-vercel-forwarded-for'); // Vercel
  if (vercelIP) {
    return vercelIP.split(',')[0].trim();
  }

  return 'unknown';
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { rating, comment, taxYear, hadIncome, hadCGT, userAgent } = body;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Invalid rating. Must be between 1 and 5.' },
        { status: 400 }
      );
    }

    // Get client IP
    const clientIP = getClientIP(request);

    console.log(`[Feedback API] Received feedback - IP: ${clientIP}, Rating: ${rating}`);

    const firestore = getDb();

    if (!firestore) {
      // Firebase not configured - log and return success
      console.log(`[Feedback API] IP: ${clientIP} | Rating: ${rating} | Comment: ${comment || 'none'} | TaxYear: ${taxYear} | (Firebase not configured)`);
      return NextResponse.json({
        success: true,
        id: 'local-' + Date.now(),
        note: 'Firebase not configured',
      });
    }

    // Store in Firestore
    const feedbackRef = collection(firestore, 'feedback');
    const docRef = await addDoc(feedbackRef, {
      rating,
      comment: comment || '',
      taxYear: taxYear || '',
      hadIncome: hadIncome || false,
      hadCGT: hadCGT || false,
      userAgent: userAgent || '',
      clientIP,
      createdAt: serverTimestamp(),
    });

    console.log(`[Feedback API] IP: ${clientIP} | Rating: ${rating} | Saved with ID: ${docRef.id}`);

    return NextResponse.json({
      success: true,
      id: docRef.id,
    });

  } catch (error) {
    console.error('[Feedback API] Error:', error);

    return NextResponse.json(
      { error: error.message || 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}
