import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ==================== L-1: VAPID_SUBJECT Tests ====================
describe('L-1: VAPID_SUBJECT auto-resolution', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = {
      VAPID_SUBJECT: process.env.VAPID_SUBJECT,
      OWNER_OPEN_ID: process.env.OWNER_OPEN_ID,
      VITE_APP_DOMAIN: process.env.VITE_APP_DOMAIN,
    };
  });

  afterEach(() => {
    // Restore env
    Object.entries(originalEnv).forEach(([key, val]) => {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    });
  });

  it('should use VAPID_SUBJECT env var when explicitly set', async () => {
    const { getVapidSubject, resetVapidSubjectForTesting } = await import('./notifications');
    resetVapidSubjectForTesting();
    
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';
    const subject = await getVapidSubject();
    expect(subject).toBe('mailto:test@example.com');
    
    resetVapidSubjectForTesting();
  });

  it('should fall back to domain-based email when no env or owner email', async () => {
    const { getVapidSubject, resetVapidSubjectForTesting } = await import('./notifications');
    resetVapidSubjectForTesting();
    
    delete process.env.VAPID_SUBJECT;
    delete process.env.OWNER_OPEN_ID;
    process.env.VITE_APP_DOMAIN = 'my-queue.example.com';
    
    const subject = await getVapidSubject();
    expect(subject).toBe('mailto:noreply@my-queue.example.com');
    
    resetVapidSubjectForTesting();
  });

  it('should fall back to queue-call.app when no domain env set', async () => {
    const { getVapidSubject, resetVapidSubjectForTesting } = await import('./notifications');
    resetVapidSubjectForTesting();
    
    delete process.env.VAPID_SUBJECT;
    delete process.env.OWNER_OPEN_ID;
    delete process.env.VITE_APP_DOMAIN;
    
    const subject = await getVapidSubject();
    expect(subject).toBe('mailto:noreply@queue-call.app');
    
    resetVapidSubjectForTesting();
  });

  it('should cache the resolved value', async () => {
    const { getVapidSubject, resetVapidSubjectForTesting } = await import('./notifications');
    resetVapidSubjectForTesting();
    
    process.env.VAPID_SUBJECT = 'mailto:cached@example.com';
    
    const first = await getVapidSubject();
    const second = await getVapidSubject();
    expect(first).toBe(second);
    expect(first).toBe('mailto:cached@example.com');
    
    resetVapidSubjectForTesting();
  });

  it('getVapidSubject should always return a mailto: URI', async () => {
    const { getVapidSubject, resetVapidSubjectForTesting } = await import('./notifications');
    resetVapidSubjectForTesting();
    
    delete process.env.VAPID_SUBJECT;
    delete process.env.OWNER_OPEN_ID;
    
    const subject = await getVapidSubject();
    expect(subject).toMatch(/^mailto:/);
    
    resetVapidSubjectForTesting();
  });
});

// ==================== L-2: Background Sync Removal Tests ====================
describe('L-2: Background Sync removal from Service Worker', () => {
  it('sw.ts should not contain sync event listener', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const swPath = path.resolve(__dirname, '../client/src/sw.ts');
    const swContent = fs.readFileSync(swPath, 'utf-8');
    
    expect(swContent).not.toContain("addEventListener('sync'");
    expect(swContent).not.toContain('addEventListener("sync"');
  });

  it('sw.ts should not contain syncCheckin function', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const swPath = path.resolve(__dirname, '../client/src/sw.ts');
    const swContent = fs.readFileSync(swPath, 'utf-8');
    
    expect(swContent).not.toContain('syncCheckin');
  });

  it('sw.ts should still contain push event listener', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const swPath = path.resolve(__dirname, '../client/src/sw.ts');
    const swContent = fs.readFileSync(swPath, 'utf-8');
    
    expect(swContent).toContain("self.addEventListener('push'");
  });

  it('sw.ts should still contain notificationclick event listener', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const swPath = path.resolve(__dirname, '../client/src/sw.ts');
    const swContent = fs.readFileSync(swPath, 'utf-8');
    
    expect(swContent).toContain("self.addEventListener('notificationclick'");
  });
});

// ==================== L-3: isSubscribed Server Verification Tests ====================
describe('L-3: Push subscription server verification', () => {
  it('usePushNotification hook should accept checkServerSubscription option', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const hookPath = path.resolve(__dirname, '../client/src/hooks/usePushNotification.ts');
    const hookContent = fs.readFileSync(hookPath, 'utf-8');
    
    // Check that the hook interface includes checkServerSubscription
    expect(hookContent).toContain('checkServerSubscription');
  });

  it('usePushNotification should only set isSubscribed true after server registration succeeds', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const hookPath = path.resolve(__dirname, '../client/src/hooks/usePushNotification.ts');
    const hookContent = fs.readFileSync(hookPath, 'utf-8');
    
    // Check that setIsSubscribed(true) only appears after subscribeFn succeeds
    // The pattern should be: subscribeFn call -> then setIsSubscribed(true)
    const subscribeFnIndex = hookContent.indexOf('await subscribeFn({');
    const setSubscribedIndex = hookContent.indexOf('setIsSubscribed(true)', subscribeFnIndex);
    
    expect(subscribeFnIndex).toBeGreaterThan(-1);
    expect(setSubscribedIndex).toBeGreaterThan(subscribeFnIndex);
    
    // Check that server error handling exists
    expect(hookContent).toContain('Failed to register push subscription with server');
  });

  it('subscribe function should handle server registration failure gracefully', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const hookPath = path.resolve(__dirname, '../client/src/hooks/usePushNotification.ts');
    const hookContent = fs.readFileSync(hookPath, 'utf-8');
    
    // Should catch server errors and return false
    expect(hookContent).toContain('catch (serverError)');
    expect(hookContent).toContain('return false');
  });
});

