import { eq, and, desc, asc, sql, inArray, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
  smsLogs, InsertSmsLog
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { getRequestId } from './_core/requestContext';
import { nanoid } from 'nanoid';


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
  const updateData = keyType === 'kiosk' ? { kioskKey: newKey } : { boardKey: newKey };
  
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

  await db.insert(pushSubscriptions).values(data);
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
}): Promise<string> {

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const sessionToken = nanoid(32);
  const expiresAt = new Date(Date.now() + STAFF_SESSION_TTL_MS);


  await db.insert(staffSessions).values({
    storeId: data.storeId,
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

  return { ...result[0], expiresAt: refreshedExpiresAt };

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
