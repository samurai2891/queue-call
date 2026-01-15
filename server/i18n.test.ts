import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES, translations } from "@shared/i18n/translations";

describe("i18n translations", () => {
  const baseKeys = Object.keys(translations.ja).sort();

  for (const locale of SUPPORTED_LOCALES) {
    if (locale === "ja") continue;

    it(`has complete keys for ${locale}`, () => {
      const localeKeys = Object.keys(translations[locale]).sort();
      expect(localeKeys).toEqual(baseKeys);
    });
  }
});
