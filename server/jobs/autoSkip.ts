import { eq, and, lt, or, isNull } from "drizzle-orm";
import { getDb, getCalledTicket, getWaitingCount } from "../db";
import { stores, tickets, queueAuditLogs } from "../../drizzle/schema";
import { broadcastQueueUpdate, broadcastTicketUpdate } from "../sse";

/**
 * 自動スキップジョブ
 * CALLED状態のチケットで猶予時間を超過したものを自動的にSKIPPEDにする
 */
export async function runAutoSkipJob() {
  const db = await getDb();
  if (!db) {
    console.warn("[AutoSkip] Database not available");
    return;
  }

  try {
    // 全店舗を取得
    const allStores = await db.select().from(stores);

    for (const store of allStores) {
      // 設定を確認
      const settings = typeof store.settings === "string" 
        ? JSON.parse(store.settings) 
        : store.settings;

      const autoSkipEnabled = settings?.queue?.autoSkip ?? true;
      const checkinGraceMinutes = settings?.queue?.checkinGraceMinutes ?? 5;

      if (!autoSkipEnabled) {
        continue; // この店舗は自動スキップ無効
      }

      const now = new Date();
      // 猶予時間を計算（現在時刻 - 猶予時間）
      const graceDeadline = new Date(now.getTime() - checkinGraceMinutes * 60 * 1000);

      // CALLED状態で期限超過したチケットを取得
      const expiredTickets = await db
        .select()
        .from(tickets)
        .where(
          and(
            eq(tickets.storeId, store.id),
            eq(tickets.status, "CALLED"),
            or(
              lt(tickets.checkinDeadlineAt, now),
              and(isNull(tickets.checkinDeadlineAt), lt(tickets.calledAt, graceDeadline))
            )
          )
        );

      if (expiredTickets.length === 0) {
        continue; // この店舗には期限切れチケットなし
      }

      console.log(
        `[AutoSkip] Store ${store.slug}: Found ${expiredTickets.length} expired ticket(s)`
      );

      // 各チケットをSKIPPEDに更新
      for (const ticket of expiredTickets) {
        await db
          .update(tickets)
          .set({
            status: "SKIPPED",
            updatedAt: new Date(),
          })
          .where(eq(tickets.id, ticket.id));

        // 監査ログに記録
        const auditLogEnabled = settings?.queue?.auditLog ?? false;
        if (auditLogEnabled) {
          await db.insert(queueAuditLogs).values({
            storeId: store.id,
            ticketId: ticket.id,
            action: "SKIP",
            reason: "auto_skipped_no_checkin",
            performedBy: "system",
          });
        }

        console.log(
          `[AutoSkip] Ticket #${ticket.number} (ID: ${ticket.id}) auto-skipped`
        );

        // SSEで通知
        broadcastTicketUpdate(store.id, ticket.ticketToken, {
          status: "SKIPPED",
          number: ticket.number,
        });
      }

      const waitingCount = await getWaitingCount(store.id);
      const calledTicket = await getCalledTicket(store.id);

      broadcastQueueUpdate(store.id, {
        currentNumber: calledTicket?.number || 0,
        waitingCount,
      });
    }
  } catch (error) {
    console.error("[AutoSkip] Job failed:", error);
  }
}

/**
 * 自動スキップジョブを定期実行
 * @param intervalSeconds 実行間隔（秒）
 */
export function startAutoSkipJob(intervalSeconds: number = 60) {
  console.log(`[AutoSkip] Starting job with interval: ${intervalSeconds}s`);

  // 初回実行
  runAutoSkipJob();

  // 定期実行
  const intervalId = setInterval(() => {
    runAutoSkipJob();
  }, intervalSeconds * 1000);

  return intervalId;
}
