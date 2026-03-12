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
  getWaitingNumbers: vi.fn(),
  getOrUpdateStorePin: vi.fn(),
  incrementPinAttempts: vi.fn(),
  resetPinAttempts: vi.fn(),
  getEstimatedWaitTimeMinutes: vi.fn(),
  getWaitTimeInfo: vi.fn(),
  // Staff member functions
  getStaffMembers: vi.fn(),
  getStaffMemberCount: vi.fn(),
  getStaffMemberById: vi.fn(),
  createStaffMember: vi.fn(),
  updateStaffMember: vi.fn(),
  deleteStaffMember: vi.fn(),
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

// Mock bcrypt - staff PIN matches on second call (managerValid=false, staffValid=true)
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed_pin'),
  compare: vi.fn().mockImplementation(async (pin: string, hash: string) => {
    // Manager PIN check: managerPinHash
    if (hash === 'hashed_manager_pin') return false;
    // Staff PIN check: staffPinHash
    if (hash === 'hashed_staff_pin') return true;
    return false;
  }),
}));

// Mock plan-limits
vi.mock('./plan-limits', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    checkStaffLimit: vi.fn(), // Don't throw by default
  };
});

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "test";
const { appRouter } = await import("./routers");
const db = await import("./db");
const { checkStaffLimit } = await import("./plan-limits");

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

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
    requestId: "req_staff_members_owner",
  };
}

function createOtherUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "other-user-456",
    email: "other@example.com",
    name: "Other User",
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
    requestId: "req_staff_members_other",
  };
}

const caller = appRouter.createCaller;

const mockStore = {
  id: 1,
  name: "Test Store",
  slug: "test-store",
  ownerId: 1,
  staffPinHash: "hashed_staff_pin",
  managerPinHash: "hashed_manager_pin",
  intakeStatus: "open",
  subscriptionPlan: "standard",
  settings: {},
};

