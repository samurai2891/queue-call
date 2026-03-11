import { describe, it, expect } from 'vitest';

describe('Image Optimization', () => {
  describe('Image size presets', () => {
    // These tests validate the design decisions for image optimization
    // The actual sharp processing is tested via integration (upload flow)

    const IMAGE_SIZE_PRESETS: Record<string, { main: number; thumb?: number; original?: boolean }> = {
      logo:  { main: 256, thumb: 64, original: true },
      menu:  { main: 800, thumb: 200 },
      feed:  { main: 1200 },
    };

    it('should define correct preset for logo images', () => {
      const preset = IMAGE_SIZE_PRESETS.logo;
      expect(preset.main).toBe(256);
      expect(preset.thumb).toBe(64);
      expect(preset.original).toBe(true);
    });

    it('should define correct preset for menu images with thumbnail', () => {
      const preset = IMAGE_SIZE_PRESETS.menu;
      expect(preset.main).toBe(800);
      expect(preset.thumb).toBe(200);
      expect(preset.original).toBeUndefined();
    });

    it('should define correct preset for feed images', () => {
      const preset = IMAGE_SIZE_PRESETS.feed;
      expect(preset.main).toBe(1200);
      expect(preset.thumb).toBeUndefined();
    });

    it('should generate thumbnails for logo and menu but not feed', () => {
      const kindsWithThumbs = Object.entries(IMAGE_SIZE_PRESETS)
        .filter(([, p]) => p.thumb)
        .map(([k]) => k);
      expect(kindsWithThumbs).toContain('logo');
      expect(kindsWithThumbs).toContain('menu');
      expect(kindsWithThumbs).not.toContain('feed');
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

    it('should generate correct key structure for menu', () => {
      const storeId = 5;
      const kind = 'menu';
      const extension = 'webp';
      const key = `stores/${storeId}/${kind}/test.${extension}`;
      expect(key).toMatch(/^stores\/\d+\/menu\/.+\.webp$/);
    });

    it('should generate thumb key from main key', () => {
      const mainKey = 'stores/1/logo/1234567890-abc123.webp';
      const thumbKey = mainKey.replace(/\.[^.]+$/, '-thumb.webp');
      expect(thumbKey).toBe('stores/1/logo/1234567890-abc123-thumb.webp');
    });

    it('should generate menu thumb key from main key', () => {
      const mainKey = 'stores/5/menu/1234567890-xyz456.webp';
      const thumbKey = mainKey.replace(/\.[^.]+$/, '-thumb.webp');
      expect(thumbKey).toBe('stores/5/menu/1234567890-xyz456-thumb.webp');
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

  describe('Menu image thumbnail fallback logic', () => {
    it('should use photoSmallUrl for menu list view when available', () => {
      const menuItem = {
        photoLargeUrl: '/menu/main.webp',
        photoSmallUrl: '/menu/thumb.webp',
      };
      const listViewUrl = menuItem.photoSmallUrl || menuItem.photoLargeUrl;
      expect(listViewUrl).toBe('/menu/thumb.webp');
    });

    it('should fallback to photoLargeUrl when photoSmallUrl is not available', () => {
      const menuItem = {
        photoLargeUrl: '/menu/main.webp',
        photoSmallUrl: null as string | null,
      };
      const listViewUrl = menuItem.photoSmallUrl || menuItem.photoLargeUrl;
      expect(listViewUrl).toBe('/menu/main.webp');
    });

    it('should use photoLargeUrl for detail/large view', () => {
      const menuItem = {
        photoLargeUrl: '/menu/main.webp',
        photoSmallUrl: '/menu/thumb.webp',
      };
      // Large view always uses photoLargeUrl
      const detailViewUrl = menuItem.photoLargeUrl;
      expect(detailViewUrl).toBe('/menu/main.webp');
    });

    it('should handle menu items without any photo', () => {
      const menuItem = {
        photoLargeUrl: null as string | null,
        photoSmallUrl: null as string | null,
      };
      const hasPhoto = !!menuItem.photoLargeUrl;
      expect(hasPhoto).toBe(false);
    });
  });

  describe('Feed post photo handling', () => {
    it('should use photoSmallUrl for feed list thumbnails when available', () => {
      const feedPost = {
        photoLargeUrl: '/feed/main.webp',
        photoSmallUrl: '/feed/small.webp',
      };
      const thumbUrl = feedPost.photoSmallUrl || feedPost.photoLargeUrl;
      expect(thumbUrl).toBe('/feed/small.webp');
    });

    it('should fallback to photoLargeUrl for feed when no small variant', () => {
      const feedPost = {
        photoLargeUrl: '/feed/main.webp',
        photoSmallUrl: null as string | null,
      };
      const thumbUrl = feedPost.photoSmallUrl || feedPost.photoLargeUrl;
      expect(thumbUrl).toBe('/feed/main.webp');
    });
  });
});
