import { getDb, createSmsLog, updateSmsLog } from './db';
import { pushSubscriptions, smsSubscriptions, tickets, smsLogs } from '../drizzle/schema';
import { eq, and, isNull, isNotNull, sql } from 'drizzle-orm';
import webPush from 'web-push';
import { consumeSmsBalance, refundSmsBalance, SMS_COST_PER_MESSAGE } from './stripe';


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

/**
 * Resolve VAPID subject (mailto: URI) from:
 * 1. VAPID_SUBJECT env var (explicit override)
 * 2. Owner's email from DB (auto-detected at first use)
 * 3. App domain-based fallback
 */
let resolvedVapidSubject: string | null = null;

async function getVapidSubject(): Promise<string> {
  // Return cached value
  if (resolvedVapidSubject) return resolvedVapidSubject;

  // 1. Explicit env var
  if (process.env.VAPID_SUBJECT) {
    resolvedVapidSubject = process.env.VAPID_SUBJECT;
    return resolvedVapidSubject;
  }

  // 2. Try to get owner's email from DB
  try {
    const ownerOpenId = process.env.OWNER_OPEN_ID;
    if (ownerOpenId) {
      const db = await getDb();
      if (db) {
        const { users } = await import('../drizzle/schema');
        const result = await db.select({ email: users.email }).from(users).where(eq(users.openId, ownerOpenId)).limit(1);
        if (result[0]?.email) {
          resolvedVapidSubject = `mailto:${result[0].email}`;
          console.log(`[VAPID] Subject resolved from owner email: ${resolvedVapidSubject}`);
          return resolvedVapidSubject;
        }
      }
    }
  } catch (e) {
    console.warn('[VAPID] Failed to resolve owner email:', e);
  }

  // 3. Domain-based fallback
  const appDomain = process.env.VITE_APP_DOMAIN || 'queue-call.app';
  resolvedVapidSubject = `mailto:noreply@${appDomain}`;
  return resolvedVapidSubject;
}

// Reset cached VAPID subject (for testing only)
export function resetVapidSubjectForTesting() {
  resolvedVapidSubject = null;
}

// Export for testing
export { getVapidSubject, resolvedVapidSubject };

let vapidConfigured = false;

const ensureVapidConfig = async (): Promise<boolean> => {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn('[Push] VAPID keys are not configured');
    return false;
  }
  const subject = await getVapidSubject();
  webPush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
};

// Send Web Push notification to a ticket

// Default TTL for push notifications (10 minutes)
const DEFAULT_PUSH_TTL = 600;

