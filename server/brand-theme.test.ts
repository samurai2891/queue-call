import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Brand Theme Feature', () => {
  // Schema test: branding field exists in StoreSettings
  describe('Schema', () => {
    it('should have branding field in StoreSettings type', () => {
      const schemaContent = fs.readFileSync(
        path.join(__dirname, '../drizzle/schema.ts'),
        'utf-8'
      );
      expect(schemaContent).toContain('branding?:');
      expect(schemaContent).toContain('primaryColor?: string');
      expect(schemaContent).toContain('secondaryColor?: string');
      expect(schemaContent).toContain('accentColor?: string');
    });
  });

  // Router test: branding is returned in getBySlug
  describe('Router', () => {
    it('should return branding in getBySlug response', () => {
      const routerContent = fs.readFileSync(
        path.join(__dirname, './routers.ts'),
        'utf-8'
      );
      expect(routerContent).toContain('branding: store.settings?.branding');
    });

    it('should return branding in getBySlugForKiosk response', () => {
      const routerContent = fs.readFileSync(
        path.join(__dirname, './routers.ts'),
        'utf-8'
      );
      // Check that branding is included in kiosk endpoint
      const kioskSection = routerContent.indexOf('getBySlugForKiosk');
      const kioskBranding = routerContent.indexOf('branding: store.settings?.branding', kioskSection);
      expect(kioskBranding).toBeGreaterThan(kioskSection);
    });

    it('should return branding in getBySlugForBoard response', () => {
      const routerContent = fs.readFileSync(
        path.join(__dirname, './routers.ts'),
        'utf-8'
      );
      // Check that branding is included in board endpoint
      const boardSection = routerContent.indexOf('getBySlugForBoard');
      const boardBranding = routerContent.indexOf('branding: store.settings?.branding', boardSection);
      expect(boardBranding).toBeGreaterThan(boardSection);
    });
  });

  // BrandThemeProvider component test
  describe('BrandThemeProvider Component', () => {
    it('should exist and export BrandThemeProvider', () => {
      const componentPath = path.join(__dirname, '../client/src/components/BrandThemeProvider.tsx');
      expect(fs.existsSync(componentPath)).toBe(true);
      
      const content = fs.readFileSync(componentPath, 'utf-8');
      expect(content).toContain('export function BrandThemeProvider');
    });

    it('should export BRAND_PRESETS with all preset keys', () => {
      const content = fs.readFileSync(
        path.join(__dirname, '../client/src/components/BrandThemeProvider.tsx'),
        'utf-8'
      );
      expect(content).toContain('BRAND_PRESETS');
      expect(content).toContain("default:");
      expect(content).toContain("warm:");
      expect(content).toContain("cool:");
      expect(content).toContain("nature:");
      expect(content).toContain("elegant:");
      expect(content).toContain("vivid:");
    });

    it('should export isValidHex function', () => {
      const content = fs.readFileSync(
        path.join(__dirname, '../client/src/components/BrandThemeProvider.tsx'),
        'utf-8'
      );
      expect(content).toContain('export function isValidHex');
    });

    it('should include hexToOklch conversion function', () => {
      const content = fs.readFileSync(
        path.join(__dirname, '../client/src/components/BrandThemeProvider.tsx'),
        'utf-8'
      );
      expect(content).toContain('function hexToOklch');
    });

    it('should include getForegroundColor for contrast', () => {
      const content = fs.readFileSync(
        path.join(__dirname, '../client/src/components/BrandThemeProvider.tsx'),
        'utf-8'
      );
      expect(content).toContain('function getForegroundColor');
    });
  });

  // Customer-facing pages integration test
  describe('Customer Pages Integration', () => {
    const customerPages = [
      { name: 'StoreTop', path: '../client/src/pages/store/StoreTop.tsx' },
      { name: 'JoinQueue', path: '../client/src/pages/store/JoinQueue.tsx' },
      { name: 'Ticket', path: '../client/src/pages/store/Ticket.tsx' },
      { name: 'KioskDisplay', path: '../client/src/pages/store/KioskDisplay.tsx' },
      { name: 'BoardDisplay', path: '../client/src/pages/store/BoardDisplay.tsx' },
    ];

    customerPages.forEach(({ name, path: filePath }) => {
      it(`${name} should import BrandThemeProvider`, () => {
        const content = fs.readFileSync(
          path.join(__dirname, filePath),
          'utf-8'
        );
        expect(content).toContain("import { BrandThemeProvider }");
      });

      it(`${name} should wrap content with BrandThemeProvider`, () => {
        const content = fs.readFileSync(
          path.join(__dirname, filePath),
          'utf-8'
        );
        expect(content).toContain('<BrandThemeProvider');
        expect(content).toContain('branding={branding}');
      });
    });
  });

  // Settings page integration test
  describe('Settings Page Integration', () => {
    it('should have branding tab in Settings', () => {
      const content = fs.readFileSync(
        path.join(__dirname, '../client/src/pages/admin/Settings.tsx'),
        'utf-8'
      );
      expect(content).toContain("id: 'branding'");
      expect(content).toContain('Palette');
    });

    it('should have color picker inputs for 3 brand colors', () => {
      const content = fs.readFileSync(
        path.join(__dirname, '../client/src/pages/admin/Settings.tsx'),
        'utf-8'
      );
      expect(content).toContain('brandPrimaryColor');
      expect(content).toContain('brandSecondaryColor');
      expect(content).toContain('brandAccentColor');
    });

    it('should have preset buttons', () => {
      const content = fs.readFileSync(
        path.join(__dirname, '../client/src/pages/admin/Settings.tsx'),
        'utf-8'
      );
      expect(content).toContain("'default', 'warm', 'cool', 'nature', 'elegant', 'vivid'");
    });

    it('should include branding in handleSave settings object', () => {
      const content = fs.readFileSync(
        path.join(__dirname, '../client/src/pages/admin/Settings.tsx'),
        'utf-8'
      );
      expect(content).toContain('branding: {');
      expect(content).toContain('primaryColor: formData.brandPrimaryColor');
      expect(content).toContain('secondaryColor: formData.brandSecondaryColor');
      expect(content).toContain('accentColor: formData.brandAccentColor');
    });
  });

  // Translation keys test
  describe('Translation Keys', () => {
    it('should have branding translation keys in all languages', () => {
      const content = fs.readFileSync(
        path.join(__dirname, '../shared/i18n/translations.ts'),
        'utf-8'
      );
      
      const requiredKeys = [
        'settings.branding',
        'settings.brandingDescription',
        'settings.brandPrimaryColor',
        'settings.brandSecondaryColor',
        'settings.brandAccentColor',
        'settings.brandPreview',
        'settings.brandReset',
        'settings.brandPresets',
      ];

      requiredKeys.forEach(key => {
        // Count occurrences - should be 5 (one per language)
        const matches = content.match(new RegExp(`'${key.replace('.', '\\.')}':`, 'g'));
        expect(matches?.length).toBe(5);
      });
    });

    it('should have preset name translations in all languages', () => {
      const content = fs.readFileSync(
        path.join(__dirname, '../shared/i18n/translations.ts'),
        'utf-8'
      );
      
      const presetKeys = [
        'settings.brandPresetDefault',
        'settings.brandPresetWarm',
        'settings.brandPresetCool',
        'settings.brandPresetNature',
        'settings.brandPresetElegant',
        'settings.brandPresetVivid',
      ];

      presetKeys.forEach(key => {
        const matches = content.match(new RegExp(`'${key.replace('.', '\\.')}':`, 'g'));
        expect(matches?.length).toBe(5);
      });
    });
  });
});
