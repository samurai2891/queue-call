import { getDb } from "../db";
import { stores } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import * as db from "../db";
import { sendWaitTimeAlert } from "../notifications";

/**
 * 待ち時間アラートジョブ
 * 予測待ち時間が設定した閾値以下になった整理券に通知を送信
 */
export async function runWaitAlertJob() {
  const database = await getDb();
  if (!database) {
    console.warn("[WaitAlert] Database not available");
    return;
  }

  try {
    // アクティブな店舗を取得
    const activeStores = await database
      .select({ id: stores.id, name: stores.name, slug: stores.slug })
      .from(stores)
      .where(eq(stores.intakeStatus, "open"));

    for (const store of activeStores) {
      await processStoreWaitAlerts(store);
    }
  } catch (error) {
    console.error("[WaitAlert] Job failed:", error);
  }
}

async function processStoreWaitAlerts(store: { id: number; name: string; slug: string }) {
  try {
    // 平均処理時間を取得
    const avgServiceTime = await db.getAverageServiceTimeMinutes(store.id);
    if (avgServiceTime === null) {
      // データ不足の場合はスキップ
      return;
    }

    // アラート対象のチケットを取得
    const alertTickets = await db.getTicketsForWaitAlert(store.id);

    for (const ticket of alertTickets) {
      // 予測待ち時間を計算
      const estimatedWaitMinutes = Math.round(ticket.groupsAhead * avgServiceTime);

      // 閾値以下の場合に通知
      if (estimatedWaitMinutes <= ticket.waitAlertMinutes) {
        const sent = await sendWaitTimeAlert(
          ticket.id,
          store.id,
          store.name,
          ticket.number,
          estimatedWaitMinutes,
          { storeSlug: store.slug }
        );

        if (sent) {
          // 送信済みとしてマーク
          await db.markWaitAlertSent(ticket.id);
          console.log(`[WaitAlert] Alert sent for ticket #${ticket.number}`, {
            storeSlug: store.slug,
            ticketId: ticket.id,
            estimatedWaitMinutes,
            alertThreshold: ticket.waitAlertMinutes,
          });
        }
      }
    }
  } catch (error) {
    console.error(`[WaitAlert] Error processing store ${store.slug}:`, error);
  }
}

/**
 * 待ち時間アラートジョブを開始
 * @param intervalSeconds 実行間隔（秒）、デフォルト60秒
 */
export function startWaitAlertJob(intervalSeconds: number = 60) {
  console.log(`[WaitAlert] Starting job with interval: ${intervalSeconds}s`);

  // 初回実行
  runWaitAlertJob();

  // 定期実行
  const intervalId = setInterval(() => {
    runWaitAlertJob();
  }, intervalSeconds * 1000);

  return intervalId;
}
