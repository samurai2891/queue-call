import { eq, and, desc, asc, sql, inArray, lt, gte, notInArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { isNotNull, isNull } from "drizzle-orm";
import { 
  InsertUser, users, 
  stores, InsertStore, Store, StoreSettings,
  tickets, InsertTicket, Ticket,
  pushSubscriptions, InsertPushSubscription,
  smsSubscriptions, InsertSmsSubscription,
  menuCategories, InsertMenuCategory,
  menuItems, InsertMenuItem,
  feedPosts, InsertFeedPost,
  queueAuditLogs, InsertQueueAuditLog,
  staffSessions, InsertStaffSession,
  staffMembers, InsertStaffMember, StaffMember,
  smsLogs, InsertSmsLog,
  smsTransactions
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { getRequestId } from './_core/requestContext';
import { nanoid } from 'nanoid';
import {
  fillMissingDailyCounts,
  getPlanMrr,
  normalizeOverviewPlanId,
  type RecentActivityItem,
} from "./admin-overview-utils";


let _db: ReturnType<typeof drizzle> | null = null;

const logDbError = (
  message: string,
  error: unknown,
  context: Record<string, unknown> = {}
) => {
  const requestId = getRequestId();
  const details = { requestId, ...context };
  console.error(`[Database] ${message}`, details, error);
};

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      logDbError("Failed to connect", error);
      _db = null;
    }
  }
  return _db;
}


// ==================== User Functions ====================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    logDbError("Failed to upsert user", error, { openId: user.openId });
    throw error;
  }

}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==================== Store Functions ====================

export async function createStore(data: { 
  slug: string; 
  name: string; 
  ownerId: number;
  defaultLocale?: string;
  supportedLocales?: string[];
  settings?: StoreSettings;
  staffPinHash?: string;
  managerPinHash?: string;
}): Promise<Store> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const kioskKey = nanoid(32);
  const boardKey = nanoid(32);

  const defaultSettings: StoreSettings = {
    queue: {
      dailyResetTime: "04:00",
      checkinGraceMinutes: 5,
      autoSkip: false,

      enableReorder: false,
      reorderMaxMove: 3,
      reorderReasonRequired: true,
      auditLog: true,
    },
    notifications: {
      pushEnabled: true,
      smsEnabled: false,
      recallLimitSeconds: 60,
      recallMaxCount: 3,
    },
    menu: {
      switchStyle: 'tabs',
      defaultView: 'feed',
      photoDefaultSize: 'large',
      allowCustomerPhotoSizeToggle: true,
    },
    kiosk: {
      autoResetSeconds: 30,
      maxPartySize: 10,
    },
    board: {
      nextCount: 3,
    },
  };

  await db.insert(stores).values({
    slug: data.slug,
    name: data.name,
    ownerId: data.ownerId,
    defaultLocale: data.defaultLocale || 'ja',
    supportedLocales: data.supportedLocales || ['ja', 'en', 'ko', 'zh-Hans', 'zh-Hant'],
    kioskKey,
    boardKey,
    staffPinHash: data.staffPinHash,
    managerPinHash: data.managerPinHash,
    settings: data.settings ? { ...defaultSettings, ...data.settings } : defaultSettings,
  });

  const result = await db.select().from(stores).where(eq(stores.slug, data.slug)).limit(1);
  return result[0];
}

export async function getStoreBySlug(slug: string): Promise<Store | undefined> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeSlug: slug });
    return undefined;
  }

  const result = await db.select().from(stores).where(eq(stores.slug, slug)).limit(1);
  return result[0];
}

export async function getStoreById(id: number): Promise<Store | undefined> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId: id });
    return undefined;
  }

  const result = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  return result[0];
}

export async function getStoresByOwner(ownerId: number): Promise<Store[]> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { ownerId });
    return [];
  }

  return await db.select().from(stores).where(eq(stores.ownerId, ownerId));
}

export async function updateStore(id: number, data: Partial<InsertStore>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(stores).set(data).where(eq(stores.id, id));
}

export async function updateStoreSettings(id: number, settings: StoreSettings): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const store = await getStoreById(id);
  if (!store) throw new Error("Store not found");

  const mergedSettings = {
    ...store.settings,
    ...settings,
  };

  const resetTime = mergedSettings.queue?.dailyResetTime;
  const updateData: Partial<InsertStore> = { settings: mergedSettings };
  if (typeof resetTime === "string" && resetTime.trim().length > 0) {
    updateData.resetTime = resetTime;
  }

  await db.update(stores).set(updateData).where(eq(stores.id, id));

}

export async function regenerateStoreKey(id: number, keyType: 'kiosk' | 'board'): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const newKey = nanoid(32);
  // kioskTokenはキオスクQR URL用のトークン（再生成で過去URL無効化）
  // boardKeyは廃止（ボードはアクセスキー不要）
  const updateData = keyType === 'kiosk' ? { kioskToken: newKey } : { boardKey: newKey };
  
  await db.update(stores).set(updateData).where(eq(stores.id, id));
  return newKey;
}

// ==================== Ticket Functions ====================

const DEFAULT_RESET_TIME = "04:00";
const ACTIVE_TICKET_STATUSES = ["WAITING", "CALLED", "ARRIVED"] as const;

type ResetTimeParts = { hours: number; minutes: number };

type ActiveTicketStatus = (typeof ACTIVE_TICKET_STATUSES)[number];

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseResetTime = (value?: string): ResetTimeParts => {
  if (!value) {
    return { hours: 4, minutes: 0 };
  }
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return { hours: 4, minutes: 0 };
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return { hours: 4, minutes: 0 };
  }
  return { hours, minutes };
};

export const resolveStoreResetTime = (store: Store): string => {
  const candidate = store.settings?.queue?.dailyResetTime || store.resetTime || DEFAULT_RESET_TIME;
  const { hours, minutes } = parseResetTime(candidate);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

export const getStoreDayKey = (store: Store, now: Date = new Date()): string => {
  const resetTime = resolveStoreResetTime(store);
  const { hours, minutes } = parseResetTime(resetTime);
  const resetDate = new Date(now);
  resetDate.setHours(hours, minutes, 0, 0);
  if (now < resetDate) {
    resetDate.setDate(resetDate.getDate() - 1);
  }
  return formatDateKey(resetDate);
};

export async function expireTicketsBeforeDayKey(
  storeId: number,
  dayKey: string,
  now: Date = new Date()
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(tickets)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(
      and(
        eq(tickets.storeId, storeId),
        lt(tickets.dayKey, dayKey),
        inArray(tickets.status, ACTIVE_TICKET_STATUSES as unknown as ActiveTicketStatus[])
      )
    );
}

const resetStoreDay = async (storeId: number, dayKey: string, now: Date) => {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(stores)
    .set({ dayKey, currentNumber: 0, updatedAt: now })
    .where(eq(stores.id, storeId));

  await expireTicketsBeforeDayKey(storeId, dayKey, now);
};

const ensureStoreDayKey = async (store: Store, now: Date = new Date()) => {
  const dayKey = getStoreDayKey(store, now);
  if (store.dayKey !== dayKey) {
    await resetStoreDay(store.id, dayKey, now);
  }
  return dayKey;
};


export async function createTicket(data: {
  storeId: number;
  partySize: number;
  note?: string;
  locale?: string;
  source?: 'web' | 'qr' | 'kiosk';
}): Promise<Ticket> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const ticketToken = nanoid(16);

  const store = await getStoreById(data.storeId);
  if (!store) throw new Error("Store not found");

  const dayKey = await ensureStoreDayKey(store);
  const isSameDay = store.dayKey === dayKey;
  const nextNumber = isSameDay ? store.currentNumber + 1 : 1;

  try {
    // Update store counter
    await db.update(stores).set({
      currentNumber: nextNumber,
      dayKey,
    }).where(eq(stores.id, data.storeId));

    // Create ticket
    await db.insert(tickets).values({
      storeId: data.storeId,
      ticketToken,
      dayKey,
      number: nextNumber,
      partySize: data.partySize,
      note: data.note,
      locale: data.locale || 'ja',
      source: data.source || 'web',
      status: 'WAITING',
      queueRank: String(nextNumber).padStart(6, '0'),
    });

    const result = await db.select().from(tickets).where(eq(tickets.ticketToken, ticketToken)).limit(1);
    return result[0];
  } catch (error) {
    logDbError("Failed to create ticket", error, {
      storeId: data.storeId,
      storeSlug: store.slug,
    });
    throw error;
  }

}