export async function sendPushNotification(
  ticketId: number,
  payload: PushPayload,
  context?: NotificationLogContext,
  pushOptions?: { ttl?: number }
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


    if (!(await ensureVapidConfig())) {
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
          const ttl = pushOptions?.ttl ?? DEFAULT_PUSH_TTL;
          await webPush.sendNotification(subscription, payloadJson, { TTL: ttl, urgency: 'high' });
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

// Send test push notification directly to a subscription
export async function sendTestPushNotification(
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: PushPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await ensureVapidConfig())) {
      return { success: false, error: 'VAPID keys not configured' };
    }

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    const payloadJson = JSON.stringify(payload);
    await webPush.sendNotification(pushSubscription, payloadJson, { TTL: 600, urgency: 'high' });
    return { success: true };
  } catch (error) {
    const statusCode =
      typeof error === 'object' && error && 'statusCode' in error
        ? (error as { statusCode?: number }).statusCode
        : undefined;
    const message =
      typeof error === 'object' && error && 'message' in error
        ? (error as { message?: string }).message
        : 'Unknown error';
    
    console.error('[Push] Test notification failed:', { statusCode, message });
    return { success: false, error: message || `Status code: ${statusCode}` };
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
      // 残高を返金（Twilio APIエラーでSMSは送信されていない）
      await refundSmsBalance({
        storeId,
        ticketId,
        reason: `Twilio API error: ${error.substring(0, 200)}`,
      });
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

// Localized fallback messages for push notifications
const PUSH_FALLBACK_MESSAGES: Record<string, { call: string; recall: string }> = {
  ja: {
    call: 'お客様の番号 {number} が呼び出されました。カウンターまでお越しください。',
    recall: 'お客様の番号 {number} が呼び出されています。再度ご確認ください。',
  },
  en: {
    call: 'Your number {number} has been called. Please come to the counter.',
    recall: 'Your number {number} is being called. Please check again.',
  },
  ko: {
    call: '고객님 번호 {number}가 호출되었습니다. 카운터로 와주세요.',
    recall: '고객님 번호 {number}가 호출 중입니다. 다시 확인해 주세요.',
  },
  'zh-Hans': {
    call: '您的号码 {number} 已被呼叫，请到柜台。',
    recall: '您的号码 {number} 正在呼叫，请再次确认。',
  },
  'zh-Hant': {
    call: '您的號碼 {number} 已被叫號，請至櫃台。',
    recall: '您的號碼 {number} 正在叫號，請再次確認。',
  },
};

// Localized fallback messages for SMS notifications
const SMS_FALLBACK_MESSAGES: Record<string, { call: string; recall: string }> = {
  ja: {
    call: '【{storeName}】お客様の番号 {number} が呼び出されました。カウンターまでお越しください。',
    recall: '【{storeName}】再度のご案内です。お客様の番号 {number} が呼び出されています。',
  },
  en: {
    call: '[{storeName}] Your number {number} has been called. Please come to the counter.',
    recall: '[{storeName}] Reminder: Your number {number} is being called. Please check again.',
  },
  ko: {
    call: '[{storeName}] 고객님 번호 {number}가 호출되었습니다. 카운터로 와주세요.',
    recall: '[{storeName}] 다시 안내드립니다. 고객님 번호 {number}가 호출 중입니다.',
  },
  'zh-Hans': {
    call: '【{storeName}】您的号码 {number} 已被呼叫，请到柜台。',
    recall: '【{storeName}】再次提醒：您的号码 {number} 正在呼叫。',
  },
  'zh-Hant': {
    call: '【{storeName}】您的號碼 {number} 已被叫號，請至櫃台。',
    recall: '【{storeName}】再次提醒：您的號碼 {number} 正在叫號。',
  },
};

// Localized fallback messages for wait time alerts
export const WAIT_ALERT_FALLBACK_MESSAGES: Record<string, { title: string; body: string }> = {
  ja: {
    title: '{storeName} - まもなく順番',
    body: 'まもなく順番です！予測待ち時間が約{minutes}分になりました。',
  },
  en: {
    title: '{storeName} - Almost your turn',
    body: 'Almost your turn! Estimated wait time is about {minutes} minutes.',
  },
  ko: {
    title: '{storeName} - 곧 차례입니다',
    body: '곧 차례입니다! 예상 대기 시간이 약 {minutes}분입니다.',
  },
  'zh-Hans': {
    title: '{storeName} - 即将轮到您',
    body: '即将轮到您！预计等待时间约{minutes}分钟。',
  },
  'zh-Hant': {
    title: '{storeName} - 即將輪到您',
    body: '即將輪到您！預計等待時間約{minutes}分鐘。',
  },
};

function getLocaleFallback(locale?: string | null): string {
  if (locale && PUSH_FALLBACK_MESSAGES[locale]) return locale;
  return 'ja'; // Default to Japanese
}

// Export for testing
export { PUSH_FALLBACK_MESSAGES, SMS_FALLBACK_MESSAGES };

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
    checkinGraceMinutes?: number;
    ticketLocale?: string | null;
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
  const locale = getLocaleFallback(options?.ticketLocale);

  if (pushEnabled) {
    const localizedMessages = PUSH_FALLBACK_MESSAGES[locale];
    const fallbackMessage = messageType === 'recall'
      ? localizedMessages.recall
      : localizedMessages.call;
    const message = (options?.pushTemplate ?? fallbackMessage)
      .replace('{storeName}', storeName)
      .replace('{number}', String(ticketNumber))
      .trim();

    // TTL = checkinGraceMinutes * 60 (default 10 minutes = 600s)
    const pushTtl = options?.checkinGraceMinutes
      ? options.checkinGraceMinutes * 60
      : DEFAULT_PUSH_TTL;

    results.push = await sendPushNotification(ticketId, {
      title: `${storeName}`,
      body: message,
      tag: `ticket-${ticketId}`,
      data: {
        type: 'called',
        ticketId,
        ticketNumber,
        url: options?.ticketUrl || '/',
        ticketToken: undefined, // included in url
      },
    }, logContext, { ttl: pushTtl });
  }


  const twilioConfig = options?.twilioConfig;
  if (twilioConfig) {
    const smsLocalizedMessages = SMS_FALLBACK_MESSAGES[locale];
    const fallbackMessage = messageType === 'recall'
      ? smsLocalizedMessages.recall
      : smsLocalizedMessages.call;

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


// Send reservation reminder SMS directly (without ticket subscription)
export async function sendReservationReminderSms(
  reservationId: number,
  storeId: number,
  phoneE164: string,
  message: string,
  twilioConfig: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
  }
): Promise<{ success: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) return { success: false, reason: 'Database not available' };

  const logContext = buildLogContext({
    storeId,
  });

  try {
    // Check and consume SMS balance BEFORE sending
    const balanceResult = await consumeSmsBalance({
      storeId,
      ticketId: 0, // No ticket for reservation reminder
    });

    if (!balanceResult.success) {
      console.warn("[SMS] Insufficient balance for reservation reminder", {
        ...logContext,
        reservationId,
        reason: balanceResult.reason,
      });
      return { success: false, reason: balanceResult.reason };
    }

    // Create SMS log entry
    const smsLogId = await createSmsLog({
      storeId,
      ticketId: 0, // No ticket for reservation reminder
      phoneE164,
      messageContent: message,
      status: 'pending',
      creditConsumed: SMS_COST_PER_MESSAGE,
      messageType: 'reminder',
    });

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
        To: phoneE164,
        From: twilioConfig.fromNumber,
        Body: message,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[SMS] Twilio error for reservation reminder:', logContext, error);
      await updateSmsLog(smsLogId, { status: 'failed', errorMessage: error });
      // 残高を返金（Twilio APIエラーでSMSは送信されていない）
      await refundSmsBalance({
        storeId,
        ticketId: 0,
        reason: `Reservation reminder Twilio error: ${error.substring(0, 200)}`,
      });
      return { success: false, reason: 'Twilio API error' };
    }

    const result = await response.json();

    // Update SMS log with success
    await updateSmsLog(smsLogId, {
      status: 'sent',
      twilioMessageSid: result.sid,
      sentAt: new Date(),
    });

    console.log('[SMS] Reservation reminder sent successfully', {
      ...logContext,
      reservationId,
      phoneE164,
      messageSid: result.sid,
    });
    return { success: true };
  } catch (error) {
    console.error('[SMS] Error sending reservation reminder:', logContext, error);
    return { success: false, reason: 'Internal error' };
  }
}

