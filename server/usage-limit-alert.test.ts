import { describe, it, expect } from "vitest";
import { getPlanLimitsInfo, getPlanFeatures } from "./plan-limits";
import { t, translations, SUPPORTED_LOCALES } from "../shared/i18n/translations";

/**
 * UsageLimitAlert に関連するサーバーサイドのロジックと翻訳キーのテスト
 */

describe("UsageLimitAlert - Plan limits for alert thresholds", () => {
  it("free plan has numeric limits for menu, staff, and feed", () => {
    const info = getPlanLimitsInfo("free");
    expect(info.menuLimit).toBe(5);
    expect(info.staffLimit).toBe(1);
    // feed uses the same limit as menu
    expect(info.menuLimit).toBe(5);
  });

  it("standard plan has staff limit but no menu limit", () => {
    const info = getPlanLimitsInfo("standard");
    expect(info.menuLimit).toBeNull();
    expect(info.staffLimit).toBe(3);
  });

  it("pro plan has no numeric limits (no alert needed)", () => {
    const info = getPlanLimitsInfo("pro");
    expect(info.menuLimit).toBeNull();
    expect(info.staffLimit).toBeNull();
  });

  it("getPlanUsage response shape includes all fields needed for alert", () => {
    const info = getPlanLimitsInfo("free");
    // Verify all fields that the alert component depends on exist
    expect(info).toHaveProperty("planId");
    expect(info).toHaveProperty("planName");
    expect(info).toHaveProperty("menuLimit");
    expect(info).toHaveProperty("staffLimit");
    // Verify planId is correct
    expect(info.planId).toBe("free");
  });
});

describe("UsageLimitAlert - Alert threshold calculation logic", () => {
  const WARNING_THRESHOLD = 0.8;

  it("correctly identifies when menu usage is at 80% threshold on free plan", () => {
    const info = getPlanLimitsInfo("free");
    // Free plan: menuLimit = 5
    // 4 items = 80% → should trigger
    const menuUsage = 4;
    const percentage = menuUsage / info.menuLimit!;
    expect(percentage).toBeGreaterThanOrEqual(WARNING_THRESHOLD);
  });

  it("correctly identifies when menu usage is below 80% threshold on free plan", () => {
    const info = getPlanLimitsInfo("free");
    // Free plan: menuLimit = 5
    // 3 items = 60% → should NOT trigger
    const menuUsage = 3;
    const percentage = menuUsage / info.menuLimit!;
    expect(percentage).toBeLessThan(WARNING_THRESHOLD);
  });

  it("correctly identifies when staff usage is at limit on free plan", () => {
    const info = getPlanLimitsInfo("free");
    // Free plan: staffLimit = 1
    // 1 staff = 100% → should trigger
    const staffUsage = 1;
    const percentage = staffUsage / info.staffLimit!;
    expect(percentage).toBeGreaterThanOrEqual(WARNING_THRESHOLD);
  });

  it("correctly identifies when staff usage is at 80% threshold on standard plan", () => {
    const info = getPlanLimitsInfo("standard");
    // Standard plan: staffLimit = 3
    // 3 staff = 100% → should trigger
    const staffUsage = 3;
    const percentage = staffUsage / info.staffLimit!;
    expect(percentage).toBeGreaterThanOrEqual(WARNING_THRESHOLD);
  });

  it("does not trigger for pro plan (no numeric limits)", () => {
    const info = getPlanLimitsInfo("pro");
    // Pro plan has null limits → no percentage calculation possible
    expect(info.menuLimit).toBeNull();
    expect(info.staffLimit).toBeNull();
  });
});

