import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

describe("Legal pages", () => {
  const pagesDir = resolve(__dirname, "../client/src/pages");

  describe("Privacy page", () => {
    const privacyPath = resolve(pagesDir, "Privacy.tsx");

    it("should exist as a file", () => {
      expect(existsSync(privacyPath)).toBe(true);
    });

    it("should contain required privacy policy sections", () => {
      const content = readFileSync(privacyPath, "utf-8");
      // Company info
      expect(content).toContain("合同会社Asobe");
      expect(content).toContain("contact@asobe-create.com");
      expect(content).toContain("神戸市中央区磯辺通");
      // Key sections
      expect(content).toContain("収集する情報");
      expect(content).toContain("情報の利用目的");
      expect(content).toContain("情報の第三者提供");
      expect(content).toContain("データの保管と削除");
      expect(content).toContain("Cookieの使用");
      expect(content).toContain("お客様の権利");
      expect(content).toContain("安全管理措置");
      expect(content).toContain("プライバシーポリシーの変更");
    });

    it("should mention data retention periods", () => {
      const content = readFileSync(privacyPath, "utf-8");
      expect(content).toContain("90日");
      expect(content).toContain("6ヶ月");
    });

    it("should mention third-party services used", () => {
      const content = readFileSync(privacyPath, "utf-8");
      expect(content).toContain("Twilio");
      expect(content).toContain("Stripe");
      expect(content).toContain("Amazon Web Services");
    });

    it("should have link to terms page", () => {
      const content = readFileSync(privacyPath, "utf-8");
      expect(content).toContain("/terms");
    });
  });

  describe("Terms page", () => {
    const termsPath = resolve(pagesDir, "Terms.tsx");

    it("should exist as a file", () => {
      expect(existsSync(termsPath)).toBe(true);
    });

    it("should contain required terms sections", () => {
      const content = readFileSync(termsPath, "utf-8");
      // Company info
      expect(content).toContain("合同会社Asobe");
      expect(content).toContain("contact@asobe-create.com");
      expect(content).toContain("神戸市中央区磯辺通");
      // Key sections
      expect(content).toContain("第1条");
      expect(content).toContain("第2条");
      expect(content).toContain("禁止事項");
      expect(content).toContain("免責事項");
      expect(content).toContain("知的財産権");
      expect(content).toContain("準拠法・管轄裁判所");
    });

    it("should specify Kobe District Court as jurisdiction", () => {
      const content = readFileSync(termsPath, "utf-8");
      expect(content).toContain("神戸地方裁判所");
    });

    it("should mention service-specific terms", () => {
      const content = readFileSync(termsPath, "utf-8");
      expect(content).toContain("順番待ち");
      expect(content).toContain("SMS");
      expect(content).toContain("Stripe");
      expect(content).toContain("90日");
    });

    it("should have link to privacy page", () => {
      const content = readFileSync(termsPath, "utf-8");
      expect(content).toContain("/privacy");
    });
  });

  describe("Routes registration", () => {
    it("should have /privacy and /terms routes in App.tsx", () => {
      const appPath = resolve(__dirname, "../client/src/App.tsx");
      const content = readFileSync(appPath, "utf-8");
      expect(content).toContain('path="/privacy"');
      expect(content).toContain('path="/terms"');
      expect(content).toContain("Privacy");
      expect(content).toContain("Terms");
    });
  });

  describe("Footer links", () => {
    it("should have legal page links in Home.tsx footer", () => {
      const homePath = resolve(pagesDir, "Home.tsx");
      const content = readFileSync(homePath, "utf-8");
      expect(content).toContain("/terms");
      expect(content).toContain("/privacy");
      expect(content).toContain("利用規約");
      expect(content).toContain("プライバシーポリシー");
      expect(content).toContain("合同会社Asobe");
    });
  });
});
