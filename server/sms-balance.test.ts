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
    it('should return transaction history', async () => {
      const storeId = 1;
      const mockTransactions = [
        { id: 1, storeId, type: 'charge', amount: 5000, balanceAfter: 5000 },
        { id: 2, storeId, type: 'consume', amount: -20, balanceAfter: 4980 },
      ];
      
      mockDb.limit.mockResolvedValueOnce(mockTransactions);
      
      const transactions = await stripeModule.getSmsTransactions(storeId);
      
      expect(transactions).toEqual(mockTransactions);
    });
    
    it('should return empty array when database is not available', async () => {
      vi.mocked(getDb).mockResolvedValueOnce(null);
      
      const transactions = await stripeModule.getSmsTransactions(1);
      
      expect(transactions).toEqual([]);
    });
    
    it('should respect limit parameter', async () => {
      const storeId = 1;
      const limit = 5;
      
      mockDb.limit.mockResolvedValueOnce([]);
      
      await stripeModule.getSmsTransactions(storeId, limit);
      
      expect(mockDb.limit).toHaveBeenCalledWith(limit);
    });
  });
  
  describe('SMS_COST_PER_MESSAGE', () => {
    it('should be 20 yen per message', () => {
      expect(stripeModule.SMS_COST_PER_MESSAGE).toBe(20);
    });
  });

});
