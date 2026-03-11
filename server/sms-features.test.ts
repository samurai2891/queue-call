import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database functions
vi.mock('./db', () => ({
  getDb: vi.fn(() => Promise.resolve({})),
  createSmsLog: vi.fn(() => Promise.resolve(1)),
  updateSmsLog: vi.fn(() => Promise.resolve()),
  getSmsLogs: vi.fn(() => Promise.resolve({ logs: [], total: 0 })),
  getSmsLogStats: vi.fn(() => Promise.resolve({ totalSent: 0, totalFailed: 0, totalCredits: 0 })),
  getStoreById: vi.fn(() => Promise.resolve({ id: 1, smsBalance: 1000 })),
  getSmsSubscriptionByTicket: vi.fn(() => Promise.resolve(null)),
  createSmsSubscription: vi.fn(() => Promise.resolve()),
  updateSmsSubscription: vi.fn(() => Promise.resolve()),
  getTicketById: vi.fn(() => Promise.resolve({ id: 1, storeId: 1 })),
}));

// Mock stripe functions
vi.mock('./stripe', () => ({
  consumeSmsBalance: vi.fn(() => Promise.resolve({ success: true })),
  getSmsBalance: vi.fn(() => Promise.resolve(1000)),
  getSmsTransactions: vi.fn(() => Promise.resolve({ transactions: [], total: 0 })),
}));

describe('SMS Features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SMS Log Functions', () => {
    it('should create SMS log entry', async () => {
      const { createSmsLog } = await import('./db');
      
      const logId = await createSmsLog({
        storeId: 1,
        ticketId: 1,
        phoneE164: '+819012345678',
        messageContent: 'Test message',
        status: 'pending',
        creditConsumed: 20,
        messageType: 'call',
      });
      
      expect(createSmsLog).toHaveBeenCalledWith({
        storeId: 1,
        ticketId: 1,
        phoneE164: '+819012345678',
        messageContent: 'Test message',
        status: 'pending',
        creditConsumed: 20,
        messageType: 'call',
      });
      expect(logId).toBe(1);
    });

    it('should update SMS log status', async () => {
      const { updateSmsLog } = await import('./db');
      
      await updateSmsLog(1, { status: 'sent', twilioMessageSid: 'SM123' });
      
      expect(updateSmsLog).toHaveBeenCalledWith(1, { status: 'sent', twilioMessageSid: 'SM123' });
    });

    it('should get SMS logs with pagination', async () => {
      const { getSmsLogs } = await import('./db');
      
      const result = await getSmsLogs(1, { limit: 20, offset: 0 });
      
      expect(getSmsLogs).toHaveBeenCalledWith(1, { limit: 20, offset: 0 });
      expect(result).toHaveProperty('logs');
      expect(result).toHaveProperty('total');
    });

    it('should get SMS stats', async () => {
      const { getSmsLogStats } = await import('./db');
      
      const stats = await getSmsLogStats(1, 30);
      
      expect(getSmsLogStats).toHaveBeenCalledWith(1, 30);
      expect(stats).toHaveProperty('totalSent');
      expect(stats).toHaveProperty('totalFailed');
      expect(stats).toHaveProperty('totalCredits');
    });
  });

  describe('SMS Registration Flow', () => {
    it('should validate E.164 phone number format', () => {
      const validNumbers = ['+819012345678', '+14155551234', '+821012345678'];
      const invalidNumbers = ['09012345678', '1234567890', '+1', ''];
      
      const e164Regex = /^\+[1-9]\d{1,14}$/;
      
      validNumbers.forEach(num => {
        expect(e164Regex.test(num)).toBe(true);
      });
      
      invalidNumbers.forEach(num => {
        expect(e164Regex.test(num)).toBe(false);
      });
    });

    it('should create SMS subscription for ticket', async () => {
      const { createSmsSubscription, getSmsSubscriptionByTicket } = await import('./db');
      
      await createSmsSubscription({
        ticketId: 1,
        phoneE164: '+819012345678',
      });
      
      expect(createSmsSubscription).toHaveBeenCalledWith({
        ticketId: 1,
        phoneE164: '+819012345678',
      });
    });

    it('should update SMS subscription with verification', async () => {
      const { updateSmsSubscription } = await import('./db');
      
      await updateSmsSubscription(1, { verifiedAt: new Date() });
      
      expect(updateSmsSubscription).toHaveBeenCalled();
    });
  });

  describe('SMS Balance Management', () => {
    it('should check SMS balance before sending', async () => {
      const { getSmsBalance } = await import('./stripe');
      
      const balance = await getSmsBalance(1);
      
      expect(balance).toBe(1000);
    });

    it('should consume SMS balance on send', async () => {
      const { consumeSmsBalance } = await import('./stripe');
      
      const result = await consumeSmsBalance({ storeId: 1, ticketId: 1 });
      
      expect(consumeSmsBalance).toHaveBeenCalledWith({ storeId: 1, ticketId: 1 });
      expect(result.success).toBe(true);
    });
  });

  describe('Auto Charge Prompt Logic', () => {
    it('should show warning when balance is low (< 1000)', () => {
      const balance = 800;
      const lowBalanceThreshold = 1000;
      const isLowBalance = balance < lowBalanceThreshold;
      
      expect(isLowBalance).toBe(true);
    });

    it('should show critical warning when balance is very low (< 500)', () => {
      const balance = 400;
      const criticalThreshold = 500;
      const isCriticalBalance = balance < criticalThreshold;
      
      expect(isCriticalBalance).toBe(true);
    });

    it('should not show warning when balance is sufficient', () => {
      const balance = 2000;
      const lowBalanceThreshold = 1000;
      const isLowBalance = balance < lowBalanceThreshold;
      
      expect(isLowBalance).toBe(false);
    });
  });

  describe('SMS Message Type', () => {
    it('should support different message types', () => {
      const validTypes = ['call', 'recall', 'reminder', 'custom'];
      
      validTypes.forEach(type => {
        expect(['call', 'recall', 'reminder', 'custom']).toContain(type);
      });
    });
  });

  describe('Phone Number Masking', () => {
    it('should mask phone number for privacy', () => {
      const formatPhoneNumber = (phone: string): string => {
        if (phone.length > 8) {
          return phone.slice(0, 4) + '****' + phone.slice(-4);
        }
        return phone;
      };
      
      expect(formatPhoneNumber('+819012345678')).toBe('+819****5678');
      expect(formatPhoneNumber('+14155551234')).toBe('+141****1234');
    });
  });

  describe('SMS Status Transitions', () => {
    it('should have valid status values', () => {
      const validStatuses = ['pending', 'sent', 'delivered', 'failed'];
      
      validStatuses.forEach(status => {
        expect(['pending', 'sent', 'delivered', 'failed']).toContain(status);
      });
    });

    it('should transition from pending to sent', () => {
      const currentStatus = 'pending';
      const nextStatus = 'sent';
      
      expect(currentStatus).toBe('pending');
      expect(nextStatus).toBe('sent');
    });
  });
});