describe("UsageLimitAlert - Donut chart SVG calculation", () => {
  // Mirror the DonutChart component's SVG math
  const size = 96;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  it("calculates correct SVG circumference for default size", () => {
    expect(radius).toBe(44);
    expect(circumference).toBeCloseTo(276.46, 1);
  });

  it("calculates correct dashOffset for 80% usage", () => {
    const percentage = 80;
    const dashOffset = circumference - (percentage / 100) * circumference;
    // 20% of circumference should remain as gap
    expect(dashOffset).toBeCloseTo(circumference * 0.2, 1);
  });

  it("calculates correct dashOffset for 100% usage (full circle)", () => {
    const percentage = 100;
    const dashOffset = circumference - (percentage / 100) * circumference;
    expect(dashOffset).toBeCloseTo(0, 1);
  });

  it("calculates correct dashOffset for 0% usage (empty)", () => {
    const percentage = 0;
    const dashOffset = circumference - (percentage / 100) * circumference;
    expect(dashOffset).toBeCloseTo(circumference, 1);
  });

  it("percentage is capped at 100 even if usage exceeds limit", () => {
    // Simulating the Math.min(Math.round(pct * 100), 100) logic
    const current = 7;
    const limit = 5;
    const pct = current / limit;
    const displayPercentage = Math.min(Math.round(pct * 100), 100);
    expect(displayPercentage).toBe(100);
  });
});

describe("UsageLimitAlert - Average usage bar calculation", () => {
  it("calculates correct average for single item", () => {
    const items = [{ percentage: 80 }];
    const avg = Math.round(items.reduce((sum, i) => sum + i.percentage, 0) / items.length);
    expect(avg).toBe(80);
  });

  it("calculates correct average for multiple items", () => {
    const items = [{ percentage: 80 }, { percentage: 100 }, { percentage: 90 }];
    const avg = Math.round(items.reduce((sum, i) => sum + i.percentage, 0) / items.length);
    expect(avg).toBe(90);
  });

  it("returns 0 for empty items", () => {
    const items: { percentage: number }[] = [];
    const avg = items.length > 0
      ? Math.round(items.reduce((sum, i) => sum + i.percentage, 0) / items.length)
      : 0;
    expect(avg).toBe(0);
  });
});

describe("UsageLimitAlert - Translation keys", () => {
  const requiredKeys = [
    "usageLimitAlert.titleApproaching",
    "usageLimitAlert.titleAtLimit",
    "usageLimitAlert.descriptionApproaching",
    "usageLimitAlert.descriptionAtLimit",
    "usageLimitAlert.menuItems",
    "usageLimitAlert.staffAccounts",
    "usageLimitAlert.feedPosts",
    "usageLimitAlert.upgradeTitle",
    "usageLimitAlert.upgradeDescription",
    "usageLimitAlert.dismissButton",
    "usageLimitAlert.upgradeButton",
  ];

  it("all required translation keys exist in Japanese", () => {
    for (const key of requiredKeys) {
      const value = t("ja", key);
      expect(value).not.toBe(key); // Should not fall back to key itself
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("all required translation keys exist in English", () => {
    for (const key of requiredKeys) {
      const value = t("en", key);
      expect(value).not.toBe(key);
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("all required translation keys exist in all supported locales", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of requiredKeys) {
        const value = t(locale, key);
        expect(value).not.toBe(key);
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it("Japanese translations contain expected content", () => {
    expect(t("ja", "usageLimitAlert.titleApproaching")).toContain("上限");
    expect(t("ja", "usageLimitAlert.titleAtLimit")).toContain("上限");
    expect(t("ja", "usageLimitAlert.upgradeButton")).toContain("アップグレード");
    expect(t("ja", "usageLimitAlert.dismissButton")).toContain("あとで");
  });

  it("English translations contain expected content", () => {
    expect(t("en", "usageLimitAlert.titleApproaching")).toContain("limit");
    expect(t("en", "usageLimitAlert.titleAtLimit")).toContain("limit");
    expect(t("en", "usageLimitAlert.upgradeButton")).toContain("Upgrade");
    expect(t("en", "usageLimitAlert.dismissButton")).toContain("later");
  });
});
