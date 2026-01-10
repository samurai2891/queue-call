import { getDb } from './db';
import { pushSubscriptions, smsSubscriptions, tickets } from '../drizzle/schema';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';

// Web Push notification payload
interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
}

// Send Web Push notification to a ticket
export async function sendPushNotification(
  ticketId: number,
  payload: PushPayload
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    // Get push subscriptions for this ticket
    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.ticketId, ticketId));

    if (subscriptions.length === 0) {
      console.log(`[Push] No subscriptions found for ticket ${ticketId}`);
      return false;
    }

    // Send to all subscriptions
    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          // Use the Web Push API
          const response = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'TTL': '86400',
              ...(sub.p256dh && sub.auth ? {
                'Authorization': `vapid p256dh=${sub.p256dh};auth=${sub.auth}`,
              } : {}),
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            // If subscription is invalid, remove it
            if (response.status === 404 || response.status === 410) {
              await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
              console.log(`[Push] Removed invalid subscription ${sub.id}`);
            }
            return false;
          }

          return true;
        } catch (error) {
          console.error(`[Push] Failed to send to subscription ${sub.id}:`, error);
          return false;
        }
      })
    );

    return results.some(r => r);
  } catch (error) {
    console.error('[Push] Error sending notification:', error);
    return false;
  }
}

// Send SMS notification via Twilio
export async function sendSmsNotification(
  ticketId: number,
  message: string,
  twilioConfig: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
  }
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    // Get SMS subscription for this ticket
    const subscriptions = await db
      .select()
      .from(smsSubscriptions)
      .where(
        and(
          eq(smsSubscriptions.ticketId, ticketId),
          isNotNull(smsSubscriptions.verifiedAt),
          isNull(smsSubscriptions.optedOutAt)
        )
      );

    if (subscriptions.length === 0) {
      console.log(`[SMS] No verified subscriptions found for ticket ${ticketId}`);
      return false;
    }

    const subscription = subscriptions[0];

    // Send via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.accountSid}/Messages.json`;
    const auth = Buffer.from(`${twilioConfig.accountSid}:${twilioConfig.authToken}`).toString('base64');

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: subscription.phoneE164,
        From: twilioConfig.fromNumber,
        Body: message,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[SMS] Twilio error:', error);
      return false;
    }

    // Update last sent time
    await db
      .update(smsSubscriptions)
      .set({ lastSentAt: new Date() })
      .where(eq(smsSubscriptions.id, subscription.id));

    return true;
  } catch (error) {
    console.error('[SMS] Error sending notification:', error);
    return false;
  }
}

// Send OTP via Twilio Verify
export async function sendOtp(
  phoneNumber: string,
  twilioConfig: {
    accountSid: string;
    authToken: string;
    verifyServiceSid: string;
  }
): Promise<boolean> {
  try {
    const twilioUrl = `https://verify.twilio.com/v2/Services/${twilioConfig.verifyServiceSid}/Verifications`;
    const auth = Buffer.from(`${twilioConfig.accountSid}:${twilioConfig.authToken}`).toString('base64');

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phoneNumber,
        Channel: 'sms',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[OTP] Twilio error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[OTP] Error sending OTP:', error);
    return false;
  }
}

// Verify OTP via Twilio Verify
export async function verifyOtp(
  phoneNumber: string,
  code: string,
  twilioConfig: {
    accountSid: string;
    authToken: string;
    verifyServiceSid: string;
  }
): Promise<boolean> {
  try {
    const twilioUrl = `https://verify.twilio.com/v2/Services/${twilioConfig.verifyServiceSid}/VerificationCheck`;
    const auth = Buffer.from(`${twilioConfig.accountSid}:${twilioConfig.authToken}`).toString('base64');

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phoneNumber,
        Code: code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[OTP] Twilio verification error:', error);
      return false;
    }

    const result = await response.json();
    return result.status === 'approved';
  } catch (error) {
    console.error('[OTP] Error verifying OTP:', error);
    return false;
  }
}

// Notify ticket holder when called
export async function notifyTicketCalled(
  ticketId: number,
  storeName: string,
  ticketNumber: number,
  twilioConfig?: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
  },
  smsTemplate?: string
): Promise<{ push: boolean; sms: boolean }> {
  const results = { push: false, sms: false };

  // Send push notification
  results.push = await sendPushNotification(ticketId, {
    title: `${storeName}`,
    body: `お客様の番号 ${ticketNumber} が呼び出されました。カウンターまでお越しください。`,
    tag: `ticket-${ticketId}`,
    data: {
      type: 'called',
      ticketId,
      ticketNumber,
    },
  });

  // Send SMS if configured
  if (twilioConfig) {
    const message = smsTemplate
      ? smsTemplate
          .replace('{storeName}', storeName)
          .replace('{number}', String(ticketNumber))
      : `【${storeName}】お客様の番号 ${ticketNumber} が呼び出されました。カウンターまでお越しください。`;

    results.sms = await sendSmsNotification(ticketId, message, twilioConfig);
  }

  return results;
}