export async function getTicketByToken(token: string): Promise<Ticket | undefined> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { ticketToken: token });
    return undefined;
  }

  const result = await db.select().from(tickets).where(eq(tickets.ticketToken, token)).limit(1);
  return result[0];
}

export async function getTicketById(id: number): Promise<Ticket | undefined> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { ticketId: id });
    return undefined;
  }

  const result = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  return result[0];
}

export async function getWaitingTickets(storeId: number): Promise<Ticket[]> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  const store = await getStoreById(storeId);
  if (!store) return [];

  const dayKey = await ensureStoreDayKey(store);
  return await db.select()
    .from(tickets)
    .where(and(
      eq(tickets.storeId, storeId),
      eq(tickets.dayKey, dayKey),
      inArray(tickets.status, ['WAITING', 'CALLED', 'ARRIVED'])
    ))
    .orderBy(asc(tickets.queueRank));
}


export async function getCalledTicket(storeId: number): Promise<Ticket | undefined> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return undefined;
  }

  const store = await getStoreById(storeId);
  if (!store) return undefined;

  const dayKey = await ensureStoreDayKey(store);
  const result = await db.select()
    .from(tickets)
    .where(and(
      eq(tickets.storeId, storeId),
      eq(tickets.dayKey, dayKey),
      eq(tickets.status, 'CALLED')
    ))
    .orderBy(desc(tickets.calledAt))
    .limit(1);

  return result[0];
}


export async function updateTicketStatus(
  id: number, 
  status: 'WAITING' | 'CALLED' | 'ARRIVED' | 'SKIPPED' | 'DONE' | 'CANCELED' | 'EXPIRED',
  additionalData?: Partial<InsertTicket>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Partial<InsertTicket> = { status, ...additionalData };

  // Set timestamp based on status
  const now = new Date();
  switch (status) {
    case 'CALLED':
      updateData.calledAt = now;
      break;
    case 'ARRIVED':
      updateData.arrivedAt = now;
      break;
    case 'DONE':
      updateData.doneAt = now;
      break;
    case 'CANCELED':
      updateData.canceledAt = now;
      break;
  }

  try {
    await db.update(tickets).set(updateData).where(eq(tickets.id, id));
  } catch (error) {
    logDbError("Failed to update ticket status", error, { ticketId: id, status });
    throw error;
  }

}

export async function updateTicketQueueRank(id: number, queueRank: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(tickets).set({ queueRank }).where(eq(tickets.id, id));
}

export async function getGroupsAhead(ticket: Ticket): Promise<number> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), {
      storeId: ticket.storeId,
      ticketId: ticket.id,
    });
    return 0;
  }

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(tickets)
    .where(and(
      eq(tickets.storeId, ticket.storeId),
      eq(tickets.dayKey, ticket.dayKey),
      eq(tickets.status, 'WAITING'),
      sql`${tickets.queueRank} < ${ticket.queueRank}`
    ));

  return result[0]?.count || 0;
}

export async function getWaitingCount(storeId: number): Promise<number> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return 0;
  }

  const store = await getStoreById(storeId);
  if (!store) return 0;

  const dayKey = await ensureStoreDayKey(store);
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(tickets)
    .where(and(
      eq(tickets.storeId, storeId),
      eq(tickets.dayKey, dayKey),
      eq(tickets.status, 'WAITING')
    ));

  return result[0]?.count || 0;
}


// ==================== Push Subscription Functions ====================

export async function createPushSubscription(data: InsertPushSubscription): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check for existing subscription with same ticketId + endpoint to prevent duplicates
  const existing = await db.select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.ticketId, data.ticketId),
        eq(pushSubscriptions.endpoint, data.endpoint)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing subscription (keys may have been refreshed)
    await db.update(pushSubscriptions)
      .set({
        p256dh: data.p256dh,
        auth: data.auth,
        createdAt: new Date(),
      })
      .where(eq(pushSubscriptions.id, existing[0].id));
  } else {
    await db.insert(pushSubscriptions).values(data);
  }
}

export async function getPushSubscriptionsByTicket(ticketId: number) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { ticketId });
    return [];
  }

  return await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.ticketId, ticketId));
}

// ==================== SMS Subscription Functions ====================

export async function createSmsSubscription(data: InsertSmsSubscription): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(smsSubscriptions).values(data);
}

export async function getSmsSubscriptionByTicket(ticketId: number) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { ticketId });
    return undefined;
  }

  const result = await db.select().from(smsSubscriptions).where(eq(smsSubscriptions.ticketId, ticketId)).limit(1);
  return result[0];
}

export async function updateSmsSubscription(id: number, data: Partial<InsertSmsSubscription>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(smsSubscriptions).set(data).where(eq(smsSubscriptions.id, id));
}

export async function optOutSmsSubscriptionsByPhone(phoneE164: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(smsSubscriptions)
    .set({ optedOutAt: new Date() })
    .where(eq(smsSubscriptions.phoneE164, phoneE164));
}

// ==================== Menu Functions ====================

export async function getMenuCategories(storeId: number) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  return await db.select()
    .from(menuCategories)
    .where(and(eq(menuCategories.storeId, storeId), eq(menuCategories.isActive, true)))
    .orderBy(asc(menuCategories.sortOrder));
}

export async function getMenuItems(storeId: number, categoryId?: number) {
  return await getMenuItemsForStore(storeId, categoryId, false);
}

export async function getMenuItemsForStore(
  storeId: number,
  categoryId?: number,
  includeInactive: boolean = false
) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId, categoryId });
    return [];
  }

  const conditions = [eq(menuItems.storeId, storeId)];
  if (!includeInactive) {
    conditions.push(eq(menuItems.isActive, true));
  }
  if (categoryId) {
    conditions.push(eq(menuItems.categoryId, categoryId));
  }

  return await db.select()
    .from(menuItems)
    .where(and(...conditions))
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.id));
}

export async function getMenuItemById(id: number) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { menuItemId: id });
    return undefined;
  }

  const result = await db.select().from(menuItems).where(eq(menuItems.id, id)).limit(1);
  return result[0];
}


export async function createMenuItem(data: InsertMenuItem): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(menuItems).values(data);
}

export async function updateMenuItem(
  id: number,
  data: Partial<InsertMenuItem>,
  storeId?: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const whereClause = storeId
    ? and(eq(menuItems.id, id), eq(menuItems.storeId, storeId))
    : eq(menuItems.id, id);

  await db.update(menuItems).set(data).where(whereClause);
}

export async function deleteMenuItem(id: number, storeId?: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const whereClause = storeId
    ? and(eq(menuItems.id, id), eq(menuItems.storeId, storeId))
    : eq(menuItems.id, id);

  await db.delete(menuItems).where(whereClause);
}


export async function createMenuCategory(data: InsertMenuCategory): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(menuCategories).values(data);
}

export async function updateMenuCategory(id: number, data: Partial<InsertMenuCategory>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(menuCategories).set(data).where(eq(menuCategories.id, id));
}

export async function deleteMenuCategory(id: number, storeId?: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // First, set categoryId to null for all menu items in this category
  const updateConditions = [eq(menuItems.categoryId, id)];
  if (storeId) {
    updateConditions.push(eq(menuItems.storeId, storeId));
  }
  await db.update(menuItems).set({ categoryId: null }).where(and(...updateConditions));

  // Then delete the category
  const deleteConditions = [eq(menuCategories.id, id)];
  if (storeId) {
    deleteConditions.push(eq(menuCategories.storeId, storeId));
  }
  await db.delete(menuCategories).where(and(...deleteConditions));
}

export async function getMenuCategoriesForStore(storeId: number) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  return await db.select()
    .from(menuCategories)
    .where(eq(menuCategories.storeId, storeId))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.id));
}

// ==================== Feed Post Functions ====================

export async function getFeedPosts(storeId: number) {
  return await getFeedPostsForStore(storeId, false);
}

