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
      // Return public info only
      return {
        id: store.id,
        slug: store.slug,
        name: store.name,
        intakeStatus: store.intakeStatus,
        defaultLocale: store.defaultLocale,
        supportedLocales: store.supportedLocales,
        settings: {
          queue: store.settings?.queue,
          menu: store.settings?.menu,
          kiosk: store.settings?.kiosk,
          board: store.settings?.board,
        },
      };
    }),

  getBySlugWithKey: publicProcedure
    .input(z.object({
      slug: z.string(),
      key: z.string().optional(),
      keyType: z.enum(['kiosk', 'board']),
    }))
    .query(async ({ input }) => {
      const store = await db.getStoreBySlug(input.slug);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      const expectedKey = input.keyType === 'kiosk' ? store.kioskKey : store.boardKey;
      if (!input.key || !expectedKey || input.key !== expectedKey) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access key required' });
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
      
      return {
        currentNumber: calledTicket?.number || 0,
        waitingCount,
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

  // Regenerate key (protected)
  regenerateKey: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      keyType: z.enum(['kiosk', 'board']),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      const newKey = await db.regenerateStoreKey(input.storeId, input.keyType);
      return { key: newKey };
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

      return {
        ...ticket,
        groupsAhead,
        currentNumber: calledTicket?.number || 0,
      };
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

  // Checkin (public)
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

      const headerRow = ['Date', 'Recipient', 'Type', 'Message', 'Status', 'Credits', 'TicketId'];
      const dataRows = logs.map((log) => [
        new Date(log.createdAt).toISOString(),
        log.phoneE164,
        log.messageType,
        log.messageContent,
        log.status,
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
});

export type AppRouter = typeof appRouter;
