import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getAdminPushStats: vi.fn(),
    getAdminSmsStats: vi.fn(),
  };
});

vi.mock("./admin-system", async () => {
  const actual = await vi.importActual<typeof import("./admin-system")>("./admin-system");
  return {
    ...actual,
    getAdminSystemVapidStatus: vi.fn(),
    getAdminSystemHealth: vi.fn(),
    getAdminTwilioBalance: vi.fn(),
  };
});

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "test";
const { appRouter } = await import("./routers");
const adminDb = await import("./db");
const adminSystem = await import("./admin-system");

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUser(openId: string, isInternalAdmin: boolean): AuthenticatedUser {
  return {
    id: 1,
    openId,
    email: `${openId}@example.com`,
    name: "Phase 6 Admin",
    loginMethod: "manus",
    role: "user",
    status: "active",
    isTest: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    isInternalAdmin,
  };
}

function createContext(openId: string, isInternalAdmin: boolean): TrpcContext {
  return {
    user: createUser(openId, isInternalAdmin),
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => undefined,
    } as TrpcContext["res"],
    requestId: "req_admin_phase6_test",
  };
}

describe("admin phase 6 router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_ADMIN_IDS = "admin-open-id";

    vi.mocked(adminDb.getAdminPushStats).mockResolvedValue({
      totalSubscriptions: 12,
      ticketsWithPush: 7,
      storesWithPush: 3,
      subscriptionsLast30d: 5,
    });
    vi.mocked(adminDb.getAdminSmsStats).mockResolvedValue({
      sent24h: 4,
      failed24h: 1,
      sent30d: 40,
      failed30d: 3,
      creditsConsumed30d: 800,
      chargeAmount30d: 5000,
    });
    vi.mocked(adminSystem.getAdminSystemVapidStatus).mockResolvedValue({
      configured: true,
      publicKeyPresent: true,
      hasPrivateKey: true,
      storesWithKeys: 2,
      totalStores: 6,
      source: "env",
    });
    vi.mocked(adminSystem.getAdminSystemHealth).mockResolvedValue({
      databaseUrlConfigured: true,
      dbConnected: true,
      queryOk: true,
      latencyMs: 8,
      checkedAt: new Date("2026-03-11T12:00:00.000Z").toISOString(),
    });
    vi.mocked(adminSystem.getAdminTwilioBalance).mockResolvedValue({
      available: true,
      currency: "USD",
      balance: "12.34",
      formattedBalance: "USD 12.34",
      error: null,
    });
  });

  it("passes system inputs through to helpers", async () => {
    const caller = appRouter.createCaller(createContext("admin-open-id", true));

    await expect(caller.admin.system.pushStats({ includeTest: true })).resolves.toMatchObject({
      totalSubscriptions: 12,
      vapidConfigured: true,
    });
    await expect(caller.admin.system.smsStats({ includeTest: false })).resolves.toMatchObject({
      sent30d: 40,
    });
    await expect(caller.admin.system.vapidStatus({ includeTest: true })).resolves.toMatchObject({
      source: "env",
    });
    await expect(caller.admin.system.twilioBalance()).resolves.toMatchObject({
      available: true,
      formattedBalance: "USD 12.34",
    });
    await expect(caller.admin.system.health()).resolves.toMatchObject({
      queryOk: true,
      latencyMs: 8,
    });

    expect(adminDb.getAdminPushStats).toHaveBeenCalledWith({ includeTest: true });
    expect(adminDb.getAdminSmsStats).toHaveBeenCalledWith({ includeTest: false });
    expect(adminSystem.getAdminSystemVapidStatus).toHaveBeenCalledWith({ includeTest: true });
    expect(adminSystem.getAdminTwilioBalance).toHaveBeenCalled();
    expect(adminSystem.getAdminSystemHealth).toHaveBeenCalled();
  });

  it("rejects non-internal-admin users from phase 6 APIs", async () => {
    const caller = appRouter.createCaller(createContext("regular-user", false));

    await expect(caller.admin.system.pushStats({ includeTest: false })).rejects.toThrow(
      "You do not have required permission (10002)"
    );
    await expect(caller.admin.system.twilioBalance()).rejects.toThrow(
      "You do not have required permission (10002)"
    );
    await expect(caller.admin.system.health()).rejects.toThrow(
      "You do not have required permission (10002)"
    );
  });
});
