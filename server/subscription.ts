import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { stores, type Store } from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";

// Stripe初期化
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-12-15.clover",
});

// ==================== プラン定義 ====================
export type PlanId = "free" | "standard" | "pro";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  nameJa: string;
  priceMonthly: number; // 月額（税抜、円）
  priceMonthlyTax: number; // 月額（税込、円）
  monthlyTicketLimit: number | null; // null = 無制限
  features: {
    smsEnabled: boolean;
    reservationEnabled: boolean;
    menuLimit: number | null; // null = 無制限
    brandingLevel: "basic" | "custom_color" | "full";
    analyticsDays: number;
    csvExport: boolean;
    businessHoursEnabled: boolean;
    staffLimit: number | null; // null = 無制限
    supportLevel: "community" | "email" | "priority_email";
  };
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    nameJa: "フリー",
    priceMonthly: 0,
    priceMonthlyTax: 0,
    monthlyTicketLimit: 50,
    features: {
      smsEnabled: false,
      reservationEnabled: false,
      menuLimit: 5,
      brandingLevel: "basic",
      analyticsDays: 1,
      csvExport: false,
      businessHoursEnabled: false,
      staffLimit: 1,
      supportLevel: "community",
    },
  },
  standard: {
    id: "standard",
    name: "Standard",
    nameJa: "スタンダード",
    priceMonthly: 1500,
    priceMonthlyTax: 1650,
    monthlyTicketLimit: null,
    features: {
      smsEnabled: true,
      reservationEnabled: true,
      menuLimit: null,
      brandingLevel: "custom_color",
      analyticsDays: 30,
      csvExport: false,
      businessHoursEnabled: true,
      staffLimit: 3,
      supportLevel: "email",
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    nameJa: "プロ",
    priceMonthly: 3500,
    priceMonthlyTax: 3850,
    monthlyTicketLimit: null,
    features: {
      smsEnabled: true,
      reservationEnabled: true,
      menuLimit: null,
      brandingLevel: "full",
      analyticsDays: 90,
      csvExport: true,
      businessHoursEnabled: true,
      staffLimit: null,
      supportLevel: "priority_email",
    },
  },
};

// Stripe Price IDs（Stripeダッシュボードで作成後に設定）
// 動的にStripe上で作成するため、ここではプロダクト情報のみ定義
const STRIPE_PRODUCT_CONFIG = {
  standard: {
    name: "Queue Call Standard プラン",
    description: "月額1,500円（税込1,650円）- 無制限の順番待ち、SMS通知、予約機能",
    priceAmount: 1650, // 税込（円）
  },
  pro: {
    name: "Queue Call Pro プラン",
    description: "月額3,500円（税込3,850円）- 全機能、フルカスタムブランディング、90日分析",
    priceAmount: 3850, // 税込（円）
  },
};

// ==================== Stripe Product/Price管理 ====================

// キャッシュ: Stripe Price IDs
let cachedPriceIds: Record<string, string> = {};

/**
 * Stripe上でProduct/Priceを取得または作成
 */
async function ensureStripePrice(planId: "standard" | "pro"): Promise<string> {
  // キャッシュチェック
  if (cachedPriceIds[planId]) {
    return cachedPriceIds[planId];
  }

  const config = STRIPE_PRODUCT_CONFIG[planId];
  const lookupKey = `queue_call_${planId}_monthly`;

  // 既存のPriceをlookup_keyで検索
  const existingPrices = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });

  if (existingPrices.data.length > 0) {
    cachedPriceIds[planId] = existingPrices.data[0].id;
    return cachedPriceIds[planId];
  }

  // Productを作成
  const product = await stripe.products.create({
    name: config.name,
    description: config.description,
    metadata: {
      plan_id: planId,
      app: "queue_call",
    },
  });

  // Priceを作成
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: config.priceAmount,
    currency: "jpy",
    recurring: {
      interval: "month",
    },
    lookup_key: lookupKey,
    metadata: {
      plan_id: planId,
    },
  });

  cachedPriceIds[planId] = price.id;
  return price.id;
}

// ==================== Checkout Session ====================

/**
 * サブスクリプション用のStripe Checkout Sessionを作成
 */
export async function createSubscriptionCheckout(params: {
  storeId: number;
  storeName: string;
  planId: "standard" | "pro";
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  stripeCustomerId?: string;
}): Promise<{ sessionId: string; url: string }> {
  const { storeId, storeName, planId, successUrl, cancelUrl, customerEmail, stripeCustomerId } = params;

  const priceId = await ensureStripePrice(planId);

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    metadata: {
      store_id: storeId.toString(),
      store_name: storeName,
      plan_id: planId,
      type: "subscription",
    },
    subscription_data: {
      metadata: {
        store_id: storeId.toString(),
        store_name: storeName,
        plan_id: planId,
      },
    },
  };

  // 既存のStripe顧客がいればそれを使う
  if (stripeCustomerId) {
    sessionParams.customer = stripeCustomerId;
  } else if (customerEmail) {
    sessionParams.customer_email = customerEmail;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  if (!session.url) {
    throw new Error("Failed to create subscription checkout session URL");
  }

  return {
    sessionId: session.id,
    url: session.url,
  };
}

