import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { stores, tickets } from "../../drizzle/schema";
import { expireTicketsBeforeDayKey, getCalledTicket, getDb, getStoreDayKey, getWaitingCount } from "../db";
import { broadcastQueueUpdate } from "../sse";

const ACTIVE_TICKET_STATUSES = ["WAITING", "CALLED", "ARRIVED"] as const;

type ActiveTicketStatus = (typeof ACTIVE_TICKET_STATUSES)[number];

export async function runDailyResetJob() {
  const db = await getDb();
  if (!db) {
    console.warn("[DailyReset] Database not available");
    return;
  }

  try {
    const allStores = await db.select().from(stores);
    const now = new Date();

    for (const store of allStores) {
      const dayKey = getStoreDayKey(store, now);
      const dayKeyChanged = store.dayKey !== dayKey;

      const pendingResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .where(
          and(
            eq(tickets.storeId, store.id),
            lt(tickets.dayKey, dayKey),
            inArray(tickets.status, ACTIVE_TICKET_STATUSES as unknown as ActiveTicketStatus[])
          )
        );

      const pendingCount = pendingResult[0]?.count || 0;

      if (dayKeyChanged) {
        await db
          .update(stores)
          .set({ dayKey, currentNumber: 0, updatedAt: now })
          .where(eq(stores.id, store.id));
        console.info("[DailyReset] Updated day key", {
          storeId: store.id,
          storeSlug: store.slug,
          dayKey,
        });
      }

      if (pendingCount > 0) {
        await expireTicketsBeforeDayKey(store.id, dayKey, now);
        console.info("[DailyReset] Expired tickets", {
          storeId: store.id,
          storeSlug: store.slug,
          expiredCount: pendingCount,
          dayKey,
        });
      }

      if (dayKeyChanged || pendingCount > 0) {
        const waitingCount = await getWaitingCount(store.id);
        const calledTicket = await getCalledTicket(store.id);
        broadcastQueueUpdate(store.id, {
          currentNumber: calledTicket?.number || 0,
          waitingCount,
        });
      }
    }
  } catch (error) {
    console.error("[DailyReset] Job failed:", error);
  }
}

export function startDailyResetJob(intervalSeconds: number = 300) {
  console.log(`[DailyReset] Starting job with interval: ${intervalSeconds}s`);

  runDailyResetJob();

  const intervalId = setInterval(() => {
    runDailyResetJob();
  }, intervalSeconds * 1000);

  return intervalId;
}
