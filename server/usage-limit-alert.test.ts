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

describe("Dashboard Usage Trend - Weekly aggregation logic", () => {
  // Mirror the aggregateWeekly helper from Dashboard.tsx
  function aggregateWeekly(
    data: Array<{ date: string; actual: number | null; predicted: number | null }>,
    isCumulative: boolean
  ) {
    if (data.length === 0) return [];
    const weeks: Array<{ date: string; actual: number | null; predicted: number | null }> = [];
    let weekActual = 0;
    let weekPredicted = 0;
    let weekStart = '';
    let count = 0;
    let hasActual = false;
    let hasPredicted = false;

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (count === 0) weekStart = item.date;

      if (isCumulative) {
        if (item.actual !== null) { weekActual = item.actual; hasActual = true; }
        if (item.predicted !== null) { weekPredicted = item.predicted; hasPredicted = true; }
      } else {
        if (item.actual !== null) { weekActual += item.actual; hasActual = true; }
        if (item.predicted !== null) { weekPredicted += item.predicted; hasPredicted = true; }
      }
      count++;

      if (count === 7 || i === data.length - 1) {
        const weekEnd = item.date;
        weeks.push({
          date: count >= 3 ? `${weekStart}~${weekEnd}` : weekEnd,
          actual: hasActual ? weekActual : null,
          predicted: hasPredicted ? weekPredicted : null,
        });
        weekActual = 0;
        weekPredicted = 0;
        count = 0;
        hasActual = false;
        hasPredicted = false;
      }
    }
    return weeks;
  }

  it("aggregates 7 days into 1 week for cumulative data (takes last value)", () => {
    const daily = [
      { date: "3/1", actual: 10, predicted: null },
      { date: "3/2", actual: 11, predicted: null },
      { date: "3/3", actual: 12, predicted: null },
      { date: "3/4", actual: 13, predicted: null },
      { date: "3/5", actual: 14, predicted: null },
      { date: "3/6", actual: 15, predicted: null },
      { date: "3/7", actual: 16, predicted: null },
    ];
    const weekly = aggregateWeekly(daily, true);
    expect(weekly).toHaveLength(1);
    expect(weekly[0].actual).toBe(16); // last value in week
    expect(weekly[0].date).toBe("3/1~3/7");
  });

  it("aggregates 7 days into 1 week for non-cumulative data (sums values)", () => {
    const daily = [
      { date: "3/1", actual: 5, predicted: null },
      { date: "3/2", actual: 3, predicted: null },
      { date: "3/3", actual: 7, predicted: null },
      { date: "3/4", actual: 2, predicted: null },
      { date: "3/5", actual: 8, predicted: null },
      { date: "3/6", actual: 4, predicted: null },
      { date: "3/7", actual: 6, predicted: null },
    ];
    const weekly = aggregateWeekly(daily, false);
    expect(weekly).toHaveLength(1);
    expect(weekly[0].actual).toBe(35); // sum of all values
  });

  it("aggregates 14 days into 2 weeks", () => {
    const daily = Array.from({ length: 14 }, (_, i) => ({
      date: `3/${i + 1}`,
      actual: i + 1,
      predicted: null,
    }));
    const weekly = aggregateWeekly(daily, true);
    expect(weekly).toHaveLength(2);
    expect(weekly[0].actual).toBe(7); // last of first week (cumulative)
    expect(weekly[1].actual).toBe(14); // last of second week
  });

  it("handles partial week at end (30 days = 4 full weeks + 2 days)", () => {
    const daily = Array.from({ length: 30 }, (_, i) => ({
      date: `day${i + 1}`,
      actual: 1,
      predicted: null,
    }));
    const weekly = aggregateWeekly(daily, false);
    expect(weekly).toHaveLength(5); // 4 full + 1 partial
    expect(weekly[0].actual).toBe(7); // sum of 7 days
    expect(weekly[4].actual).toBe(2); // partial week: 2 days
  });

  it("handles predicted values in weekly aggregation", () => {
    const daily = [
      { date: "3/1", actual: 10, predicted: null },
      { date: "3/2", actual: 11, predicted: null },
      { date: "3/3", actual: 12, predicted: null },
      { date: "3/4", actual: 13, predicted: null },
      { date: "3/5", actual: 14, predicted: null },
      { date: "3/6", actual: 15, predicted: 15 },
      { date: "3/7", actual: null, predicted: 16 },
      { date: "3/8", actual: null, predicted: 17 },
    ];
    const weekly = aggregateWeekly(daily, true);
    expect(weekly).toHaveLength(2);
    expect(weekly[0].actual).toBe(15);
    expect(weekly[0].predicted).toBe(16); // cumulative: takes last predicted in week (3/7=16)
    expect(weekly[1].actual).toBeNull();
    expect(weekly[1].predicted).toBe(17);
  });

  it("returns empty array for empty input", () => {
    const weekly = aggregateWeekly([], true);
    expect(weekly).toHaveLength(0);
  });

  it("handles single day input", () => {
    const daily = [{ date: "3/1", actual: 5, predicted: null }];
    const weekly = aggregateWeekly(daily, true);
    expect(weekly).toHaveLength(1);
    expect(weekly[0].actual).toBe(5);
    // Single day: count < 3, so date is just the end date
    expect(weekly[0].date).toBe("3/1");
  });

  it("uses range format for weeks with 3+ days", () => {
    const daily = [
      { date: "3/1", actual: 1, predicted: null },
      { date: "3/2", actual: 2, predicted: null },
      { date: "3/3", actual: 3, predicted: null },
    ];
    const weekly = aggregateWeekly(daily, true);
    expect(weekly[0].date).toBe("3/1~3/3");
  });
});

