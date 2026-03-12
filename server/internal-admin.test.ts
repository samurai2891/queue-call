import { beforeEach, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { getAuthSubject, isInternalAdminUser } from "./_core/internalAdmin";

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "test";
const { appRouter } = await import("./routers");

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUser(openId: string): AuthenticatedUser {
  const user = {
    id: 1,
    openId,
    email: `${openId}@example.com`,
    name: "Internal Admin Test User",
    loginMethod: "manus",
    role: "user" as const,
    status: "active" as const,
    isTest: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    ...user,
    isInternalAdmin: isInternalAdminUser(user),
  };
}

function createAuthContext(openId: string): TrpcContext {
  return {
    user: createUser(openId),
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => undefined,
    } as TrpcContext["res"],
    requestId: "req_internal_admin_test",
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => undefined,
    } as TrpcContext["res"],
    requestId: "req_internal_admin_public_test",
  };
}

describe("internal admin helpers", () => {
  beforeEach(() => {
    process.env.INTERNAL_ADMIN_IDS = "";
  });

  it("uses openId as auth subject", () => {
    expect(getAuthSubject(createUser("admin-open-id"))).toBe("admin-open-id");
  });

  it("returns true when the user's openId is allowlisted", () => {
    process.env.INTERNAL_ADMIN_IDS = "admin-open-id,other-user";

    expect(isInternalAdminUser(createUser("admin-open-id"))).toBe(true);
  });

  it("returns true for the production internal admin openId when allowlisted", () => {
    process.env.INTERNAL_ADMIN_IDS = "TviD2BtLwbAxQcvLDm9fCR,other-user";

    expect(isInternalAdminUser(createUser("TviD2BtLwbAxQcvLDm9fCR"))).toBe(true);
  });

  it("returns false when the user's openId is not allowlisted", () => {
    process.env.INTERNAL_ADMIN_IDS = "other-user";

    expect(isInternalAdminUser(createUser("regular-user"))).toBe(false);
  });
});

describe("internal admin router", () => {
  beforeEach(() => {
    process.env.INTERNAL_ADMIN_IDS = "";
  });

  it("allows allowlisted users to access admin endpoints", async () => {
    process.env.INTERNAL_ADMIN_IDS = "admin-open-id";
    const caller = appRouter.createCaller(createAuthContext("admin-open-id"));

    await expect(caller.admin.status()).resolves.toEqual({
      ok: true,
      authSubject: "admin-open-id",
    });
  });

  it("rejects authenticated users that are not allowlisted", async () => {
    process.env.INTERNAL_ADMIN_IDS = "admin-open-id";
    const caller = appRouter.createCaller(createAuthContext("regular-user"));

    await expect(caller.admin.status()).rejects.toThrow(
      "You do not have required permission (10002)"
    );
  });

  it("rejects unauthenticated users", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.admin.status()).rejects.toThrow("Please login (10001)");
  });
});

describe("auth.me", () => {
  beforeEach(() => {
    process.env.INTERNAL_ADMIN_IDS = "";
  });

  it("returns isInternalAdmin=true for allowlisted users", async () => {
    process.env.INTERNAL_ADMIN_IDS = "admin-open-id";
    const caller = appRouter.createCaller(createAuthContext("admin-open-id"));

    await expect(caller.auth.me()).resolves.toMatchObject({
      openId: "admin-open-id",
      isInternalAdmin: true,
    });
  });

  it("returns isInternalAdmin=true for the production internal admin openId", async () => {
    process.env.INTERNAL_ADMIN_IDS = "TviD2BtLwbAxQcvLDm9fCR";
    const caller = appRouter.createCaller(createAuthContext("TviD2BtLwbAxQcvLDm9fCR"));

    await expect(caller.auth.me()).resolves.toMatchObject({
      openId: "TviD2BtLwbAxQcvLDm9fCR",
      isInternalAdmin: true,
    });
  });

  it("returns isInternalAdmin=false for non-allowlisted users", async () => {
    process.env.INTERNAL_ADMIN_IDS = "admin-open-id";
    const caller = appRouter.createCaller(createAuthContext("regular-user"));

    await expect(caller.auth.me()).resolves.toMatchObject({
      openId: "regular-user",
      isInternalAdmin: false,
    });
  });
});
