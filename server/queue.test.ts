import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";


// Mock database functions
vi.mock('./db', () => ({
  getStoreBySlug: vi.fn(),
  getStoreById: vi.fn(),
  getStoresByOwner: vi.fn(),
  createStore: vi.fn(),
  updateStore: vi.fn(),
  updateStoreSettings: vi.fn(),
  createTicket: vi.fn(),
  getTicketByToken: vi.fn(),
  getTicketsByStore: vi.fn(),
  updateTicketStatus: vi.fn(),
  updateTicketQueueRank: vi.fn(),
  getCalledTicket: vi.fn(),
  getWaitingCount: vi.fn(),
  getNextNumber: vi.fn(),
  regenerateStoreKey: vi.fn(),
  getGroupsAhead: vi.fn(),
  getStaffSession: vi.fn(),
  getWaitingTickets: vi.fn(),
  getTicketById: vi.fn(),
  createAuditLog: vi.fn(),
  createStaffSession: vi.fn(),
  deleteStaffSession: vi.fn(),
  // PIN関連の新しい関数
  getWaitingNumbers: vi.fn(),
  getOrUpdateStorePin: vi.fn(),
  incrementPinAttempts: vi.fn(),
  resetPinAttempts: vi.fn(),
  // 予測待ち時間関連
  getEstimatedWaitTimeMinutes: vi.fn(),
  getWaitTimeInfo: vi.fn(),
}));

// Mock SSE functions
vi.mock('./sse', () => ({
  broadcastQueueUpdate: vi.fn(),
  broadcastTicketUpdate: vi.fn(),
  broadcastIntakeStatus: vi.fn(),
}));

// Mock notifications
vi.mock('./notifications', () => ({
  notifyTicketCalled: vi.fn().mockResolvedValue({ push: false, sms: false }),
}));

// Mock subscription
vi.mock('./subscription', () => ({
  PLANS: {
    free: { id: 'free', monthlyTicketLimit: 50, features: {} },
    standard: { id: 'standard', monthlyTicketLimit: null, features: {} },
    pro: { id: 'pro', monthlyTicketLimit: null, features: {} },
  },
  createSubscriptionCheckout: vi.fn(),
  getSubscriptionInfo: vi.fn(),
  cancelSubscription: vi.fn(),
  reactivateSubscription: vi.fn(),
  changeSubscriptionPlan: vi.fn(),
  checkAndIncrementMonthlyTicket: vi.fn().mockResolvedValue({ allowed: true }),
  handleSubscriptionCheckoutCompleted: vi.fn(),
  handleSubscriptionUpdated: vi.fn(),
  handleSubscriptionDeleted: vi.fn(),
  resetPriceCache: vi.fn(),
  FREE_MONTHLY_TICKET_LIMIT: 50,
  STRIPE_PRODUCT_CONFIG: {},
}));

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed_pin'),
  compare: vi.fn().mockResolvedValue(true),
}));

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "test";
const { appRouter } = await import("./routers");

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createPublicContext(): TrpcContext {


  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    status: "active",
    isTest: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    isInternalAdmin: false,
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
    requestId: "req_queue_test",
  };
}

