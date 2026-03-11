process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "test";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { getAdminTwilioBalance } = await import("./admin-system");

describe("getAdminTwilioBalance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
  });

  it("returns unavailable when Twilio credentials are missing", async () => {
    await expect(getAdminTwilioBalance()).resolves.toEqual({
      available: false,
      currency: null,
      balance: null,
      formattedBalance: "Unavailable",
      error: "Twilio credentials are not configured",
    });
  });

  it("returns formatted balance when Twilio responds successfully", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          balance: "12.34",
          currency: "usd",
        }),
      })
    );

    await expect(getAdminTwilioBalance()).resolves.toEqual({
      available: true,
      currency: "USD",
      balance: "12.34",
      formattedBalance: "USD 12.34",
      error: null,
    });
  });

  it("returns unavailable when Twilio returns an error", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })
    );

    await expect(getAdminTwilioBalance()).resolves.toEqual({
      available: false,
      currency: null,
      balance: null,
      formattedBalance: "Unavailable",
      error: "Twilio balance request failed with status 500",
    });
  });
});
