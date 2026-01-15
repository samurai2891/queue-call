import { getDb, createSmsLog, updateSmsLog } from './db';
import { pushSubscriptions, smsSubscriptions, tickets, smsLogs } from '../drizzle/schema';
import { eq, and, isNull, isNotNull, sql } from 'drizzle-orm';
import webPush from 'web-push';
import { consumeSmsBalance, SMS_COST_PER_MESSAGE } from './stripe';


// Web Push notification payload
interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
}

type NotificationLogContext = {
  storeId?: number;
  storeSlug?: string;
  ticketId?: number;
  requestId?: string;
};

const buildLogContext = (context?: NotificationLogContext) => {
  if (!context) return {};
  return {
    storeId: context.storeId,
    storeSlug: context.storeSlug,
    ticketId: context.ticketId,
    requestId: context.requestId,
  };
};

const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

let vapidConfigured = false;

const ensureVapidConfig = () => {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn('[Push] VAPID keys are not configured');
    return false;
  }
  webPush.setVapidDetails(vapidSubject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
};

// Send Web Push notification to a ticket

export async function sendPushNotification(
  ticketId: number,
  payload: PushPayload,
  context?: NotificationLogContext
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const logContext = buildLogContext({ ticketId, ...context });

  try {

    // Get push subscriptions for this ticket
    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.ticketId, ticketId));

    if (subscriptions.length === 0) {
      console.log(`[Push] No subscriptions found for ticket ${ticketId}`, logContext);
      return false;
    }


    if (!ensureVapidConfig()) {
      return false;
    }

    const payloadJson = JSON.stringify(payload);

    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        const subscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webPush.sendNotification(subscription, payloadJson, { TTL: 86400 });
          return true;
        } catch (error) {
          const statusCode =
            typeof error === 'object' && error && 'statusCode' in error
              ? (error as { statusCode?: number }).statusCode
              : undefined;

          if (statusCode === 404 || statusCode === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
            console.log(`[Push] Removed invalid subscription ${sub.id}`, {
              ...logContext,
              subscriptionId: sub.id,
            });
          }

          console.error(`[Push] Failed to send to subscription ${sub.id}:`, {
            ...logContext,
            subscriptionId: sub.id,
          }, error);
          return false;

        }
      })
    );

    return results.some(r => r);

  } catch (error) {
    console.error('[Push] Error sending notification:', logContext, error);
    return false;
  }

}