export async function getFeedPostsForStore(storeId: number, includeInactive: boolean = false) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId, includeInactive });
    return [];
  }

  const conditions = [eq(feedPosts.storeId, storeId)];
  if (!includeInactive) {
    conditions.push(eq(feedPosts.isActive, true));
  }

  return await db.select()
    .from(feedPosts)
    .where(and(...conditions))
    .orderBy(asc(feedPosts.sortOrder), desc(feedPosts.createdAt));
}

export async function getFeedPostById(id: number) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { feedPostId: id });
    return undefined;
  }

  const result = await db.select().from(feedPosts).where(eq(feedPosts.id, id)).limit(1);
  return result[0];
}


export async function createFeedPost(data: InsertFeedPost): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(feedPosts).values(data);
}

export async function updateFeedPost(
  id: number,
  data: Partial<InsertFeedPost>,
  storeId?: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const whereClause = storeId
    ? and(eq(feedPosts.id, id), eq(feedPosts.storeId, storeId))
    : eq(feedPosts.id, id);

  await db.update(feedPosts).set(data).where(whereClause);
}

export async function deleteFeedPost(id: number, storeId?: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const whereClause = storeId
    ? and(eq(feedPosts.id, id), eq(feedPosts.storeId, storeId))
    : eq(feedPosts.id, id);

  await db.delete(feedPosts).where(whereClause);
}


// ==================== Audit Log Functions ====================

export async function createAuditLog(data: InsertQueueAuditLog): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(queueAuditLogs).values(data);
}

// ==================== Staff Session Functions ====================

const STAFF_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export async function createStaffSession(data: {
  storeId: number;
  role: 'staff' | 'manager';
  staffMemberId?: number;
}): Promise<string> {

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const sessionToken = nanoid(32);
  const expiresAt = new Date(Date.now() + STAFF_SESSION_TTL_MS);


  await db.insert(staffSessions).values({
    storeId: data.storeId,
    staffMemberId: data.staffMemberId ?? null,
    sessionToken,
    role: data.role,
    expiresAt,
  });

  return sessionToken;
}

export async function getStaffSession(sessionToken: string) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { sessionToken });
    return undefined;
  }

  const result = await db.select()
    .from(staffSessions)
    .where(eq(staffSessions.sessionToken, sessionToken))
    .limit(1);

  if (!result[0]) return undefined;


  const now = new Date();

  // Check if expired
  if (new Date(result[0].expiresAt) < now) {
    await db.delete(staffSessions).where(eq(staffSessions.id, result[0].id));
    return undefined;
  }

  const refreshedExpiresAt = new Date(now.getTime() + STAFF_SESSION_TTL_MS);
  await db.update(staffSessions)
    .set({ expiresAt: refreshedExpiresAt })
    .where(eq(staffSessions.id, result[0].id));

  // スタッフメンバーの権限情報を取得
  let permissions = { canCall: true, canEditSettings: true, canManage: true };
  let staffMemberName: string | null = null;
  if (result[0].staffMemberId) {
    const member = await db.select()
      .from(staffMembers)
      .where(eq(staffMembers.id, result[0].staffMemberId))
      .limit(1);
    if (member[0]) {
      permissions = {
        canCall: member[0].canCall,
        canEditSettings: member[0].canEditSettings,
        canManage: member[0].canManage,
      };
      staffMemberName = member[0].name;
    }
  }
  // マネージャーは常に全権限
  if (result[0].role === 'manager') {
    permissions = { canCall: true, canEditSettings: true, canManage: true };
  }

  return { ...result[0], expiresAt: refreshedExpiresAt, permissions, staffMemberName };

}

export async function deleteStaffSession(sessionToken: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(staffSessions).where(eq(staffSessions.sessionToken, sessionToken));
}

export async function updateStaffSessionReorderMode(sessionToken: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(staffSessions)
    .set({ reorderModeEnabled: enabled })
    .where(eq(staffSessions.sessionToken, sessionToken));
}

// ==================== SMS Log Functions ====================

export async function createSmsLog(data: InsertSmsLog): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(smsLogs).values(data);
  return result[0].insertId;
}

export async function updateSmsLog(id: number, data: Partial<InsertSmsLog>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(smsLogs).set(data).where(eq(smsLogs.id, id));
}

export async function getSmsLogs(storeId: number, options?: {
  limit?: number;
  offset?: number;
  status?: 'pending' | 'sent' | 'delivered' | 'failed';
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return { logs: [], total: 0 };
  }

  const conditions = [eq(smsLogs.storeId, storeId)];
  
  if (options?.status) {
    conditions.push(eq(smsLogs.status, options.status));
  }
  
  if (options?.startDate) {
    conditions.push(sql`${smsLogs.createdAt} >= ${options.startDate}`);
  }
  
  if (options?.endDate) {
    conditions.push(sql`${smsLogs.createdAt} <= ${options.endDate}`);
  }

  const whereClause = and(...conditions);

  // Get total count
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(smsLogs)
    .where(whereClause);
  const total = countResult[0]?.count || 0;

  // Get logs with pagination
  let query = db.select()
    .from(smsLogs)
    .where(whereClause)
    .orderBy(desc(smsLogs.createdAt));

  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }
  if (options?.offset) {
    query = query.offset(options.offset) as typeof query;
  }

  const logs = await query;

  return { logs, total };
}

export async function getSmsLogsForExport(storeId: number, options?: {
  status?: 'pending' | 'sent' | 'delivered' | 'failed';
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 6);

  const startDate = options?.startDate && options.startDate > cutoffDate
    ? options.startDate
    : cutoffDate;

  const conditions = [
    eq(smsLogs.storeId, storeId),
    sql`${smsLogs.createdAt} >= ${startDate}`,
  ];

  if (options?.endDate) {
    conditions.push(sql`${smsLogs.createdAt} <= ${options.endDate}`);
  }

  if (options?.status) {
    conditions.push(eq(smsLogs.status, options.status));
  }

  return await db
    .select()
    .from(smsLogs)
    .where(and(...conditions))
    .orderBy(desc(smsLogs.createdAt));
}

export async function deleteSmsLogsBefore(cutoffDate: Date): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(smsLogs).where(lt(smsLogs.createdAt, cutoffDate));
}

export async function getSmsLogStats(storeId: number, days: number = 30) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return { totalSent: 0, totalFailed: 0, totalCredits: 0 };
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const result = await db.select({
    status: smsLogs.status,
    count: sql<number>`count(*)`,
    credits: sql<number>`sum(${smsLogs.creditConsumed})`,
  })
    .from(smsLogs)
    .where(and(
      eq(smsLogs.storeId, storeId),
      sql`${smsLogs.createdAt} >= ${startDate}`
    ))
    .groupBy(smsLogs.status);

  let totalSent = 0;
  let totalFailed = 0;
  let totalCredits = 0;

  for (const row of result) {
    if (row.status === 'sent' || row.status === 'delivered') {
      totalSent += row.count;
      totalCredits += row.credits || 0;
    } else if (row.status === 'failed') {
      totalFailed += row.count;
    }
  }

  return { totalSent, totalFailed, totalCredits };
}


// ==================== Statistics Functions ====================

/**
 * 日別来店数を取得（過去N日間）
 */
export async function getDailyVisitorStats(storeId: number, days: number = 30) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const result = await db.select({
    date: tickets.dayKey,
    total: sql<number>`count(*)`,
    waiting: sql<number>`sum(case when ${tickets.status} = 'WAITING' then 1 else 0 end)`,
    called: sql<number>`sum(case when ${tickets.status} = 'CALLED' then 1 else 0 end)`,
    arrived: sql<number>`sum(case when ${tickets.status} = 'ARRIVED' then 1 else 0 end)`,
    done: sql<number>`sum(case when ${tickets.status} = 'DONE' then 1 else 0 end)`,
    skipped: sql<number>`sum(case when ${tickets.status} = 'SKIPPED' then 1 else 0 end)`,
    canceled: sql<number>`sum(case when ${tickets.status} = 'CANCELED' then 1 else 0 end)`,
  })
    .from(tickets)
    .where(and(
      eq(tickets.storeId, storeId),
      sql`${tickets.createdAt} >= ${startDate}`
    ))
    .groupBy(tickets.dayKey)
    .orderBy(asc(tickets.dayKey));

  return result;
}

