import { eq, and, lt } from "drizzle-orm";
import { getDb } from "../db";
import { stores, tickets, queueAuditLogs } from "../../drizzle/schema";
import { broadcastToStore } from "../sse";

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

      // 猶予時間を計算（現在時刻 - 猶予時間）
      const graceDeadline = new Date(Date.now() - checkinGraceMinutes * 60 * 1000);

      // CALLED状態で猶予時間を超過したチケットを取得
      const expiredTickets = await db
        .select()
        .from(tickets)
        .where(
          and(
            eq(tickets.storeId, store.id),
            eq(tickets.status, "CALLED"),
            lt(tickets.calledAt, graceDeadline)
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
        broadcastToStore(store.id, "staff", "ticket-update", {
          ticketToken: ticket.ticketToken,
          status: "SKIPPED",
          number: ticket.number,
        });
        broadcastToStore(store.id, "board", "queue-update", {
          currentNumber: store.currentNumber,
          waitingCount: 0, // Will be recalculated by the client
        });
      }
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
