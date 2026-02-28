import Stripe from "stripe";
import { eq, sql, and } from "drizzle-orm";
import { getDb } from "./db";
import { stores, smsTransactions, type Store } from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";

// Stripe初期化
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-12-15.clover",
});

// SMS料金設定（円）
export const SMS_COST_PER_MESSAGE = 20; // 顧客への請求額
export const SMS_ACTUAL_COST = 15; // Twilioへの実費（参考）
export const SMS_MARGIN = 5; // マージン

// 低残高通知のデフォルト閾値（円）— 自動チャージ設定がない場合に使用
export const LOW_BALANCE_DEFAULT_THRESHOLD = 1000;

// 低残高通知の最小送信間隔（ミリ秒）— 同じ店舗への重複通知を防止
const LOW_BALANCE_NOTIFY_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6時間

// チャージプラン
export const CHARGE_PLANS = [
  { id: "plan_3000", amount: 3000, label: "3,000円（約150通）" },
  { id: "plan_5000", amount: 5000, label: "5,000円（約250通）" },
  { id: "plan_10000", amount: 10000, label: "10,000円（約500通）" },
  { id: "plan_30000", amount: 30000, label: "30,000円（約1,500通）" },
];

/**
 * Stripe Checkoutセッションを作成
 */
export async function createCheckoutSession(params: {
  storeId: number;
  storeName: string;
  amount: number;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}): Promise<{ sessionId: string; url: string }> {
  const { storeId, storeName, amount, successUrl, cancelUrl, customerEmail } = params;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "jpy",
          product_data: {
            name: "SMS通知チャージ",
            description: `${storeName} - SMS残高チャージ`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: customerEmail,
    allow_promotion_codes: true,
    metadata: {
      store_id: storeId.toString(),
      store_name: storeName,
      charge_amount: amount.toString(),
      type: "sms_charge",
    },
  });

  if (!session.url) {
    throw new Error("Failed to create checkout session URL");
  }

  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Webhook: checkout.session.completed を処理
 */
export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // メタデータから店舗IDと金額を取得
  const storeId = parseInt(session.metadata?.store_id || "0", 10);
  const chargeAmount = parseInt(session.metadata?.charge_amount || "0", 10);

  if (!storeId || !chargeAmount) {
    console.error("[Stripe] Invalid metadata in checkout session:", session.metadata);
    return;
  }

  // 店舗を取得
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) {
    console.error("[Stripe] Store not found:", storeId);
    return;
  }

  // 残高を更新
  const newBalance = store.smsBalance + chargeAmount;
  await db
    .update(stores)
    .set({ smsBalance: newBalance })
    .where(eq(stores.id, storeId));

  // 取引履歴を記録
  await db.insert(smsTransactions).values({
    storeId,
    type: "charge",
    amount: chargeAmount,
    balanceAfter: newBalance,
    stripePaymentIntentId: session.payment_intent as string,
    stripeCheckoutSessionId: session.id,
    description: `SMS残高チャージ ${chargeAmount}円`,
  });

  console.log(`[Stripe] Charged ${chargeAmount} yen to store ${storeId}. New balance: ${newBalance}`);

  // オーナーに通知
  await notifyOwner({
    title: "SMS残高がチャージされました",
    content: `店舗「${store.name}」にSMS残高 ${chargeAmount.toLocaleString()}円 がチャージされました。\n現在の残高: ${newBalance.toLocaleString()}円`,
  });
}

/**
 * SMS送信時に残高から引き落とし
 * @returns 成功した場合はtrue、残高不足の場合はfalse
 */
