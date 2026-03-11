import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getAdminTicketSummary: vi.fn(),
    getAdminTicketsByStore: vi.fn(),
    getAdminTicketPeakHours: vi.fn(),
    getAdminTicketCheckinRate: vi.fn(),
    getAdminRevenueMrr: vi.fn(),
    getAdminRevenuePlanBreakdown: vi.fn(),
  };
});

vi.mock("./admin-revenue", async () => {
  const actual = await vi.importActual<typeof import("./admin-revenue")>("./admin-revenue");
  return {
    ...actual,
    getAdminRecentPayments: vi.fn(),
    getAdminChurnRate: vi.fn(),
  };
});

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "test";
const { appRouter } = await import("./routers");
const adminDb = await import("./db");
const adminRevenue = await import("./admin-revenue");

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUser(openId: string, isInternalAdmin: boolean): AuthenticatedUser {
  return {
    id: 1,
    openId,
    email: `${openId}@example.com`,
    name: "Phase 5 Admin",
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
    requestId: "req_admin_phase5_test",
  };
}

describe("admin phase 5 router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_ADMIN_IDS = "admin-open-id";

    vi.mocked(adminDb.getAdminTicketSummary).mockResolvedValue({
      totalTickets: 100,
      calledCount: 80,
      arrivedCount: 60,
      doneCount: 55,
      canceledCount: 8,
      avgWaitMinutes: 12,
    });
    vi.mocked(adminDb.getAdminTicketsByStore).mockResolvedValue([
      {
        storeId: 11,
        storeName: "Store A",
        slug: "store-a",
        totalTickets: 30,
        doneCount: 18,
        canceledCount: 3,
        avgWaitMinutes: 11,
        checkinRate: 0.75,
      },
    ]);
    vi.mocked(adminDb.getAdminTicketPeakHours).mockResolvedValue([
      { dayOfWeek: 1, hour: 10, avgCount: 6 },
      { dayOfWeek: 1, hour: 11, avgCount: 4 },
    ]);
    vi.mocked(adminDb.getAdminTicketCheckinRate).mockResolvedValue({
      calledCount: 80,
      checkedInCount: 60,
      rate: 0.75,
    });
    vi.mocked(adminDb.getAdminRevenueMrr).mockResolvedValue({
      mrrExclTax: 5000,
      mrrInclTax: 5500,
      paidStores: 2,
    });
    vi.mocked(adminDb.getAdminRevenuePlanBreakdown).mockResolvedValue([
      { planId: "free", storeCount: 1, mrrExclTax: 0, mrrInclTax: 0 },
      { planId: "standard", storeCount: 2, mrrExclTax: 3000, mrrInclTax: 3300 },
      { planId: "pro", storeCount: 1, mrrExclTax: 3500, mrrInclTax: 3850 },
    ]);
    vi.mocked(adminRevenue.getAdminRecentPayments).mockResolvedValue([
      {
        invoiceId: "in_123",
        storeId: 11,
        storeName: "Store A",
        customerId: "cus_123",
        subscriptionId: "sub_123",
        amountPaid: 3300,
        currency: "JPY",
        status: "paid",
        paidAt: new Date("2026-03-11T10:00:00.000Z").toISOString(),
        hostedInvoiceUrl: "https://example.com/invoice",
      },
    ]);
    vi.mocked(adminRevenue.getAdminChurnRate).mockResolvedValue({
      canceledCount: 1,
      activeStartCount: 10,
      rate: 0.1,
    });
  });

  it("passes ticket inputs through to db helpers", async () => {
    const caller = appRouter.createCaller(createContext("admin-open-id", true));

    await expect(caller.admin.tickets.summary({ days: 30, includeTest: true })).resolves.toMatchObject({
      totalTickets: 100,
      avgWaitMinutes: 12,
    });
    await caller.admin.tickets.byStore({ days: 30, includeTest: false, limit: 10 });
    await caller.admin.tickets.peakHours({ days: 7, includeTest: false });
    await caller.admin.tickets.checkinRate({ days: 90, includeTest: true });

    expect(adminDb.getAdminTicketSummary).toHaveBeenCalledWith({ days: 30, includeTest: true });
    expect(adminDb.getAdminTicketsByStore).toHaveBeenCalledWith({ days: 30, includeTest: false, limit: 10 });
    expect(adminDb.getAdminTicketPeakHours).toHaveBeenCalledWith({ days: 7, includeTest: false });
    expect(adminDb.getAdminTicketCheckinRate).toHaveBeenCalledWith({ days: 90, includeTest: true });
  });

  it("passes revenue inputs through to db and stripe helpers", async () => {
    const caller = appRouter.createCaller(createContext("admin-open-id", true));

    await expect(caller.admin.revenue.mrr({ includeTest: false })).resolves.toMatchObject({
      paidStores: 2,
    });
    await caller.admin.revenue.planBreakdown({ includeTest: true });
    await caller.admin.revenue.recentPayments({ days: 90, includeTest: false, limit: 5 });
    await caller.admin.revenue.churnRate({ days: 365, includeTest: true });

    expect(adminDb.getAdminRevenueMrr).toHaveBeenCalledWith({ includeTest: false });
    expect(adminDb.getAdminRevenuePlanBreakdown).toHaveBeenCalledWith({ includeTest: true });
    expect(adminRevenue.getAdminRecentPayments).toHaveBeenCalledWith({
      days: 90,
      includeTest: false,
      limit: 5,
    });
    expect(adminRevenue.getAdminChurnRate).toHaveBeenCalledWith({
      days: 365,
      includeTest: true,
    });
  });

  it("rejects non-internal-admin users from phase 5 APIs", async () => {
    const caller = appRouter.createCaller(createContext("regular-user", false));

    await expect(caller.admin.tickets.summary({ days: 30, includeTest: false })).rejects.toThrow(
      "You do not have required permission (10002)"
    );
    await expect(caller.admin.revenue.mrr({ includeTest: false })).rejects.toThrow(
      "You do not have required permission (10002)"
    );
  });
});
