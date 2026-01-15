import { deleteSmsLogsBefore } from "../db";

export async function runCleanupSmsLogsJob() {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 6);

  try {
    await deleteSmsLogsBefore(cutoffDate);
  } catch (error) {
    console.error("[SmsLogs] Cleanup failed:", error);
  }
}

export function startCleanupSmsLogsJob(intervalSeconds: number = 24 * 60 * 60) {
  runCleanupSmsLogsJob();

  const intervalId = setInterval(() => {
    runCleanupSmsLogsJob();
  }, intervalSeconds * 1000);

  return intervalId;
}
