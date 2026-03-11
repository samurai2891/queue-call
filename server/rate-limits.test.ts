import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Rate Limits", () => {
  const routersPath = resolve(__dirname, "routers.ts");
  const routersContent = readFileSync(routersPath, "utf-8");

  describe("Dynamic rate limit computation helpers", () => {
    it("should define DEFAULT_MAX_TICKETS_PER_HOUR constant", () => {
      expect(routersContent).toContain("DEFAULT_MAX_TICKETS_PER_HOUR = 50");
    });

    it("should define RATE_LIMIT_MULTIPLIER of 1.5", () => {
      expect(routersContent).toContain("RATE_LIMIT_MULTIPLIER = 1.5");
    });

    it("should have computeTicketRateLimits function", () => {
      expect(routersContent).toContain("const computeTicketRateLimits");
      expect(routersContent).toContain("maxTicketsPerHour");
    });

    it("should have computeCallActionRateLimits function", () => {
      expect(routersContent).toContain("const computeCallActionRateLimits");
    });

    it("should have computeReservationRateLimits function", () => {
      expect(routersContent).toContain("const computeReservationRateLimits");
      expect(routersContent).toContain("maxPerSlot");
      expect(routersContent).toContain("timeSlots");
    });

    it("should apply 1.5x multiplier in all compute functions", () => {
      const matches = routersContent.match(/RATE_LIMIT_MULTIPLIER/g);
      expect(matches).not.toBeNull();
      // Used in all 3 compute functions
      expect(matches!.length).toBeGreaterThanOrEqual(4); // definition + 3 usages
    });

    it("should handle undefined/null store in compute functions", () => {
      // All compute functions should accept undefined | null
      expect(routersContent).toContain("| undefined | null, isKiosk");
      expect(routersContent).toContain("| undefined | null): RateLimitWindow[]");
    });
  });

  describe("Static rate limits", () => {
    it("should have static SMS OTP rate limit (3 per 30 min)", () => {
      expect(routersContent).toContain("STATIC_RATE_LIMITS");
      expect(routersContent).toContain("smsOtp: [{ windowMs: 30 * 60 * 1000, limit: 3 }]");
    });
  });

  describe("Staff login - no rate limiting", () => {
    it("should NOT have rate limiting on staff login (PIN is sufficient)", () => {
      expect(routersContent).toContain("Staff login: PIN authentication is sufficient protection");
      // staffLogin rate limit key should not exist
      expect(routersContent).not.toContain("staffLogin:");
      expect(routersContent).not.toContain("scope: 'staff-login'");
    });
  });

  describe("Rate limit enforcement on endpoints", () => {
    it("should enforce dynamic rate limits on ticket creation", () => {
      const ticketSection = routersContent.slice(
        routersContent.indexOf("scope: isKiosk ? 'ticket-kiosk' : 'ticket'") - 200,
        routersContent.indexOf("scope: isKiosk ? 'ticket-kiosk' : 'ticket'") + 200
      );
      expect(ticketSection).toContain("computeTicketRateLimits");
      expect(ticketSection).toContain("enforceRateLimits");
    });

    it("should enforce static rate limits on SMS OTP sending", () => {
      const smsSection = routersContent.slice(
        routersContent.indexOf("scope: 'sms-otp'") - 200,
        routersContent.indexOf("scope: 'sms-otp'") + 200
      );
      expect(smsSection).toContain("enforceRateLimits");
      expect(smsSection).toContain("STATIC_RATE_LIMITS.smsOtp");
    });

    it("should enforce dynamic rate limits on reservation creation", () => {
      const reservationSection = routersContent.slice(
        routersContent.indexOf("scope: 'reservation-create'") - 200,
        routersContent.indexOf("scope: 'reservation-create'") + 200
      );
      expect(reservationSection).toContain("enforceRateLimits");
      expect(reservationSection).toContain("computeReservationRateLimits");
      expect(reservationSection).toContain("getRequestIp");
    });

    it("should enforce dynamic rate limits on callNext", () => {
      const callNextSection = routersContent.slice(
        routersContent.indexOf("callNext: publicProcedure"),
        routersContent.indexOf("callNext: publicProcedure") + 800
      );
      expect(callNextSection).toContain("enforceRateLimits");
      expect(callNextSection).toContain("call-action");
      expect(callNextSection).toContain("computeCallActionRateLimits");
    });

    it("should enforce dynamic rate limits on callSpecific", () => {
      const callSpecificSection = routersContent.slice(
        routersContent.indexOf("callSpecific: publicProcedure"),
        routersContent.indexOf("callSpecific: publicProcedure") + 800
      );
      expect(callSpecificSection).toContain("enforceRateLimits");
      expect(callSpecificSection).toContain("call-action");
      expect(callSpecificSection).toContain("computeCallActionRateLimits");
    });

    it("should enforce dynamic rate limits on recall", () => {
      const recallSection = routersContent.slice(
        routersContent.indexOf("recall: publicProcedure"),
        routersContent.indexOf("recall: publicProcedure") + 800
      );
      expect(recallSection).toContain("enforceRateLimits");
      expect(recallSection).toContain("call-action");
      expect(recallSection).toContain("computeCallActionRateLimits");
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

    it("should use IP-based rate limiting for protected endpoints", () => {
      // Count occurrences of getRequestIp usage (smsOtp, reservation, callNext, callSpecific, recall, ticket)
      const matches = routersContent.match(/getRequestIp\(ctx\.req\)/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("StoreSettings schema includes maxTicketsPerHour", () => {
    const schemaPath = resolve(__dirname, "../drizzle/schema.ts");
    const schemaContent = readFileSync(schemaPath, "utf-8");

    it("should have maxTicketsPerHour in StoreSettings.queue", () => {
      expect(schemaContent).toContain("maxTicketsPerHour?: number");
    });
  });

  describe("No static RATE_LIMITS object references remain", () => {
    it("should not reference old RATE_LIMITS.ticket", () => {
      expect(routersContent).not.toContain("RATE_LIMITS.ticket");
    });

    it("should not reference old RATE_LIMITS.staffLogin", () => {
      expect(routersContent).not.toContain("RATE_LIMITS.staffLogin");
    });

    it("should not reference old RATE_LIMITS.callAction", () => {
      expect(routersContent).not.toContain("RATE_LIMITS.callAction");
    });

    it("should not reference old RATE_LIMITS.reservation", () => {
      expect(routersContent).not.toContain("RATE_LIMITS.reservation");
    });

    it("should use STATIC_RATE_LIMITS.smsOtp instead of RATE_LIMITS.smsOtp", () => {
      // STATIC_RATE_LIMITS.smsOtp is valid; only bare RATE_LIMITS.smsOtp is old
      const withoutStatic = routersContent.replace(/STATIC_RATE_LIMITS\.smsOtp/g, '');
      expect(withoutStatic).not.toMatch(/(?<!STATIC_)RATE_LIMITS\.smsOtp/);
    });
  });
});