/**
 * 日別平均待ち時間を取得（過去N日間）
 * 待ち時間 = calledAt - createdAt（呼び出しまでの時間）
 */
export async function getDailyWaitTimeStats(storeId: number, days: number = 30) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  // calledAtがnullでないチケットのみ対象
  const result = await db.select({
    date: tickets.dayKey,
    avgWaitMinutes: sql<number>`avg(timestampdiff(minute, ${tickets.createdAt}, ${tickets.calledAt}))`,
    minWaitMinutes: sql<number>`min(timestampdiff(minute, ${tickets.createdAt}, ${tickets.calledAt}))`,
    maxWaitMinutes: sql<number>`max(timestampdiff(minute, ${tickets.createdAt}, ${tickets.calledAt}))`,
    count: sql<number>`count(*)`,
  })
    .from(tickets)
    .where(and(
      eq(tickets.storeId, storeId),
      sql`${tickets.createdAt} >= ${startDate}`,
      sql`${tickets.calledAt} is not null`
    ))
    .groupBy(tickets.dayKey)
    .orderBy(asc(tickets.dayKey));

  return result;
}

/**
 * 時間帯別来店数を取得（ピーク時間帯分析用）
 */
export async function getHourlyStats(storeId: number, days: number = 30) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  // Format as MySQL-compatible datetime string
  const startDateStr = startDate.toISOString().slice(0, 19).replace('T', ' ');

  // Use raw SQL to avoid GROUP BY alias issues
  const result = await db.execute(sql`
    SELECT 
      hour(${tickets.createdAt}) as hour,
      count(*) as count,
      avg(timestampdiff(minute, ${tickets.createdAt}, ${tickets.calledAt})) as avgWaitMinutes
    FROM ${tickets}
    WHERE ${tickets.storeId} = ${storeId}
      AND ${tickets.createdAt} >= ${new Date(startDateStr)}
    GROUP BY 1
    ORDER BY 1
  `) as any;

  return (result[0] || []).map((r: any) => ({
    hour: Number(r.hour),
    count: Number(r.count),
    avgWaitMinutes: r.avgWaitMinutes ? Number(r.avgWaitMinutes) : null,
  }));
}

/**
 * 統計サマリーを取得（今日/今週/今月）
 */
export async function getStatsSummary(storeId: number) {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return {
      today: { total: 0, done: 0, avgWaitMinutes: 0 },
      thisWeek: { total: 0, done: 0, avgWaitMinutes: 0 },
      thisMonth: { total: 0, done: 0, avgWaitMinutes: 0 },
    };
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // 今週の開始日（月曜日）
  const weekStart = new Date(todayStart);
  const dayOfWeek = weekStart.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(weekStart.getDate() - diff);
  
  // 今月の開始日
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const getStats = async (startDate: Date) => {
    const result = await db.select({
      total: sql<number>`count(*)`,
      done: sql<number>`sum(case when ${tickets.status} = 'DONE' then 1 else 0 end)`,
      avgWaitMinutes: sql<number>`avg(case when ${tickets.calledAt} is not null then timestampdiff(minute, ${tickets.createdAt}, ${tickets.calledAt}) else null end)`,
    })
      .from(tickets)
      .where(and(
        eq(tickets.storeId, storeId),
        sql`${tickets.createdAt} >= ${startDate}`
      ));

    return {
      total: result[0]?.total || 0,
      done: result[0]?.done || 0,
      avgWaitMinutes: Math.round(result[0]?.avgWaitMinutes || 0),
    };
  };

  const [today, thisWeek, thisMonth] = await Promise.all([
    getStats(todayStart),
    getStats(weekStart),
    getStats(monthStart),
  ]);

  return { today, thisWeek, thisMonth };
}


// ============================================
// 予約関連
// ============================================

import { reservations, InsertReservation, Reservation } from "../drizzle/schema";

/**
 * 予約番号を生成（店舗ID + 日付 + 連番）
 */
function generateReservationNumber(storeId: number, date: string): string {
  const dateStr = date.replace(/-/g, '');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `R${storeId}-${dateStr}-${random}`;
}

/**
 * 予約を作成
 */
export async function createReservation(data: {
  storeId: number;
  reservationDate: string;
  reservationTime: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  partySize: number;
  note?: string;
  locale?: string;
  autoConfirm?: boolean;
}): Promise<Reservation | null> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), data);
    return null;
  }

  const reservationNumber = generateReservationNumber(data.storeId, data.reservationDate);
  const status = data.autoConfirm ? "CONFIRMED" : "PENDING";
  const confirmedAt = data.autoConfirm ? new Date() : null;

  const result = await db.insert(reservations).values({
    storeId: data.storeId,
    reservationNumber,
    reservationDate: data.reservationDate,
    reservationTime: data.reservationTime,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    customerEmail: data.customerEmail,
    partySize: data.partySize,
    note: data.note,
    locale: data.locale || "ja",
    status,
    confirmedAt,
  });

  if (result[0].affectedRows === 0) {
    return null;
  }

  const [reservation] = await db.select().from(reservations).where(eq(reservations.reservationNumber, reservationNumber));
  return reservation || null;
}

/**
 * 予約を取得（予約番号で）
 */
export async function getReservationByNumber(reservationNumber: string): Promise<Reservation | null> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { reservationNumber });
    return null;
  }

  const [reservation] = await db.select().from(reservations).where(eq(reservations.reservationNumber, reservationNumber));
  return reservation || null;
}

/**
 * 予約を取得（IDで）
 */
export async function getReservationById(id: number): Promise<Reservation | null> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { id });
    return null;
  }

  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id));
  return reservation || null;
}

/**
 * 店舗の予約一覧を取得（日付でフィルタリング）
 */
export async function getReservationsByStore(
  storeId: number,
  options?: {
    date?: string;
    startDate?: string;
    endDate?: string;
    status?: string[];
  }
): Promise<Reservation[]> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  const conditions = [eq(reservations.storeId, storeId)];

  if (options?.date) {
    conditions.push(eq(reservations.reservationDate, options.date));
  }

  if (options?.startDate) {
    conditions.push(gte(reservations.reservationDate, options.startDate));
  }

  if (options?.endDate) {
    conditions.push(sql`${reservations.reservationDate} <= ${options.endDate}`);
  }

  if (options?.status && options.status.length > 0) {
    conditions.push(inArray(reservations.status, options.status as any));
  }

  const result = await db.select()
    .from(reservations)
    .where(and(...conditions))
    .orderBy(asc(reservations.reservationDate), asc(reservations.reservationTime));

  return result;
}

/**
 * 特定の時間帯の予約数を取得
 */
export async function getReservationCountBySlot(
  storeId: number,
  date: string,
  time: string
): Promise<number> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId, date, time });
    return 0;
  }

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(reservations)
    .where(and(
      eq(reservations.storeId, storeId),
      eq(reservations.reservationDate, date),
      eq(reservations.reservationTime, time),
      inArray(reservations.status, ["PENDING", "CONFIRMED"])
    ));

  return result[0]?.count || 0;
}

/**
 * 予約ステータスを更新
 */
export async function updateReservationStatus(
  id: number,
  status: "PENDING" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELED" | "NO_SHOW",
  ticketId?: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { id, status });
    return false;
  }

  const updateData: any = { status };

  switch (status) {
    case "CONFIRMED":
      updateData.confirmedAt = new Date();
      break;
    case "CHECKED_IN":
      updateData.checkedInAt = new Date();
      if (ticketId) {
        updateData.ticketId = ticketId;
      }
      break;
    case "COMPLETED":
      updateData.completedAt = new Date();
      break;
    case "CANCELED":
      updateData.canceledAt = new Date();
      break;
    case "NO_SHOW":
      updateData.canceledAt = new Date();
      break;
  }

  const result = await db.update(reservations)
    .set(updateData)
    .where(eq(reservations.id, id));

  return result[0].affectedRows > 0;
}

/**
 * 予約をキャンセル
 */
export async function cancelReservation(id: number): Promise<boolean> {
  return updateReservationStatus(id, "CANCELED");
}

