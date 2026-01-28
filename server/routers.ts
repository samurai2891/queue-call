import { COOKIE_NAME, RATE_LIMITED_ERR_MSG } from "@shared/const";
import { TRPCError } from "@trpc/server";
import type { Request } from "express";
import * as bcrypt from "bcryptjs";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { notifyTicketCalled } from "./notifications";
import { broadcastQueueUpdate, broadcastTicketUpdate, broadcastIntakeStatus } from "./sse";
import { createCheckoutSession, getSmsBalance, getSmsTransactions, CHARGE_PLANS, SMS_COST_PER_MESSAGE } from "./stripe";



type TicketStatus = 'WAITING' | 'CALLED' | 'ARRIVED' | 'SKIPPED' | 'DONE' | 'CANCELED' | 'EXPIRED';

const ticketStatusTransitions: Record<TicketStatus, TicketStatus[]> = {
  WAITING: ['CALLED', 'CANCELED', 'EXPIRED'],
  CALLED: ['ARRIVED', 'SKIPPED', 'CANCELED', 'CALLED'],
  ARRIVED: ['DONE'],
  SKIPPED: [],
  DONE: [],
  CANCELED: [],
  EXPIRED: [],
};

function assertTicketTransition(currentStatus: TicketStatus, nextStatus: TicketStatus) {
  if (!ticketStatusTransitions[currentStatus]?.includes(nextStatus)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Cannot change ticket status from ${currentStatus} to ${nextStatus}`,
    });
  }
}

const getAppBaseUrl = () => {
  const baseUrl = process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  return baseUrl.replace(/\/+$/, '');
};

const buildTicketUrl = (storeSlug: string | undefined, ticketToken: string) => {
  if (!storeSlug) {
    return undefined;
  }
  return `${getAppBaseUrl()}/s/${storeSlug}/ticket/${ticketToken}`;
};

const getTwilioConfig = () => ({
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.TWILIO_FROM_NUMBER || '',
});

const isTwilioConfigured = (twilioConfig: { accountSid: string; authToken: string; fromNumber: string }) => {
  return Boolean(twilioConfig.accountSid && twilioConfig.authToken && twilioConfig.fromNumber);
};

type RateLimitWindow = {
  windowMs: number;
  limit: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const RATE_LIMITS = {
  ticket: {
    web: [
      { windowMs: 60_000, limit: 5 },
      { windowMs: 60 * 60 * 1000, limit: 50 },
    ],
    kiosk: [
      { windowMs: 60_000, limit: 20 },
      { windowMs: 60 * 60 * 1000, limit: 300 },
    ],
  },
  smsOtp: [{ windowMs: 30 * 60 * 1000, limit: 3 }],
  staffLogin: [{ windowMs: 10 * 60 * 1000, limit: 5 }],
};

const rateLimitBuckets = new Map<string, RateLimitEntry>();

const getRequestIp = (req: Request) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.trim() || "unknown";
  }
  return req.ip || req.socket.remoteAddress || "unknown";
};

const applyRateLimit = (scope: string, key: string, window: RateLimitWindow) => {
  const now = Date.now();
  const bucketKey = `${scope}:${key}:${window.windowMs}`;
  const entry = rateLimitBuckets.get(bucketKey);

  if (!entry || entry.resetAt <= now) {
    const nextEntry = { count: 1, resetAt: now + window.windowMs };
    rateLimitBuckets.set(bucketKey, nextEntry);
    return { allowed: true, resetAt: nextEntry.resetAt };
  }

  entry.count += 1;
  if (entry.count > window.limit) {
    return { allowed: false, resetAt: entry.resetAt };
  }

  return { allowed: true, resetAt: entry.resetAt };
};

const enforceRateLimits = (options: {
  scope: string;
  key: string;
  windows: RateLimitWindow[];
  requestId?: string;
  storeSlug?: string;
  ticketId?: number;
}) => {
  for (const window of options.windows) {
    const result = applyRateLimit(options.scope, options.key, window);
    if (!result.allowed) {
      console.warn("[RateLimit] Limit exceeded", {
        scope: options.scope,
        key: options.key,
        limit: window.limit,
        windowMs: window.windowMs,
        resetAt: new Date(result.resetAt).toISOString(),
        storeSlug: options.storeSlug,
        ticketId: options.ticketId,
        requestId: options.requestId,
      });
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: RATE_LIMITED_ERR_MSG,
      });
    }
  }
};

// ==================== Store Router ====================

const storeRouter = router({
  // Get store by slug (public)
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const store = await db.getStoreBySlug(input.slug);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }
      // Return public info only (kioskKey/boardKey included for admin pages)
      return {
        id: store.id,
        slug: store.slug,
        name: store.name,
        intakeStatus: store.intakeStatus,
        defaultLocale: store.defaultLocale,
        supportedLocales: store.supportedLocales,
        kioskKey: store.kioskKey,
        boardKey: store.boardKey,
        settings: {
          queue: store.settings?.queue,
          menu: store.settings?.menu,
          kiosk: store.settings?.kiosk,
          board: store.settings?.board,
        },
      };
    }),

  // キオスク表示画面用（アクセスキー不要）
  getBySlugForKiosk: publicProcedure
    .input(z.object({
      slug: z.string(),
    }))
    .query(async ({ input }) => {
      const store = await db.getStoreBySlug(input.slug);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      return {
        id: store.id,
        slug: store.slug,
        name: store.name,
        intakeStatus: store.intakeStatus,
        defaultLocale: store.defaultLocale,
        supportedLocales: store.supportedLocales,
        settings: {
          menu: store.settings?.menu,
          kiosk: store.settings?.kiosk,
          board: store.settings?.board,
        },
      };
    }),

  // ボード表示画面用（アクセスキー不要）
  getBySlugForBoard: publicProcedure
    .input(z.object({
      slug: z.string(),
    }))
    .query(async ({ input }) => {
      const store = await db.getStoreBySlug(input.slug);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      return {
        id: store.id,
        slug: store.slug,
        name: store.name,
        intakeStatus: store.intakeStatus,
        defaultLocale: store.defaultLocale,
        supportedLocales: store.supportedLocales,
        settings: {
          menu: store.settings?.menu,
          kiosk: store.settings?.kiosk,
          board: store.settings?.board,
        },
      };
    }),

  // Get store queue status (public)
  getQueueStatus: publicProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const calledTicket = await db.getCalledTicket(input.storeId);
      const waitingCount = await db.getWaitingCount(input.storeId);
      const waitingNumbers = await db.getWaitingNumbers(input.storeId, 10);
      
      // PINを取得または更新（15分経過時）
      const { pin, expiresAt } = await db.getOrUpdateStorePin(input.storeId);
      
      // 予測待ち時間を計算
      const waitTimeInfo = await db.getWaitTimeInfo(input.storeId);
      
      // 店舗設定を取得（予測待ち時間表示設定のため）
      const store = await db.getStoreById(input.storeId);
      const showEstimatedWaitTime = store?.settings?.queue?.showEstimatedWaitTime ?? false;
      const showCrowdLevel = store?.settings?.queue?.showCrowdLevel ?? false;
      
      // 混雑レベルを計算
      const thresholds = store?.settings?.queue?.crowdLevelThresholds ?? {
        low: 3,      // 0-3組: 空いています
        moderate: 7, // 4-7組: やや混雑
        busy: 12,    // 8-12組: 混雑中
        // 13組以上: 大混雑
      };
      
      let crowdLevel: 'empty' | 'low' | 'moderate' | 'busy' | 'crowded' = 'empty';
      if (waitingCount === 0) {
        crowdLevel = 'empty';
      } else if (waitingCount <= (thresholds.low ?? 3)) {
        crowdLevel = 'low';
      } else if (waitingCount <= (thresholds.moderate ?? 7)) {
        crowdLevel = 'moderate';
      } else if (waitingCount <= (thresholds.busy ?? 12)) {
        crowdLevel = 'busy';
      } else {
        crowdLevel = 'crowded';
      }
      
      return {
        currentNumber: calledTicket?.number || 0,
        waitingCount,
        waitingNumbers,
        currentPin: pin,
        pinExpiresAt: expiresAt,
        estimatedWaitMinutes: waitTimeInfo.estimatedWaitMinutes,
        avgServiceTimeMinutes: waitTimeInfo.avgServiceTimeMinutes,
        showEstimatedWaitTime,
        showCrowdLevel,
        crowdLevel,
      };
    }),

  // Create store (protected - admin only)
  create: protectedProcedure
    .input(z.object({
      slug: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/),
      name: z.string().min(1).max(255),
      defaultLocale: z.string().optional(),
      supportedLocales: z.array(z.string()).optional(),
      settings: z.any().optional(),
      staffPin: z.string().min(4).max(8).optional(),
      managerPin: z.string().min(4).max(8).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if slug is available
      const existing = await db.getStoreBySlug(input.slug);
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Store slug already exists' });
      }

      const staffPinHash = input.staffPin ? await bcrypt.hash(input.staffPin, 10) : await bcrypt.hash('1234', 10);
      const managerPinHash = input.managerPin ? await bcrypt.hash(input.managerPin, 10) : await bcrypt.hash('9999', 10);

      const store = await db.createStore({
        slug: input.slug,
        name: input.name,
        ownerId: ctx.user.id,
        defaultLocale: input.defaultLocale,
        supportedLocales: input.supportedLocales,
        settings: input.settings,
        staffPinHash,
        managerPinHash,
      });

      return store;
    }),

  // Get my stores (protected)
  getMyStores: protectedProcedure.query(async ({ ctx }) => {
    return await db.getStoresByOwner(ctx.user.id);
  }),

  // Get store by owner (protected) - returns first store
  getByOwner: protectedProcedure.query(async ({ ctx }) => {
    const stores = await db.getStoresByOwner(ctx.user.id);
    if (stores.length === 0) return null;
    return stores[0];
  }),

  // Update store settings (protected)
  updateSettings: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      settings: z.any(),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      await db.updateStoreSettings(input.storeId, input.settings);
      return { success: true };
    }),

  // Update store basic info (protected)
  update: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      name: z.string().min(1).max(255).optional(),
      slug: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/).optional(),
      defaultLocale: z.string().optional(),
      supportedLocales: z.array(z.string()).optional(),
      settings: z.any().optional(),
      staffPin: z.string().min(4).max(8).optional(),
      managerPin: z.string().min(4).max(8).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      const { storeId, staffPin, managerPin, settings, ...updateData } = input;
      
      // Update basic info
      if (Object.keys(updateData).length > 0) {
        await db.updateStore(storeId, updateData);
      }
      
      // Update settings
      if (settings) {
        await db.updateStoreSettings(storeId, settings);
      }
      
      // Update PINs
      if (staffPin) {
        const pinHash = await bcrypt.hash(staffPin, 10);
        await db.updateStore(storeId, { staffPinHash: pinHash });
      }
      if (managerPin) {
        const pinHash = await bcrypt.hash(managerPin, 10);
        await db.updateStore(storeId, { managerPinHash: pinHash });
      }
      
      return { success: true };
    }),

  // Set PIN (protected)
  setPin: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      pinType: z.enum(['staff', 'manager']),
      pin: z.string().min(4).max(8),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      const pinHash = await bcrypt.hash(input.pin, 10);
      const updateData = input.pinType === 'staff' 
        ? { staffPinHash: pinHash }
        : { managerPinHash: pinHash };

      await db.updateStore(input.storeId, updateData);
      return { success: true };
    }),

  // Get store with keys (protected - owner only)
  getWithKeys: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }
      return store;
    }),

  // 統計API: 日別来店数
  getDailyVisitorStats: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      days: z.number().min(1).max(365).optional().default(30),
    }))
    .query(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }
      return await db.getDailyVisitorStats(input.storeId, input.days);
    }),

  // 統計API: 日別平均待ち時間
  getDailyWaitTimeStats: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      days: z.number().min(1).max(365).optional().default(30),
    }))
    .query(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }
      return await db.getDailyWaitTimeStats(input.storeId, input.days);
    }),

  // 統計API: 時間帯別来店数（ピーク時間帯分析）
  getHourlyStats: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      days: z.number().min(1).max(365).optional().default(30),
    }))
    .query(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }
      return await db.getHourlyStats(input.storeId, input.days);
    }),

  // 統計API: サマリー（今日/今週/今月）
  getStatsSummary: protectedProcedure
    .input(z.object({
      storeId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }
      return await db.getStatsSummary(input.storeId);
    }),

  // 統計API: 混雑状況推移（時間帯別）
  getCrowdLevelHistory: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      days: z.number().min(1).max(365).optional().default(7),
    }))
    .query(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }
      return await db.getCrowdLevelHistory(input.storeId, input.days);
    }),

  // 統計API: 日別ピーク時間帯
  getDailyPeakHours: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      days: z.number().min(1).max(365).optional().default(30),
    }))
    .query(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }
      return await db.getDailyPeakHours(input.storeId, input.days);
    }),

  // 統計API: 混雑ヒートマップ（曜日×時間帯）
  getCrowdHeatmap: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      days: z.number().min(1).max(365).optional().default(30),
    }))
    .query(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }
      return await db.getHourlyCrowdHeatmap(input.storeId, input.days);
    }),
});

// ==================== Ticket Router ====================
const ticketRouter = router({
  // Create ticket (public)
  create: publicProcedure
    .input(z.object({
      storeId: z.number(),
      partySize: z.number().min(1).max(100),
      note: z.string().max(500).optional(),
      locale: z.string().optional(),
      source: z.enum(['web', 'qr', 'kiosk']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }
      if (store.intakeStatus === 'paused') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Intake is paused' });
      }

      const ipAddress = getRequestIp(ctx.req);
      const source = input.source ?? 'web';
      const isKiosk = source === 'kiosk';
      const rateKey = isKiosk ? `${store.id}` : `${store.id}:${ipAddress}`;
      const rateWindows = isKiosk ? RATE_LIMITS.ticket.kiosk : RATE_LIMITS.ticket.web;
      enforceRateLimits({
        scope: isKiosk ? 'ticket-kiosk' : 'ticket',
        key: rateKey,
        windows: rateWindows,
        requestId: ctx.requestId,
        storeSlug: store.slug,
      });

      const ticket = await db.createTicket(input);


      // Broadcast update
      const waitingCount = await db.getWaitingCount(input.storeId);
      const calledTicket = await db.getCalledTicket(input.storeId);
      broadcastQueueUpdate(input.storeId, {
        currentNumber: calledTicket?.number || 0,
        waitingCount,
      });

      return ticket;
    }),

  // Get ticket by token (public)
  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const ticket = await db.getTicketByToken(input.token);
      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      const groupsAhead = await db.getGroupsAhead(ticket);
      const calledTicket = await db.getCalledTicket(ticket.storeId);
      
      // 予測待ち時間を計算
      const estimatedWaitMinutes = await db.getEstimatedWaitTimeMinutes(ticket.storeId, groupsAhead);

      return {
        ...ticket,
        groupsAhead,
        currentNumber: calledTicket?.number || 0,
        estimatedWaitMinutes,
      };
    }),

  // Set wait time alert (public)
  setWaitAlert: publicProcedure
    .input(z.object({
      token: z.string(),
      alertMinutes: z.number().min(1).max(120).nullable(),
    }))
    .mutation(async ({ input }) => {
      const ticket = await db.getTicketByToken(input.token);
      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      if (ticket.status !== 'WAITING') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Cannot set alert for non-waiting ticket' });
      }

      await db.setWaitAlert(ticket.id, input.alertMinutes);

      return { success: true, alertMinutes: input.alertMinutes };
    }),

  // Cancel ticket (public)
  cancel: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const ticket = await db.getTicketByToken(input.token);
      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      if (ticket.status !== 'WAITING' && ticket.status !== 'CALLED') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Cannot cancel ticket' });
      }

      await db.updateTicketStatus(ticket.id, 'CANCELED');

      const waitingCount = await db.getWaitingCount(ticket.storeId);
      const calledTicket = await db.getCalledTicket(ticket.storeId);

      broadcastTicketUpdate(ticket.storeId, ticket.ticketToken, {
        status: 'CANCELED',
        number: ticket.number,
      });

      broadcastQueueUpdate(ticket.storeId, {
        currentNumber: calledTicket?.number || 0,
        waitingCount,
      });

      return { success: true };
    }),

  // Staff login
  login: publicProcedure
    .input(z.object({
      storeId: z.number(),
      pin: z.string().min(4).max(8),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      const ipAddress = getRequestIp(ctx.req);
      enforceRateLimits({
        scope: 'staff-login',
        key: `${store.id}:${ipAddress}`,
        windows: RATE_LIMITS.staffLogin,
        requestId: ctx.requestId,
        storeSlug: store.slug,
      });

      const managerValid = store.managerPinHash
        ? await bcrypt.compare(input.pin, store.managerPinHash)
        : false;
      const staffValid = !managerValid && store.staffPinHash
        ? await bcrypt.compare(input.pin, store.staffPinHash)
        : false;

      if (!managerValid && !staffValid) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid PIN' });
      }

      const role = managerValid ? 'manager' : 'staff';
      const sessionToken = await db.createStaffSession({
        storeId: store.id,
        role,
      });

      return { sessionToken, role };
    }),

  // Get staff session
  getSession: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const session = await db.getStaffSession(input.sessionToken);
      if (!session) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
      }

      return {
        storeId: session.storeId,
        role: session.role,
        expiresAt: session.expiresAt,
      };
    }),

  // Staff logout
  logout: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .mutation(async ({ input }) => {
      await db.deleteStaffSession(input.sessionToken);
      return { success: true };
    }),

  // Get waiting list
  getWaitingList: publicProcedure
    .input(z.object({ 
      sessionToken: z.string(),
      storeId: z.number() 
    }))
    .query(async ({ input }) => {
      const session = await db.getStaffSession(input.sessionToken);
      if (!session || session.storeId !== input.storeId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
      }

      return await db.getWaitingTickets(input.storeId);
    }),

  // Create ticket manually (staff)
  createManual: publicProcedure
    .input(z.object({
      sessionToken: z.string(),
      storeId: z.number(),
      partySize: z.number().min(1).max(100),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await db.getStaffSession(input.sessionToken);
      if (!session || session.storeId !== input.storeId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
      }

      const store = await db.getStoreById(input.storeId);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }
      if (store.intakeStatus === 'paused') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Intake is paused' });
      }

      const ticket = await db.createTicket({
        storeId: input.storeId,
        partySize: input.partySize,
        note: input.note?.trim() || undefined,
        locale: store.defaultLocale ?? 'ja',
        source: 'web',
      });

      const waitingCount = await db.getWaitingCount(input.storeId);
      const calledTicket = await db.getCalledTicket(input.storeId);
      broadcastQueueUpdate(input.storeId, {
        currentNumber: calledTicket?.number || 0,
        waitingCount,
      });

      return ticket;
    }),

  // Move ticket in queue
 
  moveTicket: publicProcedure
    .input(z.object({
      sessionToken: z.string(),
      ticketId: z.number(),
      delta: z.number().int().refine(value => value !== 0, { message: 'Delta must be non-zero' }),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await db.getStaffSession(input.sessionToken);
 
      if (!session) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
      }
 
      const store = await db.getStoreById(session.storeId);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }
 
      const queueSettings = store.settings?.queue;
      if (!queueSettings?.enableReorder) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Reorder is disabled' });
      }
 
      const reorderMaxMove = queueSettings?.reorderMaxMove ?? 3;
      if (Math.abs(input.delta) > reorderMaxMove) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Reorder move exceeds limit' });
      }
 
      if (queueSettings?.reorderReasonRequired && !input.reason?.trim()) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Reorder reason is required' });
      }
 
      const ticket = await db.getTicketById(input.ticketId);
      if (!ticket || ticket.storeId !== session.storeId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }
      if (ticket.status !== 'WAITING') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Ticket is not waiting' });
      }
 
      const waitingTickets = (await db.getWaitingTickets(session.storeId)).filter(
        waitingTicket => waitingTicket.status === 'WAITING'
      );
      const fromIndex = waitingTickets.findIndex(waitingTicket => waitingTicket.id === ticket.id);
      if (fromIndex === -1) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }
 
      const toIndex = fromIndex + input.delta;
      if (toIndex < 0 || toIndex >= waitingTickets.length) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Invalid move' });
      }
 
      const reordered = [...waitingTickets];
      const [movedTicket] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, movedTicket);
 
      const rankPool = waitingTickets
        .map((waitingTicket, index) => waitingTicket.queueRank ?? String(index + 1).padStart(6, '0'))
        .sort();
 
      await Promise.all(
        reordered.map(async (waitingTicket, index) => {
          const nextRank = rankPool[index];
          if (waitingTicket.queueRank !== nextRank) {
            await db.updateTicketQueueRank(waitingTicket.id, nextRank);
          }
        })
      );
 
      if (queueSettings?.auditLog) {
        await db.createAuditLog({
          storeId: session.storeId,
          ticketId: ticket.id,
          staffSessionId: session.id,
          fromPos: fromIndex + 1,
          toPos: toIndex + 1,
          action: input.delta > 0 ? 'MOVE_DOWN' : 'MOVE_UP',
          reason: input.reason,
          performedBy: session.role,
        });
      }
 
      const waitingCount = await db.getWaitingCount(session.storeId);
      const calledTicket = await db.getCalledTicket(session.storeId);
      broadcastQueueUpdate(session.storeId, {
        currentNumber: calledTicket?.number || 0,
        waitingCount,
      });
 
      return { success: true };
    }),
 
  // Call next ticket
  callNext: publicProcedure
    .input(z.object({
      sessionToken: z.string(),
      storeId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await db.getStaffSession(input.sessionToken);
 
      if (!session || session.storeId !== input.storeId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
      }
 
      const tickets = await db.getWaitingTickets(input.storeId);
      const nextTicket = tickets.find(t => t.status === 'WAITING');
      
      if (!nextTicket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No waiting tickets' });
      }
 
      // Get store settings for checkin deadline
      const store = await db.getStoreById(input.storeId);
      const graceMinutes = store?.settings?.queue?.checkinGraceMinutes || 5;
      const checkinDeadlineAt = new Date(Date.now() + graceMinutes * 60 * 1000);
 
      await db.updateTicketStatus(nextTicket.id, 'CALLED', { checkinDeadlineAt });
 
      // Broadcast updates
      const waitingCount = await db.getWaitingCount(input.storeId);
      broadcastQueueUpdate(input.storeId, {
        currentNumber: nextTicket.number,
        waitingCount,
        calledTicket: { number: nextTicket.number, ticketToken: nextTicket.ticketToken },
      });
 
      broadcastTicketUpdate(input.storeId, nextTicket.ticketToken, {
        status: 'CALLED',
        number: nextTicket.number,
      });
 
      const storeName = store?.name ?? 'Queue Call';
      const notificationSettings = store?.settings?.notifications;
      const pushEnabled = notificationSettings?.pushEnabled ?? true;
      const smsEnabled = notificationSettings?.smsEnabled ?? false;
      const twilioConfig = getTwilioConfig();
      const twilioConfigured = smsEnabled && isTwilioConfigured(twilioConfig);
      const pushTemplate = notificationSettings?.pushTemplateCalled;
      const smsTemplate = notificationSettings?.smsTemplateCalled;
      const ticketUrl = buildTicketUrl(store?.slug, nextTicket.ticketToken);
 
      const recallLimitSeconds = notificationSettings?.recallLimitSeconds;
      const recallMaxCount = notificationSettings?.recallMaxCount;
      const shouldNotify = pushEnabled || twilioConfigured;
 
      if (shouldNotify) {
        await notifyTicketCalled(nextTicket.id, input.storeId, storeName, nextTicket.number, {
          pushEnabled,
          pushTemplate,
          twilioConfig: twilioConfigured ? twilioConfig : undefined,
          smsTemplate,
          messageType: 'call',
          ticketUrl,
          recallLimitSeconds,
          recallMaxCount,
          storeSlug: store?.slug,
          requestId: ctx.requestId,
        });
 
 
      }
 
      return nextTicket;
 
    }),
 
  // Call specific ticket
  callSpecific: publicProcedure
    .input(z.object({ 
      sessionToken: z.string(),
      ticketId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await db.getStaffSession(input.sessionToken);

      if (!session) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
      }

      const ticket = await db.getTicketById(input.ticketId);
      if (!ticket || ticket.storeId !== session.storeId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      if (ticket.status !== 'CALLED') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Ticket is not currently called' });
      }

      const store = await db.getStoreById(session.storeId);
      if (store?.settings?.queue?.auditLog) {
        await db.createAuditLog({
          storeId: session.storeId,
          ticketId: ticket.id,
          staffSessionId: session.id,
          action: 'RECALL',
          performedBy: session.role,
        });
      }

      const storeName = store?.name ?? 'Queue Call';
      const notificationSettings = store?.settings?.notifications;
      const pushEnabled = notificationSettings?.pushEnabled ?? true;
      const smsEnabled = notificationSettings?.smsEnabled ?? false;
      const twilioConfig = getTwilioConfig();
      const twilioConfigured = smsEnabled && isTwilioConfigured(twilioConfig);
      const pushTemplate = notificationSettings?.pushTemplateRecall;
      const smsTemplate = notificationSettings?.smsTemplateRecall;
      const ticketUrl = buildTicketUrl(store?.slug, ticket.ticketToken);

      const recallLimitSeconds = notificationSettings?.recallLimitSeconds;
      const recallMaxCount = notificationSettings?.recallMaxCount;
      const shouldNotify = pushEnabled || twilioConfigured;

      if (shouldNotify) {
        await notifyTicketCalled(ticket.id, session.storeId, storeName, ticket.number, {
          pushEnabled,
          pushTemplate,
          twilioConfig: twilioConfigured ? twilioConfig : undefined,
          smsTemplate,
          messageType: 'recall',
          ticketUrl,
          recallLimitSeconds,
          recallMaxCount,
          storeSlug: store?.slug,
          requestId: ctx.requestId,
        });


      }

      const waitingCount = await db.getWaitingCount(session.storeId);
      broadcastQueueUpdate(session.storeId, {
        currentNumber: ticket.number,
        waitingCount,
        calledTicket: { number: ticket.number, ticketToken: ticket.ticketToken },
      });

      return { success: true };
    }),

  // Recall ticket
  recall: publicProcedure
    .input(z.object({ 
      sessionToken: z.string(),
      ticketId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await db.getStaffSession(input.sessionToken);

      if (!session) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
      }

      const ticket = await db.getTicketById(input.ticketId);
      if (!ticket || ticket.storeId !== session.storeId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      if (ticket.status !== 'CALLED') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Ticket is not currently called' });
      }

      const store = await db.getStoreById(session.storeId);
      if (store?.settings?.queue?.auditLog) {
        await db.createAuditLog({
          storeId: session.storeId,
          ticketId: ticket.id,
          staffSessionId: session.id,
          action: 'RECALL',
          performedBy: session.role,
        });
      }

      const storeName = store?.name ?? 'Queue Call';
      const notificationSettings = store?.settings?.notifications;
      const pushEnabled = notificationSettings?.pushEnabled ?? true;
      const smsEnabled = notificationSettings?.smsEnabled ?? false;
      const twilioConfig = getTwilioConfig();
      const twilioConfigured = smsEnabled && isTwilioConfigured(twilioConfig);
      const pushTemplate = notificationSettings?.pushTemplateRecall;
      const smsTemplate = notificationSettings?.smsTemplateRecall;
      const ticketUrl = buildTicketUrl(store?.slug, ticket.ticketToken);

      const recallLimitSeconds = notificationSettings?.recallLimitSeconds;
      const recallMaxCount = notificationSettings?.recallMaxCount;
      const shouldNotify = pushEnabled || twilioConfigured;

      if (shouldNotify) {
        await notifyTicketCalled(ticket.id, session.storeId, storeName, ticket.number, {
          pushEnabled,
          pushTemplate,
          twilioConfig: twilioConfigured ? twilioConfig : undefined,
          smsTemplate,
          messageType: 'recall',
          ticketUrl,
          recallLimitSeconds,
          recallMaxCount,
          storeSlug: store?.slug,
          requestId: ctx.requestId,
        });


      }

      const waitingCount = await db.getWaitingCount(session.storeId);
      broadcastQueueUpdate(session.storeId, {
        currentNumber: ticket.number,
        waitingCount,
        calledTicket: { number: ticket.number, ticketToken: ticket.ticketToken },
      });

      return { success: true };
    }),

  // Skip ticket

  skip: publicProcedure
    .input(z.object({ 
      sessionToken: z.string(),
      ticketId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await db.getStaffSession(input.sessionToken);
      if (!session) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
      }

      const ticket = await db.getTicketById(input.ticketId);
      if (!ticket || ticket.storeId !== session.storeId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      assertTicketTransition(ticket.status as TicketStatus, 'SKIPPED');

      await db.updateTicketStatus(ticket.id, 'SKIPPED');

      // Log
      const store = await db.getStoreById(session.storeId);
      if (store?.settings?.queue?.auditLog) {
        await db.createAuditLog({
          storeId: session.storeId,
          ticketId: ticket.id,
          staffSessionId: session.id,
          action: 'SKIP',
          reason: input.reason,
          performedBy: session.role,
        });
      }

      // Broadcast
      const waitingCount = await db.getWaitingCount(session.storeId);
      const calledTicket = await db.getCalledTicket(session.storeId);

      broadcastTicketUpdate(session.storeId, ticket.ticketToken, {
        status: 'SKIPPED',
        number: ticket.number,
      });

      broadcastQueueUpdate(session.storeId, {
        currentNumber: calledTicket?.number || 0,
        waitingCount,
      });

      return { success: true };
    }),

  // Mark as done
  done: publicProcedure
    .input(z.object({ 
      sessionToken: z.string(),
      ticketId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const session = await db.getStaffSession(input.sessionToken);
      if (!session) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
      }

      const ticket = await db.getTicketById(input.ticketId);
      if (!ticket || ticket.storeId !== session.storeId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      assertTicketTransition(ticket.status as TicketStatus, 'DONE');

      await db.updateTicketStatus(ticket.id, 'DONE');

      // Broadcast
      const waitingCount = await db.getWaitingCount(session.storeId);
      const calledTicket = await db.getCalledTicket(session.storeId);

      broadcastTicketUpdate(session.storeId, ticket.ticketToken, {
        status: 'DONE',
        number: ticket.number,
      });

      broadcastQueueUpdate(session.storeId, {
        currentNumber: calledTicket?.number || 0,
        waitingCount,
      });

      return { success: true };
    }),

  // Toggle intake status
  toggleIntake: publicProcedure
    .input(z.object({ 
      sessionToken: z.string(),
      storeId: z.number(),
      status: z.enum(['open', 'paused']),
    }))
    .mutation(async ({ input }) => {
      const session = await db.getStaffSession(input.sessionToken);
      if (!session || session.storeId !== input.storeId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
      }

      await db.updateStore(input.storeId, { intakeStatus: input.status });
      broadcastIntakeStatus(input.storeId, input.status);

      return { success: true };
    }),

  // Checkin (public) - 後方互換性のため残す
  checkin: publicProcedure
    .input(z.object({ 
      storeId: z.number(),
      number: z.number() 
    }))
    .mutation(async ({ input }) => {
      const tickets = await db.getWaitingTickets(input.storeId);
      const ticket = tickets.find(t => t.number === input.number && t.status === 'CALLED');
      
      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found or not called' });
      }

      await db.updateTicketStatus(ticket.id, 'ARRIVED');

      broadcastTicketUpdate(ticket.storeId, ticket.ticketToken, {
        status: 'ARRIVED',
        number: ticket.number,
      });

      return { success: true };
    }),

  // Checkin with PIN (public) - PIN認証付き到着確認
  checkinWithPin: publicProcedure
    .input(z.object({ 
      ticketToken: z.string(),
      pin: z.string().length(3),
    }))
    .mutation(async ({ input }) => {
      const MAX_ATTEMPTS = 5;

      // 整理券を取得
      const ticket = await db.getTicketByToken(input.ticketToken);
      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      // ステータス確認
      if (ticket.status !== 'CALLED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ticket is not in CALLED status' });
      }

      // 有効期限確認
      if (ticket.checkinDeadlineAt && new Date() > ticket.checkinDeadlineAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Checkin deadline has passed' });
      }

      // 試行回数確認
      if ((ticket.checkinPinAttempts || 0) >= MAX_ATTEMPTS) {
        throw new TRPCError({ 
          code: 'TOO_MANY_REQUESTS', 
          message: 'Too many PIN attempts. Please contact staff.',
        });
      }

      // 店舗の現在のPINを取得
      const { pin: currentPin } = await db.getOrUpdateStorePin(ticket.storeId);

      // PIN照合
      if (input.pin !== currentPin) {
        const newAttempts = await db.incrementPinAttempts(ticket.id);
        const attemptsRemaining = MAX_ATTEMPTS - newAttempts;
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: `Invalid PIN. ${attemptsRemaining} attempts remaining.`,
        });
      }

      // 到着確認成功
      await db.updateTicketStatus(ticket.id, 'ARRIVED');
      await db.resetPinAttempts(ticket.id);

      broadcastTicketUpdate(ticket.storeId, ticket.ticketToken, {
        status: 'ARRIVED',
        number: ticket.number,
      });

      return { success: true };
    }),
});

const staffRouter = ticketRouter;

// ==================== Menu Router ====================

async function assertStoreOwner(storeId: number, userId: number) {
  const store = await db.getStoreById(storeId);
  if (!store || store.ownerId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
  }
  return store;
}

function stripUndefined<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

const menuRouter = router({
  // Get categories (public)
  getCategories: publicProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      return await db.getMenuCategories(input.storeId);
    }),

  // Get items (public)
  getItems: publicProcedure
    .input(z.object({ 
      storeId: z.number(),
      categoryId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await db.getMenuItems(input.storeId, input.categoryId);
    }),

  // Get feed posts (public)
  getFeed: publicProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      return await db.getFeedPosts(input.storeId);
    }),

  // Get items for admin (include inactive)
  getAdminItems: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      categoryId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertStoreOwner(input.storeId, ctx.user.id);
      return await db.getMenuItemsForStore(input.storeId, input.categoryId, true);
    }),

  // Get feed posts for admin (include inactive)
  getAdminFeed: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertStoreOwner(input.storeId, ctx.user.id);
      return await db.getFeedPostsForStore(input.storeId, true);
    }),

  // Create category (protected)
  createCategory: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      nameJa: z.string(),
      nameEn: z.string().optional(),
      nameKo: z.string().optional(),
      nameZhHans: z.string().optional(),
      nameZhHant: z.string().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      await db.createMenuCategory(input);
      return { success: true };
    }),

  // Create item (protected)
  createItem: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      categoryId: z.number().optional(),
      nameJa: z.string(),
      nameEn: z.string().optional(),
      nameKo: z.string().optional(),
      nameZhHans: z.string().optional(),
      nameZhHant: z.string().optional(),
      descJa: z.string().optional(),
      descEn: z.string().optional(),
      descKo: z.string().optional(),
      descZhHans: z.string().optional(),
      descZhHant: z.string().optional(),
      price: z.number().optional(),
      photoLargeUrl: z.string().optional(),
      photoSmallUrl: z.string().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      await db.createMenuItem(input);
      return { success: true };
    }),

  // Update item (protected)
  updateItem: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      itemId: z.number(),
      categoryId: z.number().nullable().optional(),
      nameJa: z.string().optional(),
      nameEn: z.string().optional(),
      nameKo: z.string().optional(),
      nameZhHans: z.string().optional(),
      nameZhHant: z.string().optional(),
      descJa: z.string().optional(),
      descEn: z.string().optional(),
      descKo: z.string().optional(),
      descZhHans: z.string().optional(),
      descZhHant: z.string().optional(),
      price: z.number().optional(),
      photoLargeUrl: z.string().optional(),
      photoSmallUrl: z.string().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertStoreOwner(input.storeId, ctx.user.id);
      const item = await db.getMenuItemById(input.itemId);
      if (!item || item.storeId !== input.storeId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Menu item not found' });
      }

      const { storeId, itemId, ...updates } = input;
      const updateData = stripUndefined(updates);
      if (Object.keys(updateData).length === 0) {
        return { success: true };
      }

      await db.updateMenuItem(itemId, updateData, storeId);
      return { success: true };
    }),

  // Delete item (protected)
  deleteItem: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      itemId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertStoreOwner(input.storeId, ctx.user.id);
      const item = await db.getMenuItemById(input.itemId);
      if (!item || item.storeId !== input.storeId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Menu item not found' });
      }

      await db.deleteMenuItem(input.itemId, input.storeId);
      return { success: true };
    }),

  // Create feed post (protected)
  createFeedPost: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      photoLargeUrl: z.string(),
      photoSmallUrl: z.string().optional(),
      titleJa: z.string().optional(),
      titleEn: z.string().optional(),
      titleKo: z.string().optional(),
      titleZhHans: z.string().optional(),
      titleZhHant: z.string().optional(),
      captionJa: z.string().optional(),
      captionEn: z.string().optional(),
      captionKo: z.string().optional(),
      captionZhHans: z.string().optional(),
      captionZhHant: z.string().optional(),
      price: z.number().optional(),
      linkedMenuItemId: z.number().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      await db.createFeedPost(input);
      return { success: true };
    }),

  // Update feed post (protected)
  updateFeedPost: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      feedPostId: z.number(),
      photoLargeUrl: z.string().optional(),
      photoSmallUrl: z.string().optional(),
      titleJa: z.string().optional(),
      titleEn: z.string().optional(),
      titleKo: z.string().optional(),
      titleZhHans: z.string().optional(),
      titleZhHant: z.string().optional(),
      captionJa: z.string().optional(),
      captionEn: z.string().optional(),
      captionKo: z.string().optional(),
      captionZhHans: z.string().optional(),
      captionZhHant: z.string().optional(),
      price: z.number().optional(),
      linkedMenuItemId: z.number().nullable().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertStoreOwner(input.storeId, ctx.user.id);
      const post = await db.getFeedPostById(input.feedPostId);
      if (!post || post.storeId !== input.storeId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Feed post not found' });
      }

      const { storeId, feedPostId, ...updates } = input;
      const updateData = stripUndefined(updates);
      if (Object.keys(updateData).length === 0) {
        return { success: true };
      }

      await db.updateFeedPost(feedPostId, updateData, storeId);
      return { success: true };
    }),

  // Delete feed post (protected)
  deleteFeedPost: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      feedPostId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertStoreOwner(input.storeId, ctx.user.id);
      const post = await db.getFeedPostById(input.feedPostId);
      if (!post || post.storeId !== input.storeId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Feed post not found' });
      }

      await db.deleteFeedPost(input.feedPostId, input.storeId);
      return { success: true };
    }),
});

// ==================== Notification Router ====================
const notificationRouter = router({
  // Subscribe to push notifications
  subscribePush: publicProcedure
    .input(z.object({
      ticketId: z.number(),
      endpoint: z.string(),
      p256dh: z.string(),
      auth: z.string(),
    }))
    .mutation(async ({ input }) => {
      await db.createPushSubscription(input);
      return { success: true };
    }),

  // Get SMS subscription status
  getSmsStatus: publicProcedure
    .input(z.object({ ticketId: z.number() }))
    .query(async ({ input }) => {
      const subscription = await db.getSmsSubscriptionByTicket(input.ticketId);
      if (!subscription) {
        return { registered: false, verified: false, phoneE164: null };
      }
      return {
        registered: true,
        verified: !!subscription.verifiedAt,
        phoneE164: subscription.phoneE164,
        optedOut: !!subscription.optedOutAt,
      };
    }),

  // Register SMS (start verification)
  registerSms: publicProcedure
    .input(z.object({
      ticketId: z.number(),
      phoneE164: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format'),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get ticket to find store
      const ticket = await db.getTicketById(input.ticketId);
      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      // Get store to check if SMS is enabled
      const store = await db.getStoreById(ticket.storeId);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      const ipAddress = getRequestIp(ctx.req);
      enforceRateLimits({
        scope: 'sms-otp',
        key: `${store.id}:${ipAddress}:${input.phoneE164}`,
        windows: RATE_LIMITS.smsOtp,
        requestId: ctx.requestId,
        storeSlug: store.slug,
        ticketId: ticket.id,
      });

      // Check if SMS notifications are enabled

      if (!store.settings?.notifications?.smsEnabled) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'SMS notifications are not enabled for this store' });
      }

      // Check Twilio configuration
      const twilioConfig = {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',
      };

      if (!twilioConfig.accountSid || !twilioConfig.authToken || !twilioConfig.verifyServiceSid) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'SMS service is not configured' });
      }

      // Check if already registered
      const existing = await db.getSmsSubscriptionByTicket(input.ticketId);
      if (existing && existing.verifiedAt) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Phone number already verified' });
      }

      // Send OTP via Twilio Verify
      const { sendOtp } = await import('./notifications');
      const sent = await sendOtp(input.phoneE164, twilioConfig);
      if (!sent) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send verification code' });
      }

      // Create or update subscription
      if (existing) {
        await db.updateSmsSubscription(existing.id, { phoneE164: input.phoneE164 });
      } else {
        await db.createSmsSubscription({
          ticketId: input.ticketId,
          phoneE164: input.phoneE164,
        });
      }

      return { success: true, message: 'Verification code sent' };
    }),

  // Verify SMS
  verifySms: publicProcedure
    .input(z.object({
      ticketId: z.number(),
      code: z.string().length(6, 'Verification code must be 6 digits'),
    }))
    .mutation(async ({ input }) => {
      const subscription = await db.getSmsSubscriptionByTicket(input.ticketId);
      if (!subscription) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No pending verification found' });
      }

      if (subscription.verifiedAt) {
        return { success: true, message: 'Already verified' };
      }

      // Check Twilio configuration
      const twilioConfig = {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',
      };

      if (!twilioConfig.accountSid || !twilioConfig.authToken || !twilioConfig.verifyServiceSid) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'SMS service is not configured' });
      }

      // Verify OTP via Twilio
      const { verifyOtp } = await import('./notifications');
      const verified = await verifyOtp(subscription.phoneE164, input.code, twilioConfig);
      if (!verified) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid verification code' });
      }

      await db.updateSmsSubscription(subscription.id, { verifiedAt: new Date() });
      return { success: true, message: 'Phone number verified' };
    }),

  // Unsubscribe SMS
  unsubscribeSms: publicProcedure
    .input(z.object({ ticketId: z.number() }))
    .mutation(async ({ input }) => {
      const subscription = await db.getSmsSubscriptionByTicket(input.ticketId);
      if (!subscription) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No subscription found' });
      }

      await db.updateSmsSubscription(subscription.id, { optedOutAt: new Date() });
      return { success: true };
    }),
});

// ==================== Stripe Router ====================
const stripeRouter = router({
  // Get charge plans
  getChargePlans: publicProcedure.query(() => {
    return {
      plans: CHARGE_PLANS,
      costPerSms: SMS_COST_PER_MESSAGE,
    };
  }),

  // Get SMS balance (protected)
  getSmsBalance: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      const balance = await getSmsBalance(input.storeId);
      const estimatedSms = Math.floor(balance / SMS_COST_PER_MESSAGE);

      return {
        balance,
        estimatedSms,
        costPerSms: SMS_COST_PER_MESSAGE,
      };
    }),

  // Get SMS transaction history (protected)
  getSmsTransactions: protectedProcedure
    .input(z.object({ storeId: z.number(), limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      return await getSmsTransactions(input.storeId, input.limit);
    }),

  // Create checkout session for SMS charge (protected)
  createCheckoutSession: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      amount: z.number().int().min(500).max(100000),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      const origin = ctx.req.headers.origin || 'http://localhost:3000';

      const session = await createCheckoutSession({
        storeId: store.id,
        storeName: store.name,
        amount: input.amount,
        successUrl: `${origin}/admin/settings?tab=notifications&charge=success`,
        cancelUrl: `${origin}/admin/settings?tab=notifications&charge=canceled`,
        customerEmail: ctx.user.email || undefined,
      });

      return session;
    }),
});

// ==================== SMS Logs Router ====================
const smsLogsRouter = router({
  // Get SMS logs with pagination (protected)
  getLogs: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      limit: z.number().min(1).max(100).optional().default(20),
      offset: z.number().min(0).optional().default(0),
      status: z.enum(['pending', 'sent', 'delivered', 'failed']).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      const options: Parameters<typeof db.getSmsLogs>[1] = {
        limit: input.limit,
        offset: input.offset,
        status: input.status,
      };

      if (input.startDate) {
        options.startDate = new Date(input.startDate);
      }
      if (input.endDate) {
        options.endDate = new Date(input.endDate);
      }

      return await db.getSmsLogs(input.storeId, options);
    }),

  // Get SMS stats (protected)
  getStats: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      days: z.number().min(1).max(365).optional().default(30),
    }))
    .query(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      return await db.getSmsLogStats(input.storeId, input.days);
    }),
  exportCsv: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      status: z.enum(['pending', 'sent', 'delivered', 'failed']).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      const options: Parameters<typeof db.getSmsLogsForExport>[1] = {
        status: input.status,
      };

      if (input.startDate) {
        options.startDate = new Date(input.startDate);
      }
      if (input.endDate) {
        options.endDate = new Date(input.endDate);
      }

      const logs = await db.getSmsLogsForExport(input.storeId, options);

      const formatCsvValue = (value: string | number | null | undefined) => {
        const textValue = String(value ?? '');
        return `"${textValue.replace(/"/g, '""')}"`;
      };

      // Japanese headers for better readability in Excel
      const headerRow = [
        '送信日時',
        '宛先電話番号',
        'メッセージ種別',
        'メッセージ内容',
        'ステータス',
        '消費クレジット(円)',
        'チケットID',
      ];

      const statusLabels: Record<string, string> = {
        pending: '送信中',
        sent: '送信済み',
        delivered: '配信完了',
        failed: '失敗',
      };

      const typeLabels: Record<string, string> = {
        call: '呼び出し',
        recall: '再呼び出し',
        reminder: 'リマインダー',
        custom: 'カスタム',
      };

      const formatDateTime = (date: Date) => {
        const d = new Date(date);
        return d.toLocaleString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      };

      const dataRows = logs.map((log) => [
        formatDateTime(log.createdAt),
        log.phoneE164,
        typeLabels[log.messageType] || log.messageType,
        log.messageContent,
        statusLabels[log.status] || log.status,
        log.creditConsumed,
        log.ticketId ?? '',
      ]);

      const csvLines = [headerRow, ...dataRows]
        .map((row) => row.map((value) => formatCsvValue(value)).join(','))
        .join('\n');

      const dateStamp = new Date().toISOString().slice(0, 10);

      return {
        csv: `\uFEFF${csvLines}`,
        filename: `sms-logs-${store.slug}-${dateStamp}.csv`,
      };
    }),
});