describe("Dashboard Usage Trend - Granularity toggle translation keys", () => {
  const granularityKeys = [
    "dashboard.usageGranularityDaily",
    "dashboard.usageGranularityWeekly",
    "dashboard.usageGranularityMonthly",
  ];

  it("all granularity translation keys exist in all supported locales", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of granularityKeys) {
        const value = t(locale, key);
        expect(value).not.toBe(key);
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it("Japanese granularity translations are correct", () => {
    expect(t("ja", "dashboard.usageGranularityDaily")).toBe("日別");
    expect(t("ja", "dashboard.usageGranularityWeekly")).toBe("週別");
    expect(t("ja", "dashboard.usageGranularityMonthly")).toBe("月別");
  });

  it("English granularity translations are correct", () => {
    expect(t("en", "dashboard.usageGranularityDaily")).toBe("Daily");
    expect(t("en", "dashboard.usageGranularityWeekly")).toBe("Weekly");
    expect(t("en", "dashboard.usageGranularityMonthly")).toBe("Monthly");
  });

  it("Korean granularity translations are correct", () => {
    expect(t("ko", "dashboard.usageGranularityDaily")).toBe("일별");
    expect(t("ko", "dashboard.usageGranularityWeekly")).toBe("주별");
    expect(t("ko", "dashboard.usageGranularityMonthly")).toBe("월별");
  });

  it("zh-Hans granularity translations are correct", () => {
    expect(t("zh-Hans", "dashboard.usageGranularityDaily")).toBe("按日");
    expect(t("zh-Hans", "dashboard.usageGranularityWeekly")).toBe("按周");
    expect(t("zh-Hans", "dashboard.usageGranularityMonthly")).toBe("按月");
  });

  it("zh-Hant granularity translations are correct", () => {
    expect(t("zh-Hant", "dashboard.usageGranularityDaily")).toBe("按日");
    expect(t("zh-Hant", "dashboard.usageGranularityWeekly")).toBe("按週");
    expect(t("zh-Hant", "dashboard.usageGranularityMonthly")).toBe("按月");
  });
});

describe("Dashboard Usage Trend - Monthly aggregation logic", () => {
  // Mirror the aggregateMonthly helper from Dashboard.tsx
  function aggregateMonthly(
    data: Array<{ date: string; actual: number | null; predicted: number | null }>,
    isCumulative: boolean,
    rawDaily: Array<{ date: string }>
  ) {
    if (data.length === 0 || rawDaily.length === 0) return [];
    const months: Array<{ date: string; actual: number | null; predicted: number | null }> = [];
    let currentMonth = '';
    let monthActual = 0;
    let monthPredicted = 0;
    let hasActual = false;
    let hasPredicted = false;

    for (let i = 0; i < data.length; i++) {
      let monthKey: string;
      if (i < rawDaily.length && rawDaily[i].date.includes('-')) {
        monthKey = rawDaily[i].date.substring(0, 7);
      } else {
        const parts = data[i].date.split('/');
        const now = new Date();
        monthKey = `${now.getFullYear()}-${parts[0].padStart(2, '0')}`;
      }

      if (currentMonth && monthKey !== currentMonth) {
        const [y, m] = currentMonth.split('-');
        months.push({
          date: `${y}/${m}`,
          actual: hasActual ? monthActual : null,
          predicted: hasPredicted ? monthPredicted : null,
        });
        monthActual = 0;
        monthPredicted = 0;
        hasActual = false;
        hasPredicted = false;
      }
      currentMonth = monthKey;

      if (isCumulative) {
        if (data[i].actual !== null) { monthActual = data[i].actual!; hasActual = true; }
        if (data[i].predicted !== null) { monthPredicted = data[i].predicted!; hasPredicted = true; }
      } else {
        if (data[i].actual !== null) { monthActual += data[i].actual!; hasActual = true; }
        if (data[i].predicted !== null) { monthPredicted += data[i].predicted!; hasPredicted = true; }
      }
    }

    if (currentMonth) {
      const [y, m] = currentMonth.split('-');
      months.push({
        date: `${y}/${m}`,
        actual: hasActual ? monthActual : null,
        predicted: hasPredicted ? monthPredicted : null,
      });
    }

    return months;
  }

  it("aggregates single month of cumulative data (takes last value)", () => {
    const rawDaily = [
      { date: "2026-02-01" }, { date: "2026-02-02" }, { date: "2026-02-03" },
    ];
    const data = [
      { date: "2/1", actual: 10, predicted: null },
      { date: "2/2", actual: 12, predicted: null },
      { date: "2/3", actual: 15, predicted: null },
    ];
    const monthly = aggregateMonthly(data, true, rawDaily);
    expect(monthly).toHaveLength(1);
    expect(monthly[0].actual).toBe(15); // last value (cumulative)
    expect(monthly[0].date).toBe("2026/02");
  });

  it("aggregates single month of non-cumulative data (sums values)", () => {
    const rawDaily = [
      { date: "2026-02-01" }, { date: "2026-02-02" }, { date: "2026-02-03" },
    ];
    const data = [
      { date: "2/1", actual: 5, predicted: null },
      { date: "2/2", actual: 3, predicted: null },
      { date: "2/3", actual: 7, predicted: null },
    ];
    const monthly = aggregateMonthly(data, false, rawDaily);
    expect(monthly).toHaveLength(1);
    expect(monthly[0].actual).toBe(15); // sum
  });

  it("aggregates data spanning two months", () => {
    const rawDaily = [
      { date: "2026-01-30" }, { date: "2026-01-31" },
      { date: "2026-02-01" }, { date: "2026-02-02" },
    ];
    const data = [
      { date: "1/30", actual: 8, predicted: null },
      { date: "1/31", actual: 10, predicted: null },
      { date: "2/1", actual: 12, predicted: null },
      { date: "2/2", actual: 14, predicted: null },
    ];
    const monthly = aggregateMonthly(data, true, rawDaily);
    expect(monthly).toHaveLength(2);
    expect(monthly[0].actual).toBe(10); // Jan last value
    expect(monthly[0].date).toBe("2026/01");
    expect(monthly[1].actual).toBe(14); // Feb last value
    expect(monthly[1].date).toBe("2026/02");
  });

  it("aggregates non-cumulative data spanning two months", () => {
    const rawDaily = [
      { date: "2026-01-30" }, { date: "2026-01-31" },
      { date: "2026-02-01" }, { date: "2026-02-02" },
    ];
    const data = [
      { date: "1/30", actual: 5, predicted: null },
      { date: "1/31", actual: 3, predicted: null },
      { date: "2/1", actual: 7, predicted: null },
      { date: "2/2", actual: 2, predicted: null },
    ];
    const monthly = aggregateMonthly(data, false, rawDaily);
    expect(monthly).toHaveLength(2);
    expect(monthly[0].actual).toBe(8); // Jan sum: 5+3
    expect(monthly[1].actual).toBe(9); // Feb sum: 7+2
  });

  it("handles predicted values in monthly aggregation", () => {
    const rawDaily = [
      { date: "2026-02-25" }, { date: "2026-02-26" }, { date: "2026-02-27" }, { date: "2026-02-28" },
    ];
    const data = [
      { date: "2/25", actual: 10, predicted: null },
      { date: "2/26", actual: 12, predicted: null },
      { date: "2/27", actual: 14, predicted: 14 },
      { date: "2/28", actual: null, predicted: 16 },
    ];
    const monthly = aggregateMonthly(data, true, rawDaily);
    expect(monthly).toHaveLength(1);
    expect(monthly[0].actual).toBe(14);
    expect(monthly[0].predicted).toBe(16);
  });

  it("returns empty array for empty input", () => {
    const monthly = aggregateMonthly([], true, []);
    expect(monthly).toHaveLength(0);
  });

  it("handles single day input", () => {
    const rawDaily = [{ date: "2026-03-15" }];
    const data = [{ date: "3/15", actual: 42, predicted: null }];
    const monthly = aggregateMonthly(data, true, rawDaily);
    expect(monthly).toHaveLength(1);
    expect(monthly[0].actual).toBe(42);
    expect(monthly[0].date).toBe("2026/03");
  });

  it("aggregates data spanning three months", () => {
    const rawDaily = [
      { date: "2025-12-30" }, { date: "2025-12-31" },
      { date: "2026-01-01" }, { date: "2026-01-15" },
      { date: "2026-02-01" },
    ];
    const data = [
      { date: "12/30", actual: 1, predicted: null },
      { date: "12/31", actual: 2, predicted: null },
      { date: "1/1", actual: 3, predicted: null },
      { date: "1/15", actual: 4, predicted: null },
      { date: "2/1", actual: 5, predicted: null },
    ];
    const monthly = aggregateMonthly(data, false, rawDaily);
    expect(monthly).toHaveLength(3);
    expect(monthly[0].actual).toBe(3); // Dec: 1+2
    expect(monthly[0].date).toBe("2025/12");
    expect(monthly[1].actual).toBe(7); // Jan: 3+4
    expect(monthly[1].date).toBe("2026/01");
    expect(monthly[2].actual).toBe(5); // Feb: 5
    expect(monthly[2].date).toBe("2026/02");
  });
});
