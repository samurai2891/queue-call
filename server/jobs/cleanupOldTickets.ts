import { and, lt, inArray, eq } from "drizzle-orm";
import { getDb } from "../db";
import { tickets, pushSubscriptions, smsSubscriptions, queueAuditLogs } from "../../drizzle/schema";

/** Default retention period: 90 days */
const DEFAULT_RETENTION_DAYS = 90;

/** Terminal statuses eligible for cleanup */
const TERMINAL_STATUSES = ["DONE", "CANCELED", "SKIPPED", "EXPIRED"] as const;

/** Maximum tickets to delete per batch to avoid long-running transactions */
const BATCH_SIZE = 500;

export interface CleanupResult {
  deletedTickets: number;
  deletedPushSubscriptions: number;
  deletedSmsSubscriptions: number;
  deletedAuditLogs: number;
}

/**
 * 古いチケットデータの自動削除ジョブ
 * 
 * 指定日数以上経過した終了済み（DONE/CANCELED/SKIPPED/EXPIRED）チケットと
 * 関連するpushSubscriptions, smsSubscriptions, queueAuditLogsを削除する。
 * 
 * バッチ処理で大量データも安全に削除。
 */
export async function runCleanupOldTicketsJob(
  retentionDays: number = DEFAULT_RETENTION_DAYS
): Promise<CleanupResult> {
  const db = await getDb();
  if (!db) {
    console.warn("[CleanupOldTickets] Database not available");
    return { deletedTickets: 0, deletedPushSubscriptions: 0, deletedSmsSubscriptions: 0, deletedAuditLogs: 0 };
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  let totalDeletedTickets = 0;
  let totalDeletedPush = 0;
  let totalDeletedSms = 0;
  let totalDeletedAuditLogs = 0;

  try {
    // バッチ処理ループ
    while (true) {
      // 削除対象のチケットIDをバッチ取得
      const oldTickets = await db
        .select({ id: tickets.id })
        .from(tickets)
        .where(
          and(
            inArray(tickets.status, [...TERMINAL_STATUSES]),
            lt(tickets.createdAt, cutoffDate)
          )
        )
        .limit(BATCH_SIZE);

      if (oldTickets.length === 0) {
        break; // 削除対象なし
      }

      const ticketIds = oldTickets.map((t) => t.id);

      // 1. 関連するpushSubscriptionsを削除
      const pushResult = await db
        .delete(pushSubscriptions)
        .where(inArray(pushSubscriptions.ticketId, ticketIds));
      const deletedPush = (pushResult as any)[0]?.affectedRows ?? 0;
      totalDeletedPush += deletedPush;

      // 2. 関連するsmsSubscriptionsを削除
      const smsResult = await db
        .delete(smsSubscriptions)
        .where(inArray(smsSubscriptions.ticketId, ticketIds));
      const deletedSms = (smsResult as any)[0]?.affectedRows ?? 0;
      totalDeletedSms += deletedSms;

      // 3. 関連するqueueAuditLogsを削除
      const auditResult = await db
        .delete(queueAuditLogs)
        .where(inArray(queueAuditLogs.ticketId, ticketIds));
      const deletedAudit = (auditResult as any)[0]?.affectedRows ?? 0;
      totalDeletedAuditLogs += deletedAudit;

      // 4. チケット本体を削除
      const ticketResult = await db
        .delete(tickets)
        .where(inArray(tickets.id, ticketIds));
      const deletedTickets = (ticketResult as any)[0]?.affectedRows ?? 0;
      totalDeletedTickets += deletedTickets;

      console.log(
        `[CleanupOldTickets] Batch deleted: ${deletedTickets} tickets, ${deletedPush} push, ${deletedSms} sms, ${deletedAudit} audit logs`
      );

      // バッチサイズ未満なら全件処理完了
      if (oldTickets.length < BATCH_SIZE) {
        break;
      }
    }

    if (totalDeletedTickets > 0) {
      console.log(
        `[CleanupOldTickets] Total cleanup: ${totalDeletedTickets} tickets, ` +
        `${totalDeletedPush} push subscriptions, ${totalDeletedSms} sms subscriptions, ` +
        `${totalDeletedAuditLogs} audit logs (cutoff: ${cutoffDate.toISOString()})`
      );
    } else {
      console.log("[CleanupOldTickets] No old tickets to clean up");
    }
  } catch (error) {
    console.error("[CleanupOldTickets] Job failed:", error);
  }

  return {
    deletedTickets: totalDeletedTickets,
    deletedPushSubscriptions: totalDeletedPush,
    deletedSmsSubscriptions: totalDeletedSms,
    deletedAuditLogs: totalDeletedAuditLogs,
  };
}

/**
 * 古いチケット削除ジョブを定期実行（デフォルト: 24時間ごと）
 * @param intervalSeconds 実行間隔（秒）
 * @param retentionDays 保持日数（デフォルト: 90日）
 */
export function startCleanupOldTicketsJob(
  intervalSeconds: number = 24 * 60 * 60,
  retentionDays: number = DEFAULT_RETENTION_DAYS
) {
  console.log(
    `[CleanupOldTickets] Starting job: interval=${intervalSeconds}s, retention=${retentionDays} days`
  );

  // 初回実行（起動から5分後に実行して、起動時の負荷を避ける）
  setTimeout(() => {
    runCleanupOldTicketsJob(retentionDays);
  }, 5 * 60 * 1000);

  // 定期実行
  const intervalId = setInterval(() => {
    runCleanupOldTicketsJob(retentionDays);
  }, intervalSeconds * 1000);

  return intervalId;
}