export async function consumeSmsBalance(params: {
  storeId: number;
  ticketId: number;
  smsMessageSid?: string;
}): Promise<{ success: boolean; newBalance: number; reason?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, newBalance: 0, reason: "Database not available" };
  }

  const { storeId, ticketId, smsMessageSid } = params;

  // 店舗を取得
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) {
    return { success: false, newBalance: 0, reason: "Store not found" };
  }

  // 残高チェック
  if (store.smsBalance < SMS_COST_PER_MESSAGE) {
    // 残高不足時も低残高通知を送信（重複防止付き）
    await sendLowBalanceNotification(db, store, store.smsBalance);
    return { success: false, newBalance: store.smsBalance, reason: "Insufficient balance" };
  }

  // 残高を引き落とし
  const newBalance = store.smsBalance - SMS_COST_PER_MESSAGE;
  await db
    .update(stores)
    .set({ smsBalance: newBalance })
    .where(eq(stores.id, storeId));

  // 取引履歴を記録
  await db.insert(smsTransactions).values({
    storeId,
    type: "consume",
    amount: -SMS_COST_PER_MESSAGE,
    balanceAfter: newBalance,
    ticketId,
    smsMessageSid,
    description: `SMS送信 (チケット#${ticketId})`,
  });

  // 残高アラート + 自動チャージチェック
  const autoCharge = store.settings?.smsAutoCharge;
  const threshold = autoCharge?.thresholdBalance ?? LOW_BALANCE_DEFAULT_THRESHOLD;
  const autoChargeAmount = autoCharge?.chargeAmount ?? 0;

  if (autoCharge?.enabled && threshold > 0 && autoChargeAmount > 0 && newBalance <= threshold) {
    // 自動チャージをトリガー（非同期で実行、失敗してもSMS送信自体はブロックしない）
    triggerAutoCharge(storeId, store.name, autoChargeAmount).catch((err: unknown) => {
      console.error(`[AutoCharge] Failed for store ${storeId}:`, err);
    });
  } else if (newBalance <= threshold) {
    // 自動チャージ未設定時は低残高通知を送信（重複防止付き）
    await sendLowBalanceNotification(db, store, newBalance);
  }

  return { success: true, newBalance };
}

/**
 * 低残高通知を送信（重複防止付き）
 * - lastLowBalanceNotifiedAt をチェックし、クールダウン期間内ならスキップ
 * - 通知内容にチャージページへのリンクを含める
 */
export async function sendLowBalanceNotification(
  db: any,
  store: Store,
  currentBalance: number
): Promise<void> {
  // 重複通知防止: クールダウン期間内ならスキップ
  if (store.lastLowBalanceNotifiedAt) {
    const elapsed = Date.now() - new Date(store.lastLowBalanceNotifiedAt).getTime();
    if (elapsed < LOW_BALANCE_NOTIFY_COOLDOWN_MS) {
      console.log(`[LowBalance] Skipping notification for store ${store.id}: cooldown active (${Math.round(elapsed / 60000)}min elapsed)`);
      return;
    }
  }

  // 通知タイムスタンプを更新
  await db
    .update(stores)
    .set({ lastLowBalanceNotifiedAt: new Date() })
    .where(eq(stores.id, store.id));

  const settingsUrl = `${process.env.VITE_FRONTEND_FORGE_API_URL || ''}/admin/settings?tab=notifications`;
  const autoCharge = store.settings?.smsAutoCharge;

  if (currentBalance <= 0) {
    await notifyOwner({
      title: `⚠️ SMS残高がなくなりました`,
      content: [
        `店舗「${store.name}」のSMS残高が ${currentBalance.toLocaleString()}円 になりました。`,
        `SMS通知は送信できません。今すぐチャージしてください。`,
        ``,
        `チャージページ: ${settingsUrl}`,
        autoCharge?.enabled ? '' : `\n※ 自動チャージを設定すると、残高不足を防止できます。`,
      ].filter(Boolean).join('\n'),
    });
  } else {
    const threshold = autoCharge?.thresholdBalance ?? LOW_BALANCE_DEFAULT_THRESHOLD;
    const remainingMessages = Math.floor(currentBalance / SMS_COST_PER_MESSAGE);
    await notifyOwner({
      title: `SMS残高が少なくなっています`,
      content: [
        `店舗「${store.name}」のSMS残高が ${currentBalance.toLocaleString()}円 です（閾値: ${threshold.toLocaleString()}円）。`,
        `残り約 ${remainingMessages} 通分のSMSを送信できます。`,
        ``,
        `チャージページ: ${settingsUrl}`,
        autoCharge?.enabled ? '' : `\n※ 自動チャージを設定すると、閾値を下回った際に自動でチャージされます。`,
      ].filter(Boolean).join('\n'),
    });
  }

  console.log(`[LowBalance] Notification sent for store ${store.id}: balance=${currentBalance}`);
}

