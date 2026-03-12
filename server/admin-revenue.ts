import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { stores } from "../drizzle/schema";
import { getDb } from "./db";
import { subscriptionStripe } from "./subscription";

type AdminRecentPaymentsInput = {
  days: 30 | 90 | 365;
  includeTest: boolean;
  limit?: number;
};

type AdminChurnRateInput = {
  days: 30 | 90 | 365;
  includeTest: boolean;
};

const getStartUnix = (days: number) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  return Math.floor(start.getTime() / 1000);
};

const toIsoString = (value: number | Date | string | null | undefined) => {
  if (!value) return new Date(0).toISOString();
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
};

const ensureStripeConfigured = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "STRIPE_SECRET_KEY is not configured",
    });
  }
};

const resolveInvoiceStoreId = (invoice: any): number | null => {
  const invoiceStoreId = invoice?.metadata?.store_id;
  const parentStoreId =
    invoice?.parent?.subscription_details?.metadata?.store_id ?? null;
  const rawStoreId = parentStoreId || invoiceStoreId;
  const storeId = rawStoreId ? Number.parseInt(rawStoreId, 10) : 0;
  return Number.isFinite(storeId) && storeId > 0 ? storeId : null;
};

const resolveSubscriptionStoreId = (subscription: any): number | null => {
  const rawStoreId = subscription?.metadata?.store_id ?? null;
  const storeId = rawStoreId ? Number.parseInt(rawStoreId, 10) : 0;
  return Number.isFinite(storeId) && storeId > 0 ? storeId : null;
};

const resolveSubscriptionPlanId = (subscription: any): "standard" | "pro" | null => {
  const metadataPlanId = subscription?.metadata?.plan_id;
  if (metadataPlanId === "standard" || metadataPlanId === "pro") {
    return metadataPlanId;
  }

  const itemPlanId = subscription?.items?.data?.[0]?.price?.metadata?.plan_id;
  if (itemPlanId === "standard" || itemPlanId === "pro") {
    return itemPlanId;
  }

  return null;
};

export async function getAdminRecentPayments({
  days,
  includeTest,
  limit = 20,
}: AdminRecentPaymentsInput) {
  ensureStripeConfigured();
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  }

  const storeCache = new Map<number, { id: number; name: string; isTest: boolean } | null>();
  const getStore = async (storeId: number) => {
    if (storeCache.has(storeId)) {
      return storeCache.get(storeId) ?? null;
    }

    const [store] = await db
      .select({
        id: stores.id,
        name: stores.name,
        isTest: stores.isTest,
      })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    const resolved = store ?? null;
    storeCache.set(storeId, resolved);
    return resolved;
  };

  const results: Array<{
    invoiceId: string;
    storeId: number;
    storeName: string;
    customerId: string | null;
    subscriptionId: string | null;
    amountPaid: number;
    currency: string;
    status: string | null;
    paidAt: string;
    hostedInvoiceUrl: string | null;
  }> = [];

  for await (const invoice of subscriptionStripe.invoices.list({
    created: { gte: getStartUnix(days) },
    limit: 100,
  })) {
    const stripeInvoice = invoice as any;

    if (!stripeInvoice.paid || stripeInvoice.amount_paid <= 0 || !stripeInvoice.subscription) {
      continue;
    }

    const storeId = resolveInvoiceStoreId(stripeInvoice);
    if (!storeId) {
      continue;
    }

    const store = await getStore(storeId);
    if (!store || (!includeTest && store.isTest)) {
      continue;
    }

    results.push({
      invoiceId: stripeInvoice.id,
      storeId: store.id,
      storeName: store.name,
      customerId:
        typeof stripeInvoice.customer === "string"
          ? stripeInvoice.customer
          : stripeInvoice.customer?.id ?? null,
      subscriptionId:
        typeof stripeInvoice.subscription === "string"
          ? stripeInvoice.subscription
          : stripeInvoice.subscription?.id ?? null,
      amountPaid: Number(stripeInvoice.amount_paid ?? 0),
      currency: String(stripeInvoice.currency ?? "").toUpperCase(),
      status: stripeInvoice.status ?? null,
      paidAt: toIsoString(stripeInvoice.status_transitions?.paid_at ?? stripeInvoice.created),
      hostedInvoiceUrl: stripeInvoice.hosted_invoice_url ?? null,
    });

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

export async function getAdminChurnRate({
  days,
  includeTest,
}: AdminChurnRateInput) {
  ensureStripeConfigured();
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  }

  const startUnix = getStartUnix(days);
  const storeCache = new Map<number, { id: number; isTest: boolean } | null>();
  const getStore = async (storeId: number) => {
    if (storeCache.has(storeId)) {
      return storeCache.get(storeId) ?? null;
    }

    const [store] = await db
      .select({
        id: stores.id,
        isTest: stores.isTest,
      })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    const resolved = store ?? null;
    storeCache.set(storeId, resolved);
    return resolved;
  };

  let canceledCount = 0;
  let activeStartCount = 0;

  for await (const subscription of subscriptionStripe.subscriptions.list({
    status: "all",
    limit: 100,
  })) {
    const storeId = resolveSubscriptionStoreId(subscription);
    const planId = resolveSubscriptionPlanId(subscription);
    if (!storeId || !planId) {
      continue;
    }

    const store = await getStore(storeId);
    if (!store || (!includeTest && store.isTest)) {
      continue;
    }

    const createdAt = Number(subscription.created ?? 0);
    const canceledAt = Number(subscription.canceled_at ?? 0);

    if (createdAt < startUnix && (!canceledAt || canceledAt >= startUnix)) {
      activeStartCount += 1;
    }

    if (canceledAt && canceledAt >= startUnix) {
      canceledCount += 1;
    }
  }

  return {
    canceledCount,
    activeStartCount,
    rate: activeStartCount > 0 ? canceledCount / activeStartCount : 0,
  };
}
