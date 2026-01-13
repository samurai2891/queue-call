import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { stores, smsTransactions } from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";

// Stripe初期化
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-12-15.clover",
});

// SMS料金設定（円）
export const SMS_COST_PER_MESSAGE = 20; // 顧客への請求額
export const SMS_ACTUAL_COST = 15; // Twilioへの実費（参考）
export const SMS_MARGIN = 5; // マージン

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
    // 残高不足アラート
    if (store.smsBalance <= 1000 && store.smsBalance > 0) {
      await notifyOwner({
        title: "SMS残高が少なくなっています",
        content: `店舗「${store.name}」のSMS残高が ${store.smsBalance.toLocaleString()}円 です。チャージをお願いします。`,
      });
    }
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

  // 残高アラート
  if (newBalance <= 1000 && newBalance > 0) {
    await notifyOwner({
      title: "SMS残高が少なくなっています",
      content: `店舗「${store.name}」のSMS残高が ${newBalance.toLocaleString()}円 です。チャージをお願いします。`,
    });
  } else if (newBalance <= 0) {
    await notifyOwner({
      title: "SMS残高がなくなりました",
      content: `店舗「${store.name}」のSMS残高が ${newBalance.toLocaleString()}円 になりました。SMS通知は送信されません。チャージをお願いします。`,
    });
  }

  return { success: true, newBalance };
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
export async function getSmsTransactions(storeId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];

  const transactions = await db
    .select()
    .from(smsTransactions)
    .where(eq(smsTransactions.storeId, storeId))
    .orderBy(sql`${smsTransactions.createdAt} DESC`)
    .limit(limit);

  return transactions;
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

export { stripe };