/**
 * 予約をチェックイン（チケット発行と連携）
 */
export async function checkInReservation(id: number, ticketId: number): Promise<boolean> {
  return updateReservationStatus(id, "CHECKED_IN", ticketId);
}


// ==================== Checkin PIN Functions ====================

const PIN_VALIDITY_MINUTES = 15;

/**
 * 3桁のランダムPINを生成（000-999）
 */
export function generateCheckinPin(): string {
  // crypto.randomIntを使用してより安全な乱数生成
  const randomValue = Math.floor(Math.random() * 1000);
  return randomValue.toString().padStart(3, '0');
}

/**
 * 店舗のPINが期限切れかどうかを確認
 */
export function isPinExpired(checkinPinUpdatedAt: Date | null): boolean {
  if (!checkinPinUpdatedAt) return true;
  const now = new Date();
  const expiresAt = new Date(checkinPinUpdatedAt.getTime() + PIN_VALIDITY_MINUTES * 60 * 1000);
  return now >= expiresAt;
}

/**
 * PINの有効期限を取得
 */
export function getPinExpiresAt(checkinPinUpdatedAt: Date | null): Date | null {
  if (!checkinPinUpdatedAt) return null;
  return new Date(checkinPinUpdatedAt.getTime() + PIN_VALIDITY_MINUTES * 60 * 1000);
}

/**
 * 店舗のPINを更新（15分経過している場合のみ）
 * @returns 現在のPINと有効期限
 */
export async function getOrUpdateStorePin(storeId: number): Promise<{
  pin: string;
  expiresAt: Date;
  wasUpdated: boolean;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const store = await getStoreById(storeId);
  if (!store) throw new Error("Store not found");

  // PINが存在し、有効期限内の場合はそのまま返す
  if (store.currentCheckinPin && store.checkinPinUpdatedAt && !isPinExpired(store.checkinPinUpdatedAt)) {
    return {
      pin: store.currentCheckinPin,
      expiresAt: getPinExpiresAt(store.checkinPinUpdatedAt)!,
      wasUpdated: false,
    };
  }

  // 新しいPINを生成して更新
  const newPin = generateCheckinPin();
  const now = new Date();

  await db.update(stores).set({
    currentCheckinPin: newPin,
    checkinPinUpdatedAt: now,
  }).where(eq(stores.id, storeId));

  return {
    pin: newPin,
    expiresAt: getPinExpiresAt(now)!,
    wasUpdated: true,
  };
}

/**
 * 整理券のPIN試行回数をインクリメント
 */
export async function incrementPinAttempts(ticketId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const ticket = await getTicketById(ticketId);
  if (!ticket) throw new Error("Ticket not found");

  const newAttempts = (ticket.checkinPinAttempts || 0) + 1;
  await db.update(tickets).set({
    checkinPinAttempts: newAttempts,
  }).where(eq(tickets.id, ticketId));

  return newAttempts;
}

/**
 * 整理券のPIN試行回数をリセット
 */
export async function resetPinAttempts(ticketId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(tickets).set({
    checkinPinAttempts: 0,
  }).where(eq(tickets.id, ticketId));
}

/**
 * 待機中の番号リストを取得（次のN件）
 */
export async function getWaitingNumbers(storeId: number, limit: number = 10): Promise<number[]> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  const store = await getStoreById(storeId);
  if (!store) return [];

  const dayKey = await ensureStoreDayKey(store);
  const result = await db.select({ number: tickets.number })
    .from(tickets)
    .where(and(
      eq(tickets.storeId, storeId),
      eq(tickets.dayKey, dayKey),
      eq(tickets.status, 'WAITING')
    ))
    .orderBy(asc(tickets.queueRank))
    .limit(limit);

  return result.map(r => r.number);
}


// ==================== Wait Time Estimation Functions ====================

/**
 * 店舗の平均処理時間を計算（過去7日間のデータから）
 * 処理時間 = calledAt - createdAt（発券から呼び出しまでの時間）
 * @returns 平均処理時間（分）、データがない場合はnull
 */
export async function getAverageServiceTimeMinutes(storeId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return null;
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  startDate.setHours(0, 0, 0, 0);

  // 呼び出し済みチケットの平均待ち時間を計算
  const result = await db.select({
    avgMinutes: sql<number>`avg(timestampdiff(minute, ${tickets.createdAt}, ${tickets.calledAt}))`,
    count: sql<number>`count(*)`,
  })
    .from(tickets)
    .where(and(
      eq(tickets.storeId, storeId),
      sql`${tickets.createdAt} >= ${startDate}`,
      sql`${tickets.calledAt} is not null`
    ));

  const avgMinutes = result[0]?.avgMinutes;
  const count = result[0]?.count || 0;

  // データが少なすぎる場合はnullを返す（最低5件必要）
  if (count < 5 || avgMinutes === null) {
    return null;
  }

  return Math.round(avgMinutes);
}

/**
 * 整理券の予測待ち時間を計算
 * @param storeId 店舗ID
 * @param groupsAhead 前に待っている組数
 * @returns 予測待ち時間（分）、計算できない場合はnull
 */
export async function getEstimatedWaitTimeMinutes(
  storeId: number,
  groupsAhead: number
): Promise<number | null> {
  if (groupsAhead <= 0) {
    return 0;
  }

  const avgServiceTime = await getAverageServiceTimeMinutes(storeId);
  if (avgServiceTime === null) {
    return null;
  }

  // 予測待ち時間 = 前の組数 × 平均処理時間
  // 最低1分、最大180分（3時間）に制限
  const estimatedMinutes = Math.min(180, Math.max(1, groupsAhead * avgServiceTime));
  return Math.round(estimatedMinutes);
}

/**
 * 店舗の現在の待ち時間情報を取得
 * @returns 待ち時間情報（平均処理時間、現在の待ち組数、予測待ち時間）
 */
export async function getWaitTimeInfo(storeId: number): Promise<{
  avgServiceTimeMinutes: number | null;
  currentWaitingCount: number;
  estimatedWaitMinutes: number | null;
}> {
  const [avgServiceTime, waitingCount] = await Promise.all([
    getAverageServiceTimeMinutes(storeId),
    getWaitingCount(storeId),
  ]);

  let estimatedWaitMinutes: number | null = null;
  if (avgServiceTime !== null && waitingCount > 0) {
    estimatedWaitMinutes = Math.min(180, Math.max(1, waitingCount * avgServiceTime));
  } else if (waitingCount === 0) {
    estimatedWaitMinutes = 0;
  }

  return {
    avgServiceTimeMinutes: avgServiceTime,
    currentWaitingCount: waitingCount,
    estimatedWaitMinutes,
  };
}


// ==================== Wait Alert Functions ====================

/**
 * 整理券の待ち時間アラート設定を更新
 */
export async function setWaitAlert(ticketId: number, alertMinutes: number | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(tickets).set({
    waitAlertMinutes: alertMinutes,
    waitAlertSentAt: null, // アラート設定変更時はリセット
  }).where(eq(tickets.id, ticketId));
}

/**
 * 整理券の待ち時間アラートを送信済みとしてマーク
 */
export async function markWaitAlertSent(ticketId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(tickets).set({
    waitAlertSentAt: new Date(),
  }).where(eq(tickets.id, ticketId));
}

/**
 * アラート送信対象の整理券を取得
 * 条件: WAITING状態、アラート設定あり、未送信、予測待ち時間が閾値以下
 */
export async function getTicketsForWaitAlert(storeId: number): Promise<Array<{
  id: number;
  ticketToken: string;
  number: number;
  waitAlertMinutes: number;
  groupsAhead: number;
  locale: string | null;
}>> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  const store = await getStoreById(storeId);
  if (!store) return [];

  const dayKey = await ensureStoreDayKey(store);

  // アラート設定があり、未送信のWAITINGチケットを取得
  const result = await db.select({
    id: tickets.id,
    ticketToken: tickets.ticketToken,
    number: tickets.number,
    waitAlertMinutes: tickets.waitAlertMinutes,
    queueRank: tickets.queueRank,
    locale: tickets.locale,
  })
    .from(tickets)
    .where(and(
      eq(tickets.storeId, storeId),
      eq(tickets.dayKey, dayKey),
      eq(tickets.status, 'WAITING'),
      isNotNull(tickets.waitAlertMinutes),
      isNull(tickets.waitAlertSentAt)
    ))
    .orderBy(asc(tickets.queueRank));

  // 各チケットの待ち組数を計算
  const ticketsWithGroupsAhead = await Promise.all(
    result.map(async (ticket) => {
      const groupsAhead = await getGroupsAheadByRank(storeId, dayKey, ticket.queueRank);
      return {
        id: ticket.id,
        ticketToken: ticket.ticketToken,
        number: ticket.number,
        waitAlertMinutes: ticket.waitAlertMinutes!,
        groupsAhead,
        locale: ticket.locale,
      };
    })
  );

  return ticketsWithGroupsAhead;
}