describe("Store Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getBySlug", () => {
    it("returns store public info when found", async () => {
      const { getStoreBySlug } = await import('./db');
      (getStoreBySlug as any).mockResolvedValue({
        id: 1,
        slug: "test-store",
        name: "Test Store",
        intakeStatus: "open",
        defaultLocale: "ja",
        supportedLocales: ["ja", "en"],
        settings: {
          menu: { defaultView: "feed" },
          kiosk: { autoResetSeconds: 30 },
          board: { nextCount: 3 },
        },
      });

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.store.getBySlug({ slug: "test-store" });

      expect(result).toMatchObject({
        id: 1,
        slug: "test-store",
        name: "Test Store",
        intakeStatus: "open",
      });
    });

    it("throws NOT_FOUND when store does not exist", async () => {
      const { getStoreBySlug } = await import('./db');
      (getStoreBySlug as any).mockResolvedValue(null);

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.store.getBySlug({ slug: "nonexistent" }))
        .rejects.toThrow("Store not found");
    });
  });

  describe("getQueueStatus", () => {
    it("returns current queue status with PIN, waiting numbers, and estimated wait time", async () => {
      const { getCalledTicket, getWaitingCount, getWaitingNumbers, getOrUpdateStorePin, getWaitTimeInfo } = await import('./db');
      (getCalledTicket as any).mockResolvedValue({ number: 5 });
      (getWaitingCount as any).mockResolvedValue(10);
      (getWaitingNumbers as any).mockResolvedValue([6, 7, 8, 9, 10]);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      (getOrUpdateStorePin as any).mockResolvedValue({ pin: '123', expiresAt });
      (getWaitTimeInfo as any).mockResolvedValue({
        avgServiceTimeMinutes: 5,
        currentWaitingCount: 10,
        estimatedWaitMinutes: 50,
      });

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.store.getQueueStatus({ storeId: 1 });

      expect(result.currentNumber).toBe(5);
      expect(result.waitingCount).toBe(10);
      expect(result.waitingNumbers).toEqual([6, 7, 8, 9, 10]);
      expect(result.currentPin).toBe('123');
      expect(result.pinExpiresAt).toEqual(expiresAt);
      expect(result.estimatedWaitMinutes).toBe(50);
      expect(result.avgServiceTimeMinutes).toBe(5);
    });

    it("returns 0 for currentNumber when no ticket is called", async () => {
      const { getCalledTicket, getWaitingCount, getWaitingNumbers, getOrUpdateStorePin, getWaitTimeInfo } = await import('./db');
      (getCalledTicket as any).mockResolvedValue(null);
      (getWaitingCount as any).mockResolvedValue(0);
      (getWaitingNumbers as any).mockResolvedValue([]);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      (getOrUpdateStorePin as any).mockResolvedValue({ pin: '456', expiresAt });
      (getWaitTimeInfo as any).mockResolvedValue({
        avgServiceTimeMinutes: null,
        currentWaitingCount: 0,
        estimatedWaitMinutes: 0,
      });

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.store.getQueueStatus({ storeId: 1 });

      expect(result.currentNumber).toBe(0);
      expect(result.waitingNumbers).toEqual([]);
      expect(result.estimatedWaitMinutes).toBe(0);
    });
  });

  describe("create", () => {
    it("creates a new store for authenticated user", async () => {
      const { getStoreBySlug, createStore } = await import('./db');
      (getStoreBySlug as any).mockResolvedValue(null);
      (createStore as any).mockResolvedValue({
        id: 1,
        slug: "new-store",
        name: "New Store",
        ownerId: 1,
      });

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.store.create({
        slug: "new-store",
        name: "New Store",
      });

      expect(result).toMatchObject({
        slug: "new-store",
        name: "New Store",
      });
    });

    it("throws CONFLICT when slug already exists", async () => {
      const { getStoreBySlug } = await import('./db');
      (getStoreBySlug as any).mockResolvedValue({ id: 1, slug: "existing" });

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.store.create({
        slug: "existing",
        name: "Test",
      })).rejects.toThrow("Store slug already exists");
    });
  });
});

