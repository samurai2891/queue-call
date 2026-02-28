import { describe, expect, it } from "vitest";
import {
  getPlanFeatures,
  getStorePlan,
  checkSmsAllowed,
  checkReservationAllowed,
  checkMenuLimit,
  checkBusinessHoursAllowed,
  checkStaffLimit,
  getAnalyticsDaysLimit,
  checkCsvExportAllowed,
  getBrandingLevel,
  checkBrandingAllowed,
  getPlanLimitsInfo,
  getUnlockedFeatures,
} from "./plan-limits";

describe("getPlanFeatures", () => {
  it("returns free plan features for undefined/null", () => {
    const features = getPlanFeatures(undefined);
    expect(features.smsEnabled).toBe(false);
    expect(features.reservationEnabled).toBe(false);
    expect(features.menuLimit).toBe(5);
    expect(features.analyticsDays).toBe(1);
    expect(features.csvExport).toBe(false);
    expect(features.businessHoursEnabled).toBe(false);
    expect(features.staffLimit).toBe(1);
    expect(features.brandingLevel).toBe("basic");

    const featuresNull = getPlanFeatures(null);
    expect(featuresNull.smsEnabled).toBe(false);
  });

  it("returns standard plan features", () => {
    const features = getPlanFeatures("standard");
    expect(features.smsEnabled).toBe(true);
    expect(features.reservationEnabled).toBe(true);
    expect(features.menuLimit).toBeNull();
    expect(features.analyticsDays).toBe(30);
    expect(features.csvExport).toBe(false);
    expect(features.businessHoursEnabled).toBe(true);
    expect(features.staffLimit).toBe(3);
    expect(features.brandingLevel).toBe("custom_color");
  });

  it("returns pro plan features", () => {
    const features = getPlanFeatures("pro");
    expect(features.smsEnabled).toBe(true);
    expect(features.reservationEnabled).toBe(true);
    expect(features.menuLimit).toBeNull();
    expect(features.analyticsDays).toBe(90);
    expect(features.csvExport).toBe(true);
    expect(features.businessHoursEnabled).toBe(true);
    expect(features.staffLimit).toBeNull();
    expect(features.brandingLevel).toBe("full");
  });

  it("falls back to free for unknown plan", () => {
    const features = getPlanFeatures("unknown_plan");
    expect(features.smsEnabled).toBe(false);
  });
});

describe("getStorePlan", () => {
  it("returns the full plan definition", () => {
    const plan = getStorePlan("standard");
    expect(plan.id).toBe("standard");
    expect(plan.nameJa).toBe("スタンダード");
    expect(plan.priceMonthly).toBe(1500);
  });

  it("returns free plan for undefined", () => {
    const plan = getStorePlan(undefined);
    expect(plan.id).toBe("free");
    expect(plan.priceMonthly).toBe(0);
  });
});

describe("checkSmsAllowed", () => {
  it("throws for free plan", () => {
    expect(() => checkSmsAllowed("free")).toThrow("SMS通知はStandard以上のプランで利用できます");
  });

  it("does not throw for standard plan", () => {
    expect(() => checkSmsAllowed("standard")).not.toThrow();
  });

  it("does not throw for pro plan", () => {
    expect(() => checkSmsAllowed("pro")).not.toThrow();
  });
});

describe("checkReservationAllowed", () => {
  it("throws for free plan", () => {
    expect(() => checkReservationAllowed("free")).toThrow("予約機能はStandard以上のプランで利用できます");
  });

  it("does not throw for standard plan", () => {
    expect(() => checkReservationAllowed("standard")).not.toThrow();
  });
});

describe("checkMenuLimit", () => {
  it("throws when free plan exceeds 5 items", () => {
    expect(() => checkMenuLimit("free", 5)).toThrow("メニューは5品まで");
  });

  it("does not throw when free plan has less than 5 items", () => {
    expect(() => checkMenuLimit("free", 4)).not.toThrow();
  });

  it("does not throw when free plan has 0 items", () => {
    expect(() => checkMenuLimit("free", 0)).not.toThrow();
  });

  it("throws at exactly the limit (boundary test)", () => {
    expect(() => checkMenuLimit("free", 5)).toThrow();
    expect(() => checkMenuLimit("free", 6)).toThrow();
  });

  it("does not throw at one below the limit (boundary test)", () => {
    expect(() => checkMenuLimit("free", 4)).not.toThrow();
  });

  it("includes upgrade message in error", () => {
    expect(() => checkMenuLimit("free", 5)).toThrow("Standard以上のプランにアップグレード");
  });

  it("does not throw for standard plan regardless of count", () => {
    expect(() => checkMenuLimit("standard", 100)).not.toThrow();
  });

  it("does not throw for pro plan regardless of count", () => {
    expect(() => checkMenuLimit("pro", 1000)).not.toThrow();
  });
});

