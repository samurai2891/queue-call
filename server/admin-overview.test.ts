import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import {
  fillMissingDailyCounts,
  normalizeOverviewPlanId,
} from "./admin-overview-utils";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getOverviewKpis: vi.fn(),
    getOverviewTicketChart: vi.fn(),
    getOverviewPlanDistribution: vi.fn(),
    getOverviewRecentActivity: vi.fn(),
  };
});

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "test";
const { appRouter } = await import("./routers");
const overviewDb = await import("./db");

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUser(openId: string, isInternalAdmin: boolean): AuthenticatedUser {
  return {
    id: 1,
    openId,
    email: `${openId}@example.com`,
    name: "Overview Admin",
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
    requestId: "req_overview_test",
  };
}

describe("admin overview utils", () => {
  it("normalizes premium to pro", () => {
    expect(normalizeOverviewPlanId("premium")).toBe("pro");
  });

  it("falls back unknown plan ids to free", () => {
    expect(normalizeOverviewPlanId("enterprise")).toBe("free");
  });

  it("fills missing daily chart points", () => {
    // Build input data relative to a fixed reference date to avoid timezone drift
    // Use noon UTC so local date is stable across UTC-12 to UTC+12
    const fixedNow = new Date("2026-03-11T12:00:00Z");
    const yyyy = fixedNow.getUTCFullYear();
    const mm = String(fixedNow.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(fixedNow.getUTCDate()).padStart(2, "0");
    const todayKey = `${yyyy}-${mm}-${dd}`; // "2026-03-11"
    const yesterdayKey = `${yyyy}-${mm}-${String(fixedNow.getUTCDate() - 1).padStart(2, "0")}`; // "2026-03-10"
    const twoDaysAgoKey = `${yyyy}-${mm}-${String(fixedNow.getUTCDate() - 2).padStart(2, "0")}`; // "2026-03-09"

    const result = fillMissingDailyCounts(
      [
        { date: twoDaysAgoKey, count: 3 },
        { date: todayKey, count: 5 },
      ],
      3,
      fixedNow
    );

    expect(result).toHaveLength(3);
    // Verify structure: 3 consecutive days ending at fixedNow's local date
    // count=3 for twoDaysAgo, count=0 for yesterday, count=5 for today
    const countMap = new Map(result.map(r => [r.date, r.count]));
    expect(countMap.get(twoDaysAgoKey)).toBe(3);
    expect(countMap.get(yesterdayKey)).toBe(0);
    expect(countMap.get(todayKey)).toBe(5);
  });
});

describe("admin overview router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_ADMIN_IDS = "admin-open-id";
    vi.mocked(overviewDb.getOverviewKpis).mockResolvedValue({
      totalUsers: 10,
      activeStores30d: 4,
      ticketsToday: 12,
      smsSent30d: 6,
      mrrExclTax: 3000,
      mrrInclTax: 3300,
    });
    vi.mocked(overviewDb.getOverviewTicketChart).mockResolvedValue([
      { date: "2026-03-10", count: 2 },
      { date: "2026-03-11", count: 4 },
    ]);
    vi.mocked(overviewDb.getOverviewPlanDistribution).mockResolvedValue([
      { planId: "free", count: 1 },
      { planId: "standard", count: 2 },
      { planId: "pro", count: 3 },
    ]);
    vi.mocked(overviewDb.getOverviewRecentActivity).mockResolvedValue([
      {
        id: "ticket-1",
        type: "ticket_created",
        occurredAt: new Date("2026-03-11T09:00:00.000Z").toISOString(),
        title: "チケット発券",
        description: "Store A で受付番号 12 を発券",
        storeId: 1,
        storeName: "Store A",
      },
    ]);
  });

  it("passes includeTest to KPI query", async () => {
    const caller = appRouter.createCaller(createContext("admin-open-id", true));

    await expect(
      caller.admin.overview.kpi({ includeTest: true })
    ).resolves.toMatchObject({
      totalUsers: 10,
      mrrInclTax: 3300,
    });

    expect(overviewDb.getOverviewKpis).toHaveBeenCalledWith({
      includeTest: true,
      excludedOpenIds: ["admin-open-id"],
    });
  });

  it("passes chart and activity inputs through overview router", async () => {
    const caller = appRouter.createCaller(createContext("admin-open-id", true));

    await caller.admin.overview.ticketChart({ includeTest: false, days: 30 });
    await caller.admin.overview.planDistribution({ includeTest: true });
    await caller.admin.overview.recentActivity({ includeTest: false, limit: 15 });

    expect(overviewDb.getOverviewTicketChart).toHaveBeenCalledWith({
      includeTest: false,
      days: 30,
    });
    expect(overviewDb.getOverviewPlanDistribution).toHaveBeenCalledWith({
      includeTest: true,
    });
    expect(overviewDb.getOverviewRecentActivity).toHaveBeenCalledWith({
      includeTest: false,
      limit: 15,
      excludedOpenIds: ["admin-open-id"],
    });
  });

  it("rejects non-internal-admin users from overview APIs", async () => {
    const caller = appRouter.createCaller(createContext("regular-user", false));

    await expect(caller.admin.overview.kpi({})).rejects.toThrow(
      "You do not have required permission (10002)"
    );
  });
});
