import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
}));

const db = await import("./db");
const { sdk } = await import("./_core/sdk");
const { createContext } = await import("./_core/context");
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "test";
const { appRouter } = await import("./routers");

describe("suspended user authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects suspended users in sdk.authenticateRequest", async () => {
    vi.mocked(db.getUserByOpenId).mockResolvedValue({
      id: 9,
      openId: "suspended-user",
      email: "suspended@example.com",
      name: "Suspended User",
      loginMethod: "manus",
      role: "user",
      status: "suspended",
      isTest: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    vi.spyOn(sdk as typeof sdk, "verifySession").mockResolvedValue({
      openId: "suspended-user",
      appId: "app",
      name: "Suspended User",
    });

    const request = {
      headers: {
        cookie: "queue-call-session=test-cookie",
      },
    } as any;

    await expect(sdk.authenticateRequest(request)).rejects.toThrow("Account suspended");
  });

  it("returns null from auth.me when suspended authentication is rejected", async () => {
    vi.spyOn(sdk, "authenticateRequest").mockRejectedValue(new Error("Account suspended"));

    const ctx = await createContext({
      req: {
        protocol: "https",
        headers: {},
      } as TrpcContext["req"],
      res: {
        clearCookie: () => undefined,
      } as TrpcContext["res"],
    });
    const caller = appRouter.createCaller(ctx);

    await expect(caller.auth.me()).resolves.toBeNull();
  });
});
