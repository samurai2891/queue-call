import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    setupAdminTestAccount: vi.fn(),
    getAdminTestAccounts: vi.fn(),
    getAdminTestAccountStats: vi.fn(),
    resetAdminTestStore: vi.fn(),
    resetAllAdminTestStores: vi.fn(),
  };
});

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "test";
const { appRouter } = await import("./routers");
const adminDb = await import("./db");

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUser(openId: string, isInternalAdmin: boolean): AuthenticatedUser {
  return {
    id: 1,
    openId,
    email: `${openId}@example.com`,
    name: "Test Account Admin",
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
    requestId: "req_admin_test_accounts_test",
  };
}

describe("admin test accounts router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_ADMIN_IDS = "admin-open-id";

    vi.mocked(adminDb.getAdminTestAccounts).mockResolvedValue([
      {
        user: {
          id: 21,
          openId: "test-user-open-id",
          name: "Demo User",
          email: "demo@example.com",
          status: "active",
          isTest: true,
          updatedAt: new Date("2026-03-11T10:00:00.000Z").toISOString(),
        },
        stores: [
          {
            id: 31,
            name: "Test Store Free",
            slug: "test-free",
            intakeStatus: "open",
            testPlanOverride: "free",
            subscriptionPlan: "free",
            effectiveSubscriptionPlan: "free",
            currentNumber: 0,
            isTest: true,
            updatedAt: new Date("2026-03-11T10:00:00.000Z").toISOString(),
          },
        ],
      },
    ]);

    vi.mocked(adminDb.getAdminTestAccountStats).mockResolvedValue({
      testUsers: 1,
      testStores: 3,
      storesReady: true,
      lastUpdatedAt: new Date("2026-03-11T10:00:00.000Z").toISOString(),
    });

    vi.mocked(adminDb.setupAdminTestAccount).mockResolvedValue({
      userId: 21,
      storesCreated: 2,
      storesUpdated: 1,
    });

    vi.mocked(adminDb.resetAdminTestStore).mockResolvedValue({
      storeId: 31,
      reset: true,
    });

    vi.mocked(adminDb.resetAllAdminTestStores).mockResolvedValue({
      userId: 21,
      resetStores: 3,
    });
  });

  it("passes setup through to the db helper", async () => {
    const caller = appRouter.createCaller(createContext("admin-open-id", true));

    await expect(caller.admin.testAccounts.setup({ userId: 21 })).resolves.toEqual({
      userId: 21,
      storesCreated: 2,
      storesUpdated: 1,
    });

    expect(adminDb.setupAdminTestAccount).toHaveBeenCalledWith({
      userId: 21,
      internalAdminOpenIds: ["admin-open-id"],
    });
  });

  it("returns list and stats for configured test accounts", async () => {
    const caller = appRouter.createCaller(createContext("admin-open-id", true));

    await expect(caller.admin.testAccounts.list()).resolves.toMatchObject([
      {
        user: { openId: "test-user-open-id", isTest: true },
        stores: [{ slug: "test-free", isTest: true }],
      },
    ]);

    await expect(caller.admin.testAccounts.stats()).resolves.toMatchObject({
      testUsers: 1,
      testStores: 3,
      storesReady: true,
    });
  });

  it("passes reset actions through to the db helper", async () => {
    const caller = appRouter.createCaller(createContext("admin-open-id", true));

    await expect(caller.admin.testAccounts.resetStore({ storeId: 31 })).resolves.toEqual({
      storeId: 31,
      reset: true,
    });

    await expect(caller.admin.testAccounts.resetAll({ userId: 21 })).resolves.toEqual({
      userId: 21,
      resetStores: 3,
    });

    expect(adminDb.resetAdminTestStore).toHaveBeenCalledWith(31);
    expect(adminDb.resetAllAdminTestStores).toHaveBeenCalledWith(21);
  });

  it("rejects non-internal-admin users from test account APIs", async () => {
    const caller = appRouter.createCaller(createContext("regular-user", false));

    await expect(caller.admin.testAccounts.list()).rejects.toThrow(
      "You do not have required permission (10002)"
    );
  });
});