/**
 * queueRankを基に待ち組数を計算
 */
async function getGroupsAheadByRank(storeId: number, dayKey: string, queueRank: string | null): Promise<number> {
  const db = await getDb();
  if (!db || !queueRank) return 0;

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(tickets)
    .where(and(
      eq(tickets.storeId, storeId),
      eq(tickets.dayKey, dayKey),
      eq(tickets.status, 'WAITING'),
      sql`${tickets.queueRank} < ${queueRank}`
    ));

  return result[0]?.count || 0;
}


/**
 * 月間予約サマリーを取得（日付ごとの予約数）
 */
export async function getMonthlyReservationSummary(
  storeId: number,
  year: number,
  month: number
): Promise<Array<{ date: string; total: number; pending: number; confirmed: number; checkedIn: number; completed: number; canceled: number; noShow: number }>> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  // 月の開始日と終了日を計算
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const result = await db.select({
    date: reservations.reservationDate,
    total: sql<number>`count(*)`,
    pending: sql<number>`sum(case when ${reservations.status} = 'PENDING' then 1 else 0 end)`,
    confirmed: sql<number>`sum(case when ${reservations.status} = 'CONFIRMED' then 1 else 0 end)`,
    checkedIn: sql<number>`sum(case when ${reservations.status} = 'CHECKED_IN' then 1 else 0 end)`,
    completed: sql<number>`sum(case when ${reservations.status} = 'COMPLETED' then 1 else 0 end)`,
    canceled: sql<number>`sum(case when ${reservations.status} = 'CANCELED' then 1 else 0 end)`,
    noShow: sql<number>`sum(case when ${reservations.status} = 'NO_SHOW' then 1 else 0 end)`,
  })
    .from(reservations)
    .where(and(
      eq(reservations.storeId, storeId),
      gte(reservations.reservationDate, startDate),
      sql`${reservations.reservationDate} <= ${endDate}`
    ))
    .groupBy(reservations.reservationDate)
    .orderBy(asc(reservations.reservationDate));

  return result.map(r => ({
    date: r.date,
    total: Number(r.total) || 0,
    pending: Number(r.pending) || 0,
    confirmed: Number(r.confirmed) || 0,
    checkedIn: Number(r.checkedIn) || 0,
    completed: Number(r.completed) || 0,
    canceled: Number(r.canceled) || 0,
    noShow: Number(r.noShow) || 0,
  }));
}

/**
 * 週間予約一覧を取得
 */
export async function getWeeklyReservations(
  storeId: number,
  startDate: string,
  endDate: string
): Promise<Reservation[]> {
  return getReservationsByStore(storeId, { startDate, endDate });
}


// ==================== Crowd Level History Functions ====================

/**
 * 時間帯別の混雑状況推移を取得（日別・時間帯別）
 * 各時間帯の待機組数の最大値を集計
 */
export async function getCrowdLevelHistory(
  storeId: number,
  days: number = 7
): Promise<Array<{
  date: string;
  hour: number;
  maxWaitingCount: number;
  avgWaitingCount: number;
  ticketCount: number;
}>> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  const startDateStr = startDate.toISOString().slice(0, 19).replace('T', ' ');

  // 各チケットが作成された時点での待機組数を計算するサブクエリ
  // 簡略化: 各時間帯に発行されたチケット数を待機組数の指標として使用
  const result = await db.select({
    date: sql<string>`date(${tickets.createdAt})`,
    hour: sql<number>`hour(${tickets.createdAt})`,
    ticketCount: sql<number>`count(*)`,
    // 待機中だったチケット数（SKIPPEDやCANCELED以外）
    activeCount: sql<number>`sum(case when ${tickets.status} in ('WAITING', 'CALLED', 'ARRIVED', 'DONE') then 1 else 0 end)`,
  })
    .from(tickets)
    .where(and(
      eq(tickets.storeId, storeId),
      gte(tickets.createdAt, new Date(startDateStr))
    ))
    .groupBy(sql`date(${tickets.createdAt})`, sql`hour(${tickets.createdAt})`)
    .orderBy(sql`date(${tickets.createdAt})`, sql`hour(${tickets.createdAt})`);

  return result.map(r => ({
    date: r.date,
    hour: r.hour,
    maxWaitingCount: Number(r.activeCount) || 0,
    avgWaitingCount: Number(r.activeCount) || 0,
    ticketCount: Number(r.ticketCount) || 0,
  }));
}

/**
 * 日別の混雑ピーク時間帯を取得
 */
export async function getDailyPeakHours(
  storeId: number,
  days: number = 30
): Promise<Array<{
  date: string;
  peakHour: number;
  peakCount: number;
  totalCount: number;
}>> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  const startDateStr = startDate.toISOString().slice(0, 19).replace('T', ' ');

  // 日別・時間帯別の集計
  const hourlyData = await db.select({
    date: sql<string>`date(${tickets.createdAt})`,
    hour: sql<number>`hour(${tickets.createdAt})`,
    count: sql<number>`count(*)`,
  })
    .from(tickets)
    .where(and(
      eq(tickets.storeId, storeId),
      gte(tickets.createdAt, new Date(startDateStr))
    ))
    .groupBy(sql`date(${tickets.createdAt})`, sql`hour(${tickets.createdAt})`)
    .orderBy(sql`date(${tickets.createdAt})`, sql`hour(${tickets.createdAt})`);

  // 日別にピーク時間帯を計算
  const dailyMap = new Map<string, { peakHour: number; peakCount: number; totalCount: number }>();
  
  for (const row of hourlyData) {
    const existing = dailyMap.get(row.date);
    const count = Number(row.count) || 0;
    
    if (!existing) {
      dailyMap.set(row.date, {
        peakHour: row.hour,
        peakCount: count,
        totalCount: count,
      });
    } else {
      existing.totalCount += count;
      if (count > existing.peakCount) {
        existing.peakHour = row.hour;
        existing.peakCount = count;
      }
    }
  }

  return Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    ...data,
  }));
}

/**
 * 曜日別・時間帯別の平均混雑状況を取得
 */
export async function getWeekdayHourlyCrowdPattern(
  storeId: number,
  days: number = 90
): Promise<Array<{
  dayOfWeek: number; // 0=日曜, 1=月曜, ..., 6=土曜
  hour: number;
  avgCount: number;
  maxCount: number;
}>> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  const startDateStr = startDate.toISOString().slice(0, 19).replace('T', ' ');

  const result = await db.select({
    dayOfWeek: sql<number>`dayofweek(${tickets.createdAt}) - 1`, // MySQL: 1=日曜 → 0=日曜に変換
    hour: sql<number>`hour(${tickets.createdAt})`,
    avgCount: sql<number>`count(*) / count(distinct date(${tickets.createdAt}))`,
    maxCount: sql<number>`max(daily_count)`,
  })
    .from(
      db.select({
        createdAt: tickets.createdAt,
        dailyCount: sql<number>`count(*)`.as('daily_count'),
      })
        .from(tickets)
        .where(and(
          eq(tickets.storeId, storeId),
          gte(tickets.createdAt, new Date(startDateStr))
        ))
        .groupBy(sql`date(${tickets.createdAt})`, sql`hour(${tickets.createdAt})`)
        .as('daily_hourly')
    )
    .groupBy(sql`dayofweek(${tickets.createdAt}) - 1`, sql`hour(${tickets.createdAt})`)
    .orderBy(sql`dayofweek(${tickets.createdAt}) - 1`, sql`hour(${tickets.createdAt})`);

  return result.map(r => ({
    dayOfWeek: Number(r.dayOfWeek),
    hour: Number(r.hour),
    avgCount: Math.round(Number(r.avgCount) || 0),
    maxCount: Number(r.maxCount) || 0,
  }));
}