/**
 * 店舗のSMS残高を取得
 */
export async function getSmsBalance(storeId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const [store] = await db.select({ smsBalance: stores.smsBalance }).from(stores).where(eq(stores.id, storeId)).limit(1);
  return store?.smsBalance || 0;
}

/**
 * SMS取引履歴を取得
 */
export async function getSmsTransactions(storeId: number, limit = 50, offset = 0, type?: 'charge' | 'consume' | 'refund') {
  const db = await getDb();
  if (!db) return { transactions: [], total: 0 };

  // 'send' フィルターは 'consume' に変換（UIでは「送信」と表示）
  const whereCondition = type
    ? and(eq(smsTransactions.storeId, storeId), eq(smsTransactions.type, type))
    : eq(smsTransactions.storeId, storeId);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(smsTransactions)
    .where(whereCondition);

  const transactions = await db
    .select()
    .from(smsTransactions)
    .where(whereCondition)
    .orderBy(sql`${smsTransactions.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  return { transactions, total: Number(countResult?.count ?? 0) };
}

/**
 * Webhook: invoice.paid を処理
 * サブスクリプションの支払い成功時にSMS残高をチャージする
 */
export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // メタデータからstore_idを取得（サブスクリプションのmetadataまたはinvoiceのmetadata）
  const subscriptionMetadata = invoice.parent?.subscription_details?.metadata;
  const storeId = parseInt(
    subscriptionMetadata?.store_id ||
    invoice.metadata?.store_id ||
    "0",
    10
  );

  if (!storeId) {
    console.log("[Stripe] invoice.paid: No store_id in metadata, skipping. Invoice:", invoice.id);
    return;
  }

  // 支払い金額を取得（Stripeは最小通貨単位で返すが、JPYは1円=1単位）
  const amountPaid = invoice.amount_paid;
  if (!amountPaid || amountPaid <= 0) {
    console.log(`[Stripe] invoice.paid: Zero or negative amount for invoice ${invoice.id}, skipping.`);
    return;
  }

  // 店舗を取得
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) {
    console.error("[Stripe] invoice.paid: Store not found:", storeId);
    return;
  }

  // payment_intentのIDを取得（新APIではpayments配列内にpayment_intentがある）
  let paymentIntentId: string | null = null;
  const firstPayment = invoice.payments?.data?.[0];
  if (firstPayment?.payment?.payment_intent) {
    const pi = firstPayment.payment.payment_intent;
    paymentIntentId = typeof pi === 'string' ? pi : pi.id;
  }

  // 重複処理防止: 同じpayment_intent IDで既にチャージ済みか確認
  if (paymentIntentId) {
    const existingTx = await db
      .select()
      .from(smsTransactions)
      .where(eq(smsTransactions.stripePaymentIntentId, paymentIntentId))
      .limit(1);

    if (existingTx.length > 0) {
      console.log(`[Stripe] invoice.paid: Already processed payment_intent ${paymentIntentId}, skipping.`);
      return;
    }
  }

  // 残高を更新
  const newBalance = store.smsBalance + amountPaid;
  await db
    .update(stores)
    .set({ smsBalance: newBalance })
    .where(eq(stores.id, storeId));

  // 取引履歴を記録
  await db.insert(smsTransactions).values({
    storeId,
    type: "charge",
    amount: amountPaid,
    balanceAfter: newBalance,
    stripePaymentIntentId: paymentIntentId || invoice.id,
    description: `サブスクリプション支払い ${amountPaid.toLocaleString()}円 (Invoice: ${invoice.id})`,
  });

  console.log(`[Stripe] invoice.paid: Charged ${amountPaid} yen to store ${storeId}. New balance: ${newBalance}`);

  // オーナーに通知
  await notifyOwner({
    title: "サブスクリプション支払いが完了しました",
    content: `店舗「${store.name}」のサブスクリプション支払い ${amountPaid.toLocaleString()}円 が完了しました。\nSMS残高に ${amountPaid.toLocaleString()}円 がチャージされました。\n現在の残高: ${newBalance.toLocaleString()}円`,
  });
}

/**
 * 自動チャージをトリガー
 * SMS残高が閾値を下回ったときに呼び出される
 * Stripe Checkoutセッションを作成し、オーナーに通知する
 */
export async function triggerAutoCharge(
  storeId: number,
  storeName: string,
  chargeAmount: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // 重複防止: 過去1時間以内に自動チャージが実行されていないか確認
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentAutoCharge = await db
    .select()
    .from(smsTransactions)
    .where(
      sql`${smsTransactions.storeId} = ${storeId} AND ${smsTransactions.type} = 'charge' AND ${smsTransactions.description} LIKE '%自動チャージ%' AND ${smsTransactions.createdAt} > ${oneHourAgo}`
    )
    .limit(1);

  if (recentAutoCharge.length > 0) {
    console.log(`[AutoCharge] Skipping: auto-charge already triggered within the last hour for store ${storeId}`);
    return;
  }

  try {
    // Stripe Checkoutセッションを作成（オーナーが支払いを完了する必要がある）
    const session = await createCheckoutSession({
      storeId,
      storeName,
      amount: chargeAmount,
      successUrl: `${process.env.VITE_FRONTEND_FORGE_API_URL || ''}/admin/settings?tab=notifications&charge=success`,
      cancelUrl: `${process.env.VITE_FRONTEND_FORGE_API_URL || ''}/admin/settings?tab=notifications&charge=canceled`,
    });

    // オーナーに通知
    await notifyOwner({
      title: "自動チャージ: SMS残高が閾値を下回りました",
      content: `店舗「${storeName}」のSMS残高が設定した閾値を下回りました。\n自動チャージ金額: ${chargeAmount.toLocaleString()}円\n以下のリンクから支払いを完了してください:\n${session.url}`,
    });

    console.log(`[AutoCharge] Triggered for store ${storeId}: ${chargeAmount} yen. Checkout URL: ${session.url}`);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[AutoCharge] Failed to create checkout session for store ${storeId}:`, errMsg);
    
    // 失敗時もオーナーに通知
    await notifyOwner({
      title: "自動チャージに失敗しました",
      content: `店舗「${storeName}」の自動チャージに失敗しました。\n手動でチャージしてください。\nエラー: ${errMsg}`,
    });
  }
}

