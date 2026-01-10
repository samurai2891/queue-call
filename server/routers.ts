import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { broadcastQueueUpdate, broadcastTicketUpdate, broadcastIntakeStatus } from "./sse";
import * as bcrypt from "bcryptjs";

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
    .mutation(async ({ input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }
      if (store.intakeStatus === 'paused') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Intake is paused' });
      }

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

      // Broadcast update
      const waitingCount = await db.getWaitingCount(ticket.storeId);
      const calledTicket = await db.getCalledTicket(ticket.storeId);
      broadcastQueueUpdate(ticket.storeId, {
        currentNumber: calledTicket?.number || 0,
        waitingCount,
      });

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

// ==================== Staff Router ====================
const staffRouter = router({
  // Login with PIN
  login: publicProcedure
    .input(z.object({
      storeId: z.number(),
      pin: z.string(),
    }))
    .mutation(async ({ input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' });
      }

      // Check manager PIN first
      if (store.managerPinHash) {
        const isManager = await bcrypt.compare(input.pin, store.managerPinHash);
        if (isManager) {
          const sessionToken = await db.createStaffSession({ storeId: input.storeId, role: 'manager' });
          return { sessionToken, role: 'manager' as const };
        }
      }

      // Check staff PIN
      if (store.staffPinHash) {
        const isStaff = await bcrypt.compare(input.pin, store.staffPinHash);
        if (isStaff) {
          const sessionToken = await db.createStaffSession({ storeId: input.storeId, role: 'staff' });
          return { sessionToken, role: 'staff' as const };
        }
      }

      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid PIN' });
    }),

  // Logout
  logout: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .mutation(async ({ input }) => {
      await db.deleteStaffSession(input.sessionToken);
      return { success: true };
    }),

  // Get session
  getSession: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const session = await db.getStaffSession(input.sessionToken);
      if (!session) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
      }
      return session;
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

  // Call next
  callNext: publicProcedure
    .input(z.object({ 
      sessionToken: z.string(),
      storeId: z.number() 
    }))
    .mutation(async ({ input }) => {
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

      return nextTicket;
    }),

  // Call specific ticket
  callSpecific: publicProcedure
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

      const store = await db.getStoreById(session.storeId);
      const graceMinutes = store?.settings?.queue?.checkinGraceMinutes || 5;
      const checkinDeadlineAt = new Date(Date.now() + graceMinutes * 60 * 1000);

      await db.updateTicketStatus(ticket.id, 'CALLED', { checkinDeadlineAt });

      // Log if audit enabled
      if (store?.settings?.queue?.auditLog) {
        await db.createAuditLog({
          storeId: session.storeId,
          ticketId: ticket.id,
          action: 'CALL_SPECIFIC',
          reason: input.reason,
          performedBy: session.role,
        });
      }

      // Broadcast updates
      const waitingCount = await db.getWaitingCount(session.storeId);
      broadcastQueueUpdate(session.storeId, {
        currentNumber: ticket.number,
        waitingCount,
        calledTicket: { number: ticket.number, ticketToken: ticket.ticketToken },
      });

      return ticket;
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

      await db.updateTicketStatus(ticket.id, 'SKIPPED');

      // Log
      const store = await db.getStoreById(session.storeId);
      if (store?.settings?.queue?.auditLog) {
        await db.createAuditLog({
          storeId: session.storeId,
          ticketId: ticket.id,
          action: 'SKIP',
          reason: input.reason,
          performedBy: session.role,
        });
      }

      // Broadcast
      const waitingCount = await db.getWaitingCount(session.storeId);
      const calledTicket = await db.getCalledTicket(session.storeId);
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

      await db.updateTicketStatus(ticket.id, 'DONE');

      // Broadcast
      const waitingCount = await db.getWaitingCount(session.storeId);
      const calledTicket = await db.getCalledTicket(session.storeId);
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
});

// ==================== Menu Router ====================
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
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await db.getStoreById(input.storeId);
      if (!store || store.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      await db.createFeedPost(input);
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

  // Register SMS (start verification)
  registerSms: publicProcedure
    .input(z.object({
      ticketId: z.number(),
      phoneE164: z.string(),
    }))
    .mutation(async ({ input }) => {
      // TODO: Implement Twilio verification
      await db.createSmsSubscription({
        ticketId: input.ticketId,
        phoneE164: input.phoneE164,
      });
      return { success: true, message: 'Verification code sent' };
    }),

  // Verify SMS
  verifySms: publicProcedure
    .input(z.object({
      ticketId: z.number(),
      code: z.string(),
    }))
    .mutation(async ({ input }) => {
      // TODO: Implement Twilio verification
      const subscription = await db.getSmsSubscriptionByTicket(input.ticketId);
      if (!subscription) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });
      }

      await db.updateSmsSubscription(subscription.id, { verifiedAt: new Date() });
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
});

export type AppRouter = typeof appRouter;