// Send wait time alert notification
export async function sendWaitTimeAlert(
  ticketId: number,
  storeId: number,
  storeName: string,
  ticketNumber: number,
  estimatedMinutes: number,
  options?: {
    storeSlug?: string;
    requestId?: string;
    ticketLocale?: string | null;
  }
): Promise<boolean> {
  const logContext: NotificationLogContext = {
    storeId,
    storeSlug: options?.storeSlug,
    ticketId,
    requestId: options?.requestId,
  };

  const locale = getLocaleFallback(options?.ticketLocale);
  const localizedAlert = WAIT_ALERT_FALLBACK_MESSAGES[locale];
  const title = localizedAlert.title.replace('{storeName}', storeName);
  const message = localizedAlert.body.replace('{minutes}', String(estimatedMinutes));

  // Build ticket URL for notification click navigation
  let ticketUrl: string | undefined;
  if (options?.storeSlug) {
    const db = await getDb();
    if (db) {
      const [ticket] = await db.select({ ticketToken: tickets.ticketToken }).from(tickets).where(eq(tickets.id, ticketId)).limit(1);
      if (ticket?.ticketToken) {
        const baseUrl = process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
        ticketUrl = `${baseUrl.replace(/\/+$/, '')}/s/${options.storeSlug}/ticket/${ticket.ticketToken}`;
      }
    }
  }

  const result = await sendPushNotification(ticketId, {
    title,
    body: message,
    tag: `wait-alert-${ticketId}`,
    data: {
      type: 'wait_alert',
      ticketId,
      ticketNumber,
      estimatedMinutes,
      url: ticketUrl || '/',
    },
  }, logContext);

  if (result) {
    console.log('[Push] Wait time alert sent', {
      ...logContext,
      ticketNumber,
      estimatedMinutes,
    });
  }

  return result;
}
