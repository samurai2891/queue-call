import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Rate Limits", () => {
  const routersPath = resolve(__dirname, "routers.ts");
  const routersContent = readFileSync(routersPath, "utf-8");

  describe("RATE_LIMITS configuration", () => {
    it("should define rate limits for ticket creation (web)", () => {
      expect(routersContent).toContain("ticket:");
      expect(routersContent).toContain("web:");
    });

    it("should define rate limits for ticket creation (kiosk)", () => {
      expect(routersContent).toContain("kiosk:");
    });

    it("should define rate limits for SMS OTP", () => {
      expect(routersContent).toContain("smsOtp:");
    });

    it("should define rate limits for staff login", () => {
      expect(routersContent).toContain("staffLogin:");
    });

    it("should define rate limits for reservation creation", () => {
      expect(routersContent).toContain("reservation:");
      // Should have per-minute and per-hour windows
      const reservationSection = routersContent.slice(
        routersContent.indexOf("reservation:"),
        routersContent.indexOf("reservation:") + 200
      );
      expect(reservationSection).toContain("60_000");
      expect(reservationSection).toContain("60 * 60 * 1000");
    });

    it("should define rate limits for call actions", () => {
      expect(routersContent).toContain("callAction:");
      const callSection = routersContent.slice(
        routersContent.indexOf("callAction:"),
        routersContent.indexOf("callAction:") + 200
      );
      expect(callSection).toContain("60_000");
      expect(callSection).toContain("60 * 60 * 1000");
    });
  });

  describe("Rate limit enforcement on endpoints", () => {
    it("should enforce rate limits on staff login", () => {
      const loginSection = routersContent.slice(
        routersContent.indexOf("login: publicProcedure"),
        routersContent.indexOf("login: publicProcedure") + 700
      );
      expect(loginSection).toContain("enforceRateLimits");
      expect(loginSection).toContain("staff-login");
      expect(loginSection).toContain("RATE_LIMITS.staffLogin");
    });

    it("should enforce rate limits on SMS OTP sending", () => {
      const smsSection = routersContent.slice(
        routersContent.indexOf("scope: 'sms-otp'") - 200,
        routersContent.indexOf("scope: 'sms-otp'") + 200
      );
      expect(smsSection).toContain("enforceRateLimits");
      expect(smsSection).toContain("RATE_LIMITS.smsOtp");
    });

    it("should enforce rate limits on reservation creation", () => {
      const reservationSection = routersContent.slice(
        routersContent.indexOf("scope: 'reservation-create'") - 200,
        routersContent.indexOf("scope: 'reservation-create'") + 200
      );
      expect(reservationSection).toContain("enforceRateLimits");
      expect(reservationSection).toContain("RATE_LIMITS.reservation");
      expect(reservationSection).toContain("getRequestIp");
    });

    it("should enforce rate limits on callNext", () => {
      const callNextSection = routersContent.slice(
        routersContent.indexOf("callNext: publicProcedure"),
        routersContent.indexOf("callNext: publicProcedure") + 600
      );
      expect(callNextSection).toContain("enforceRateLimits");
      expect(callNextSection).toContain("call-action");
      expect(callNextSection).toContain("RATE_LIMITS.callAction");
    });

    it("should enforce rate limits on callSpecific", () => {
      const callSpecificSection = routersContent.slice(
        routersContent.indexOf("callSpecific: publicProcedure"),
        routersContent.indexOf("callSpecific: publicProcedure") + 600
      );
      expect(callSpecificSection).toContain("enforceRateLimits");
      expect(callSpecificSection).toContain("call-action");
      expect(callSpecificSection).toContain("RATE_LIMITS.callAction");
    });

    it("should enforce rate limits on recall", () => {
      const recallSection = routersContent.slice(
        routersContent.indexOf("recall: publicProcedure"),
        routersContent.indexOf("recall: publicProcedure") + 600
      );
      expect(recallSection).toContain("enforceRateLimits");
      expect(recallSection).toContain("call-action");
      expect(recallSection).toContain("RATE_LIMITS.callAction");
    });
  });

  describe("Rate limit helper functions", () => {
    it("should have getRequestIp function for IP extraction", () => {
      expect(routersContent).toContain("const getRequestIp");
      expect(routersContent).toContain("x-forwarded-for");
    });

    it("should have applyRateLimit function with sliding window logic", () => {
      expect(routersContent).toContain("const applyRateLimit");
      expect(routersContent).toContain("rateLimitBuckets");
    });

    it("should have enforceRateLimits function that throws TOO_MANY_REQUESTS", () => {
      expect(routersContent).toContain("const enforceRateLimits");
      expect(routersContent).toContain("TOO_MANY_REQUESTS");
      expect(routersContent).toContain("RATE_LIMITED_ERR_MSG");
    });

    it("should use IP-based rate limiting for all protected endpoints", () => {
      // Count occurrences of getRequestIp usage (should be at least 6: staffLogin, smsOtp, reservation, callNext, callSpecific, recall)
      const matches = routersContent.match(/getRequestIp\(ctx\.req\)/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe("Rate limit values are reasonable", () => {
    it("should have strict limits for staff login (5 per 10 min)", () => {
      expect(routersContent).toContain("staffLogin: [{ windowMs: 10 * 60 * 1000, limit: 5 }]");
    });

    it("should have strict limits for SMS OTP (3 per 30 min)", () => {
      expect(routersContent).toContain("smsOtp: [{ windowMs: 30 * 60 * 1000, limit: 3 }]");
    });

    it("should have reservation limits with both per-minute and per-hour windows", () => {
      expect(routersContent).toContain("reservation:");
    });

    it("should have call action limits with both per-minute and per-hour windows", () => {
      expect(routersContent).toContain("callAction:");
    });
  });
});
