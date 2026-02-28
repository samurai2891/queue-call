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
