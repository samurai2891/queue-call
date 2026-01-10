import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
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
  getCalledTicket: vi.fn(),
  getWaitingCount: vi.fn(),
  getNextNumber: vi.fn(),
  regenerateStoreKey: vi.fn(),
  getGroupsAhead: vi.fn(),
}));

// Mock SSE functions
vi.mock('./sse', () => ({
  broadcastQueueUpdate: vi.fn(),
  broadcastTicketUpdate: vi.fn(),
  broadcastIntakeStatus: vi.fn(),
}));

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed_pin'),
  compare: vi.fn().mockResolvedValue(true),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
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
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
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
    it("returns current queue status", async () => {
      const { getCalledTicket, getWaitingCount } = await import('./db');
      (getCalledTicket as any).mockResolvedValue({ number: 5 });
      (getWaitingCount as any).mockResolvedValue(10);

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.store.getQueueStatus({ storeId: 1 });

      expect(result).toEqual({
        currentNumber: 5,
        waitingCount: 10,
      });
    });

    it("returns 0 for currentNumber when no ticket is called", async () => {
      const { getCalledTicket, getWaitingCount } = await import('./db');
      (getCalledTicket as any).mockResolvedValue(null);
      (getWaitingCount as any).mockResolvedValue(0);

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.store.getQueueStatus({ storeId: 1 });

      expect(result.currentNumber).toBe(0);
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
    it("returns ticket with queue position", async () => {
      const { getTicketByToken, getCalledTicket, getWaitingCount, getGroupsAhead } = await import('./db');
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

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.ticket.getByToken({ token: "abc123" });

      expect(result).toMatchObject({
        number: 5,
        status: "WAITING",
      });
      expect(result.currentNumber).toBe(2);
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