const mockStaffMember = {
  id: 1,
  storeId: 1,
  name: "田中太郎",
  canCall: true,
  canEditSettings: false,
  canManage: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe("Staff Member Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getStoreById).mockResolvedValue(mockStore as any);
  });

  describe("staffMember.list", () => {
    it("should return staff members for store owner", async () => {
      const members = [
        { ...mockStaffMember },
        { ...mockStaffMember, id: 2, name: "鈴木花子" },
      ];
      vi.mocked(db.getStaffMembers).mockResolvedValue(members as any);

      const ctx = createAuthContext();
      const result = await caller(ctx).staffMember.list({ storeId: 1 });

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("田中太郎");
      expect(result[1].name).toBe("鈴木花子");
    });

    it("should reject non-owner access", async () => {
      const ctx = createOtherUserContext();

      await expect(
        caller(ctx).staffMember.list({ storeId: 1 })
      ).rejects.toThrow("Not authorized");
    });

    it("should return empty array when no staff members exist", async () => {
      vi.mocked(db.getStaffMembers).mockResolvedValue([]);

      const ctx = createAuthContext();
      const result = await caller(ctx).staffMember.list({ storeId: 1 });

      expect(result).toHaveLength(0);
    });
  });

  describe("staffMember.create", () => {
    it("should create a new staff member with default permissions", async () => {
      vi.mocked(db.getStaffMemberCount).mockResolvedValue(0);
      vi.mocked(db.createStaffMember).mockResolvedValue(1);

      const ctx = createAuthContext();
      const result = await caller(ctx).staffMember.create({
        storeId: 1,
        name: "新しいスタッフ",
      });

      expect(result.id).toBe(1);
      expect(db.createStaffMember).toHaveBeenCalledWith({
        storeId: 1,
        name: "新しいスタッフ",
        canCall: true,
        canEditSettings: false,
        canManage: false,
      });
    });

    it("should create a staff member with custom permissions", async () => {
      vi.mocked(db.getStaffMemberCount).mockResolvedValue(0);
      vi.mocked(db.createStaffMember).mockResolvedValue(2);

      const ctx = createAuthContext();
      const result = await caller(ctx).staffMember.create({
        storeId: 1,
        name: "マネージャースタッフ",
        canCall: true,
        canEditSettings: true,
        canManage: true,
      });

      expect(result.id).toBe(2);
      expect(db.createStaffMember).toHaveBeenCalledWith({
        storeId: 1,
        name: "マネージャースタッフ",
        canCall: true,
        canEditSettings: true,
        canManage: true,
      });
    });

    it("should check plan limits before creating", async () => {
      vi.mocked(db.getStaffMemberCount).mockResolvedValue(3);
      vi.mocked(db.createStaffMember).mockResolvedValue(4);

      const ctx = createAuthContext();
      await caller(ctx).staffMember.create({
        storeId: 1,
        name: "テスト",
      });

      expect(checkStaffLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          subscriptionPlan: "standard",
        }),
        3,
      );
    });

    it("should reject non-owner access", async () => {
      const ctx = createOtherUserContext();

      await expect(
        caller(ctx).staffMember.create({
          storeId: 1,
          name: "不正アクセス",
        })
      ).rejects.toThrow("Not authorized");
    });

    it("should reject empty name", async () => {
      const ctx = createAuthContext();

      await expect(
        caller(ctx).staffMember.create({
          storeId: 1,
          name: "",
        })
      ).rejects.toThrow();
    });
  });

  describe("staffMember.update", () => {
    it("should update staff member name", async () => {
      vi.mocked(db.getStaffMemberById).mockResolvedValue(mockStaffMember as any);
      vi.mocked(db.updateStaffMember).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const result = await caller(ctx).staffMember.update({
        storeId: 1,
        id: 1,
        name: "更新された名前",
      });

      expect(result.success).toBe(true);
      expect(db.updateStaffMember).toHaveBeenCalledWith(1, 1, { name: "更新された名前" });
    });

    it("should update staff member permissions", async () => {
      vi.mocked(db.getStaffMemberById).mockResolvedValue(mockStaffMember as any);
      vi.mocked(db.updateStaffMember).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const result = await caller(ctx).staffMember.update({
        storeId: 1,
        id: 1,
        canCall: true,
        canEditSettings: true,
        canManage: true,
      });

      expect(result.success).toBe(true);
      expect(db.updateStaffMember).toHaveBeenCalledWith(1, 1, {
        canCall: true,
        canEditSettings: true,
        canManage: true,
      });
    });

    it("should reject update for non-existent staff member", async () => {
      vi.mocked(db.getStaffMemberById).mockResolvedValue(null);

      const ctx = createAuthContext();

      await expect(
        caller(ctx).staffMember.update({
          storeId: 1,
          id: 999,
          name: "存在しない",
        })
      ).rejects.toThrow("Staff member not found");
    });

    it("should reject non-owner access", async () => {
      const ctx = createOtherUserContext();

      await expect(
        caller(ctx).staffMember.update({
          storeId: 1,
          id: 1,
          name: "不正アクセス",
        })
      ).rejects.toThrow("Not authorized");
    });
  });

  describe("staffMember.delete", () => {
    it("should delete a staff member", async () => {
      vi.mocked(db.getStaffMemberById).mockResolvedValue(mockStaffMember as any);
      vi.mocked(db.deleteStaffMember).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const result = await caller(ctx).staffMember.delete({
        storeId: 1,
        id: 1,
      });

      expect(result.success).toBe(true);
      expect(db.deleteStaffMember).toHaveBeenCalledWith(1, 1);
    });

    it("should reject delete for non-existent staff member", async () => {
      vi.mocked(db.getStaffMemberById).mockResolvedValue(null);

      const ctx = createAuthContext();

      await expect(
        caller(ctx).staffMember.delete({
          storeId: 1,
          id: 999,
        })
      ).rejects.toThrow("Staff member not found");
    });

    it("should reject non-owner access", async () => {
      const ctx = createOtherUserContext();

      await expect(
        caller(ctx).staffMember.delete({
          storeId: 1,
          id: 1,
        })
      ).rejects.toThrow("Not authorized");
    });
  });
});

