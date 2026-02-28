import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module
vi.mock('./db', () => ({
  getDb: vi.fn(),
}));

// Mock the notification module
vi.mock('./_core/notification', () => ({
  notifyOwner: vi.fn().mockResolvedValue(undefined),
}));

import { getDb } from './db';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'test';
const stripeModule = await import('./stripe');


describe('SMS Balance Functions', () => {
  let mockDb: any;
  
  beforeEach(() => {
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue([]),
    };
    
    vi.mocked(getDb).mockResolvedValue(mockDb);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('consumeSmsBalance', () => {
    it('should consume balance successfully when sufficient funds', async () => {
      const storeId = 1;
      const ticketId = 100;
      const initialBalance = 1000;
      
      // Mock store with sufficient balance
      mockDb.limit.mockResolvedValueOnce([{ id: storeId, smsBalance: initialBalance, name: 'Test Store' }]);
      
      const result = await stripeModule.consumeSmsBalance({ storeId, ticketId });

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(initialBalance - stripeModule.SMS_COST_PER_MESSAGE);

    });
    
    it('should fail when balance is insufficient', async () => {
      const storeId = 1;
      const ticketId = 100;
      const initialBalance = 10; // Less than SMS_COST_PER_MESSAGE (20)
      
      // Mock store with insufficient balance
      mockDb.limit.mockResolvedValueOnce([{ id: storeId, smsBalance: initialBalance, name: 'Test Store' }]);
      
      const result = await stripeModule.consumeSmsBalance({ storeId, ticketId });
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('Insufficient balance');
      expect(result.newBalance).toBe(initialBalance);
    });
    
    it('should fail when store is not found', async () => {
      const storeId = 999;
      const ticketId = 100;
      
      // Mock empty result
      mockDb.limit.mockResolvedValueOnce([]);
      
      const result = await stripeModule.consumeSmsBalance({ storeId, ticketId });
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('Store not found');
    });
    
    it('should fail when database is not available', async () => {
      vi.mocked(getDb).mockResolvedValueOnce(null);
      
      const result = await stripeModule.consumeSmsBalance({ storeId: 1, ticketId: 100 });
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('Database not available');
    });
  });
  
  describe('getSmsBalance', () => {
    it('should return the store SMS balance', async () => {
      const storeId = 1;
      const expectedBalance = 5000;
      
      mockDb.limit.mockResolvedValueOnce([{ smsBalance: expectedBalance }]);
      
      const balance = await stripeModule.getSmsBalance(storeId);
      
      expect(balance).toBe(expectedBalance);
    });
    
    it('should return 0 when store is not found', async () => {
      const storeId = 999;
      
      mockDb.limit.mockResolvedValueOnce([]);
      
      const balance = await stripeModule.getSmsBalance(storeId);
      
      expect(balance).toBe(0);
    });
    
    it('should return 0 when database is not available', async () => {
      vi.mocked(getDb).mockResolvedValueOnce(null);
      
      const balance = await stripeModule.getSmsBalance(1);
      
      expect(balance).toBe(0);
    });
  });
  
  describe('getSmsTransactions', () => {
    it('should return transaction history with total count', async () => {
      const storeId = 1;
      const mockTransactions = [
        { id: 1, storeId, type: 'charge', amount: 5000, balanceAfter: 5000 },
        { id: 2, storeId, type: 'consume', amount: -20, balanceAfter: 4980 },
      ];
      
      // First call for count query
      mockDb.where.mockResolvedValueOnce([{ count: 2 }]);
      // Second call for offset().then transactions
      mockDb.offset = vi.fn().mockResolvedValueOnce(mockTransactions);
      mockDb.limit.mockReturnThis();
      
      const result = await stripeModule.getSmsTransactions(storeId);
      
      expect(result.transactions).toEqual(mockTransactions);
      expect(result.total).toBe(2);
    });
    
    it('should return empty result when database is not available', async () => {
      vi.mocked(getDb).mockResolvedValueOnce(null);
      
      const result = await stripeModule.getSmsTransactions(1);
      
      expect(result).toEqual({ transactions: [], total: 0 });
    });
    
    it('should respect limit and offset parameters', async () => {
      const storeId = 1;
      const limit = 5;
      const offset = 10;
      
      mockDb.where.mockResolvedValueOnce([{ count: 15 }]);
      mockDb.offset = vi.fn().mockResolvedValueOnce([]);
      mockDb.limit.mockReturnThis();
      
      const result = await stripeModule.getSmsTransactions(storeId, limit, offset);
      
      expect(mockDb.limit).toHaveBeenCalledWith(limit);
      expect(mockDb.offset).toHaveBeenCalledWith(offset);
      expect(result.total).toBe(15);
    });

    it('should filter by type when charge type is specified', async () => {
      const storeId = 1;
      const mockChargeTransactions = [
        { id: 1, storeId, type: 'charge', amount: 5000, balanceAfter: 5000 },
      ];
      
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]);
      mockDb.offset = vi.fn().mockResolvedValueOnce(mockChargeTransactions);
      mockDb.limit.mockReturnThis();
      
      const result = await stripeModule.getSmsTransactions(storeId, 50, 0, 'charge');
      
      expect(result.transactions).toEqual(mockChargeTransactions);
      expect(result.total).toBe(1);
      // where should be called with AND condition (storeId + type)
      expect(mockDb.where).toHaveBeenCalledTimes(2);
    });

    it('should filter by type when consume type is specified', async () => {
      const storeId = 1;
      const mockConsumeTransactions = [
        { id: 2, storeId, type: 'consume', amount: -20, balanceAfter: 4980 },
      ];
      
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]);
      mockDb.offset = vi.fn().mockResolvedValueOnce(mockConsumeTransactions);
      mockDb.limit.mockReturnThis();
      
      const result = await stripeModule.getSmsTransactions(storeId, 50, 0, 'consume');
      
      expect(result.transactions).toEqual(mockConsumeTransactions);
      expect(result.total).toBe(1);
    });

    it('should return all types when no type filter is specified', async () => {
      const storeId = 1;
      const mockAllTransactions = [
        { id: 1, storeId, type: 'charge', amount: 5000, balanceAfter: 5000 },
        { id: 2, storeId, type: 'consume', amount: -20, balanceAfter: 4980 },
      ];
      
      mockDb.where.mockResolvedValueOnce([{ count: 2 }]);
      mockDb.offset = vi.fn().mockResolvedValueOnce(mockAllTransactions);
      mockDb.limit.mockReturnThis();
      
      const result = await stripeModule.getSmsTransactions(storeId, 50, 0, undefined);
      
      expect(result.transactions).toEqual(mockAllTransactions);
      expect(result.total).toBe(2);
    });
  });
  
  describe('SMS_COST_PER_MESSAGE', () => {
    it('should be 20 yen per message', () => {
      expect(stripeModule.SMS_COST_PER_MESSAGE).toBe(20);
    });
  });

  describe('LOW_BALANCE_DEFAULT_THRESHOLD', () => {
    it('should be 1000 yen', () => {
      expect(stripeModule.LOW_BALANCE_DEFAULT_THRESHOLD).toBe(1000);
    });
  });

  describe('sendLowBalanceNotification', () => {
    it('should send notification when no previous notification was sent', async () => {
      const { notifyOwner } = await import('./_core/notification');
      const store = {
        id: 1,
        name: 'Test Store',
        smsBalance: 500,
        lastLowBalanceNotifiedAt: null,
        settings: null,
      } as any;

      await stripeModule.sendLowBalanceNotification(mockDb, store, 500);

      expect(vi.mocked(notifyOwner)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(notifyOwner)).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('SMS残高が少なくなっています'),
        })
      );
      // Should update lastLowBalanceNotifiedAt
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should skip notification during cooldown period', async () => {
      const { notifyOwner } = await import('./_core/notification');
      const store = {
        id: 1,
        name: 'Test Store',
        smsBalance: 500,
        lastLowBalanceNotifiedAt: new Date(), // Just notified
        settings: null,
      } as any;

      await stripeModule.sendLowBalanceNotification(mockDb, store, 500);

      expect(vi.mocked(notifyOwner)).not.toHaveBeenCalled();
    });

    it('should send notification after cooldown period expires', async () => {
      const { notifyOwner } = await import('./_core/notification');
      const store = {
        id: 1,
        name: 'Test Store',
        smsBalance: 500,
        lastLowBalanceNotifiedAt: new Date(Date.now() - 7 * 60 * 60 * 1000), // 7 hours ago (> 6h cooldown)
        settings: null,
      } as any;

      await stripeModule.sendLowBalanceNotification(mockDb, store, 500);

      expect(vi.mocked(notifyOwner)).toHaveBeenCalledTimes(1);
    });

    it('should send critical notification when balance is zero', async () => {
      const { notifyOwner } = await import('./_core/notification');
      const store = {
        id: 1,
        name: 'Test Store',
        smsBalance: 0,
        lastLowBalanceNotifiedAt: null,
        settings: null,
      } as any;

      await stripeModule.sendLowBalanceNotification(mockDb, store, 0);

      expect(vi.mocked(notifyOwner)).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('SMS残高がなくなりました'),
        })
      );
    });

    it('should include auto-charge recommendation when auto-charge is disabled', async () => {
      const { notifyOwner } = await import('./_core/notification');
      const store = {
        id: 1,
        name: 'Test Store',
        smsBalance: 500,
        lastLowBalanceNotifiedAt: null,
        settings: { smsAutoCharge: { enabled: false } },
      } as any;

      await stripeModule.sendLowBalanceNotification(mockDb, store, 500);

      expect(vi.mocked(notifyOwner)).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('自動チャージ'),
        })
      );
    });

    it('should not include auto-charge recommendation when auto-charge is enabled', async () => {
      const { notifyOwner } = await import('./_core/notification');
      const store = {
        id: 1,
        name: 'Test Store',
        smsBalance: 500,
        lastLowBalanceNotifiedAt: null,
        settings: { smsAutoCharge: { enabled: true, thresholdBalance: 1000, chargeAmount: 5000 } },
      } as any;

      await stripeModule.sendLowBalanceNotification(mockDb, store, 500);

      const callContent = vi.mocked(notifyOwner).mock.calls[0][0].content;
      expect(callContent).not.toContain('自動チャージを設定すると');
    });

    it('should include remaining messages count in notification', async () => {
      const { notifyOwner } = await import('./_core/notification');
      const store = {
        id: 1,
        name: 'Test Store',
        smsBalance: 500,
        lastLowBalanceNotifiedAt: null,
        settings: null,
      } as any;

      await stripeModule.sendLowBalanceNotification(mockDb, store, 500);

      const callContent = vi.mocked(notifyOwner).mock.calls[0][0].content;
      expect(callContent).toContain('25 通分'); // 500 / 20 = 25
    });

    it('should include settings URL in notification', async () => {
      const { notifyOwner } = await import('./_core/notification');
      const store = {
        id: 1,
        name: 'Test Store',
        smsBalance: 500,
        lastLowBalanceNotifiedAt: null,
        settings: null,
      } as any;

      await stripeModule.sendLowBalanceNotification(mockDb, store, 500);

      const callContent = vi.mocked(notifyOwner).mock.calls[0][0].content;
      expect(callContent).toContain('/admin/settings?tab=notifications');
    });
  });

  describe('consumeSmsBalance low balance notification integration', () => {
    it('should use autoCharge threshold when autoCharge is configured', async () => {
      const { notifyOwner } = await import('./_core/notification');
      const storeId = 1;
      const ticketId = 100;
      // Balance after consume will be 2980, which is below autoCharge threshold of 3000
      const initialBalance = 3000;
      
      mockDb.limit.mockResolvedValueOnce([{
        id: storeId,
        smsBalance: initialBalance,
        name: 'Test Store',
        lastLowBalanceNotifiedAt: null,
        settings: {
          smsAutoCharge: { enabled: false, thresholdBalance: 3000, chargeAmount: 5000 },
        },
      }]);
      
      const result = await stripeModule.consumeSmsBalance({ storeId, ticketId });
      
      expect(result.success).toBe(true);
      // Should trigger low balance notification since 2980 <= 3000 threshold
      expect(vi.mocked(notifyOwner)).toHaveBeenCalled();
    });

    it('should use default threshold when no autoCharge settings', async () => {
      const { notifyOwner } = await import('./_core/notification');
      const storeId = 1;
      const ticketId = 100;
      // Balance after consume will be 980, which is below default threshold of 1000
      const initialBalance = 1000;
      
      mockDb.limit.mockResolvedValueOnce([{
        id: storeId,
        smsBalance: initialBalance,
        name: 'Test Store',
        lastLowBalanceNotifiedAt: null,
        settings: null,
      }]);
      
      const result = await stripeModule.consumeSmsBalance({ storeId, ticketId });
      
      expect(result.success).toBe(true);
      // Should trigger low balance notification since 980 <= 1000 default threshold
      expect(vi.mocked(notifyOwner)).toHaveBeenCalled();
    });
  });

});