// ==================== Webhook Handlers ====================

/**
 * checkout.session.completed (subscription) を処理
 */
export async function handleSubscriptionCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const storeId = parseInt(session.metadata?.store_id || "0", 10);
  const planId = session.metadata?.plan_id as PlanId | undefined;

  if (!storeId || !planId || !PLANS[planId]) {
    console.log("[Subscription] Invalid metadata in checkout session:", session.metadata);
    return;
  }

  // Stripe顧客IDを保存
  const customerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id;

  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : (session.subscription as any)?.id;

  if (customerId) {
    await db
      .update(stores)
      .set({ stripeCustomerId: customerId })
      .where(eq(stores.id, storeId));
  }

  // サブスクリプション情報を取得して保存
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await updateStoreSubscription(storeId, subscription, planId);
  }

  // 店舗名を取得
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  const storeName = store?.name || session.metadata?.store_name || "不明";

  console.log(`[Subscription] Store ${storeId} subscribed to ${planId} plan`);

  await notifyOwner({
    title: `サブスクリプション開始: ${PLANS[planId].nameJa}プラン`,
    content: `店舗「${storeName}」が${PLANS[planId].nameJa}プラン（月額${PLANS[planId].priceMonthlyTax.toLocaleString()}円）に加入しました。`,
  });
}

/**
 * customer.subscription.updated を処理
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const storeId = parseInt(subscription.metadata?.store_id || "0", 10);
  const planId = subscription.metadata?.plan_id as PlanId | undefined;

  if (!storeId) {
    console.log("[Subscription] No store_id in subscription metadata:", subscription.id);
    return;
  }

  await updateStoreSubscription(storeId, subscription, planId);
  console.log(`[Subscription] Updated subscription for store ${storeId}: status=${subscription.status}`);
}

/**
 * customer.subscription.deleted を処理
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const storeId = parseInt(subscription.metadata?.store_id || "0", 10);

  if (!storeId) {
    console.log("[Subscription] No store_id in subscription metadata:", subscription.id);
    return;
  }

  // Freeプランにダウングレード
  await db
    .update(stores)
    .set({
      subscriptionPlan: "free",
      stripeSubscriptionId: null,
      subscriptionStatus: "canceled",
      subscriptionCurrentPeriodEnd: null,
    })
    .where(eq(stores.id, storeId));

  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  const storeName = store?.name || "不明";

  console.log(`[Subscription] Store ${storeId} subscription canceled, downgraded to free`);

  await notifyOwner({
    title: "サブスクリプションが解約されました",
    content: `店舗「${storeName}」のサブスクリプションが解約されました。フリープランに移行しました。`,
  });
}

// ==================== サブスクリプション管理 ====================

/**
 * 店舗のサブスクリプション情報をDBに反映
 */
async function updateStoreSubscription(
  storeId: number,
  subscription: Stripe.Subscription,
  planId?: PlanId
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // planIdがmetadataになければ、Price metadataから取得
  let resolvedPlanId = planId;
  if (!resolvedPlanId) {
    const item = subscription.items.data[0];
    if (item?.price?.metadata?.plan_id) {
      resolvedPlanId = item.price.metadata.plan_id as PlanId;
    }
  }

  const updateData: Partial<Store> = {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
  };

  if (resolvedPlanId && PLANS[resolvedPlanId]) {
    // activeまたはtrialing状態のみプランを更新
    if (subscription.status === "active" || subscription.status === "trialing") {
      updateData.subscriptionPlan = resolvedPlanId;
    }
  }

  // 現在の期間終了日を保存
  const periodEnd = (subscription as any).current_period_end;
  if (periodEnd) {
    updateData.subscriptionCurrentPeriodEnd = new Date(periodEnd * 1000);
  }

  await db
    .update(stores)
    .set(updateData)
    .where(eq(stores.id, storeId));
}

/**
 * サブスクリプションを解約（期間終了時に停止）
 */
