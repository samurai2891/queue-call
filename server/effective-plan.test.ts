process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "test";
import { describe, expect, it } from "vitest";
import {
  calculateRatio,
  resolveEffectivePlanId,
} from "./admin-overview-utils";
const { getPlanFeatures, getPlanLimitsInfo } = await import("./plan-limits");

describe("resolveEffectivePlanId", () => {
  it("prefers testPlanOverride for test stores", () => {
    expect(
      resolveEffectivePlanId({
        subscriptionPlan: "free",
        isTest: true,
        testPlanOverride: "standard",
      })
    ).toBe("standard");
  });

  it("normalizes premium override to pro", () => {
    expect(
      resolveEffectivePlanId({
        subscriptionPlan: "free",
        isTest: true,
        testPlanOverride: "premium",
      })
    ).toBe("pro");
  });

  it("falls back to subscriptionPlan for production stores", () => {
    expect(
      resolveEffectivePlanId({
        subscriptionPlan: "pro",
        isTest: false,
        testPlanOverride: "free",
      })
    ).toBe("pro");
  });
});

describe("plan limits with effective test plan", () => {
  it("unlocks standard features for a standard test override", () => {
    const features = getPlanFeatures({
      subscriptionPlan: "free",
      isTest: true,
      testPlanOverride: "standard",
    });

    expect(features.smsEnabled).toBe(true);
    expect(features.reservationEnabled).toBe(true);
    expect(features.analyticsDays).toBe(30);
  });

  it("returns pro plan limits for a pro test override", () => {
    const limits = getPlanLimitsInfo({
      subscriptionPlan: "free",
      isTest: true,
      testPlanOverride: "pro",
    });

    expect(limits.planId).toBe("pro");
    expect(limits.csvExport).toBe(true);
    expect(limits.staffLimit).toBeNull();
  });
});

describe("calculateRatio", () => {
  it("returns 0 when denominator is 0", () => {
    expect(calculateRatio(5, 0)).toBe(0);
  });

  it("calculates cancel rate as a fraction", () => {
    expect(calculateRatio(8, 100)).toBe(0.08);
  });
});
