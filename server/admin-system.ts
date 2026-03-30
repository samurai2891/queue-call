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
    publicKeyPresent: vapidStatus.configured,
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

export async function getAdminTwilioBalance() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return {
      available: false,
      currency: null,
      balance: null,
      formattedBalance: "Unavailable",
      error: "Twilio credentials are not configured",
    };
  }

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Balance.json`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    if (!response.ok) {
      return {
        available: false,
        currency: null,
        balance: null,
        formattedBalance: "Unavailable",
        error: `Twilio balance request failed with status ${response.status}`,
      };
    }

    const result = (await response.json()) as {
      balance?: string | null;
      currency?: string | null;
    };
    const currency = result.currency?.toUpperCase() ?? null;
    const balance = result.balance ?? null;

    return {
      available: balance !== null,
      currency,
      balance,
      formattedBalance:
        balance !== null ? `${currency ?? "BAL"} ${balance}` : "Unavailable",
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      currency: null,
      balance: null,
      formattedBalance: "Unavailable",
      error: error instanceof Error ? error.message : "Unknown Twilio error",
    };
  }
}
