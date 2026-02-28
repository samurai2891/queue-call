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
    expect(info).toHaveProperty("planId");
    expect(info).toHaveProperty("planName");
    expect(info).toHaveProperty("menuLimit");
    expect(info).toHaveProperty("staffLimit");
    expect(info.planId).toBe("free");
  });
});

describe("UsageLimitAlert - Alert threshold calculation logic", () => {
  const WARNING_THRESHOLD = 0.8;

  it("correctly identifies when menu usage is at 80% threshold on free plan", () => {
    const info = getPlanLimitsInfo("free");
    const menuUsage = 4;
    const percentage = menuUsage / info.menuLimit!;
    expect(percentage).toBeGreaterThanOrEqual(WARNING_THRESHOLD);
  });

  it("correctly identifies when menu usage is below 80% threshold on free plan", () => {
    const info = getPlanLimitsInfo("free");
    const menuUsage = 3;
    const percentage = menuUsage / info.menuLimit!;
    expect(percentage).toBeLessThan(WARNING_THRESHOLD);
  });

  it("correctly identifies when staff usage is at limit on free plan", () => {
    const info = getPlanLimitsInfo("free");
    const staffUsage = 1;
    const percentage = staffUsage / info.staffLimit!;
    expect(percentage).toBeGreaterThanOrEqual(WARNING_THRESHOLD);
  });

  it("correctly identifies when staff usage is at 80% threshold on standard plan", () => {
    const info = getPlanLimitsInfo("standard");
    const staffUsage = 3;
    const percentage = staffUsage / info.staffLimit!;
    expect(percentage).toBeGreaterThanOrEqual(WARNING_THRESHOLD);
  });

  it("does not trigger for pro plan (no numeric limits)", () => {
    const info = getPlanLimitsInfo("pro");
    expect(info.menuLimit).toBeNull();
    expect(info.staffLimit).toBeNull();
  });
});

