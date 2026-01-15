import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

const buildErrorContext = (input: unknown) => {
  if (!input || typeof input !== "object") {
    return {};
  }

  const record = input as Record<string, unknown>;
  const context = {
    storeId: typeof record.storeId === "number" ? record.storeId : undefined,
    storeSlug:
      typeof record.storeSlug === "string"
        ? record.storeSlug
        : typeof record.slug === "string"
          ? record.slug
          : undefined,
    ticketId: typeof record.ticketId === "number" ? record.ticketId : undefined,
    ticketToken:
      typeof record.ticketToken === "string"
        ? record.ticketToken
        : typeof record.token === "string"
          ? record.token
          : undefined,
  };

  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined)
  );
};

const logErrors = t.middleware(async opts => {
  try {
    return await opts.next();
  } catch (error) {
    const context = buildErrorContext(opts.rawInput);
    console.error(
      "[API] Request failed",
      {
        requestId: opts.ctx.requestId,
        path: opts.path,
        ...context,
      },
      error
    );
    throw error;
  }
});

export const router = t.router;
export const publicProcedure = t.procedure.use(logErrors);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireUser);

export const adminProcedure = publicProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
