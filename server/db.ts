import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
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
  staffSessions, InsertStaffSession
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { nanoid } from 'nanoid';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
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
    console.error("[Database] Failed to upsert user:", error);
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
  if (!db) return undefined;

  const result = await db.select().from(stores).where(eq(stores.slug, slug)).limit(1);
  return result[0];
}

export async function getStoreById(id: number): Promise<Store | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  return result[0];
}

export async function getStoresByOwner(ownerId: number): Promise<Store[]> {
  const db = await getDb();
  if (!db) return [];

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

  await db.update(stores).set({ settings: mergedSettings }).where(eq(stores.id, id));
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

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export async function createTicket(data: {
  storeId: number;
  partySize: number;
  note?: string;
  locale?: string;
  source?: 'web' | 'qr' | 'kiosk';
}): Promise<Ticket> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const dayKey = getTodayKey();
  const ticketToken = nanoid(16);

  // Get next number for today
  const store = await getStoreById(data.storeId);
  if (!store) throw new Error("Store not found");

  let nextNumber: number;
  if (store.dayKey === dayKey) {
    nextNumber = store.currentNumber + 1;
  } else {
    nextNumber = 1;
  }

  // Update store counter
  await db.update(stores).set({
    currentNumber: nextNumber,
    dayKey: dayKey,
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
}

export async function getTicketByToken(token: string): Promise<Ticket | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(tickets).where(eq(tickets.ticketToken, token)).limit(1);
  return result[0];
}

export async function getTicketById(id: number): Promise<Ticket | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  return result[0];
}

export async function getWaitingTickets(storeId: number): Promise<Ticket[]> {
  const db = await getDb();
  if (!db) return [];

  const dayKey = getTodayKey();
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
  if (!db) return undefined;

  const dayKey = getTodayKey();
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

  await db.update(tickets).set(updateData).where(eq(tickets.id, id));
}

export async function getGroupsAhead(ticket: Ticket): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

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
  if (!db) return 0;

  const dayKey = getTodayKey();
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
  if (!db) return [];

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
  if (!db) return undefined;

  const result = await db.select().from(smsSubscriptions).where(eq(smsSubscriptions.ticketId, ticketId)).limit(1);
  return result[0];
}

export async function updateSmsSubscription(id: number, data: Partial<InsertSmsSubscription>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(smsSubscriptions).set(data).where(eq(smsSubscriptions.id, id));
}

// ==================== Menu Functions ====================

export async function getMenuCategories(storeId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(menuCategories)
    .where(and(eq(menuCategories.storeId, storeId), eq(menuCategories.isActive, true)))
    .orderBy(asc(menuCategories.sortOrder));
}

export async function getMenuItems(storeId: number, categoryId?: number) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(menuItems.storeId, storeId), eq(menuItems.isActive, true)];
  if (categoryId) {
    conditions.push(eq(menuItems.categoryId, categoryId));
  }

  return await db.select()
    .from(menuItems)
    .where(and(...conditions))
    .orderBy(asc(menuItems.sortOrder));
}

export async function createMenuItem(data: InsertMenuItem): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(menuItems).values(data);
}

export async function updateMenuItem(id: number, data: Partial<InsertMenuItem>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(menuItems).set(data).where(eq(menuItems.id, id));
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
  const db = await getDb();
  if (!db) return [];

  return await db.select()
    .from(feedPosts)
    .where(and(eq(feedPosts.storeId, storeId), eq(feedPosts.isActive, true)))
    .orderBy(desc(feedPosts.createdAt));
}

export async function createFeedPost(data: InsertFeedPost): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(feedPosts).values(data);
}

export async function updateFeedPost(id: number, data: Partial<InsertFeedPost>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(feedPosts).set(data).where(eq(feedPosts.id, id));
}

// ==================== Audit Log Functions ====================

export async function createAuditLog(data: InsertQueueAuditLog): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(queueAuditLogs).values(data);
}

// ==================== Staff Session Functions ====================

export async function createStaffSession(data: {
  storeId: number;
  role: 'staff' | 'manager';
}): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const sessionToken = nanoid(32);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

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
  if (!db) return undefined;

  const result = await db.select()
    .from(staffSessions)
    .where(eq(staffSessions.sessionToken, sessionToken))
    .limit(1);

  if (!result[0]) return undefined;

  // Check if expired
  if (new Date(result[0].expiresAt) < new Date()) {
    await db.delete(staffSessions).where(eq(staffSessions.id, result[0].id));
    return undefined;
  }

  return result[0];
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