export async function cancelSubscription(storeId: number): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) return { success: false, message: "Database not available" };

  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return { success: false, message: "Store not found" };

  if (!store.stripeSubscriptionId) {
    return { success: false, message: "No active subscription" };
  }

  try {
    // 期間終了時にキャンセル（即時キャンセルではない）
    await stripe.subscriptions.update(store.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await db
      .update(stores)
      .set({ subscriptionStatus: "cancel_at_period_end" })
      .where(eq(stores.id, storeId));

    console.log(`[Subscription] Store ${storeId} subscription set to cancel at period end`);

    return { success: true, message: "サブスクリプションは現在の請求期間終了時に解約されます" };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Subscription] Failed to cancel subscription for store ${storeId}:`, errMsg);
    return { success: false, message: errMsg };
  }
}

/**
 * サブスクリプション解約の取り消し（cancel_at_period_end を解除）
 */
export async function reactivateSubscription(storeId: number): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) return { success: false, message: "Database not available" };

  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return { success: false, message: "Store not found" };

  if (!store.stripeSubscriptionId) {
    return { success: false, message: "No active subscription" };
  }

  try {
    await stripe.subscriptions.update(store.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    await db
      .update(stores)
      .set({ subscriptionStatus: "active" })
      .where(eq(stores.id, storeId));

    return { success: true, message: "サブスクリプションの解約が取り消されました" };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { success: false, message: errMsg };
  }
}

/**
 * プランを変更（アップグレード/ダウングレード）
 */
export async function changeSubscriptionPlan(
  storeId: number,
  newPlanId: "standard" | "pro"
): Promise<{ success: boolean; message: string; previousPlan?: string }> {
  const db = await getDb();
  if (!db) return { success: false, message: "Database not available" };

  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return { success: false, message: "Store not found" };

  const previousPlan = store.subscriptionPlan || 'free';

  if (!store.stripeSubscriptionId) {
    return { success: false, message: "No active subscription to change" };
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(store.stripeSubscriptionId);
    const currentItem = subscription.items.data[0];

    if (!currentItem) {
      return { success: false, message: "No subscription items found" };
    }

    const newPriceId = await ensureStripePrice(newPlanId);

    // プランを変更（日割り計算で即時適用）
    await stripe.subscriptions.update(store.stripeSubscriptionId, {
      items: [
        {
          id: currentItem.id,
          price: newPriceId,
        },
      ],
      metadata: {
        ...subscription.metadata,
        plan_id: newPlanId,
      },
      proration_behavior: "create_prorations",
    });

    await db
      .update(stores)
      .set({
        subscriptionPlan: newPlanId,
      })
      .where(eq(stores.id, storeId));

    console.log(`[Subscription] Store ${storeId} plan changed to ${newPlanId}`);

    return { success: true, message: `${PLANS[newPlanId].nameJa}プランに変更しました`, previousPlan };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { success: false, message: errMsg };
  }
}

/**
 * 店舗のサブスクリプション情報を取得
 */
export async function getSubscriptionInfo(storeId: number): Promise<{
  plan: PlanDefinition;
  status: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  monthlyTicketCount: number;
  monthlyTicketLimit: number | null;
} | null> {
  const db = await getDb();
  if (!db) return null;

  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return null;

  const plan = PLANS[store.subscriptionPlan as PlanId] || PLANS.free;

  return {
    plan,
    status: store.subscriptionStatus,
    currentPeriodEnd: store.subscriptionCurrentPeriodEnd,
    cancelAtPeriodEnd: store.subscriptionStatus === "cancel_at_period_end",
    monthlyTicketCount: store.monthlyTicketCount || 0,
    monthlyTicketLimit: plan.monthlyTicketLimit,
  };
}

// ==================== 月間チケット制限 ====================

const FREE_MONTHLY_TICKET_LIMIT = 50;

/**
 * 月間チケット発行数をチェックし、制限内であればカウントを増やす
 * @returns { allowed: true } or { allowed: false, reason, limit, current }
 */
export async function checkAndIncrementMonthlyTicket(storeId: number): Promise<{
  allowed: boolean;
  reason?: string;
  limit?: number;
  current?: number;
}> {
  const db = await getDb();
  if (!db) return { allowed: false, reason: "Database not available" };

  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return { allowed: false, reason: "Store not found" };

  const plan = PLANS[store.subscriptionPlan as PlanId] || PLANS.free;

  // 有料プランは無制限
  if (plan.monthlyTicketLimit === null) {
    return { allowed: true };
  }

  // 月間リセットチェック
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  let currentCount = store.monthlyTicketCount;

  if (store.monthlyTicketResetDate !== currentMonth) {
    // 新しい月: カウンターをリセット
    currentCount = 0;
    await db
      .update(stores)
      .set({
        monthlyTicketCount: 0,
        monthlyTicketResetDate: currentMonth,
      })
      .where(eq(stores.id, storeId));
  }

  // 制限チェック
  if (currentCount >= plan.monthlyTicketLimit) {
    return {
      allowed: false,
      reason: `月間チケット上限（${plan.monthlyTicketLimit}人）に達しました。有料プランにアップグレードすると無制限にご利用いただけます。`,
      limit: plan.monthlyTicketLimit,
      current: currentCount,
    };
  }

  // カウント増加
  await db
    .update(stores)
    .set({ monthlyTicketCount: currentCount + 1 })
    .where(eq(stores.id, storeId));

  return { allowed: true };
}

/**
 * テスト用: キャッシュをリセット
 */
export function resetPriceCache(): void {
  cachedPriceIds = {};
}

export { stripe as subscriptionStripe, STRIPE_PRODUCT_CONFIG, FREE_MONTHLY_TICKET_LIMIT };