describe("Ticket Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("creates a new ticket when store is open", async () => {
      const { getStoreById, createTicket, getWaitingCount, getCalledTicket } = await import('./db');
      (getStoreById as any).mockResolvedValue({
        id: 1,
        intakeStatus: "open",
      });
      (createTicket as any).mockResolvedValue({
        id: 1,
        number: 1,
        token: "abc123",
        storeId: 1,
        partySize: 2,
        status: "waiting",
      });
      (getWaitingCount as any).mockResolvedValue(1);
      (getCalledTicket as any).mockResolvedValue(null);

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.ticket.create({
        storeId: 1,
        partySize: 2,
      });

      expect(result).toMatchObject({
        number: 1,
        partySize: 2,
        status: "waiting",
      });
    });

    it("throws PRECONDITION_FAILED when intake is paused", async () => {
      const { getStoreById } = await import('./db');
      (getStoreById as any).mockResolvedValue({
        id: 1,
        intakeStatus: "paused",
      });

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.ticket.create({
        storeId: 1,
        partySize: 2,
      })).rejects.toThrow("Intake is paused");
    });
  });

  describe("getByToken", () => {
    it("returns ticket with queue position and estimated wait time", async () => {
      const { getTicketByToken, getCalledTicket, getWaitingCount, getGroupsAhead, getEstimatedWaitTimeMinutes } = await import('./db');
      (getTicketByToken as any).mockResolvedValue({
        id: 1,
        number: 5,
        token: "abc123",
        storeId: 1,
        partySize: 2,
        status: "WAITING",
        store: {
          id: 1,
          name: "Test Store",
          slug: "test-store",
        },
      });
      (getGroupsAhead as any).mockResolvedValue(3);
      (getCalledTicket as any).mockResolvedValue({ number: 2 });
      (getWaitingCount as any).mockResolvedValue(5);
      (getEstimatedWaitTimeMinutes as any).mockResolvedValue(15);

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.ticket.getByToken({ token: "abc123" });

      expect(result).toMatchObject({
        number: 5,
        status: "WAITING",
      });
      expect(result.currentNumber).toBe(2);
      expect(result.estimatedWaitMinutes).toBe(15);
    });

    it("throws NOT_FOUND when ticket does not exist", async () => {
      const { getTicketByToken } = await import('./db');
      (getTicketByToken as any).mockResolvedValue(null);

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.ticket.getByToken({ token: "invalid" }))
        .rejects.toThrow("Ticket not found");
    });
  });

  describe("cancel", () => {
    it("cancels a waiting ticket", async () => {
      const { getTicketByToken, updateTicketStatus, getWaitingCount, getCalledTicket } = await import('./db');
      (getTicketByToken as any).mockResolvedValue({
        id: 1,
        number: 5,
        token: "abc123",
        storeId: 1,
        status: "WAITING",
      });
      (updateTicketStatus as any).mockResolvedValue(undefined);
      (getWaitingCount as any).mockResolvedValue(4);
      (getCalledTicket as any).mockResolvedValue({ number: 2 });

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.ticket.cancel({ token: "abc123" });

      expect(result.success).toBe(true);
    });

    it("throws PRECONDITION_FAILED when ticket is already processed", async () => {
      const { getTicketByToken } = await import('./db');
      (getTicketByToken as any).mockResolvedValue({
        id: 1,
        status: "DONE",
      });

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.ticket.cancel({ token: "abc123" }))
        .rejects.toThrow("Cannot cancel ticket");
    });
  });
});

describe("Auth Router", () => {
  it("returns current user when authenticated", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toMatchObject({
      id: 1,
      email: "test@example.com",
      name: "Test User",
    });
  });

  it("returns null when not authenticated", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeNull();
  });

  it("clears session cookie on logout", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result.success).toBe(true);
    expect(ctx.res.clearCookie).toHaveBeenCalled();
  });
});

