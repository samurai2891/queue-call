import { sql } from "drizzle-orm";
import { getDb, getAdminVapidStoreStats } from "./db";
import { getVapidStatus } from "./vapid";

export async function getAdminSystemVapidStatus({
  includeTest,
}: {
  includeTest: boolean;
}) {
  const vapidStatus = getVapidStatus();
  const storeStats = await getAdminVapidStoreStats({ includeTest });

  const source =
    vapidStatus.configured && storeStats.hasMatchingConfiguredStore
      ? "store_settings"
      : vapidStatus.configured
        ? "env"
        : storeStats.storesWithKeys > 0
          ? "store_settings"
          : "none";

  return {
    configured: vapidStatus.configured,
    publicKeyPresent: Boolean(vapidStatus.publicKey),
    hasPrivateKey: vapidStatus.hasPrivateKey,
    storesWithKeys: storeStats.storesWithKeys,
    totalStores: storeStats.totalStores,
    source,
  };
}

export async function getAdminSystemHealth() {
  const checkedAt = new Date().toISOString();
  const databaseUrlConfigured = Boolean(process.env.DATABASE_URL);

  if (!databaseUrlConfigured) {
    return {
      databaseUrlConfigured,
      dbConnected: false,
      queryOk: false,
      latencyMs: null as number | null,
      checkedAt,
    };
  }

  const startedAt = Date.now();
  const db = await getDb();
  if (!db) {
    return {
      databaseUrlConfigured,
      dbConnected: false,
      queryOk: false,
      latencyMs: null as number | null,
      checkedAt,
    };
  }

  try {
    await db.execute(sql`SELECT 1`);
    return {
      databaseUrlConfigured,
      dbConnected: true,
      queryOk: true,
      latencyMs: Date.now() - startedAt,
      checkedAt,
    };
  } catch {
    return {
      databaseUrlConfigured,
      dbConnected: true,
      queryOk: false,
      latencyMs: Date.now() - startedAt,
      checkedAt,
    };
  }
}
