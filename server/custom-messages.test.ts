import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Custom Messages Feature', () => {
  // ---- Schema Tests ----
  describe('Schema: customMessages field in StoreSettings', () => {
    const schemaContent = readFileSync(resolve(__dirname, '../drizzle/schema.ts'), 'utf-8');

    it('should define customMessages in StoreSettings type', () => {
      expect(schemaContent).toContain('customMessages');
    });

    it('should include welcomeMessage field', () => {
      expect(schemaContent).toContain('welcomeMessage');
    });

    it('should include joinNotice field', () => {
      expect(schemaContent).toContain('joinNotice');
    });

    it('should include ticketMessage field', () => {
      expect(schemaContent).toContain('ticketMessage');
    });

    it('should include kioskMessage field', () => {
      expect(schemaContent).toContain('kioskMessage');
    });
  });

  // ---- API Tests ----
  describe('API: customMessages in getBySlug responses', () => {
    const routersContent = readFileSync(resolve(__dirname, './routers.ts'), 'utf-8');

    it('should return customMessages in getBySlug', () => {
      expect(routersContent).toContain('customMessages');
    });

    it('should return customMessages in getBySlugForKiosk', () => {
      // getBySlugForKiosk should include customMessages in settings
      const kioskSection = routersContent.indexOf('getBySlugForKiosk');
      expect(kioskSection).toBeGreaterThan(-1);
      const afterKiosk = routersContent.slice(kioskSection, kioskSection + 2000);
      expect(afterKiosk).toContain('customMessages');
    });
  });

  // ---- Admin UI Tests ----
  describe('Admin UI: Custom Messages tab in Settings', () => {
    const settingsContent = readFileSync(resolve(__dirname, '../client/src/pages/admin/Settings.tsx'), 'utf-8');

    it('should have messages tab', () => {
      expect(settingsContent).toContain('value="messages"');
    });

    it('should have welcomeMessage textarea', () => {
      expect(settingsContent).toContain('id="welcomeMessage"');
    });

    it('should have joinNotice textarea', () => {
      expect(settingsContent).toContain('id="joinNotice"');
    });

    it('should have ticketMessage textarea', () => {
      expect(settingsContent).toContain('id="ticketMessage"');
    });

    it('should have kioskMessage textarea', () => {
      expect(settingsContent).toContain('id="kioskMessage"');
    });

    it('should enforce 200 character limit', () => {
      // Check that the 200 char limit is applied
      const charLimitMatches = settingsContent.match(/\.length <= 200/g);
      expect(charLimitMatches).not.toBeNull();
      expect(charLimitMatches!.length).toBeGreaterThanOrEqual(4);
    });

    it('should include customMessages in handleSave', () => {
      expect(settingsContent).toContain('customMessages');
    });

    it('should initialize formData with customMessages fields', () => {
      expect(settingsContent).toContain('welcomeMessage:');
      expect(settingsContent).toContain('joinNotice:');
      expect(settingsContent).toContain('ticketMessage:');
      expect(settingsContent).toContain('kioskMessage:');
    });
  });

  // ---- Customer-facing UI Tests ----
  describe('Customer UI: Custom message display', () => {
    it('should display welcomeMessage in StoreTop', () => {
      const storeTopContent = readFileSync(resolve(__dirname, '../client/src/pages/store/StoreTop.tsx'), 'utf-8');
      expect(storeTopContent).toContain('customMessages?.welcomeMessage');
    });

    it('should display joinNotice in JoinQueue', () => {
      const joinQueueContent = readFileSync(resolve(__dirname, '../client/src/pages/store/JoinQueue.tsx'), 'utf-8');
      expect(joinQueueContent).toContain('customMessages?.joinNotice');
    });

    it('should display ticketMessage in Ticket', () => {
      const ticketContent = readFileSync(resolve(__dirname, '../client/src/pages/store/Ticket.tsx'), 'utf-8');
      expect(ticketContent).toContain('customMessages?.ticketMessage');
    });

    it('should display kioskMessage in KioskDisplay', () => {
      const kioskContent = readFileSync(resolve(__dirname, '../client/src/pages/store/KioskDisplay.tsx'), 'utf-8');
      expect(kioskContent).toContain('customMessages?.kioskMessage');
    });

    it('should use whitespace-pre-wrap for message formatting', () => {
      const joinQueueContent = readFileSync(resolve(__dirname, '../client/src/pages/store/JoinQueue.tsx'), 'utf-8');
      expect(joinQueueContent).toContain('whitespace-pre-wrap');
    });
  });

  // ---- Translation Tests ----
  describe('Translations: Custom message keys', () => {
    const translationsContent = readFileSync(resolve(__dirname, '../shared/i18n/translations.ts'), 'utf-8');

    it('should have Japanese translations for custom messages', () => {
      expect(translationsContent).toContain('settings.customMessages');
      expect(translationsContent).toContain('settings.welcomeMessage');
      expect(translationsContent).toContain('settings.joinNotice');
      expect(translationsContent).toContain('settings.ticketMessage');
      expect(translationsContent).toContain('settings.kioskMessage');
    });

    it('should have English translations for custom messages', () => {
      // Check that the key appears at least twice (ja + en)
      const matches = translationsContent.match(/'settings\.customMessages'/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });

    it('should have character count translation key', () => {
      expect(translationsContent).toContain('settings.messageCharCount');
    });

    it('should have placeholder translations', () => {
      expect(translationsContent).toContain('settings.welcomeMessagePlaceholder');
      expect(translationsContent).toContain('settings.joinNoticePlaceholder');
      expect(translationsContent).toContain('settings.ticketMessagePlaceholder');
      expect(translationsContent).toContain('settings.kioskMessagePlaceholder');
    });
  });
});