describe("checkBusinessHoursAllowed", () => {
  it("throws for free plan", () => {
    expect(() => checkBusinessHoursAllowed("free")).toThrow("営業時間制御はStandard以上のプランで利用できます");
  });

  it("does not throw for standard plan", () => {
    expect(() => checkBusinessHoursAllowed("standard")).not.toThrow();
  });
});

describe("checkStaffLimit", () => {
  it("throws when free plan exceeds 1 staff", () => {
    expect(() => checkStaffLimit("free", 1)).toThrow("スタッフは1名まで");
  });

  it("does not throw when free plan has 0 staff", () => {
    expect(() => checkStaffLimit("free", 0)).not.toThrow();
  });

  it("throws when standard plan exceeds 3 staff", () => {
    expect(() => checkStaffLimit("standard", 3)).toThrow("スタッフは3名まで");
  });

  it("does not throw when standard plan has 2 staff", () => {
    expect(() => checkStaffLimit("standard", 2)).not.toThrow();
  });

  it("does not throw for pro plan regardless of count", () => {
    expect(() => checkStaffLimit("pro", 100)).not.toThrow();
  });
});

describe("getAnalyticsDaysLimit", () => {
  it("returns 1 for free plan", () => {
    expect(getAnalyticsDaysLimit("free")).toBe(1);
  });

  it("returns 30 for standard plan", () => {
    expect(getAnalyticsDaysLimit("standard")).toBe(30);
  });

  it("returns 90 for pro plan", () => {
    expect(getAnalyticsDaysLimit("pro")).toBe(90);
  });
});

describe("checkCsvExportAllowed", () => {
  it("throws for free plan", () => {
    expect(() => checkCsvExportAllowed("free")).toThrow("CSV出力はProプランで利用できます");
  });

  it("throws for standard plan", () => {
    expect(() => checkCsvExportAllowed("standard")).toThrow("CSV出力はProプランで利用できます");
  });

  it("does not throw for pro plan", () => {
    expect(() => checkCsvExportAllowed("pro")).not.toThrow();
  });
});

describe("getBrandingLevel", () => {
  it("returns basic for free plan", () => {
    expect(getBrandingLevel("free")).toBe("basic");
  });

  it("returns custom_color for standard plan", () => {
    expect(getBrandingLevel("standard")).toBe("custom_color");
  });

  it("returns full for pro plan", () => {
    expect(getBrandingLevel("pro")).toBe("full");
  });
});

describe("checkBrandingAllowed", () => {
  it("throws for free plan with color setting", () => {
    expect(() => checkBrandingAllowed("free", "color")).toThrow("カスタムカラーはStandard以上のプランで利用できます");
  });

  it("does not throw for standard plan with color setting", () => {
    expect(() => checkBrandingAllowed("standard", "color")).not.toThrow();
  });

  it("throws for free plan with logo setting", () => {
    expect(() => checkBrandingAllowed("free", "logo")).toThrow("カスタムロゴはProプランで利用できます");
  });

  it("throws for standard plan with logo setting", () => {
    expect(() => checkBrandingAllowed("standard", "logo")).toThrow("カスタムロゴはProプランで利用できます");
  });

  it("does not throw for pro plan with logo setting", () => {
    expect(() => checkBrandingAllowed("pro", "logo")).not.toThrow();
  });
});

