import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runCleanupOldTicketsJob, startCleanupOldTicketsJob } from "./cleanupOldTickets";
import * as db from "../db";

// Mock dependencies
vi.mock("../db");

describe("cleanupOldTickets job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createMockDb() {
    return {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    };
  }

  it("should delete old tickets with terminal statuses and their related records", async () => {
    const mockDb = createMockDb();
    vi.mocked(db.getDb).mockResolvedValue(mockDb as any);

    // Mock: find old tickets (batch 1)
    const oldTickets = [
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ];

    // First select: returns old tickets
    mockDb.select.mockReturnValueOnce(mockDb);
    mockDb.from.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockReturnValueOnce(Promise.resolve(oldTickets));

    // Delete pushSubscriptions
    mockDb.delete.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve([{ affectedRows: 2 }]));

    // Delete smsSubscriptions
    mockDb.delete.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve([{ affectedRows: 1 }]));

    // Delete queueAuditLogs
    mockDb.delete.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve([{ affectedRows: 3 }]));

    // Delete tickets
    mockDb.delete.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve([{ affectedRows: 3 }]));

    // Second select: returns empty (no more old tickets)
    mockDb.select.mockReturnValueOnce(mockDb);
    mockDb.from.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockReturnValueOnce(Promise.resolve([]));

    const result = await runCleanupOldTicketsJob(90);

    expect(result.deletedTickets).toBe(3);
    expect(result.deletedPushSubscriptions).toBe(2);
    expect(result.deletedSmsSubscriptions).toBe(1);
    expect(result.deletedAuditLogs).toBe(3);

    // Verify delete was called 4 times (push, sms, audit, tickets)
    expect(mockDb.delete).toHaveBeenCalledTimes(4);
  });

  it("should return zeros when no old tickets exist", async () => {
    const mockDb = createMockDb();
    vi.mocked(db.getDb).mockResolvedValue(mockDb as any);

    // Mock: no old tickets found
    mockDb.select.mockReturnValueOnce(mockDb);
    mockDb.from.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockReturnValueOnce(Promise.resolve([]));

    const result = await runCleanupOldTicketsJob(90);

    expect(result.deletedTickets).toBe(0);
    expect(result.deletedPushSubscriptions).toBe(0);
    expect(result.deletedSmsSubscriptions).toBe(0);
    expect(result.deletedAuditLogs).toBe(0);

    // Verify no delete was called
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("should handle database unavailability gracefully", async () => {
    vi.mocked(db.getDb).mockResolvedValue(null);

    const result = await runCleanupOldTicketsJob();

    expect(result.deletedTickets).toBe(0);
    expect(result.deletedPushSubscriptions).toBe(0);
    expect(result.deletedSmsSubscriptions).toBe(0);
    expect(result.deletedAuditLogs).toBe(0);
  });

  it("should handle errors gracefully and return zeros", async () => {
    const mockDb = createMockDb();
    vi.mocked(db.getDb).mockResolvedValue(mockDb as any);

    // Mock: select throws error
    mockDb.select.mockReturnValueOnce(mockDb);
    mockDb.from.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockReturnValueOnce(Promise.reject(new Error("Database error")));

    const result = await runCleanupOldTicketsJob();

    // Should not throw, returns zeros
    expect(result.deletedTickets).toBe(0);
  });

  it("should use custom retention days", async () => {
    const mockDb = createMockDb();
    vi.mocked(db.getDb).mockResolvedValue(mockDb as any);

    // Set a fixed date for testing
    const now = new Date("2026-06-15T12:00:00Z");
    vi.setSystemTime(now);

    // Mock: no old tickets found
    mockDb.select.mockReturnValueOnce(mockDb);
    mockDb.from.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockReturnValueOnce(Promise.resolve([]));

    await runCleanupOldTicketsJob(30); // 30 days retention

    // Verify select was called (the cutoff date logic is internal)
    expect(mockDb.select).toHaveBeenCalled();
  });

  it("should process multiple batches when there are many old tickets", async () => {
    const mockDb = createMockDb();
    vi.mocked(db.getDb).mockResolvedValue(mockDb as any);

    // Batch 1: 500 tickets (full batch)
    const batch1 = Array.from({ length: 500 }, (_, i) => ({ id: i + 1 }));

    // First batch select
    mockDb.select.mockReturnValueOnce(mockDb);
    mockDb.from.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockReturnValueOnce(Promise.resolve(batch1));

    // Delete push, sms, audit, tickets for batch 1
    mockDb.delete.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve([{ affectedRows: 100 }]));
    mockDb.delete.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve([{ affectedRows: 50 }]));
    mockDb.delete.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve([{ affectedRows: 200 }]));
    mockDb.delete.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve([{ affectedRows: 500 }]));

    // Batch 2: 100 tickets (partial batch, signals end)
    const batch2 = Array.from({ length: 100 }, (_, i) => ({ id: i + 501 }));

    mockDb.select.mockReturnValueOnce(mockDb);
    mockDb.from.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockReturnValueOnce(Promise.resolve(batch2));

    // Delete push, sms, audit, tickets for batch 2
    mockDb.delete.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve([{ affectedRows: 20 }]));
    mockDb.delete.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve([{ affectedRows: 10 }]));
    mockDb.delete.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve([{ affectedRows: 40 }]));
    mockDb.delete.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve([{ affectedRows: 100 }]));

    const result = await runCleanupOldTicketsJob(90);

    expect(result.deletedTickets).toBe(600);
    expect(result.deletedPushSubscriptions).toBe(120);
    expect(result.deletedSmsSubscriptions).toBe(60);
    expect(result.deletedAuditLogs).toBe(240);

    // Verify delete was called 8 times (4 per batch × 2 batches)
    expect(mockDb.delete).toHaveBeenCalledTimes(8);
  });

  it("should start the job with delayed first execution and periodic interval", async () => {
    const mockDb = createMockDb();
    vi.mocked(db.getDb).mockResolvedValue(mockDb as any);

    // Mock: no old tickets
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.limit.mockReturnValue(Promise.resolve([]));

    const intervalId = startCleanupOldTicketsJob(3600, 90);

    // Should not have run yet (delayed by 5 minutes)
    expect(mockDb.select).not.toHaveBeenCalled();

    // Advance 5 minutes for the initial delayed execution
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    // Now it should have run once
    expect(mockDb.select).toHaveBeenCalled();

    clearInterval(intervalId);
  });
});
