import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Meta Conversions API Route
 * Sends server-side events to Meta for more reliable conversion tracking
 *
 * Required environment variables:
 * - META_PIXEL_ID: Your Meta Pixel ID
 * - META_CONVERSIONS_API_TOKEN: Access token for Conversions API
 */

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CONVERSIONS_API_TOKEN;
const API_VERSION = 'v18.0';

/**
 * Hash user data for privacy (required by Conversions API)
 */
function hashData(data) {
  if (!data) return null;
  return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
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

  return null;
}

export async function POST(request) {
  try {
    // Check if Conversions API is configured
    if (!PIXEL_ID || !ACCESS_TOKEN) {
      console.log('[Conversions API] Not configured, skipping');
      return NextResponse.json({ success: true, skipped: true });
    }

    const body = await request.json();
    const {
      eventName,
      eventId,
      customData = {},
      userData = {},
      eventSourceUrl,
    } = body;

    if (!eventName) {
      return NextResponse.json({ error: 'Missing eventName' }, { status: 400 });
    }

    // Get user data from request
    const clientIP = getClientIP(request);
    const userAgent = request.headers.get('user-agent');

    // Build the event payload
    const eventTime = Math.floor(Date.now() / 1000);

    const event = {
      event_name: eventName,
      event_time: eventTime,
      event_id: eventId || `${eventName}_${eventTime}_${Math.random().toString(36).substring(7)}`,
      event_source_url: eventSourceUrl || request.headers.get('referer'),
      action_source: 'website',
      user_data: {
        client_ip_address: clientIP,
        client_user_agent: userAgent,
        // Hash any PII data
        ...(userData.email && { em: hashData(userData.email) }),
        ...(userData.phone && { ph: hashData(userData.phone) }),
        ...(userData.firstName && { fn: hashData(userData.firstName) }),
        ...(userData.lastName && { ln: hashData(userData.lastName) }),
        // External ID (e.g., session ID) - not hashed
        ...(userData.externalId && { external_id: userData.externalId }),
        // Browser data for better matching
        ...(userData.fbp && { fbp: userData.fbp }), // _fbp cookie
        ...(userData.fbc && { fbc: userData.fbc }), // _fbc cookie (click ID)
      },
      custom_data: {
        ...customData,
        currency: customData.currency || 'GBP',
      },
    };

    // Send to Meta Conversions API
    const url = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [event],
        access_token: ACCESS_TOKEN,
        // Enable test mode in development
        ...(process.env.NODE_ENV === 'development' && {
          test_event_code: process.env.META_TEST_EVENT_CODE
        }),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[Conversions API] Error:', result);
      return NextResponse.json({
        success: false,
        error: result.error?.message || 'API error'
      }, { status: 500 });
    }

    console.log(`[Conversions API] ✅ Sent: ${eventName}`, result);

    return NextResponse.json({
      success: true,
      events_received: result.events_received,
      fbtrace_id: result.fbtrace_id,
    });

  } catch (error) {
    console.error('[Conversions API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
