import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Store - 店舗情報
 */
export const stores = mysqlTable("stores", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  ownerId: int("ownerId").notNull(),
  
  // PIN認証
  staffPinHash: varchar("staffPinHash", { length: 255 }),
  managerPinHash: varchar("managerPinHash", { length: 255 }),
  
  // 受付状態
  intakeStatus: mysqlEnum("intakeStatus", ["open", "paused"]).default("open").notNull(),
  
  // 言語設定
  defaultLocale: varchar("defaultLocale", { length: 10 }).default("ja").notNull(),
  supportedLocales: json("supportedLocales").$type<string[]>(),
  
  // 日次リセット時刻 (HH:mm形式)
  resetTime: varchar("resetTime", { length: 5 }).default("04:00").notNull(),
  
  // 現在の番号カウンター
  currentNumber: int("currentNumber").default(0).notNull(),
  dayKey: varchar("dayKey", { length: 10 }), // YYYY-MM-DD形式
  
  // キオスク用トークン（QR URL用、再生成可能）
  kioskKey: varchar("kioskKey", { length: 64 }),
  kioskToken: varchar("kioskToken", { length: 64 }),
  // boardKeyは廃止（ボードはアクセスキー不要）
  boardKey: varchar("boardKey", { length: 64 }),
  
  // 設定JSON
  settings: json("settings").$type<StoreSettings>(),
  
  // SMS残高（プリペイド）
  smsBalance: int("smsBalance").default(0).notNull(),
  
  // Stripe顧客ID
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  
  // 到着確認用PIN（15分ごとに更新）
  currentCheckinPin: varchar("currentCheckinPin", { length: 3 }),
  checkinPinUpdatedAt: timestamp("checkinPinUpdatedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Store = typeof stores.$inferSelect;
export type InsertStore = typeof stores.$inferInsert;

export interface StoreSettings {
  queue?: {
    dailyResetTime?: string;
    checkinGraceMinutes?: number;
    autoSkip?: boolean;
    enableReorder?: boolean;
    reorderMaxMove?: number;
    reorderReasonRequired?: boolean;
    auditLog?: boolean;
    showEstimatedWaitTime?: boolean; // 店舗トップページに予測待ち時間を表示
    showCrowdLevel?: boolean; // 店舗トップページに混雑状況を表示
    crowdLevelThresholds?: { // 混雑レベルの閾値
      low?: number;      // この値以下は「空いています」
      moderate?: number; // この値以下は「やや混雑」
      busy?: number;     // この値以下は「混雑中」
      // これ以上は「大混雑」
    };
  };

  notifications?: {
    pushEnabled?: boolean;
    smsEnabled?: boolean;
    recallLimitSeconds?: number;
    recallMaxCount?: number;
    pushTemplateCalled?: string;
    pushTemplateRecall?: string;
    smsTemplateCalled?: string;
    smsTemplateRecall?: string;
  };

  menu?: {
    switchStyle?: "icons" | "tabs";
    defaultView?: "feed" | "list";
    photoDefaultSize?: "large" | "small";
    allowCustomerPhotoSizeToggle?: boolean;
  };
  kiosk?: {
    autoResetSeconds?: number;
    maxPartySize?: number;
  };
  board?: {
    nextCount?: number;
  };
  reservation?: {
    enabled?: boolean;
    // 予約可能な時間帯（例: ["11:00", "11:30", "12:00", ...]）
    timeSlots?: string[];
    // 予約可能な曜日（0=日曜, 1=月曜, ..., 6=土曜）
    availableDays?: number[];
    // 予約可能な日数先（例: 30日先まで）
    advanceDays?: number;
    // 時間帯あたりの最大予約数
    maxPerSlot?: number;
    // 最大人数
    maxPartySize?: number;
    // 自動確認（手動確認が不要な場合）
    autoConfirm?: boolean;
    // SMSリマインダー（予約前日に送信）
    smsReminder?: boolean;
  };
  branding?: {
    primaryColor?: string;    // プライマリカラー（HEX形式: #3b82f6）
    secondaryColor?: string;  // セカンダリカラー（HEX形式）
    accentColor?: string;     // アクセントカラー（HEX形式）
  };
}

/**
 * Ticket - 順番待ちチケット
 */
export const tickets = mysqlTable("tickets", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  ticketToken: varchar("ticketToken", { length: 64 }).notNull().unique(),
  
  dayKey: varchar("dayKey", { length: 10 }).notNull(), // YYYY-MM-DD
  number: int("number").notNull(),
  
  partySize: int("partySize").notNull(),
  note: text("note"),
  locale: varchar("locale", { length: 10 }).default("ja"),
  source: mysqlEnum("source", ["web", "qr", "kiosk"]).default("web").notNull(),
  
  status: mysqlEnum("status", ["WAITING", "CALLED", "ARRIVED", "SKIPPED", "DONE", "CANCELED", "EXPIRED"]).default("WAITING").notNull(),
  
  // 順番調整用ランク (lexorank形式)
  queueRank: varchar("queueRank", { length: 64 }),
  
  calledAt: timestamp("calledAt"),
  arrivedAt: timestamp("arrivedAt"),
  doneAt: timestamp("doneAt"),
  canceledAt: timestamp("canceledAt"),
  checkinDeadlineAt: timestamp("checkinDeadlineAt"),
  
  // PIN入力試行回数（5回まで）
  checkinPinAttempts: int("checkinPinAttempts").default(0).notNull(),
  
  // 予測待ち時間アラート設定
  waitAlertMinutes: int("waitAlertMinutes"), // アラート閾値（分）、null=無効
  waitAlertSentAt: timestamp("waitAlertSentAt"), // アラート送信済み日時
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = typeof tickets.$inferInsert;

/**
 * PushSubscription - Web Push購読
 */
export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: varchar("p256dh", { length: 255 }).notNull(),
  auth: varchar("auth", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;

/**
 * SmsSubscription - SMS通知購読 (Twilio)
 */
export const smsSubscriptions = mysqlTable("sms_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull(),
  phoneE164: varchar("phoneE164", { length: 20 }).notNull(),
  verifiedAt: timestamp("verifiedAt"),
  optedOutAt: timestamp("optedOutAt"),
  lastSentAt: timestamp("lastSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SmsSubscription = typeof smsSubscriptions.$inferSelect;
export type InsertSmsSubscription = typeof smsSubscriptions.$inferInsert;

/**
 * MenuCategory - メニューカテゴリ
 */
export const menuCategories = mysqlTable("menu_categories", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  
  // 多言語名称
  nameJa: varchar("nameJa", { length: 255 }).notNull(),
  nameEn: varchar("nameEn", { length: 255 }),
  nameKo: varchar("nameKo", { length: 255 }),
  nameZhHans: varchar("nameZhHans", { length: 255 }),
  nameZhHant: varchar("nameZhHant", { length: 255 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MenuCategory = typeof menuCategories.$inferSelect;
export type InsertMenuCategory = typeof menuCategories.$inferInsert;

/**
 * MenuItem - メニュー商品
 */
export const menuItems = mysqlTable("menu_items", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  categoryId: int("categoryId"),
  price: int("price").default(0).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  
  // 多言語名称・説明
  nameJa: varchar("nameJa", { length: 255 }).notNull(),
  nameEn: varchar("nameEn", { length: 255 }),
  nameKo: varchar("nameKo", { length: 255 }),
  nameZhHans: varchar("nameZhHans", { length: 255 }),
  nameZhHant: varchar("nameZhHant", { length: 255 }),
  
  descJa: text("descJa"),
  descEn: text("descEn"),
  descKo: text("descKo"),
  descZhHans: text("descZhHans"),
  descZhHant: text("descZhHant"),
  
  // 画像URL (大小バリアント)
  photoLargeUrl: text("photoLargeUrl"),
  photoSmallUrl: text("photoSmallUrl"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = typeof menuItems.$inferInsert;

/**
 * FeedPost - フィード投稿
 */
export const feedPosts = mysqlTable("feed_posts", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  
  // 画像URL (大小バリアント)
  photoLargeUrl: text("photoLargeUrl").notNull(),
  photoSmallUrl: text("photoSmallUrl"),
  
  // 多言語タイトル・キャプション
  titleJa: varchar("titleJa", { length: 255 }),
  titleEn: varchar("titleEn", { length: 255 }),
  titleKo: varchar("titleKo", { length: 255 }),
  titleZhHans: varchar("titleZhHans", { length: 255 }),
  titleZhHant: varchar("titleZhHant", { length: 255 }),
  
  captionJa: text("captionJa"),
  captionEn: text("captionEn"),
  captionKo: text("captionKo"),
  captionZhHans: text("captionZhHans"),
  captionZhHant: text("captionZhHant"),
  
  // 価格表示（任意）
  price: int("price"),
  
  // 商品へのリンク（任意）
  linkedMenuItemId: int("linkedMenuItemId"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FeedPost = typeof feedPosts.$inferSelect;
export type InsertFeedPost = typeof feedPosts.$inferInsert;

/**
 * QueueAuditLog - 順番調整ログ
 */
export const queueAuditLogs = mysqlTable("queue_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  ticketId: int("ticketId").notNull(),
  staffSessionId: int("staffSessionId"),
  fromPos: int("fromPos"),
  toPos: int("toPos"),
  action: mysqlEnum("action", ["MOVE_UP", "MOVE_DOWN", "CALL_SPECIFIC", "SKIP", "RECALL"]).notNull(),
  reason: text("reason"),
  performedBy: varchar("performedBy", { length: 64 }), // staff/manager
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type QueueAuditLog = typeof queueAuditLogs.$inferSelect;
export type InsertQueueAuditLog = typeof queueAuditLogs.$inferInsert;

/**
 * StaffSession - スタッフセッション
 */
export const staffSessions = mysqlTable("staff_sessions", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  sessionToken: varchar("sessionToken", { length: 64 }).notNull().unique(),
  role: mysqlEnum("role", ["staff", "manager"]).notNull(),
  reorderModeEnabled: boolean("reorderModeEnabled").default(false).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StaffSession = typeof staffSessions.$inferSelect;
export type InsertStaffSession = typeof staffSessions.$inferInsert;

/**
 * SmsTransaction - SMS残高取引履歴
 */
export const smsTransactions = mysqlTable("sms_transactions", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  
  // 取引タイプ: charge（チャージ）, consume（消費）, refund（返金）
  type: mysqlEnum("type", ["charge", "consume", "refund"]).notNull(),
  
  // 金額（円）: チャージは正、消費は負
  amount: int("amount").notNull(),
  
  // 取引後の残高
  balanceAfter: int("balanceAfter").notNull(),
  
  // Stripe関連（チャージ時のみ）
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  stripeCheckoutSessionId: varchar("stripeCheckoutSessionId", { length: 255 }),
  
  // SMS送信関連（消費時のみ）
  ticketId: int("ticketId"),
  smsMessageSid: varchar("smsMessageSid", { length: 64 }),
  
  // メモ
  description: text("description"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SmsTransaction = typeof smsTransactions.$inferSelect;
export type InsertSmsTransaction = typeof smsTransactions.$inferInsert;

/**
 * SmsLog - SMS送信履歴
 */
export const smsLogs = mysqlTable("sms_logs", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  ticketId: int("ticketId"),
  
  // 宛先電話番号（E.164形式）
  phoneE164: varchar("phoneE164", { length: 20 }).notNull(),
  
  // 送信内容
  messageContent: text("messageContent").notNull(),
  
  // 送信ステータス
  status: mysqlEnum("status", ["pending", "sent", "delivered", "failed"]).default("pending").notNull(),
  
  // TwilioメッセージSID
  twilioMessageSid: varchar("twilioMessageSid", { length: 64 }),
  
  // エラーメッセージ（失敗時）
  errorMessage: text("errorMessage"),
  
  // 消費クレジット（円）
  creditConsumed: int("creditConsumed").default(20).notNull(),
  
  // 送信タイプ
  messageType: mysqlEnum("messageType", ["call", "recall", "reminder", "custom"]).default("call").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  sentAt: timestamp("sentAt"),
  deliveredAt: timestamp("deliveredAt"),
});

export type SmsLog = typeof smsLogs.$inferSelect;
export type InsertSmsLog = typeof smsLogs.$inferInsert;

/**
 * Reservation - 予約
 */
export const reservations = mysqlTable("reservations", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  
  // 予約番号（店舗内でユニーク）
  reservationNumber: varchar("reservationNumber", { length: 20 }).notNull(),
  
  // 予約日時
  reservationDate: varchar("reservationDate", { length: 10 }).notNull(), // YYYY-MM-DD
  reservationTime: varchar("reservationTime", { length: 5 }).notNull(), // HH:mm
  
  // 予約者情報
  customerName: varchar("customerName", { length: 255 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 20 }),
  customerEmail: varchar("customerEmail", { length: 320 }),
  partySize: int("partySize").notNull(),
  note: text("note"),
  locale: varchar("locale", { length: 10 }).default("ja"),
  
  // ステータス
  status: mysqlEnum("status", ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELED", "NO_SHOW"]).default("PENDING").notNull(),
  
  // チェックイン時に発行されるチケットID
  ticketId: int("ticketId"),
  
  // タイムスタンプ
  confirmedAt: timestamp("confirmedAt"),
  checkedInAt: timestamp("checkedInAt"),
  completedAt: timestamp("completedAt"),
  canceledAt: timestamp("canceledAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Reservation = typeof reservations.$inferSelect;
export type InsertReservation = typeof reservations.$inferInsert;