// ==================== L-4: Fallback Message Localization Tests ====================
describe('L-4: Fallback message localization', () => {
  it('should have push fallback messages for all 5 supported languages', async () => {
    const { PUSH_FALLBACK_MESSAGES } = await import('./notifications');
    
    const languages = ['ja', 'en', 'ko', 'zh-Hans', 'zh-Hant'];
    for (const lang of languages) {
      expect(PUSH_FALLBACK_MESSAGES[lang]).toBeDefined();
      expect(PUSH_FALLBACK_MESSAGES[lang].call).toBeDefined();
      expect(PUSH_FALLBACK_MESSAGES[lang].recall).toBeDefined();
      expect(PUSH_FALLBACK_MESSAGES[lang].call.length).toBeGreaterThan(0);
      expect(PUSH_FALLBACK_MESSAGES[lang].recall.length).toBeGreaterThan(0);
    }
  });

  it('should have SMS fallback messages for all 5 supported languages', async () => {
    const { SMS_FALLBACK_MESSAGES } = await import('./notifications');
    
    const languages = ['ja', 'en', 'ko', 'zh-Hans', 'zh-Hant'];
    for (const lang of languages) {
      expect(SMS_FALLBACK_MESSAGES[lang]).toBeDefined();
      expect(SMS_FALLBACK_MESSAGES[lang].call).toBeDefined();
      expect(SMS_FALLBACK_MESSAGES[lang].recall).toBeDefined();
    }
  });

  it('should have wait alert fallback messages for all 5 supported languages', async () => {
    const { WAIT_ALERT_FALLBACK_MESSAGES } = await import('./notifications');
    
    const languages = ['ja', 'en', 'ko', 'zh-Hans', 'zh-Hant'];
    for (const lang of languages) {
      expect(WAIT_ALERT_FALLBACK_MESSAGES[lang]).toBeDefined();
      expect(WAIT_ALERT_FALLBACK_MESSAGES[lang].title).toBeDefined();
      expect(WAIT_ALERT_FALLBACK_MESSAGES[lang].body).toBeDefined();
    }
  });

  it('push fallback messages should contain {number} placeholder', async () => {
    const { PUSH_FALLBACK_MESSAGES } = await import('./notifications');
    
    const languages = ['ja', 'en', 'ko', 'zh-Hans', 'zh-Hant'];
    for (const lang of languages) {
      expect(PUSH_FALLBACK_MESSAGES[lang].call).toContain('{number}');
      expect(PUSH_FALLBACK_MESSAGES[lang].recall).toContain('{number}');
    }
  });

  it('SMS fallback messages should contain {storeName} and {number} placeholders', async () => {
    const { SMS_FALLBACK_MESSAGES } = await import('./notifications');
    
    const languages = ['ja', 'en', 'ko', 'zh-Hans', 'zh-Hant'];
    for (const lang of languages) {
      expect(SMS_FALLBACK_MESSAGES[lang].call).toContain('{storeName}');
      expect(SMS_FALLBACK_MESSAGES[lang].call).toContain('{number}');
      expect(SMS_FALLBACK_MESSAGES[lang].recall).toContain('{storeName}');
      expect(SMS_FALLBACK_MESSAGES[lang].recall).toContain('{number}');
    }
  });

  it('wait alert messages should contain {storeName} and {minutes} placeholders', async () => {
    const { WAIT_ALERT_FALLBACK_MESSAGES } = await import('./notifications');
    
    const languages = ['ja', 'en', 'ko', 'zh-Hans', 'zh-Hant'];
    for (const lang of languages) {
      expect(WAIT_ALERT_FALLBACK_MESSAGES[lang].title).toContain('{storeName}');
      expect(WAIT_ALERT_FALLBACK_MESSAGES[lang].body).toContain('{minutes}');
    }
  });

  it('notifyTicketCalled should accept ticketLocale option', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const notifPath = path.resolve(__dirname, './notifications.ts');
    const content = fs.readFileSync(notifPath, 'utf-8');
    
    // Check that notifyTicketCalled accepts ticketLocale
    expect(content).toContain('ticketLocale?: string | null');
  });

  it('sendWaitTimeAlert should accept ticketLocale option', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const notifPath = path.resolve(__dirname, './notifications.ts');
    const content = fs.readFileSync(notifPath, 'utf-8');
    
    // Find sendWaitTimeAlert function and check it has ticketLocale
    const funcIndex = content.indexOf('export async function sendWaitTimeAlert');
    const funcEnd = content.indexOf('): Promise<boolean>', funcIndex);
    const funcSignature = content.substring(funcIndex, funcEnd);
    
    expect(funcSignature).toContain('ticketLocale');
  });

  it('English fallback messages should be in English', async () => {
    const { PUSH_FALLBACK_MESSAGES, SMS_FALLBACK_MESSAGES, WAIT_ALERT_FALLBACK_MESSAGES } = await import('./notifications');
    
    expect(PUSH_FALLBACK_MESSAGES.en.call).toContain('called');
    expect(PUSH_FALLBACK_MESSAGES.en.recall).toContain('being called');
    expect(SMS_FALLBACK_MESSAGES.en.call).toContain('called');
    expect(WAIT_ALERT_FALLBACK_MESSAGES.en.title).toContain('Almost');
    expect(WAIT_ALERT_FALLBACK_MESSAGES.en.body).toContain('Almost your turn');
  });

  it('Japanese fallback messages should be in Japanese', async () => {
    const { PUSH_FALLBACK_MESSAGES, SMS_FALLBACK_MESSAGES, WAIT_ALERT_FALLBACK_MESSAGES } = await import('./notifications');
    
    expect(PUSH_FALLBACK_MESSAGES.ja.call).toContain('呼び出されました');
    expect(PUSH_FALLBACK_MESSAGES.ja.recall).toContain('呼び出されています');
    expect(SMS_FALLBACK_MESSAGES.ja.call).toContain('呼び出されました');
    expect(WAIT_ALERT_FALLBACK_MESSAGES.ja.title).toContain('まもなく順番');
    expect(WAIT_ALERT_FALLBACK_MESSAGES.ja.body).toContain('まもなく順番');
  });

  it('Korean fallback messages should be in Korean', async () => {
    const { PUSH_FALLBACK_MESSAGES } = await import('./notifications');
    
    expect(PUSH_FALLBACK_MESSAGES.ko.call).toContain('호출되었습니다');
    expect(PUSH_FALLBACK_MESSAGES.ko.recall).toContain('호출 중입니다');
  });

  it('Chinese Simplified fallback messages should be in Simplified Chinese', async () => {
    const { PUSH_FALLBACK_MESSAGES } = await import('./notifications');
    
    expect(PUSH_FALLBACK_MESSAGES['zh-Hans'].call).toContain('已被呼叫');
    expect(PUSH_FALLBACK_MESSAGES['zh-Hans'].recall).toContain('正在呼叫');
  });

  it('Chinese Traditional fallback messages should be in Traditional Chinese', async () => {
    const { PUSH_FALLBACK_MESSAGES } = await import('./notifications');
    
    expect(PUSH_FALLBACK_MESSAGES['zh-Hant'].call).toContain('已被叫號');
    expect(PUSH_FALLBACK_MESSAGES['zh-Hant'].recall).toContain('正在叫號');
  });

  it('routers should pass ticketLocale to notifyTicketCalled', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const routersPath = path.resolve(__dirname, './routers.ts');
    const content = fs.readFileSync(routersPath, 'utf-8');
    
    // Check that ticketLocale is passed in callNext, callSpecific, and recall
    const callNextMatch = content.match(/callNext:[\s\S]*?ticketLocale:\s*nextTicket\.locale/);
    expect(callNextMatch).not.toBeNull();
    
    // callSpecific and recall should also pass ticketLocale
    const ticketLocaleOccurrences = (content.match(/ticketLocale:\s*ticket\.locale/g) || []).length;
    expect(ticketLocaleOccurrences).toBeGreaterThanOrEqual(2); // callSpecific + recall
  });

  it('waitAlert job should pass ticketLocale to sendWaitTimeAlert', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const jobPath = path.resolve(__dirname, './jobs/waitAlert.ts');
    const content = fs.readFileSync(jobPath, 'utf-8');
    
    expect(content).toContain('ticketLocale: ticket.locale');
  });
});

// ==================== L-1 + L-4 Integration: VAPID subject no longer hardcoded ====================
describe('L-1: No hardcoded VAPID subjects', () => {
  it('vapid.ts should not contain hardcoded mailto addresses', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const vapidPath = path.resolve(__dirname, './vapid.ts');
    const content = fs.readFileSync(vapidPath, 'utf-8');
    
    // Should not contain hardcoded mailto addresses
    expect(content).not.toContain("'mailto:noreply@queue-call.app'");
    expect(content).not.toContain("'mailto:admin@example.com'");
    
    // Should use getVapidSubject instead
    expect(content).toContain('getVapidSubject');
  });

  it('notifications.ts should not contain hardcoded VAPID subject', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const notifPath = path.resolve(__dirname, './notifications.ts');
    const content = fs.readFileSync(notifPath, 'utf-8');
    
    // Should not contain the old hardcoded value
    expect(content).not.toContain("'mailto:admin@example.com'");
    
    // Should use getVapidSubject
    expect(content).toContain('async function getVapidSubject');
  });
});
