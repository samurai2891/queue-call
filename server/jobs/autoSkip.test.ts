import { describe, it, expect, beforeEach, vi } from "vitest";
import { runAutoSkipJob } from "./autoSkip";
import * as db from "../db";
import * as sse from "../sse";

// Mock dependencies
vi.mock("../db");
vi.mock("../sse");

describe("autoSkip job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should skip CALLED tickets that exceeded grace period", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
    };

    // Mock getDb to return our mock database
    vi.mocked(db.getDb).mockResolvedValue(mockDb as any);
    vi.mocked(db.getWaitingCount).mockResolvedValue(0);
    vi.mocked(db.getCalledTicket).mockResolvedValue(null);

    // Mock store data
    const mockStore = {
      id: 1,
      slug: "test-store",
      settings: JSON.stringify({
        queue: {
          autoSkip: true,
          checkinGraceMinutes: 5,
          auditLog: true,
        },
      }),
    };

    // Mock expired ticket (called 10 minutes ago)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const mockTicket = {
      id: 100,
      storeId: 1,
      ticketToken: "test-token",
      number: 42,
      status: "CALLED",
      calledAt: tenMinutesAgo,
    };

    // Setup mock chain for stores query
    mockDb.select.mockReturnValueOnce(mockDb);
    mockDb.from.mockReturnValueOnce(Promise.resolve([mockStore]));

    // Setup mock chain for tickets query
    mockDb.select.mockReturnValueOnce(mockDb);
    mockDb.from.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve([mockTicket]));

    // Setup mock chain for update
    mockDb.update.mockReturnValueOnce(mockDb);
    mockDb.set.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve());

    // Setup mock chain for audit log insert
    mockDb.insert.mockReturnValueOnce(mockDb);
    mockDb.values.mockReturnValueOnce(Promise.resolve());

    // Run the job
    await runAutoSkipJob();

    // Verify update was called
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SKIPPED",
      })
    );

    // Verify audit log was created
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 1,
        ticketId: 100,
        action: "SKIP",
        reason: "auto_skipped_no_checkin",
        performedBy: "system",
      })
    );

    // Verify SSE broadcast
    expect(vi.mocked(sse.broadcastTicketUpdate)).toHaveBeenCalledWith(
      1,
      "test-token",
      expect.objectContaining({
        status: "SKIPPED",
        number: 42,
      })
    );
    expect(vi.mocked(sse.broadcastQueueUpdate)).toHaveBeenCalledWith(1, {
      currentNumber: 0,
      waitingCount: 0,
    });
  });

  it("should not skip tickets when autoSkip is disabled", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };

    vi.mocked(db.getDb).mockResolvedValue(mockDb as any);

    // Mock store with autoSkip disabled
    const mockStore = {
      id: 1,
      slug: "test-store",
      settings: JSON.stringify({
        queue: {
          autoSkip: false,
          checkinGraceMinutes: 5,
        },
      }),
    };

    mockDb.select.mockReturnValueOnce(mockDb);
    mockDb.from.mockReturnValueOnce(Promise.resolve([mockStore]));

    await runAutoSkipJob();

    // Verify no update was called
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("should not skip tickets within grace period", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };

    vi.mocked(db.getDb).mockResolvedValue(mockDb as any);

    const mockStore = {
      id: 1,
      slug: "test-store",
      settings: JSON.stringify({
        queue: {
          autoSkip: true,
          checkinGraceMinutes: 5,
        },
      }),
    };

    // Mock recent ticket (called 2 minutes ago, within grace period)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const mockTicket = {
      id: 100,
      storeId: 1,
      ticketToken: "test-token",
      number: 42,
      status: "CALLED",
      calledAt: twoMinutesAgo,
    };

    mockDb.select.mockReturnValueOnce(mockDb);
    mockDb.from.mockReturnValueOnce(Promise.resolve([mockStore]));

    // Return empty array (no expired tickets)
    mockDb.select.mockReturnValueOnce(mockDb);
    mockDb.from.mockReturnValueOnce(mockDb);
    mockDb.where.mockReturnValueOnce(Promise.resolve([]));

    await runAutoSkipJob();

    // Verify no update was called
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("should handle database unavailability gracefully", async () => {
    vi.mocked(db.getDb).mockResolvedValue(null);

    // Should not throw
    await expect(runAutoSkipJob()).resolves.toBeUndefined();
  });

  it("should handle errors gracefully", async () => {
    const mockDb = {
      select: vi.fn().mockRejectedValue(new Error("Database error")),
    };

    vi.mocked(db.getDb).mockResolvedValue(mockDb as any);

    // Should not throw
    await expect(runAutoSkipJob()).resolves.toBeUndefined();
  });
});
