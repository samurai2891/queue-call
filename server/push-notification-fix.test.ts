import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Push Notification Fix Verification', () => {
  
  describe('CRITICAL-1: Service Worker strategy (injectManifest)', () => {
    it('vite.config.ts should use injectManifest strategy', () => {
      const configPath = path.resolve(__dirname, '../vite.config.ts');
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain("strategies: 'injectManifest'");
    });

    it('vite.config.ts should point to client/src/sw.ts', () => {
      const configPath = path.resolve(__dirname, '../vite.config.ts');
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain("srcDir: 'src'");
      expect(content).toContain("filename: 'sw.ts'");
    });

    it('custom service worker should exist at client/src/sw.ts', () => {
      const swPath = path.resolve(__dirname, '../client/src/sw.ts');
      expect(fs.existsSync(swPath)).toBe(true);
    });

    it('custom service worker should have push event listener', () => {
      const swPath = path.resolve(__dirname, '../client/src/sw.ts');
      const content = fs.readFileSync(swPath, 'utf-8');
      expect(content).toContain("self.addEventListener('push'");
    });

    it('custom service worker should have notificationclick event listener', () => {
      const swPath = path.resolve(__dirname, '../client/src/sw.ts');
      const content = fs.readFileSync(swPath, 'utf-8');
      expect(content).toContain("self.addEventListener('notificationclick'");
    });

    it('custom service worker should include workbox precache', () => {
      const swPath = path.resolve(__dirname, '../client/src/sw.ts');
      const content = fs.readFileSync(swPath, 'utf-8');
      expect(content).toContain('precacheAndRoute');
      expect(content).toContain('self.__WB_MANIFEST');
    });

    it('custom service worker should include skipWaiting and clientsClaim', () => {
      const swPath = path.resolve(__dirname, '../client/src/sw.ts');
      const content = fs.readFileSync(swPath, 'utf-8');
      expect(content).toContain('self.skipWaiting()');
      expect(content).toContain('clientsClaim()');
    });

    it('old sw.js should NOT exist in client/public', () => {
      const oldSwPath = path.resolve(__dirname, '../client/public/sw.js');
      expect(fs.existsSync(oldSwPath)).toBe(false);
    });

    it('main.tsx should NOT manually register service worker', () => {
      const mainPath = path.resolve(__dirname, '../client/src/main.tsx');
      const content = fs.readFileSync(mainPath, 'utf-8');
      expect(content).not.toContain("navigator.serviceWorker.register");
    });
  });

  describe('CRITICAL-2: VAPID public key fetching', () => {
    it('usePushNotification should accept getVapidPublicKey option', () => {
      const hookPath = path.resolve(__dirname, '../client/src/hooks/usePushNotification.ts');
      const content = fs.readFileSync(hookPath, 'utf-8');
      expect(content).toContain('getVapidPublicKey');
    });

    it('usePushNotification should call getVapidPublicKey before falling back to env', () => {
      const hookPath = path.resolve(__dirname, '../client/src/hooks/usePushNotification.ts');
      const content = fs.readFileSync(hookPath, 'utf-8');
      // Should try API first
      expect(content).toContain('if (getVapidPublicKey)');
      expect(content).toContain('vapidPublicKey = await getVapidPublicKey()');
      // Then fallback to env
      expect(content).toContain('import.meta.env.VITE_VAPID_PUBLIC_KEY');
    });

    it('Notifications.tsx should use VITE_VAPID_PUBLIC_KEY env var instead of API endpoint', () => {
      const notifPath = path.resolve(__dirname, '../client/src/pages/store/Notifications.tsx');
      const content = fs.readFileSync(notifPath, 'utf-8');
      // getVapidPublicKey callback still passed to usePushNotification
      expect(content).toContain('getVapidPublicKey');
      // But it uses env var instead of API fetch for security
      expect(content).toContain('VITE_VAPID_PUBLIC_KEY');
      // Should NOT use the removed API endpoint
      expect(content).not.toContain('trpcUtils.system.getVapidPublicKey.fetch');
    });
  });

  describe('HIGH-4: Wait time alert URL', () => {
    it('sendWaitTimeAlert should include url in push data', () => {
      const notifPath = path.resolve(__dirname, './notifications.ts');
      const content = fs.readFileSync(notifPath, 'utf-8');
      // Find the sendWaitTimeAlert function and check it has url in data
      const funcStart = content.indexOf('export async function sendWaitTimeAlert');
      const funcEnd = content.indexOf('return result;', funcStart);
      const funcBody = content.substring(funcStart, funcEnd);
      expect(funcBody).toContain("url: ticketUrl || '/'");
    });
  });

  describe('Service Worker push handler correctness', () => {
    it('push handler should extract nested data correctly', () => {
      const swPath = path.resolve(__dirname, '../client/src/sw.ts');
      const content = fs.readFileSync(swPath, 'utf-8');
      expect(content).toContain('const nestedData = data.data || {}');
      expect(content).toContain("nestedData.url || data.url || '/'");
    });

    it('push handler should set requireInteraction to true', () => {
      const swPath = path.resolve(__dirname, '../client/src/sw.ts');
      const content = fs.readFileSync(swPath, 'utf-8');
      expect(content).toContain('requireInteraction: true');
    });

    it('notificationclick handler should open correct URL', () => {
      const swPath = path.resolve(__dirname, '../client/src/sw.ts');
      const content = fs.readFileSync(swPath, 'utf-8');
      expect(content).toContain("event.notification.data?.url || '/'");
      expect(content).toContain('self.clients.openWindow');
    });

    it('push handler should include vibrate pattern', () => {
      const swPath = path.resolve(__dirname, '../client/src/sw.ts');
      const content = fs.readFileSync(swPath, 'utf-8');
      expect(content).toContain('vibrate: [200, 100, 200]');
    });
  });

  describe('Workbox configuration', () => {
    it('should include cleanupOutdatedCaches', () => {
      const swPath = path.resolve(__dirname, '../client/src/sw.ts');
      const content = fs.readFileSync(swPath, 'utf-8');
      expect(content).toContain('cleanupOutdatedCaches');
    });

    it('vite.config.ts should not have old workbox runtimeCaching config', () => {
      const configPath = path.resolve(__dirname, '../vite.config.ts');
      const content = fs.readFileSync(configPath, 'utf-8');
      // With injectManifest, caching is handled in the SW itself, not in config
      expect(content).not.toContain('runtimeCaching');
    });
  });
});
