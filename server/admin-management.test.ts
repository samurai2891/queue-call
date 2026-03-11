import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getAdminUsersPage: vi.fn(),
    getAdminUserDetail: vi.fn(),
    updateAdminUserStatus: vi.fn(),
    updateAdminUserTestFlag: vi.fn(),
    getAdminStoresPage: vi.fn(),
    getAdminStoreDetail: vi.fn(),
    updateAdminStoreIntakeStatus: vi.fn(),
    updateAdminStoreTestFlag: vi.fn(),
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
    name: "Admin Manager",
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
    requestId: "req_admin_management_test",
  };
}

describe("admin management router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_ADMIN_IDS = "admin-open-id";

    vi.mocked(adminDb.getAdminUsersPage).mockResolvedValue({
      items: [
        {
          id: 1,
          openId: "admin-open-id",
          name: "Admin User",
          email: "admin@example.com",
          role: "user",
          status: "active",
          isTest: false,
          isInternalAdmin: true,
          createdAt: new Date("2026-03-11T00:00:00.000Z").toISOString(),
          updatedAt: new Date("2026-03-11T00:00:00.000Z").toISOString(),
          lastSignedIn: new Date("2026-03-11T01:00:00.000Z").toISOString(),
        },
      ],
      page: 2,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    vi.mocked(adminDb.getAdminUserDetail).mockResolvedValue({
      id: 1,
      openId: "admin-open-id",
      name: "Admin User",
      email: "admin@example.com",
      role: "user",
      status: "active",
      isTest: false,
      isInternalAdmin: true,
      createdAt: new Date("2026-03-11T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2026-03-11T00:00:00.000Z").toISOString(),
      lastSignedIn: new Date("2026-03-11T01:00:00.000Z").toISOString(),
      stores: [
        {
          id: 11,
          name: 'Store A',
          slug: 'store-a',
          intakeStatus: 'open',
          subscriptionPlan: 'standard',
          isTest: false,
        },
      ],
    });
    vi.mocked(adminDb.getAdminStoresPage).mockResolvedValue({
      items: [
        {
          id: 11,
          name: "Store A",
          slug: "store-a",
          intakeStatus: "open",
          subscriptionPlan: "standard",
          subscriptionStatus: "active",
          isTest: false,
          smsBalance: 1000,
          createdAt: new Date("2026-03-11T00:00:00.000Z").toISOString(),
          updatedAt: new Date("2026-03-11T00:00:00.000Z").toISOString(),
          owner: {
            id: 1,
            openId: "owner-open-id",
            name: "Owner",
            email: "owner@example.com",
            status: "active",
            isTest: false,
          },
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    vi.mocked(adminDb.getAdminStoreDetail).mockResolvedValue({
      id: 11,
      name: "Store A",
      slug: "store-a",
      intakeStatus: "open",
      subscriptionPlan: "standard",
      subscriptionStatus: "active",
      isTest: false,
      smsBalance: 1000,
      createdAt: new Date("2026-03-11T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2026-03-11T00:00:00.000Z").toISOString(),
      owner: {
        id: 1,
        openId: "owner-open-id",
        name: "Owner",
        email: "owner@example.com",
        status: "active",
        isTest: false,
      },
      settingsSummary: {
        resetTime: "04:00",
        pushEnabled: false,
        smsEnabled: false,
        reservationEnabled: false,
      },
    });
  });

  it("passes user list filters through the admin router", async () => {
    const caller = appRouter.createCaller(createContext("admin-open-id", true));

    await expect(
      caller.admin.users.list({
        page: 2,
        pageSize: 10,
        query: "admin",
        status: "active",
        testFilter: "production",
        internalAdminFilter: "internal_admin",
      })
    ).resolves.toMatchObject({
      items: [{ openId: "admin-open-id", isInternalAdmin: true }],
      page: 2,
      pageSize: 10,
    });

    expect(adminDb.getAdminUsersPage).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      query: "admin",
      status: "active",
      testFilter: "production",
      internalAdminFilter: "internal_admin",
      internalAdminOpenIds: ["admin-open-id"],
    });
  });

  it("passes user detail and mutations through the admin router", async () => {
    const caller = appRouter.createCaller(createContext("admin-open-id", true));

    await expect(caller.admin.users.detail({ userId: 1 })).resolves.toMatchObject({
      id: 1,
      stores: [{ slug: "store-a" }],
    });

    await caller.admin.users.updateStatus({ userId: 1, status: "suspended" });
    await caller.admin.users.updateTestFlag({ userId: 1, isTest: true });

    expect(adminDb.getAdminUserDetail).toHaveBeenCalledWith({
      userId: 1,
      internalAdminOpenIds: ["admin-open-id"],
    });
    expect(adminDb.updateAdminUserStatus).toHaveBeenCalledWith(1, "suspended");
    expect(adminDb.updateAdminUserTestFlag).toHaveBeenCalledWith(1, true);
  });

  it("passes store list filters and mutations through the admin router", async () => {
    const caller = appRouter.createCaller(createContext("admin-open-id", true));

    await expect(
      caller.admin.stores.list({
        page: 1,
        pageSize: 20,
        query: "store",
        status: "open",
        testFilter: "all",
        planFilter: "standard",
      })
    ).resolves.toMatchObject({
      items: [{ slug: "store-a", owner: { openId: "owner-open-id" } }],
      total: 1,
    });

    await expect(caller.admin.stores.detail({ storeId: 11 })).resolves.toMatchObject({
      id: 11,
      owner: { openId: "owner-open-id" },
    });

    await caller.admin.stores.updateStatus({ storeId: 11, status: "paused" });
    await caller.admin.stores.updateTestFlag({ storeId: 11, isTest: true });

    expect(adminDb.getAdminStoresPage).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      query: "store",
      status: "open",
      testFilter: "all",
      planFilter: "standard",
    });
    expect(adminDb.getAdminStoreDetail).toHaveBeenCalledWith(11);
    expect(adminDb.updateAdminStoreIntakeStatus).toHaveBeenCalledWith(11, "paused");
    expect(adminDb.updateAdminStoreTestFlag).toHaveBeenCalledWith(11, true);
  });

  it("rejects non-internal-admin users from management APIs", async () => {
    const caller = appRouter.createCaller(createContext("regular-user", false));

    await expect(
      caller.admin.users.list({
        page: 1,
        pageSize: 20,
        query: "",
        status: "all",
        testFilter: "all",
        internalAdminFilter: "all",
      })
    ).rejects.toThrow("You do not have required permission (10002)");
  });
});