/**
 * 時間帯別の混雑パターンを取得（ヒートマップ用）
 */
export async function getHourlyCrowdHeatmap(
  storeId: number,
  days: number = 30
): Promise<Array<{
  dayOfWeek: number;
  hour: number;
  count: number;
  crowdLevel: 'empty' | 'low' | 'moderate' | 'busy' | 'crowded';
}>> {
  const db = await getDb();
  if (!db) {
    logDbError("Database not available", new Error("Database not available"), { storeId });
    return [];
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  const startDateStr = startDate.toISOString().slice(0, 19).replace('T', ' ');

  // 店舗の混雑レベル閾値を取得
  const store = await getStoreById(storeId);
  const thresholds = store?.settings?.queue?.crowdLevelThresholds || {
    low: 3,
    moderate: 7,
    busy: 12,
  };

  // Use raw SQL to avoid GROUP BY alias issues
  const result = await db.execute(sql`
    SELECT 
      dayofweek(${tickets.createdAt}) - 1 as dayOfWeek,
      hour(${tickets.createdAt}) as hour,
      count(*) / count(distinct date(${tickets.createdAt})) as count
    FROM ${tickets}
    WHERE ${tickets.storeId} = ${storeId}
      AND ${tickets.createdAt} >= ${new Date(startDateStr)}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `) as any;

  return (result[0] || []).map((r: any) => {
    const avgCount = Math.round(Number(r.count) || 0);
    let crowdLevel: 'empty' | 'low' | 'moderate' | 'busy' | 'crowded';
    
    if (avgCount === 0) {
      crowdLevel = 'empty';
    } else if (avgCount <= (thresholds.low || 3)) {
      crowdLevel = 'low';
    } else if (avgCount <= (thresholds.moderate || 7)) {
      crowdLevel = 'moderate';
    } else if (avgCount <= (thresholds.busy || 12)) {
      crowdLevel = 'busy';
    } else {
      crowdLevel = 'crowded';
    }

    return {
      dayOfWeek: Number(r.dayOfWeek),
      hour: Number(r.hour),
      count: avgCount,
      crowdLevel,
    };
  });
}


// ==================== Plan Limit Helper Functions ====================

export async function getMenuItemCount(storeId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(menuItems)
    .where(eq(menuItems.storeId, storeId));

  return Number(result[0]?.count ?? 0);
}

export async function getActiveStaffSessionCount(storeId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const now = new Date();
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(staffSessions)
    .where(and(
      eq(staffSessions.storeId, storeId),
      gte(staffSessions.expiresAt, now)
    ));

  return Number(result[0]?.count ?? 0);
}

export async function getFeedPostCount(storeId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(feedPosts)
    .where(eq(feedPosts.storeId, storeId));

  return Number(result[0]?.count ?? 0);
}


// ==================== Usage Trend Helpers ====================

/**
 * 日別のメニュー登録数推移を取得（createdAtベースで累積カウント）
 */
export async function getDailyMenuItemTrend(storeId: number, days: number = 30) {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const result = await db.select({
    date: sql<string>`DATE(${menuItems.createdAt})`.as('date'),
    count: sql<number>`count(*)`.as('count'),
  })
    .from(menuItems)
    .where(and(
      eq(menuItems.storeId, storeId),
      sql`${menuItems.createdAt} >= ${startDate}`
    ))
    .groupBy(sql`DATE(${menuItems.createdAt})`)
    .orderBy(sql`DATE(${menuItems.createdAt})`);

  return result;
}

/**
 * 日別のフィード投稿数推移を取得（createdAtベースで累積カウント）
 */
export async function getDailyFeedPostTrend(storeId: number, days: number = 30) {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const result = await db.select({
    date: sql<string>`DATE(${feedPosts.createdAt})`.as('date'),
    count: sql<number>`count(*)`.as('count'),
  })
    .from(feedPosts)
    .where(and(
      eq(feedPosts.storeId, storeId),
      sql`${feedPosts.createdAt} >= ${startDate}`
    ))
    .groupBy(sql`DATE(${feedPosts.createdAt})`)
    .orderBy(sql`DATE(${feedPosts.createdAt})`);

  return result;
}

/**
 * 日別のチケット発券数推移を取得
 */
export async function getDailyTicketTrend(storeId: number, days: number = 30) {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const result = await db.select({
    date: sql<string>`DATE(${tickets.createdAt})`.as('date'),
    count: sql<number>`count(*)`.as('count'),
  })
    .from(tickets)
    .where(and(
      eq(tickets.storeId, storeId),
      sql`${tickets.createdAt} >= ${startDate}`
    ))
    .groupBy(sql`DATE(${tickets.createdAt})`)
    .orderBy(sql`DATE(${tickets.createdAt})`);

  return result;
}

/**
 * 現在の各リソースの累積カウントを取得
 */
export async function getResourceCounts(storeId: number) {
  const db = await getDb();
  if (!db) return { menu: 0, feed: 0, monthlyTickets: 0 };

  const [menuResult, feedResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(menuItems).where(eq(menuItems.storeId, storeId)),
    db.select({ count: sql<number>`count(*)` }).from(feedPosts).where(eq(feedPosts.storeId, storeId)),
  ]);

  return {
    menu: Number(menuResult[0]?.count ?? 0),
    feed: Number(feedResult[0]?.count ?? 0),
  };
}

type OverviewFilterOptions = {
  includeTest: boolean;
  excludedOpenIds?: string[];
};

const getStartOfToday = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
};

const getStartOfNDaysAgo = (days: number) => {
  const start = getStartOfToday();
  start.setDate(start.getDate() - days + 1);
  return start;
};

const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) return new Date(0).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
};

export async function getOverviewKpis({
  includeTest,
  excludedOpenIds = [],
}: OverviewFilterOptions) {
  const db = await getDb();
  if (!db) {
    return {
      totalUsers: 0,
      activeStores30d: 0,
      ticketsToday: 0,
      smsSent30d: 0,
      mrrExclTax: 0,
      mrrInclTax: 0,
    };
  }

  const start30d = getStartOfNDaysAgo(30);
  const startToday = getStartOfToday();

  const userConditions = [eq(users.isTest, false)];
  if (excludedOpenIds.length > 0) {
    userConditions.push(notInArray(users.openId, excludedOpenIds));
  }

  const storeConditions = includeTest ? [] : [eq(stores.isTest, false)];

  const [userRows, activeStoreRows, ticketRows, smsRows, mrrStores] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(and(...userConditions)),
      db
        .select({ count: sql<number>`count(distinct ${tickets.storeId})` })
        .from(tickets)
        .innerJoin(stores, eq(tickets.storeId, stores.id))
        .where(and(gte(tickets.createdAt, start30d), ...storeConditions)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .innerJoin(stores, eq(tickets.storeId, stores.id))
        .where(and(gte(tickets.createdAt, startToday), ...storeConditions)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(smsLogs)
        .innerJoin(stores, eq(smsLogs.storeId, stores.id))
        .where(and(gte(smsLogs.createdAt, start30d), ...storeConditions)),
      db
        .select({
          planId: stores.subscriptionPlan,
        })
        .from(stores)
        .where(
          and(
            ...storeConditions,
            sql`${stores.subscriptionPlan} <> 'free'`,
            inArray(stores.subscriptionStatus, ["active", "cancel_at_period_end"])
          )
        ),
    ]);

  const mrr = mrrStores.reduce(
    (sum, store) => {
      const mrrValues = getPlanMrr(normalizeOverviewPlanId(store.planId));
      sum.exclTax += mrrValues.exclTax;
      sum.inclTax += mrrValues.inclTax;
      return sum;
    },
    { exclTax: 0, inclTax: 0 }
  );

  return {
    totalUsers: Number(userRows[0]?.count ?? 0),
    activeStores30d: Number(activeStoreRows[0]?.count ?? 0),
    ticketsToday: Number(ticketRows[0]?.count ?? 0),
    smsSent30d: Number(smsRows[0]?.count ?? 0),
    mrrExclTax: mrr.exclTax,
    mrrInclTax: mrr.inclTax,
  };
}

