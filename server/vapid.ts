import webPush from 'web-push';
import { getDb } from './db';
import { stores } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

// Generate new VAPID keys
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const keys = webPush.generateVAPIDKeys();
  return {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  };
}

/**
 * Save VAPID keys to the store's settings in DB
 * This allows VAPID keys to persist without manual env var configuration
 */
export async function saveVapidKeysToStore(
  storeId: number,
  keys: { publicKey: string; privateKey: string }
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return false;

  const settings = store.settings || {};
  settings.vapid = {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  };

  await db
    .update(stores)
    .set({ settings })
    .where(eq(stores.id, storeId));

  // Also set process.env so they take effect immediately without restart
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VITE_VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;

  // Configure web-push with new keys
  try {
    webPush.setVapidDetails(
      'mailto:noreply@queue-call.app',
      keys.publicKey,
      keys.privateKey
    );
  } catch (e) {
    console.error('[VAPID] Failed to set VAPID details after save:', e);
  }

  console.log(`[VAPID] Keys saved to store ${storeId} settings and applied to process.env`);
  return true;
}

/**
 * Load VAPID keys from DB (store settings) if env vars are not set
 * Called at server startup to auto-configure VAPID
 */
export async function loadVapidKeysFromDb(): Promise<boolean> {
  // If env vars are already set, use them
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return true;
  }

  const db = await getDb();
  if (!db) return false;

  // Find the first store with VAPID keys in settings
  const storeList = await db.select().from(stores).limit(10);
  for (const store of storeList) {
    const vapid = store.settings?.vapid;
    if (vapid?.publicKey && vapid?.privateKey) {
      process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
      process.env.VITE_VAPID_PUBLIC_KEY = vapid.publicKey;
      process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

      try {
        webPush.setVapidDetails(
          'mailto:noreply@queue-call.app',
          vapid.publicKey,
          vapid.privateKey
        );
        console.log(`[VAPID] Keys loaded from store ${store.id} settings`);
        return true;
      } catch (e) {
        console.error('[VAPID] Failed to set VAPID details from DB:', e);
      }
    }
  }

  return false;
}

// Check if VAPID keys are configured (from env or DB)
export function getVapidStatus(): {
  configured: boolean;
  publicKey: string | null;
  hasPrivateKey: boolean;
} {
  const publicKey = process.env.VAPID_PUBLIC_KEY || null;
  const privateKey = process.env.VAPID_PRIVATE_KEY || null;
  
  return {
    configured: !!(publicKey && privateKey),
    publicKey,
    hasPrivateKey: !!privateKey,
  };
}

// Get the frontend VAPID public key
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || null;
}