describe("getUnlockedFeatures", () => {
  it("returns all features when upgrading from free to pro", () => {
    const features = getUnlockedFeatures("free", "pro");
    const keys = features.map(f => f.key);
    expect(keys).toContain("sms");
    expect(keys).toContain("reservation");
    expect(keys).toContain("menuUnlimited");
    expect(keys).toContain("businessHours");
    expect(keys).toContain("staffIncrease");
    expect(keys).toContain("analyticsExpanded");
    expect(keys).toContain("csvExport");
    expect(keys).toContain("customColor");
    expect(keys).toContain("customLogo");
    expect(keys).toContain("supportUpgrade");
    expect(features.length).toBe(10);
  });

  it("returns standard-specific features when upgrading from free to standard", () => {
    const features = getUnlockedFeatures("free", "standard");
    const keys = features.map(f => f.key);
    expect(keys).toContain("sms");
    expect(keys).toContain("reservation");
    expect(keys).toContain("menuUnlimited");
    expect(keys).toContain("businessHours");
    expect(keys).toContain("staffIncrease");
    expect(keys).toContain("analyticsExpanded");
    expect(keys).toContain("customColor");
    expect(keys).toContain("supportUpgrade");
    // Standard does NOT unlock CSV or custom logo
    expect(keys).not.toContain("csvExport");
    expect(keys).not.toContain("customLogo");
    expect(features.length).toBe(8);
  });

  it("returns pro-only features when upgrading from standard to pro", () => {
    const features = getUnlockedFeatures("standard", "pro");
    const keys = features.map(f => f.key);
    expect(keys).toContain("csvExport");
    expect(keys).toContain("customLogo");
    expect(keys).toContain("analyticsExpanded");
    expect(keys).toContain("staffIncrease");
    expect(keys).toContain("supportUpgrade");
    // These were already available in standard
    expect(keys).not.toContain("sms");
    expect(keys).not.toContain("reservation");
    expect(keys).not.toContain("menuUnlimited");
    expect(keys).not.toContain("businessHours");
    expect(keys).not.toContain("customColor");
    expect(features.length).toBe(5);
  });

  it("returns empty array for same plan", () => {
    expect(getUnlockedFeatures("free", "free")).toEqual([]);
    expect(getUnlockedFeatures("standard", "standard")).toEqual([]);
    expect(getUnlockedFeatures("pro", "pro")).toEqual([]);
  });

  it("returns empty array for downgrade", () => {
    expect(getUnlockedFeatures("pro", "free")).toEqual([]);
    expect(getUnlockedFeatures("pro", "standard")).toEqual([]);
    expect(getUnlockedFeatures("standard", "free")).toEqual([]);
  });

  it("handles null/undefined old plan as free", () => {
    const fromNull = getUnlockedFeatures(null, "standard");
    const fromUndefined = getUnlockedFeatures(undefined, "standard");
    const fromFree = getUnlockedFeatures("free", "standard");
    expect(fromNull).toEqual(fromFree);
    expect(fromUndefined).toEqual(fromFree);
  });

  it("includes correct settingsTab for each feature", () => {
    const features = getUnlockedFeatures("free", "pro");
    const sms = features.find(f => f.key === "sms");
    expect(sms?.settingsTab).toBe("notifications");
    const reservation = features.find(f => f.key === "reservation");
    expect(reservation?.settingsTab).toBe("reservation");
    const menu = features.find(f => f.key === "menuUnlimited");
    expect(menu?.settingsTab).toBe("menu");
    const bh = features.find(f => f.key === "businessHours");
    expect(bh?.settingsTab).toBe("businessHours");
    const staff = features.find(f => f.key === "staffIncrease");
    expect(staff?.settingsTab).toBe("security");
    const color = features.find(f => f.key === "customColor");
    expect(color?.settingsTab).toBe("branding");
    const logo = features.find(f => f.key === "customLogo");
    expect(logo?.settingsTab).toBe("branding");
    // Analytics and CSV have no settingsTab
    const analytics = features.find(f => f.key === "analyticsExpanded");
    expect(analytics?.settingsTab).toBeUndefined();
    const csv = features.find(f => f.key === "csvExport");
    expect(csv?.settingsTab).toBeUndefined();
  });
});

describe("getPlanLimitsInfo", () => {
  it("returns complete plan limits info for free plan", () => {
    const info = getPlanLimitsInfo("free");
    expect(info.planId).toBe("free");
    expect(info.planName).toBe("フリー");
    expect(info.smsEnabled).toBe(false);
    expect(info.reservationEnabled).toBe(false);
    expect(info.menuLimit).toBe(5);
    expect(info.analyticsDays).toBe(1);
    expect(info.csvExport).toBe(false);
    expect(info.businessHoursEnabled).toBe(false);
    expect(info.staffLimit).toBe(1);
    expect(info.brandingLevel).toBe("basic");
    expect(info.supportLevel).toBe("community");
  });

  it("returns complete plan limits info for standard plan", () => {
    const info = getPlanLimitsInfo("standard");
    expect(info.planId).toBe("standard");
    expect(info.planName).toBe("スタンダード");
    expect(info.smsEnabled).toBe(true);
    expect(info.reservationEnabled).toBe(true);
    expect(info.menuLimit).toBeNull();
    expect(info.analyticsDays).toBe(30);
    expect(info.csvExport).toBe(false);
    expect(info.businessHoursEnabled).toBe(true);
    expect(info.staffLimit).toBe(3);
    expect(info.brandingLevel).toBe("custom_color");
    expect(info.supportLevel).toBe("email");
  });

  it("returns complete plan limits info for pro plan", () => {
    const info = getPlanLimitsInfo("pro");
    expect(info.planId).toBe("pro");
    expect(info.planName).toBe("プロ");
    expect(info.smsEnabled).toBe(true);
    expect(info.reservationEnabled).toBe(true);
    expect(info.menuLimit).toBeNull();
    expect(info.analyticsDays).toBe(90);
    expect(info.csvExport).toBe(true);
    expect(info.businessHoursEnabled).toBe(true);
    expect(info.staffLimit).toBeNull();
    expect(info.brandingLevel).toBe("full");
    expect(info.supportLevel).toBe("priority_email");
  });
});
