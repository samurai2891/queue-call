import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("SMS Privacy Consent Checkbox", () => {
  const smsRegPath = resolve(__dirname, "../client/src/components/SmsRegistration.tsx");
  const smsRegContent = readFileSync(smsRegPath, "utf-8");

  const translationsPath = resolve(__dirname, "../shared/i18n/translations.ts");
  const translationsContent = readFileSync(translationsPath, "utf-8");

  describe("SmsRegistration component", () => {
    it("should import Checkbox component", () => {
      expect(smsRegContent).toContain("import { Checkbox }");
      expect(smsRegContent).toContain("@/components/ui/checkbox");
    });

    it("should import Link from wouter for privacy policy link", () => {
      expect(smsRegContent).toContain("import { Link }");
      expect(smsRegContent).toContain("from 'wouter'");
    });

    it("should have privacyAgreed state", () => {
      expect(smsRegContent).toContain("const [privacyAgreed, setPrivacyAgreed] = useState(false)");
    });

    it("should render a Checkbox with id privacy-consent", () => {
      expect(smsRegContent).toContain('id="privacy-consent"');
      expect(smsRegContent).toContain("checked={privacyAgreed}");
      expect(smsRegContent).toContain("onCheckedChange");
    });

    it("should link to /privacy page", () => {
      expect(smsRegContent).toContain('href="/privacy"');
    });

    it("should use privacy consent translation keys", () => {
      expect(smsRegContent).toContain("t('sms.privacyPolicy')");
      expect(smsRegContent).toContain("t('sms.privacyConsent')");
    });

    it("should disable send button when privacy is not agreed", () => {
      expect(smsRegContent).toContain("!privacyAgreed");
      // The disabled condition should include privacyAgreed check
      expect(smsRegContent).toContain("disabled={!phoneNumber || !privacyAgreed || registerMutation.isPending}");
    });

    it("should reset privacyAgreed when canceling", () => {
      expect(smsRegContent).toContain("setPrivacyAgreed(false)");
    });
  });

  describe("Translations", () => {
    it("should have Japanese privacy consent translations", () => {
      expect(translationsContent).toContain("'sms.privacyConsent': 'に同意の上、SMS通知を登録します'");
      expect(translationsContent).toContain("'sms.privacyPolicy': 'プライバシーポリシー'");
    });

    it("should have English privacy consent translations", () => {
      expect(translationsContent).toContain("'sms.privacyConsent': ' and register for SMS notifications'");
      expect(translationsContent).toContain("'sms.privacyPolicy': 'Privacy Policy'");
    });

    it("should have Korean privacy consent translations", () => {
      expect(translationsContent).toContain("'sms.privacyConsent': '에 동의하고 SMS 알림을 등록합니다'");
      expect(translationsContent).toContain("'sms.privacyPolicy': '개인정보 처리방침'");
    });

    it("should have Simplified Chinese privacy consent translations", () => {
      expect(translationsContent).toContain("'sms.privacyConsent': '，同意后注册短信通知'");
      expect(translationsContent).toContain("'sms.privacyPolicy': '隐私政策'");
    });

    it("should have Traditional Chinese privacy consent translations", () => {
      expect(translationsContent).toContain("'sms.privacyConsent': '，同意後註冊簡訊通知'");
      expect(translationsContent).toContain("'sms.privacyPolicy': '隱私權政策'");
    });
  });
});