/**
 * Webhookの署名を検証
 */
export function constructWebhookEvent(
  payload: Buffer,
  signature: string,
  webhookSecret: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * SMS分析データを取得（日別・週別・月別の集計）
 */
export async function getSmsAnalytics(
  storeId: number,
  period: 'daily' | 'weekly' | 'monthly' = 'daily',
  days = 30
): Promise<{
  dataPoints: Array<{
    date: string;
    sendCount: number;
    chargeCount: number;
    sendCost: number;
    chargeAmount: number;
  }>;
  summary: {
    totalSendCount: number;
    totalChargeCount: number;
    totalSendCost: number;
    totalChargeAmount: number;
    avgDailySendCount: number;
    avgDailySendCost: number;
  };
}> {
  const db = await getDb();
  if (!db) return { dataPoints: [], summary: { totalSendCount: 0, totalChargeCount: 0, totalSendCost: 0, totalChargeAmount: 0, avgDailySendCount: 0, avgDailySendCost: 0 } };

  // 期間に応じた日数を設定
  const lookbackDays = period === 'monthly' ? Math.max(days, 365) : period === 'weekly' ? Math.max(days, 90) : days;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);

  // 生データを取得（日別集計）
  const rawData = await db
    .select({
      date: sql<string>`DATE(${smsTransactions.createdAt})`,
      type: smsTransactions.type,
      count: sql<number>`COUNT(*)`,
      totalAmount: sql<number>`SUM(ABS(${smsTransactions.amount}))`,
    })
    .from(smsTransactions)
    .where(
      and(
        eq(smsTransactions.storeId, storeId),
        sql`${smsTransactions.createdAt} >= ${startDate}`
      )
    )
    .groupBy(sql`DATE(${smsTransactions.createdAt})`, smsTransactions.type)
    .orderBy(sql`DATE(${smsTransactions.createdAt}) ASC`);

  // 日別データをマップに変換
  const dailyMap = new Map<string, { sendCount: number; chargeCount: number; sendCost: number; chargeAmount: number }>();

  for (const row of rawData) {
    const dateStr = String(row.date);
    if (!dailyMap.has(dateStr)) {
      dailyMap.set(dateStr, { sendCount: 0, chargeCount: 0, sendCost: 0, chargeAmount: 0 });
    }
    const entry = dailyMap.get(dateStr)!;
    const count = Number(row.count);
    const amount = Number(row.totalAmount);

    if (row.type === 'consume') {
      entry.sendCount += count;
      entry.sendCost += amount;
    } else if (row.type === 'charge') {
      entry.chargeCount += count;
      entry.chargeAmount += amount;
    }
  }

  // 期間に応じてグループ化
  let dataPoints: Array<{ date: string; sendCount: number; chargeCount: number; sendCost: number; chargeAmount: number }>;

  if (period === 'daily') {
    // 日別: 欠損日も埋める
    dataPoints = [];
    const cursor = new Date(startDate);
    const today = new Date();
    while (cursor <= today) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const entry = dailyMap.get(dateStr) || { sendCount: 0, chargeCount: 0, sendCost: 0, chargeAmount: 0 };
      dataPoints.push({ date: dateStr, ...entry });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (period === 'weekly') {
    // 週別: ISO週番号でグループ化
    const weeklyMap = new Map<string, { sendCount: number; chargeCount: number; sendCost: number; chargeAmount: number }>();
    Array.from(dailyMap.entries()).forEach(([dateStr, entry]) => {
      const d = new Date(dateStr);
      // 週の開始日（月曜日）を計算
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(d);
      weekStart.setDate(diff);
      const weekKey = weekStart.toISOString().slice(0, 10);

      if (!weeklyMap.has(weekKey)) {
        weeklyMap.set(weekKey, { sendCount: 0, chargeCount: 0, sendCost: 0, chargeAmount: 0 });
      }
      const weekEntry = weeklyMap.get(weekKey)!;
      weekEntry.sendCount += entry.sendCount;
      weekEntry.chargeCount += entry.chargeCount;
      weekEntry.sendCost += entry.sendCost;
      weekEntry.chargeAmount += entry.chargeAmount;
    });
    dataPoints = Array.from(weeklyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entry]) => ({ date, ...entry }));
  } else {
    // 月別: YYYY-MMでグループ化
    const monthlyMap = new Map<string, { sendCount: number; chargeCount: number; sendCost: number; chargeAmount: number }>();
    Array.from(dailyMap.entries()).forEach(([dateStr, entry]) => {
      const monthKey = dateStr.slice(0, 7);
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, { sendCount: 0, chargeCount: 0, sendCost: 0, chargeAmount: 0 });
      }
      const monthEntry = monthlyMap.get(monthKey)!;
      monthEntry.sendCount += entry.sendCount;
      monthEntry.chargeCount += entry.chargeCount;
      monthEntry.sendCost += entry.sendCost;
      monthEntry.chargeAmount += entry.chargeAmount;
    });
    dataPoints = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entry]) => ({ date, ...entry }));
  }

  // サマリー計算
  const totalSendCount = dataPoints.reduce((sum, d) => sum + d.sendCount, 0);
  const totalChargeCount = dataPoints.reduce((sum, d) => sum + d.chargeCount, 0);
  const totalSendCost = dataPoints.reduce((sum, d) => sum + d.sendCost, 0);
  const totalChargeAmount = dataPoints.reduce((sum, d) => sum + d.chargeAmount, 0);
  const activeDays = dataPoints.filter(d => d.sendCount > 0).length || 1;

  return {
    dataPoints,
    summary: {
      totalSendCount,
      totalChargeCount,
      totalSendCost,
      totalChargeAmount,
      avgDailySendCount: Math.round((totalSendCount / activeDays) * 10) / 10,
      avgDailySendCost: Math.round((totalSendCost / activeDays) * 10) / 10,
    },
  };
}

export { stripe };
