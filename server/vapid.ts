/**
 * VAPID Key Management - Shared Service Key
 *
 * Uses a single VAPID key pair for the entire service (set via environment variables).
 * All stores share the same public key, so no per-store key generation is needed.
 * Store owners do NOT need to generate keys manually.
 */
import webPush from 'web-push';
import { getVapidSubject } from './notifications';

let vapidInitialized = false;

/**
 * Initialize web-push with the shared VAPID keys from environment variables.
 * Called once at server startup via loadVapidKeysFromDb (backward compat).
 */
async function initSharedVapidKeys(): Promise<boolean> {
  if (vapidInitialized) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    console.warn('[VAPID] VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is not set. Push notifications will be disabled.');
    return false;
  }

  try {
    const subject = await getVapidSubject();
    webPush.setVapidDetails(subject, publicKey, privateKey);
    vapidInitialized = true;
    console.log('[VAPID] Shared VAPID keys initialized from environment variables.');
    return true;
  } catch (e) {
    console.error('[VAPID] Failed to initialize shared VAPID keys:', e);
    return false;
  }
}

/**
 * Check if VAPID keys are configured (from environment variables).
 * Note: publicKey is intentionally NOT returned to avoid exposing it via API.
 */
export function getVapidStatus(): {
  configured: boolean;
  hasPrivateKey: boolean;
} {
  const publicKey = process.env.VAPID_PUBLIC_KEY || null;
  const privateKey = process.env.VAPID_PRIVATE_KEY || null;

  return {
    configured: !!(publicKey && privateKey),
    hasPrivateKey: !!privateKey,
  };
}

/**
 * @deprecated No longer needed. VAPID keys are now shared across all stores
 * and configured via environment variables (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).
 * Returns the current shared keys for display purposes only.
 */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  return { publicKey, privateKey };
}

/**
 * @deprecated No longer needed. VAPID keys are now managed via environment variables.
 * This function is kept as a no-op for backward compatibility.
 */
export async function saveVapidKeysToStore(
  _storeId: number,
  _keys: { publicKey: string; privateKey: string }
): Promise<boolean> {
  console.warn('[VAPID] saveVapidKeysToStore is deprecated. VAPID keys are now shared via environment variables.');
  return true;
}

/**
 * Load VAPID keys - now simply initializes from environment variables.
 * Kept for backward compatibility with server startup code.
 */
export async function loadVapidKeysFromDb(): Promise<boolean> {
  return initSharedVapidKeys();
}
