import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("maxTicketsPerHour Settings UI", () => {
  const settingsPath = resolve(__dirname, "../client/src/pages/admin/Settings.tsx");
  const settingsContent = readFileSync(settingsPath, "utf-8");

  describe("Form data", () => {
    it("should have maxTicketsPerHour in initial formData with default 50", () => {
      expect(settingsContent).toContain("maxTicketsPerHour: 50");
    });

    it("should load maxTicketsPerHour from store settings", () => {
      expect(settingsContent).toContain("settings.queue?.maxTicketsPerHour ?? 50");
    });

    it("should save maxTicketsPerHour to queue settings", () => {
      expect(settingsContent).toContain("maxTicketsPerHour: formData.maxTicketsPerHour");
    });
  });

  describe("UI elements", () => {
    it("should have input field for maxTicketsPerHour", () => {
      expect(settingsContent).toContain('id="maxTicketsPerHour"');
      expect(settingsContent).toContain('type="number"');
    });

    it("should have min=10 and max=500 constraints", () => {
      expect(settingsContent).toContain("min={10}");
      expect(settingsContent).toContain("max={500}");
    });

    it("should use translation key for label", () => {
      expect(settingsContent).toContain("t('settings.maxTicketsPerHour')");
    });

    it("should use translation key for help text", () => {
      expect(settingsContent).toContain("t('settings.maxTicketsPerHourHelp')");
    });

    it("should handle NaN input gracefully with default 50", () => {
      expect(settingsContent).toContain("Number.isNaN(val) ? 50 : val");
    });
  });
});

describe("maxTicketsPerHour Translations", () => {
  const translationsPath = resolve(__dirname, "../shared/i18n/translations.ts");
  const translationsContent = readFileSync(translationsPath, "utf-8");

  it("should have Japanese translation", () => {
    expect(translationsContent).toContain("'settings.maxTicketsPerHour': '1時間あたりの最大発券数'");
    expect(translationsContent).toContain("'settings.maxTicketsPerHourHelp'");
  });

  it("should have English translation", () => {
    expect(translationsContent).toContain("'settings.maxTicketsPerHour': 'Max Tickets Per Hour'");
  });

  it("should have Korean translation", () => {
    expect(translationsContent).toContain("'settings.maxTicketsPerHour': '시간당 최대 발권 수'");
  });

  it("should have Simplified Chinese translation", () => {
    expect(translationsContent).toContain("'settings.maxTicketsPerHour': '每小时最大发票数'");
  });

  it("should have Traditional Chinese translation", () => {
    expect(translationsContent).toContain("'settings.maxTicketsPerHour': '每小時最大發票數'");
  });

  it("should have help text in all 5 languages", () => {
    const helpMatches = translationsContent.match(/'settings\.maxTicketsPerHourHelp'/g);
    expect(helpMatches).not.toBeNull();
    expect(helpMatches!.length).toBe(5);
  });
});