// Send SMS notification via Twilio with balance check
export async function sendSmsNotification(
  ticketId: number,
  storeId: number,
  message: string,
  twilioConfig: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
  },
  options?: {
    messageType?: 'call' | 'recall' | 'reminder' | 'custom';
    recallLimitSeconds?: number;
    recallMaxCount?: number;
    logContext?: NotificationLogContext;
  }
): Promise<{ success: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) return { success: false, reason: 'Database not available' };

  const logContext = buildLogContext({
    storeId,
    ticketId,
    ...options?.logContext,
  });

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
      console.log("[SMS] No verified subscriptions found", logContext);
      return { success: false, reason: 'No verified subscription' };
    }


    const subscription = subscriptions[0];
    const messageType = options?.messageType ?? 'call';
    const recallLimitSeconds = options?.recallLimitSeconds ?? 0;
    const recallMaxCount = options?.recallMaxCount ?? 0;

    if (messageType === 'recall') {
      const now = new Date();

      if (recallLimitSeconds > 0 && subscription.lastSentAt) {
        const secondsSinceLast = (now.getTime() - subscription.lastSentAt.getTime()) / 1000;

        if (secondsSinceLast < recallLimitSeconds) {
          await createSmsLog({
            storeId,
            ticketId,
            phoneE164: subscription.phoneE164,
            messageContent: message,
            status: 'failed',
            creditConsumed: 0,
            messageType,
            errorMessage: 'Recall throttled',
          });
          console.warn("[SMS] Recall throttled", logContext);
          return { success: false, reason: 'Recall throttled' };

        }
      }

      if (recallMaxCount > 0) {
        const [ticket] = await db
          .select({ calledAt: tickets.calledAt, createdAt: tickets.createdAt })
          .from(tickets)
          .where(eq(tickets.id, ticketId))
          .limit(1);

        const baseline = ticket?.calledAt ?? ticket?.createdAt;
        if (baseline) {
          const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(smsLogs)
            .where(
              and(
                eq(smsLogs.ticketId, ticketId),
                eq(smsLogs.messageType, 'recall'),
                sql`${smsLogs.createdAt} >= ${baseline}`
              )
            );

          const recallCount = countResult[0]?.count || 0;
          if (recallCount >= recallMaxCount) {
            await createSmsLog({
              storeId,
              ticketId,
              phoneE164: subscription.phoneE164,
              messageContent: message,
              status: 'failed',
              creditConsumed: 0,
              messageType,
              errorMessage: 'Recall limit reached',
            });
            console.warn("[SMS] Recall limit reached", logContext);
            return { success: false, reason: 'Recall limit reached' };

          }
        }
      }
    }

    // Create SMS log entry first
    const smsLogId = await createSmsLog({
      storeId,
      ticketId,
      phoneE164: subscription.phoneE164,
      messageContent: message,
      status: 'pending',
      creditConsumed: SMS_COST_PER_MESSAGE,
      messageType,
    });

    // Check and consume SMS balance BEFORE sending
    const balanceResult = await consumeSmsBalance({
      storeId,
      ticketId,
    });

    if (!balanceResult.success) {
      console.warn("[SMS] Insufficient balance", {
        ...logContext,
        reason: balanceResult.reason,
      });
      await updateSmsLog(smsLogId, { status: 'failed', errorMessage: balanceResult.reason });
      return { success: false, reason: balanceResult.reason };
    }


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
      console.error('[SMS] Twilio error:', logContext, error);
      await updateSmsLog(smsLogId, { status: 'failed', errorMessage: error });
      // Note: Balance was already consumed. In production, consider refund logic here.
      return { success: false, reason: 'Twilio API error' };
    }


    const result = await response.json();

    // Update SMS log with success
    await updateSmsLog(smsLogId, {
      status: 'sent',
      twilioMessageSid: result.sid,
      sentAt: new Date(),
    });

    // Update last sent time
    await db
      .update(smsSubscriptions)
      .set({ lastSentAt: new Date() })
      .where(eq(smsSubscriptions.id, subscription.id));

    console.log('[SMS] Successfully sent', {
      ...logContext,
      phoneE164: subscription.phoneE164,
      messageSid: result.sid,
    });
    return { success: true };
  } catch (error) {
    console.error('[SMS] Error sending notification:', logContext, error);
    return { success: false, reason: 'Internal error' };
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
  storeId: number,
  storeName: string,
  ticketNumber: number,
  options?: {
    pushEnabled?: boolean;
    pushTemplate?: string;
    twilioConfig?: {
      accountSid: string;
      authToken: string;
      fromNumber: string;
    };
    smsTemplate?: string;
    messageType?: 'call' | 'recall' | 'reminder' | 'custom';
    ticketUrl?: string;

    recallLimitSeconds?: number;
    recallMaxCount?: number;
    storeSlug?: string;
    requestId?: string;
  }
): Promise<{ push: boolean; sms: boolean; smsReason?: string }> {
  const results: { push: boolean; sms: boolean; smsReason?: string } = { push: false, sms: false };
  const pushEnabled = options?.pushEnabled ?? true;
  const logContext: NotificationLogContext = {
    storeId,
    storeSlug: options?.storeSlug,
    ticketId,
    requestId: options?.requestId,
  };
  const messageType = options?.messageType ?? 'call';

  if (pushEnabled) {
    const fallbackMessage = messageType === 'recall'
      ? `お客様の番号 ${ticketNumber} が呼び出されています。再度ご確認ください。`
      : `お客様の番号 ${ticketNumber} が呼び出されました。カウンターまでお越しください。`;
    const message = (options?.pushTemplate ?? fallbackMessage)
      .replace('{storeName}', storeName)
      .replace('{number}', String(ticketNumber))
      .trim();

    results.push = await sendPushNotification(ticketId, {
      title: `${storeName}`,
      body: message,
      tag: `ticket-${ticketId}`,
      data: {
        type: 'called',
        ticketId,
        ticketNumber,
      },
    }, logContext);
  }


  const twilioConfig = options?.twilioConfig;
  if (twilioConfig) {
    const fallbackMessage = messageType === 'recall'
      ? `【${storeName}】再度のご案内です。お客様の番号 ${ticketNumber} が呼び出されています。`
      : `【${storeName}】お客様の番号 ${ticketNumber} が呼び出されました。カウンターまでお越しください。`;

    const ticketUrl = options?.ticketUrl ?? '';
    const message = (options?.smsTemplate ?? fallbackMessage)
      .replace('{storeName}', storeName)
      .replace('{number}', String(ticketNumber))
      .replace('{url}', ticketUrl)
      .trim();

    const smsResult = await sendSmsNotification(ticketId, storeId, message, twilioConfig, {
      messageType,
      recallLimitSeconds: options?.recallLimitSeconds,
      recallMaxCount: options?.recallMaxCount,
      logContext,
    });

    results.sms = smsResult.success;
    results.smsReason = smsResult.reason;
  }

  return results;
}

