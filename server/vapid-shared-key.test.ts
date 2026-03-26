/**
 * FEAT-VAPID: 共通VAPIDキー方式の検証テスト
 * - 環境変数にVAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY が設定されているか確認
 * - キーのフォーマットが正しいか確認（Base64URL形式）
 */
import { describe, it, expect, beforeAll } from 'vitest';

describe('Shared VAPID Key Configuration', () => {
  it('VAPID_PUBLIC_KEY is set in environment', () => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    expect(publicKey, 'VAPID_PUBLIC_KEY must be set').toBeTruthy();
    expect(publicKey!.length).toBeGreaterThan(20);
  });

  it('VAPID_PRIVATE_KEY is set in environment', () => {
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    expect(privateKey, 'VAPID_PRIVATE_KEY must be set').toBeTruthy();
    expect(privateKey!.length).toBeGreaterThan(20);
  });

  it('VAPID_PUBLIC_KEY is valid Base64URL format (no + or /)', () => {
    const publicKey = process.env.VAPID_PUBLIC_KEY ?? '';
    // VAPID keys use Base64URL encoding (- and _ instead of + and /)
    expect(publicKey).not.toContain('+');
    expect(publicKey).not.toContain('/');
    // Should be ~88 chars for P-256 uncompressed public key
    expect(publicKey.length).toBeGreaterThanOrEqual(80);
  });

  it('VAPID_PRIVATE_KEY is valid Base64URL format', () => {
    const privateKey = process.env.VAPID_PRIVATE_KEY ?? '';
    expect(privateKey).not.toContain('+');
    expect(privateKey).not.toContain('/');
    expect(privateKey.length).toBeGreaterThanOrEqual(40);
  });

  it('web-push can be configured with the shared keys', async () => {
    const webPush = await import('web-push');
    const publicKey = process.env.VAPID_PUBLIC_KEY!;
    const privateKey = process.env.VAPID_PRIVATE_KEY!;
    // Should not throw
    expect(() => {
      webPush.default.setVapidDetails(
        'mailto:test@example.com',
        publicKey,
        privateKey
      );
    }).not.toThrow();
  });
});