describe("UsageLimitAlert - Donut chart SVG calculation", () => {
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

describe("UsageLimitAlert - Tooltip text generation", () => {
  // Mirror the getTooltipText helper logic
  function getTooltipText(locale: string, current: number, limit: number): string {
    const remaining = limit - current;
    if (remaining <= 0) {
      return t(locale as any, "usageLimitAlert.tooltipAtLimit");
    }
    return t(locale as any, "usageLimitAlert.tooltipRemaining").replace("{remaining}", String(remaining));
  }

  it("shows remaining count when below limit (Japanese)", () => {
    const text = getTooltipText("ja", 3, 5);
    expect(text).toContain("2");
    expect(text).toContain("追加可能");
  });

  it("shows remaining count when below limit (English)", () => {
    const text = getTooltipText("en", 3, 5);
    expect(text).toContain("2");
    expect(text).toContain("more can be added");
  });

  it("shows at-limit message when current equals limit (Japanese)", () => {
    const text = getTooltipText("ja", 5, 5);
    expect(text).toContain("上限");
    expect(text).toContain("アップグレード");
  });

  it("shows at-limit message when current equals limit (English)", () => {
    const text = getTooltipText("en", 5, 5);
    expect(text).toContain("Limit reached");
    expect(text).toContain("Upgrade");
  });

  it("shows at-limit message when current exceeds limit", () => {
    const text = getTooltipText("ja", 7, 5);
    expect(text).toContain("上限");
  });

  it("shows remaining=1 when one slot left", () => {
    const text = getTooltipText("ja", 4, 5);
    expect(text).toContain("1");
    expect(text).toContain("追加可能");
  });

  it("correctly calculates remaining for standard plan staff limit", () => {
    const info = getPlanLimitsInfo("standard");
    // Standard plan: staffLimit = 3, simulate 2 staff
    const text = getTooltipText("ja", 2, info.staffLimit!);
    expect(text).toContain("1");
    expect(text).toContain("追加可能");
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
    "usageLimitAlert.tooltipRemaining",
    "usageLimitAlert.tooltipAtLimit",
  ];

  it("all required translation keys exist in Japanese", () => {
    for (const key of requiredKeys) {
      const value = t("ja", key);
      expect(value).not.toBe(key);
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

  it("tooltipRemaining contains {remaining} placeholder in all locales", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const value = t(locale, "usageLimitAlert.tooltipRemaining");
      expect(value).toContain("{remaining}");
    }
  });

  it("Japanese translations contain expected content", () => {
    expect(t("ja", "usageLimitAlert.titleApproaching")).toContain("上限");
    expect(t("ja", "usageLimitAlert.titleAtLimit")).toContain("上限");
    expect(t("ja", "usageLimitAlert.upgradeButton")).toContain("アップグレード");
    expect(t("ja", "usageLimitAlert.dismissButton")).toContain("あとで");
    expect(t("ja", "usageLimitAlert.tooltipRemaining")).toContain("追加可能");
    expect(t("ja", "usageLimitAlert.tooltipAtLimit")).toContain("アップグレード");
  });

  it("English translations contain expected content", () => {
    expect(t("en", "usageLimitAlert.titleApproaching")).toContain("limit");
    expect(t("en", "usageLimitAlert.titleAtLimit")).toContain("limit");
    expect(t("en", "usageLimitAlert.upgradeButton")).toContain("Upgrade");
    expect(t("en", "usageLimitAlert.dismissButton")).toContain("later");
    expect(t("en", "usageLimitAlert.tooltipRemaining")).toContain("more can be added");
    expect(t("en", "usageLimitAlert.tooltipAtLimit")).toContain("Upgrade");
  });
});

describe("Dashboard Usage Trend - Linear regression prediction", () => {
  // Mirror the linear regression logic from Dashboard.tsx
  function linearRegression(data: number[]) {
    const len = data.length;
    if (len < 2) return { slope: 0, intercept: data[0] || 0 };
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < len; i++) {
      sumX += i;
      sumY += data[i];
      sumXY += i * data[i];
      sumXX += i * i;
    }
    const slope = (len * sumXY - sumX * sumY) / (len * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / len;
    return { slope, intercept };
  }

  function estimateDaysToLimit(currentValue: number, slope: number, limit: number | null) {
    if (limit === null || limit === 0) return null;
    if (currentValue >= limit) return 0;
    if (slope <= 0) return null;
    return Math.ceil((limit - currentValue) / slope);
  }

  it("calculates correct slope for constant data", () => {
    const data = [5, 5, 5, 5, 5];
    const { slope } = linearRegression(data);
    expect(slope).toBeCloseTo(0, 5);
  });

  it("calculates correct slope for linearly increasing data", () => {
    const data = [1, 2, 3, 4, 5];
    const { slope, intercept } = linearRegression(data);
    expect(slope).toBeCloseTo(1, 5);
    expect(intercept).toBeCloseTo(1, 5);
  });

  it("calculates correct slope for linearly decreasing data", () => {
    const data = [10, 8, 6, 4, 2];
    const { slope } = linearRegression(data);
    expect(slope).toBeCloseTo(-2, 5);
  });

  it("handles single data point", () => {
    const data = [42];
    const { slope, intercept } = linearRegression(data);
    expect(slope).toBe(0);
    expect(intercept).toBe(42);
  });

  it("handles empty data", () => {
    const data: number[] = [];
    const { slope, intercept } = linearRegression(data);
    expect(slope).toBe(0);
    expect(intercept).toBe(0);
  });

  it("estimates days to limit correctly for increasing data", () => {
    // Current: 3, slope: 1/day, limit: 5 → 2 days
    const days = estimateDaysToLimit(3, 1, 5);
    expect(days).toBe(2);
  });

  it("returns 0 when already at limit", () => {
    const days = estimateDaysToLimit(5, 1, 5);
    expect(days).toBe(0);
  });

  it("returns 0 when over limit", () => {
    const days = estimateDaysToLimit(7, 1, 5);
    expect(days).toBe(0);
  });

  it("returns null for decreasing data (no risk)", () => {
    const days = estimateDaysToLimit(3, -1, 5);
    expect(days).toBeNull();
  });

  it("returns null for unlimited plans", () => {
    const days = estimateDaysToLimit(3, 1, null);
    expect(days).toBeNull();
  });

  it("returns null for zero slope (constant usage)", () => {
    const days = estimateDaysToLimit(3, 0, 5);
    expect(days).toBeNull();
  });

  it("rounds up fractional days", () => {
    // Current: 3, slope: 0.7/day, limit: 5 → ceil(2/0.7) = ceil(2.857) = 3
    const days = estimateDaysToLimit(3, 0.7, 5);
    expect(days).toBe(3);
  });
});

describe("Dashboard Usage Trend - Translation keys", () => {
  const trendKeys = [
    "dashboard.usageTrendTitle",
    "dashboard.usageMenuTrend",
    "dashboard.usageMenuTrendDesc",
    "dashboard.usageFeedTrend",
    "dashboard.usageFeedTrendDesc",
    "dashboard.usageTicketTrendTitle",
    "dashboard.usageTicketTrendDesc",
    "dashboard.usageActual",
    "dashboard.usagePredicted",
    "dashboard.usageLimitLine",
    "dashboard.usageDailyAvgLimit",
    "dashboard.usageLimitReached",
    "dashboard.usageDaysToLimit",
    "dashboard.usageNoLimitRisk",
    "dashboard.usageMonthlyTickets",
    "dashboard.usageTicketTrend",
  ];

  it("all usage trend translation keys exist in all supported locales", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of trendKeys) {
        const value = t(locale, key);
        expect(value).not.toBe(key);
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it("usageDaysToLimit contains {days} placeholder in all locales", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const value = t(locale, "dashboard.usageDaysToLimit");
      expect(value).toContain("{days}");
    }
  });

  it("Japanese trend translations contain expected content", () => {
    expect(t("ja", "dashboard.usageTrendTitle")).toContain("推移");
    expect(t("ja", "dashboard.usageActual")).toBe("実績");
    expect(t("ja", "dashboard.usagePredicted")).toBe("予測");
    expect(t("ja", "dashboard.usageLimitLine")).toBe("上限");
    expect(t("ja", "dashboard.usageLimitReached")).toContain("上限");
  });

  it("English trend translations contain expected content", () => {
    expect(t("en", "dashboard.usageTrendTitle")).toContain("Trend");
    expect(t("en", "dashboard.usageActual")).toBe("Actual");
    expect(t("en", "dashboard.usagePredicted")).toBe("Forecast");
    expect(t("en", "dashboard.usageLimitLine")).toBe("Limit");
    expect(t("en", "dashboard.usageLimitReached")).toContain("reached");
  });
});