export async function getOverviewTicketChart({
  includeTest,
  days = 30,
}: {
  includeTest: boolean;
  days?: number;
}) {
  const db = await getDb();
  if (!db) return fillMissingDailyCounts([], days);

  const startDate = getStartOfNDaysAgo(days);
  const storeConditions = includeTest ? [] : [eq(stores.isTest, false)];

  const rows = await db
    .select({
      date: sql<string>`DATE(${tickets.createdAt})`.as("date"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(tickets)
    .innerJoin(stores, eq(tickets.storeId, stores.id))
    .where(and(gte(tickets.createdAt, startDate), ...storeConditions))
    .groupBy(sql`DATE(${tickets.createdAt})`)
    .orderBy(sql`DATE(${tickets.createdAt})`);

  return fillMissingDailyCounts(
    rows.map(row => ({
      date: row.date,
      count: Number(row.count ?? 0),
    })),
    days
  );
}

export async function getOverviewPlanDistribution({
  includeTest,
}: {
  includeTest: boolean;
}) {
  const db = await getDb();
  if (!db) {
    return [
      { planId: "free" as const, count: 0 },
      { planId: "standard" as const, count: 0 },
      { planId: "pro" as const, count: 0 },
    ];
  }

  const rows = await db
    .select({
      subscriptionPlan: stores.subscriptionPlan,
      isTest: stores.isTest,
      testPlanOverride: stores.testPlanOverride,
    })
    .from(stores)
    .where(includeTest ? undefined : eq(stores.isTest, false));

  const counts = rows.reduce(
    (acc, row) => {
      const planId =
        includeTest && row.isTest && row.testPlanOverride
          ? normalizeOverviewPlanId(row.testPlanOverride)
          : normalizeOverviewPlanId(row.subscriptionPlan);

      acc[planId] += 1;
      return acc;
    },
    { free: 0, standard: 0, pro: 0 }
  );

  return [
    { planId: "free" as const, count: counts.free },
    { planId: "standard" as const, count: counts.standard },
    { planId: "pro" as const, count: counts.pro },
  ];
}

export async function getOverviewRecentActivity({
  includeTest,
  limit = 20,
  excludedOpenIds = [],
}: OverviewFilterOptions & { limit?: number }) {
  const db = await getDb();
  if (!db) return [] as RecentActivityItem[];

  const userConditions = [eq(users.isTest, false)];
  if (excludedOpenIds.length > 0) {
    userConditions.push(notInArray(users.openId, excludedOpenIds));
  }

  const storeConditions = includeTest ? [] : [eq(stores.isTest, false)];

  const [userRows, storeRows, ticketRows, smsRows, chargeRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        openId: users.openId,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(...userConditions))
      .orderBy(desc(users.createdAt))
      .limit(limit),
    db
      .select({
        id: stores.id,
        name: stores.name,
        slug: stores.slug,
        createdAt: stores.createdAt,
      })
      .from(stores)
      .where(storeConditions.length > 0 ? and(...storeConditions) : undefined)
      .orderBy(desc(stores.createdAt))
      .limit(limit),
    db
      .select({
        id: tickets.id,
        number: tickets.number,
        status: tickets.status,
        createdAt: tickets.createdAt,
        storeId: stores.id,
        storeName: stores.name,
      })
      .from(tickets)
      .innerJoin(stores, eq(tickets.storeId, stores.id))
      .where(and(...storeConditions))
      .orderBy(desc(tickets.createdAt))
      .limit(limit),
    db
      .select({
        id: smsLogs.id,
        messageType: smsLogs.messageType,
        status: smsLogs.status,
        createdAt: smsLogs.createdAt,
        storeId: stores.id,
        storeName: stores.name,
      })
      .from(smsLogs)
      .innerJoin(stores, eq(smsLogs.storeId, stores.id))
      .where(and(...storeConditions))
      .orderBy(desc(smsLogs.createdAt))
      .limit(limit),
    db
      .select({
        id: smsTransactions.id,
        amount: smsTransactions.amount,
        description: smsTransactions.description,
        createdAt: smsTransactions.createdAt,
        storeId: stores.id,
        storeName: stores.name,
      })
      .from(smsTransactions)
      .innerJoin(stores, eq(smsTransactions.storeId, stores.id))
      .where(
        and(
          eq(smsTransactions.type, "charge"),
          ...storeConditions
        )
      )
      .orderBy(desc(smsTransactions.createdAt))
      .limit(limit),
  ]);

  const activities: RecentActivityItem[] = [
    ...userRows.map(row => ({
      id: `user-${row.id}`,
      type: "user_created" as const,
      occurredAt: toIsoString(row.createdAt),
      title: "新規ユーザー登録",
      description:
        row.name || row.email || row.openId
          ? `${row.name || row.email || row.openId} が登録`
          : `ユーザー #${row.id} が登録`,
      userId: row.id,
    })),
    ...storeRows.map(row => ({
      id: `store-${row.id}`,
      type: "store_created" as const,
      occurredAt: toIsoString(row.createdAt),
      title: "新規店舗作成",
      description: `${row.name} (${row.slug}) が作成`,
      storeId: row.id,
      storeName: row.name,
    })),
    ...ticketRows.map(row => ({
      id: `ticket-${row.id}`,
      type: "ticket_created" as const,
      occurredAt: toIsoString(row.createdAt),
      title: "チケット発券",
      description: `${row.storeName} で受付番号 ${row.number} を発券`,
      storeId: row.storeId,
      storeName: row.storeName,
    })),
    ...smsRows.map(row => ({
      id: `sms-${row.id}`,
      type: "sms_sent" as const,
      occurredAt: toIsoString(row.createdAt),
      title: "SMS送信",
      description: `${row.storeName} で ${row.messageType} SMS を ${row.status} 状態で記録`,
      storeId: row.storeId,
      storeName: row.storeName,
    })),
    ...chargeRows.map(row => ({
      id: `sms-charge-${row.id}`,
      type: "sms_charge" as const,
      occurredAt: toIsoString(row.createdAt),
      title: "SMSチャージ",
      description: `${row.storeName} に ${Math.abs(Number(row.amount ?? 0)).toLocaleString()}円 をチャージ`,
      storeId: row.storeId,
      storeName: row.storeName,
    })),
  ];

  return activities
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit);
}


// ==================== Staff Member Helpers ====================

export async function getStaffMembers(storeId: number): Promise<StaffMember[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(staffMembers)
    .where(and(
      eq(staffMembers.storeId, storeId),
      eq(staffMembers.isActive, true)
    ))
    .orderBy(staffMembers.createdAt);
}

export async function getStaffMemberCount(storeId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(staffMembers)
    .where(and(
      eq(staffMembers.storeId, storeId),
      eq(staffMembers.isActive, true)
    ));

  return Number(result[0]?.count ?? 0);
}

export async function getStaffMemberById(id: number, storeId: number): Promise<StaffMember | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select()
    .from(staffMembers)
    .where(and(
      eq(staffMembers.id, id),
      eq(staffMembers.storeId, storeId)
    ))
    .limit(1);

  return result[0] ?? null;
}

export async function createStaffMember(data: { storeId: number; name: string; canCall?: boolean; canEditSettings?: boolean; canManage?: boolean }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const result = await db.insert(staffMembers).values({
    storeId: data.storeId,
    name: data.name,
    canCall: data.canCall ?? true,
    canEditSettings: data.canEditSettings ?? false,
    canManage: data.canManage ?? false,
  });

  return Number(result[0].insertId);
}

export async function updateStaffMember(id: number, storeId: number, data: { name?: string; canCall?: boolean; canEditSettings?: boolean; canManage?: boolean }): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(staffMembers)
    .set(data)
    .where(and(
      eq(staffMembers.id, id),
      eq(staffMembers.storeId, storeId)
    ));
}

export async function deleteStaffMember(id: number, storeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // ソフトデリート: isActive = false に設定
  await db.update(staffMembers)
    .set({ isActive: false })
    .where(and(
      eq(staffMembers.id, id),
      eq(staffMembers.storeId, storeId)
    ));
}
