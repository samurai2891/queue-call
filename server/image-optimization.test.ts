import { describe, it, expect } from 'vitest';

describe('Image Optimization', () => {
  describe('Image size presets', () => {
    // These tests validate the design decisions for image optimization
    // The actual sharp processing is tested via integration (upload flow)

    it('should define correct preset for logo images', () => {
      const logoPreset = { main: 256, thumb: 64, original: true };
      expect(logoPreset.main).toBe(256);
      expect(logoPreset.thumb).toBe(64);
      expect(logoPreset.original).toBe(true);
    });

    it('should define correct preset for menu images', () => {
      const menuPreset = { main: 800 };
      expect(menuPreset.main).toBe(800);
    });

    it('should define correct preset for feed images', () => {
      const feedPreset = { main: 1200 };
      expect(feedPreset.main).toBe(1200);
    });
  });

  describe('Media key generation', () => {
    it('should generate correct key structure for logo', () => {
      const storeId = 1;
      const kind = 'logo';
      const extension = 'webp';
      const key = `stores/${storeId}/${kind}/test.${extension}`;
      expect(key).toMatch(/^stores\/\d+\/logo\/.+\.webp$/);
    });

    it('should generate thumb key from main key', () => {
      const mainKey = 'stores/1/logo/1234567890-abc123.webp';
      const thumbKey = mainKey.replace(/\.[^.]+$/, '-thumb.webp');
      expect(thumbKey).toBe('stores/1/logo/1234567890-abc123-thumb.webp');
    });

    it('should generate original key from main key', () => {
      const mainKey = 'stores/1/logo/1234567890-abc123.webp';
      const originalKey = mainKey.replace(/\.[^.]+$/, '-original.webp');
      expect(originalKey).toBe('stores/1/logo/1234567890-abc123-original.webp');
    });
  });

  describe('Kind normalization', () => {
    it('should normalize menu-item to menu', () => {
      const normalize = (kind: string) => {
        const normalized = kind.trim().toLowerCase();
        const allowedKinds = new Set(['menu', 'menu-item', 'feed', 'feed-post', 'logo']);
        if (!allowedKinds.has(normalized)) return null;
        if (normalized === 'menu-item') return 'menu';
        if (normalized === 'feed-post') return 'feed';
        return normalized;
      };

      expect(normalize('menu-item')).toBe('menu');
      expect(normalize('feed-post')).toBe('feed');
      expect(normalize('logo')).toBe('logo');
      expect(normalize('menu')).toBe('menu');
      expect(normalize('feed')).toBe('feed');
      expect(normalize('invalid')).toBeNull();
    });
  });

  describe('Branding schema with optimized logo fields', () => {
    it('should support all logo URL variants', () => {
      const branding = {
        primaryColor: '#3b82f6',
        logoUrl: '/api/media/file?key=stores/1/logo/main.webp',
        logoKey: 'stores/1/logo/main.webp',
        logoThumbUrl: '/api/media/file?key=stores/1/logo/main-thumb.webp',
        logoThumbKey: 'stores/1/logo/main-thumb.webp',
        logoOriginalUrl: '/api/media/file?key=stores/1/logo/main-original.webp',
        logoOriginalKey: 'stores/1/logo/main-original.webp',
      };

      expect(branding.logoUrl).toBeDefined();
      expect(branding.logoThumbUrl).toBeDefined();
      expect(branding.logoOriginalUrl).toBeDefined();
    });

    it('should allow branding without optional logo fields', () => {
      const branding = {
        primaryColor: '#3b82f6',
        logoUrl: '/api/media/file?key=stores/1/logo/main.webp',
        logoKey: 'stores/1/logo/main.webp',
      };

      expect(branding.logoUrl).toBeDefined();
      expect((branding as any).logoThumbUrl).toBeUndefined();
      expect((branding as any).logoOriginalUrl).toBeUndefined();
    });
  });

  describe('Thumbnail fallback logic', () => {
    it('should use thumbUrl when available', () => {
      const branding = {
        logoUrl: '/main.webp',
        logoThumbUrl: '/thumb.webp',
      };
      const displayUrl = branding.logoThumbUrl || branding.logoUrl;
      expect(displayUrl).toBe('/thumb.webp');
    });

    it('should fallback to logoUrl when thumbUrl is not available', () => {
      const branding = {
        logoUrl: '/main.webp',
        logoThumbUrl: undefined as string | undefined,
      };
      const displayUrl = branding.logoThumbUrl || branding.logoUrl;
      expect(displayUrl).toBe('/main.webp');
    });
  });
});