// ==================== Reservation Router ====================
const reservationRouter = router({
  // 店舗の予約設定を取得
  getSettings: publicProcedure
    .input(z.object({ storeSlug: z.string() }))
    .query(async ({ input }) => {
      const store = await db.getStoreBySlug(input.storeSlug);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      const settings = store.settings?.reservation || {
        enabled: false,
        timeSlots: [],
        availableDays: [0, 1, 2, 3, 4, 5, 6],
        advanceDays: 30,
        maxPerSlot: 5,
        maxPartySize: 10,
        autoConfirm: true,
        smsReminder: false,
      };

      return {
        storeId: store.id,
        storeName: store.name,
        settings,
      };
    }),

  // 利用可能な時間枠を取得
  getAvailableSlots: publicProcedure
    .input(z.object({
      storeSlug: z.string(),
      date: z.string(), // YYYY-MM-DD
    }))
    .query(async ({ input }) => {
      const store = await db.getStoreBySlug(input.storeSlug);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      const settings = store.settings?.reservation;
      if (!settings?.enabled) {
        return { slots: [], message: 'Reservations are not enabled for this store' };
      }

      const timeSlots = settings.timeSlots || [];
      const maxPerSlot = settings.maxPerSlot || 5;

      // 各時間枠の予約数を取得
      const slots = await Promise.all(
        timeSlots.map(async (time) => {
          const count = await db.getReservationCountBySlot(store.id, input.date, time);
          return {
            time,
            available: count < maxPerSlot,
            remaining: maxPerSlot - count,
          };
        })
      );

      return { slots };
    }),

  // 予約を作成（顧客向け）
  create: publicProcedure
    .input(z.object({
      storeSlug: z.string(),
      reservationDate: z.string(),
      reservationTime: z.string(),
      customerName: z.string().min(1),
      customerPhone: z.string().optional(),
      customerEmail: z.string().email().optional(),
      partySize: z.number().int().min(1),
      note: z.string().optional(),
      locale: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const store = await db.getStoreBySlug(input.storeSlug);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      const settings = store.settings?.reservation;
      if (!settings?.enabled) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Reservations are not enabled for this store' });
      }

      // 時間枠の空きを確認
      const count = await db.getReservationCountBySlot(store.id, input.reservationDate, input.reservationTime);
      const maxPerSlot = settings.maxPerSlot || 5;
      if (count >= maxPerSlot) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This time slot is fully booked' });
      }

      // 人数チェック
      const maxPartySize = settings.maxPartySize || 10;
      if (input.partySize > maxPartySize) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Maximum party size is ${maxPartySize}` });
      }

      const reservation = await db.createReservation({
        storeId: store.id,
        reservationDate: input.reservationDate,
        reservationTime: input.reservationTime,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        partySize: input.partySize,
        note: input.note,
        locale: input.locale,
        autoConfirm: settings.autoConfirm,
      });

      if (!reservation) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create reservation' });
      }

      return {
        reservation,
        message: settings.autoConfirm ? 'Reservation confirmed' : 'Reservation pending confirmation',
      };
    }),

  // 予約を取得（予約番号で）
  getByNumber: publicProcedure
    .input(z.object({ reservationNumber: z.string() }))
    .query(async ({ input }) => {
      const reservation = await db.getReservationByNumber(input.reservationNumber);
      if (!reservation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reservation not found' });
      }
      return reservation;
    }),

  // 店舗の予約一覧を取得（スタッフ向け）
  listByStore: publicProcedure
    .input(z.object({
      storeSlug: z.string(),
      staffToken: z.string(),
      date: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      status: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      const store = await db.getStoreBySlug(input.storeSlug);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      // スタッフトークン検証
      const session = await db.getStaffSession(input.staffToken);
      if (!session || session.storeId !== store.id) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid staff token' });
      }

      const reservations = await db.getReservationsByStore(store.id, {
        date: input.date,
        startDate: input.startDate,
        endDate: input.endDate,
        status: input.status,
      });

      return reservations;
    }),

  // 予約ステータスを更新（スタッフ向け）
  updateStatus: publicProcedure
    .input(z.object({
      storeSlug: z.string(),
      staffToken: z.string(),
      reservationId: z.number(),
      status: z.enum(['CONFIRMED', 'CANCELED', 'NO_SHOW']),
    }))
    .mutation(async ({ input }) => {
      const store = await db.getStoreBySlug(input.storeSlug);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      // スタッフトークン検証
      const session = await db.getStaffSession(input.staffToken);
      if (!session || session.storeId !== store.id) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid staff token' });
      }

      const success = await db.updateReservationStatus(input.reservationId, input.status);
      if (!success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update reservation status' });
      }

      return { success: true };
    }),

  // 予約をチェックイン（チケット発行）
  checkIn: publicProcedure
    .input(z.object({
      storeSlug: z.string(),
      staffToken: z.string(),
      reservationId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const store = await db.getStoreBySlug(input.storeSlug);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      // スタッフトークン検証
      const session = await db.getStaffSession(input.staffToken);
      if (!session || session.storeId !== store.id) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid staff token' });
      }

      // 予約を取得
      const reservation = await db.getReservationById(input.reservationId);
      if (!reservation || reservation.storeId !== store.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reservation not found' });
      }

      if (reservation.status !== 'CONFIRMED' && reservation.status !== 'PENDING') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Reservation cannot be checked in' });
      }

      // チケットを発行
      const ticket = await db.createTicket({
        storeId: store.id,
        partySize: reservation.partySize,
        note: `予約: ${reservation.reservationNumber} / ${reservation.customerName}`,
        locale: reservation.locale || 'ja',
        source: 'web',
      });

      if (!ticket) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create ticket' });
      }

      // 予約をチェックイン済みに更新
      await db.checkInReservation(input.reservationId, ticket.id);

      // SSEでキュー更新をブロードキャスト
      const waitingTickets = await db.getWaitingTickets(store.id);
      broadcastQueueUpdate(store.id, {
        currentNumber: ticket.number,
        waitingCount: waitingTickets.length,
      });

      return {
        ticket,
        message: 'Reservation checked in successfully',
      };
    }),

  // 予約をキャンセル（顧客向け）
  cancel: publicProcedure
    .input(z.object({ reservationNumber: z.string() }))
    .mutation(async ({ input }) => {
      const reservation = await db.getReservationByNumber(input.reservationNumber);
      if (!reservation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reservation not found' });
      }

      if (reservation.status === 'CANCELED' || reservation.status === 'COMPLETED' || reservation.status === 'CHECKED_IN') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Reservation cannot be canceled' });
      }

      const success = await db.cancelReservation(reservation.id);
      if (!success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to cancel reservation' });
      }

      return { success: true };
    }),

  // 予約リマインダーSMSを送信（スタッフ向け）
  sendReminder: publicProcedure
    .input(z.object({
      storeSlug: z.string(),
      staffToken: z.string(),
      reservationId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const store = await db.getStoreBySlug(input.storeSlug);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      // スタッフトークン検証
      const session = await db.getStaffSession(input.staffToken);
      if (!session || session.storeId !== store.id) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid staff token' });
      }

      // 予約を取得
      const reservation = await db.getReservationById(input.reservationId);
      if (!reservation || reservation.storeId !== store.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reservation not found' });
      }

      if (!reservation.customerPhone) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No phone number registered for this reservation' });
      }

      // SMS設定を確認
      const notificationSettings = store.settings?.notifications;
      if (!notificationSettings?.smsEnabled) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'SMS notifications are not enabled for this store' });
      }

      // Twilio設定を取得
      const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'SMS service not configured' });
      }

      // リマインダーメッセージを作成
      const message = `【${store.name}】ご予約のリマインダーです。\n日時: ${reservation.reservationDate} ${reservation.reservationTime}\n人数: ${reservation.partySize}名\n予約番号: ${reservation.reservationNumber}\nご来店をお待ちしております。`;

      const { sendReservationReminderSms } = await import('./notifications');
      const result = await sendReservationReminderSms(
        reservation.id,
        store.id,
        reservation.customerPhone,
        message,
        {
          accountSid: twilioAccountSid,
          authToken: twilioAuthToken,
          fromNumber: twilioPhoneNumber,
        }
      );

      if (!result.success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.reason || 'Failed to send reminder' });
      }

      return { success: true, message: 'Reminder sent successfully' };
    }),

  // スタッフによる予約作成（電話・DM受付用）
  createByStaff: publicProcedure
    .input(z.object({
      storeSlug: z.string(),
      staffToken: z.string(),
      reservationDate: z.string(),
      reservationTime: z.string(),
      customerName: z.string().min(1),
      customerPhone: z.string().optional(),
      customerEmail: z.string().email().optional().or(z.literal('')),
      partySize: z.number().int().min(1),
      note: z.string().optional(),
      locale: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const store = await db.getStoreBySlug(input.storeSlug);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      // スタッフトークン検証
      const session = await db.getStaffSession(input.staffToken);
      if (!session || session.storeId !== store.id) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid staff token' });
      }

      const settings = store.settings?.reservation;
      if (!settings?.enabled) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Reservations are not enabled for this store' });
      }

      // 時間枠の空きを確認
      const count = await db.getReservationCountBySlot(store.id, input.reservationDate, input.reservationTime);
      const maxPerSlot = settings.maxPerSlot || 5;
      if (count >= maxPerSlot) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This time slot is fully booked' });
      }

      // 人数チェック
      const maxPartySize = settings.maxPartySize || 10;
      if (input.partySize > maxPartySize) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Maximum party size is ${maxPartySize}` });
      }

      // メールアドレスが空文字の場合はundefinedに変換
      const customerEmail = input.customerEmail && input.customerEmail.trim() !== '' ? input.customerEmail : undefined;

      const reservation = await db.createReservation({
        storeId: store.id,
        reservationDate: input.reservationDate,
        reservationTime: input.reservationTime,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail,
        partySize: input.partySize,
        note: input.note,
        locale: input.locale,
        autoConfirm: true, // スタッフ登録は自動確認
      });

      if (!reservation) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create reservation' });
      }

      return {
        reservation,
        message: 'Reservation created successfully',
      };
    }),

  // 月間予約サマリーを取得（スタッフ向け）
  getMonthlySummary: publicProcedure
    .input(z.object({
      storeSlug: z.string(),
      staffToken: z.string(),
      year: z.number(),
      month: z.number(),
    }))
    .query(async ({ input }) => {
      const store = await db.getStoreBySlug(input.storeSlug);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      // スタッフトークン検証
      const session = await db.getStaffSession(input.staffToken);
      if (!session || session.storeId !== store.id) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid staff token' });
      }

      const summary = await db.getMonthlyReservationSummary(store.id, input.year, input.month);
      return summary;
    }),

  // 週間予約一覧を取得（スタッフ向け）
  getWeeklyReservations: publicProcedure
    .input(z.object({
      storeSlug: z.string(),
      staffToken: z.string(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      const store = await db.getStoreBySlug(input.storeSlug);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      // スタッフトークン検証
      const session = await db.getStaffSession(input.staffToken);
      if (!session || session.storeId !== store.id) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid staff token' });
      }

      const reservations = await db.getWeeklyReservations(store.id, input.startDate, input.endDate);
      return reservations;
    }),

  // 予約設定を更新（オーナー向け）
  updateSettings: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      settings: z.object({
        enabled: z.boolean().optional(),
        timeSlots: z.array(z.string()).optional(),
        availableDays: z.array(z.number()).optional(),
        advanceDays: z.number().optional(),
        maxPerSlot: z.number().optional(),
        maxPartySize: z.number().optional(),
        autoConfirm: z.boolean().optional(),
        smsReminder: z.boolean().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      const currentSettings = store.settings || {};
      const newSettings = {
        ...currentSettings,
        reservation: {
          ...currentSettings.reservation,
          ...input.settings,
        },
      };

      await db.updateStoreSettings(input.storeId, newSettings);

      return { success: true };
    }),
});

// ==================== Main Router ====================
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  store: storeRouter,
  ticket: ticketRouter,
  staff: staffRouter,
  menu: menuRouter,
  notification: notificationRouter,
  stripe: stripeRouter,
  smsLogs: smsLogsRouter,
  reservation: reservationRouter,
});

export type AppRouter = typeof appRouter;