describe("Staff Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves a waiting ticket and logs audit", async () => {
    const {
      getStaffSession,
      getStoreById,
      getTicketById,
      getWaitingTickets,
      updateTicketQueueRank,
      getWaitingCount,
      getCalledTicket,
      createAuditLog,
    } = await import('./db');
    const { broadcastQueueUpdate } = await import('./sse');

    (getStaffSession as any).mockResolvedValue({ id: 99, storeId: 1, role: 'staff' });
    (getStoreById as any).mockResolvedValue({
      id: 1,
      settings: {
        queue: {
          enableReorder: true,
          reorderMaxMove: 2,
          reorderReasonRequired: false,
          auditLog: true,
        },
      },
    });
    (getTicketById as any).mockResolvedValue({ id: 10, storeId: 1, status: 'WAITING' });
    (getWaitingTickets as any).mockResolvedValue([
      { id: 10, storeId: 1, status: 'WAITING', queueRank: '000001' },
      { id: 11, storeId: 1, status: 'WAITING', queueRank: '000002' },
    ]);
    (updateTicketQueueRank as any).mockResolvedValue(undefined);
    (getWaitingCount as any).mockResolvedValue(2);
    (getCalledTicket as any).mockResolvedValue(null);
    (createAuditLog as any).mockResolvedValue(undefined);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.staff.moveTicket({
      sessionToken: 'session-token',
      ticketId: 10,
      delta: 1,
    });

    expect(result.success).toBe(true);
    expect(updateTicketQueueRank).toHaveBeenCalledWith(10, '000002');
    expect(updateTicketQueueRank).toHaveBeenCalledWith(11, '000001');
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 1,
        ticketId: 10,
        staffSessionId: 99,
        fromPos: 1,
        toPos: 2,
        action: 'MOVE_DOWN',
      })
    );
    expect(broadcastQueueUpdate).toHaveBeenCalledWith(1, {
      currentNumber: 0,
      waitingCount: 2,
    });
  });

  it("rejects move when reorder is disabled", async () => {
    const { getStaffSession, getStoreById } = await import('./db');

    (getStaffSession as any).mockResolvedValue({ id: 99, storeId: 1, role: 'staff' });
    (getStoreById as any).mockResolvedValue({
      id: 1,
      settings: {
        queue: {
          enableReorder: false,
        },
      },
    });

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.staff.moveTicket({ sessionToken: 'session-token', ticketId: 10, delta: 1 })
    ).rejects.toThrow('Reorder is disabled');
  });

  it("creates manual ticket when intake is open", async () => {
    const { getStaffSession, getStoreById, createTicket, getWaitingCount, getCalledTicket } = await import('./db');
    const { broadcastQueueUpdate } = await import('./sse');

    (getStaffSession as any).mockResolvedValue({ id: 42, storeId: 2, role: 'staff' });
    (getStoreById as any).mockResolvedValue({
      id: 2,
      intakeStatus: 'open',
      defaultLocale: 'en',
    });
    (createTicket as any).mockResolvedValue({
      id: 5,
      storeId: 2,
      number: 12,
      ticketToken: 'token-123',
      status: 'WAITING',
    });
    (getWaitingCount as any).mockResolvedValue(3);
    (getCalledTicket as any).mockResolvedValue(null);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.staff.createManual({
      sessionToken: 'session-token',
      storeId: 2,
      partySize: 4,
      note: 'Table seat',
    });

    expect(createTicket).toHaveBeenCalledWith({
      storeId: 2,
      partySize: 4,
      note: 'Table seat',
      locale: 'en',
      source: 'web',
    });
    expect(broadcastQueueUpdate).toHaveBeenCalledWith(2, {
      currentNumber: 0,
      waitingCount: 3,
    });
    expect(result).toMatchObject({
      number: 12,
      ticketToken: 'token-123',
    });
  });

  it("rejects manual ticket when intake is paused", async () => {
    const { getStaffSession, getStoreById } = await import('./db');

    (getStaffSession as any).mockResolvedValue({ id: 42, storeId: 2, role: 'staff' });
    (getStoreById as any).mockResolvedValue({
      id: 2,
      intakeStatus: 'paused',
      defaultLocale: 'ja',
    });

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.staff.createManual({
        sessionToken: 'session-token',
        storeId: 2,
        partySize: 2,
      })
    ).rejects.toThrow('Intake is paused');
  });

  it("passes push template on recall notification", async () => {
    const { getStaffSession, getStoreById, getTicketById, getWaitingCount } = await import('./db');
    const { notifyTicketCalled } = await import('./notifications');

    (getStaffSession as any).mockResolvedValue({ id: 99, storeId: 1, role: 'staff' });
    (getTicketById as any).mockResolvedValue({
      id: 10,
      storeId: 1,
      status: 'CALLED',
      number: 7,
      ticketToken: 'ticket-token',
    });
    (getStoreById as any).mockResolvedValue({
      id: 1,
      name: 'Demo Store',
      slug: 'demo',
      settings: {
        notifications: {
          pushEnabled: true,
          smsEnabled: false,
          pushTemplateRecall: 'Please return #{number}',
        },
      },
    });
    (getWaitingCount as any).mockResolvedValue(1);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.staff.callSpecific({ sessionToken: 'session-token', ticketId: 10 });

    expect(notifyTicketCalled).toHaveBeenCalledWith(
      10,
      1,
      'Demo Store',
      7,
      expect.objectContaining({
        messageType: 'recall',
        pushTemplate: 'Please return #{number}',
      })
    );
  });
});