describe("Staff Login with Staff Member Selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getStoreById).mockResolvedValue(mockStore as any);
  });

  it("should return needsStaffSelection when staff members exist and no staffMemberId provided", async () => {
    const members = [
      { id: 1, name: "田中" },
      { id: 2, name: "鈴木" },
    ];
    vi.mocked(db.getStaffMembers).mockResolvedValue(members as any);
    vi.mocked(db.getStoreBySlug).mockResolvedValue(mockStore as any);

    const ctx = {
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

    const result = await caller(ctx).staff.login({
      storeId: 1,
      pin: "1234",
    });

    expect(result).toHaveProperty("needsStaffSelection", true);
    expect(result).toHaveProperty("staffMembers");
    if ("staffMembers" in result) {
      expect(result.staffMembers).toHaveLength(2);
      expect(result.staffMembers[0].name).toBe("田中");
    }
  });

  it("should create session with staffMemberId when provided", async () => {
    const member = { id: 1, name: "田中", canCall: true, canEditSettings: false, canManage: false };
    vi.mocked(db.getStaffMembers).mockResolvedValue([member] as any);
    vi.mocked(db.getStaffMemberById).mockResolvedValue(member as any);
    vi.mocked(db.createStaffSession).mockResolvedValue({
      token: "test-session-token",
      role: "staff",
      expiresAt: new Date(Date.now() + 86400000),
    } as any);

    const ctx = {
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

    const result = await caller(ctx).staff.login({
      storeId: 1,
      pin: "1234",
      staffMemberId: 1,
    });

    expect(result).toHaveProperty("sessionToken");
    expect(db.createStaffSession).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 1,
        role: "staff",
        staffMemberId: 1,
      })
    );
  });

  it("should reject login with non-existent staffMemberId", async () => {
    vi.mocked(db.getStaffMembers).mockResolvedValue([{ id: 1, name: "田中" }] as any);
    vi.mocked(db.getStaffMemberById).mockResolvedValue(null);

    const ctx = {
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

    await expect(
      caller(ctx).staff.login({
        storeId: 1,
        pin: "1234",
        staffMemberId: 999,
      })
    ).rejects.toThrow("Staff member not found");
  });
});

describe("Staff Permissions", () => {
  it("should include permissions in session response", async () => {
    const mockSession = {
      token: "test-token",
      role: "staff",
      expiresAt: new Date(Date.now() + 86400000),
      permissions: {
        canCall: true,
        canEditSettings: false,
        canManage: false,
      },
      staffMemberName: "田中",
    };

    vi.mocked(db.getStaffSession).mockResolvedValue(mockSession as any);

    const ctx = {
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

    const result = await caller(ctx).staff.getSession({
      sessionToken: "test-token",
    });

    expect(result.permissions).toEqual({
      canCall: true,
      canEditSettings: false,
      canManage: false,
    });
    expect(result.staffMemberName).toBe("田中");
  });

  it("manager session should have full permissions", async () => {
    const mockSession = {
      token: "manager-token",
      role: "manager",
      expiresAt: new Date(Date.now() + 86400000),
      permissions: {
        canCall: true,
        canEditSettings: true,
        canManage: true,
      },
      staffMemberName: null,
    };

    vi.mocked(db.getStaffSession).mockResolvedValue(mockSession as any);

    const ctx = {
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

    const result = await caller(ctx).staff.getSession({
      sessionToken: "manager-token",
    });

    expect(result.role).toBe("manager");
    expect(result.permissions).toEqual({
      canCall: true,
      canEditSettings: true,
      canManage: true,
    });
  });
});

describe("Translation Keys for Staff Members", () => {
  it("should have all required staff member translation keys in all languages", async () => {
    const { translations } = await import("../shared/i18n/translations");
    const requiredKeys = [
      'staff.selectStaff',
      'staff.selectStaffDesc',
      'staff.noPermission',
      'settings.staffMembers',
      'settings.staffMembersDesc',
      'settings.addStaffMember',
      'settings.staffName',
      'settings.staffNamePlaceholder',
      'settings.staffPermissions',
      'settings.staffLimitReached',
      'settings.noStaffMembers',
      'settings.noStaffMembersDesc',
      'settings.noStaffMembersHint',
      'settings.addStaff',
      'settings.staffMemberAdded',
      'settings.staffMemberUpdated',
      'settings.staffMemberDeleted',
      'settings.deleteStaffTitle',
      'settings.deleteStaffDesc',
      'settings.permCall',
      'settings.permCallDesc',
      'settings.permSettings',
      'settings.permSettingsDesc',
      'settings.permOperations',
      'settings.permOperationsDesc',
    ];

    const languages = ['ja', 'en', 'ko', 'zh-Hans', 'zh-Hant'] as const;

    for (const lang of languages) {
      const langTranslations = translations[lang];
      for (const key of requiredKeys) {
        expect(langTranslations).toHaveProperty(key);
        expect((langTranslations as any)[key]).toBeTruthy();
      }
    }
  });
});
