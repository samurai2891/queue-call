import { z } from "zod";
import { router, internalAdminProcedure } from "../_core/trpc";
import { getAuthSubject, getInternalAdminIds } from "../_core/internalAdmin";
import {
  getAdminStoreDetail,
  getAdminStoresPage,
  getAdminUserDetail,
  getAdminUsersPage,
  getOverviewKpis,
  getOverviewPlanDistribution,
  getOverviewRecentActivity,
  getOverviewTicketChart,
  updateAdminStoreIntakeStatus,
  updateAdminStoreTestFlag,
  updateAdminUserStatus,
  updateAdminUserTestFlag,
} from "../db";

const pageInput = z.object({
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
  query: z.string().optional().default(""),
});

export const adminRouter = router({
  status: internalAdminProcedure.query(({ ctx }) => ({
    ok: true,
    authSubject: getAuthSubject(ctx.user),
  })),
  overview: router({
    kpi: internalAdminProcedure
      .input(
        z.object({
          includeTest: z.boolean().optional().default(false),
        })
      )
      .query(async ({ input }) => {
        return getOverviewKpis({
          includeTest: input.includeTest,
          excludedOpenIds: getInternalAdminIds(),
        });
      }),
    ticketChart: internalAdminProcedure
      .input(
        z.object({
          includeTest: z.boolean().optional().default(false),
          days: z.number().min(1).max(365).optional().default(30),
        })
      )
      .query(async ({ input }) => {
        return getOverviewTicketChart({
          includeTest: input.includeTest,
          days: input.days,
        });
      }),
    planDistribution: internalAdminProcedure
      .input(
        z.object({
          includeTest: z.boolean().optional().default(false),
        })
      )
      .query(async ({ input }) => {
        return getOverviewPlanDistribution({
          includeTest: input.includeTest,
        });
      }),
    recentActivity: internalAdminProcedure
      .input(
        z.object({
          includeTest: z.boolean().optional().default(false),
          limit: z.number().min(1).max(50).optional().default(20),
        })
      )
      .query(async ({ input }) => {
        return getOverviewRecentActivity({
          includeTest: input.includeTest,
          limit: input.limit,
          excludedOpenIds: getInternalAdminIds(),
        });
      }),
  }),
  users: router({
    list: internalAdminProcedure
      .input(
        pageInput.extend({
          status: z.enum(["all", "active", "suspended"]).optional().default("all"),
          testFilter: z.enum(["all", "test", "production"]).optional().default("all"),
          internalAdminFilter: z
            .enum(["all", "internal_admin", "non_internal_admin"])
            .optional()
            .default("all"),
        })
      )
      .query(async ({ input }) => {
        return getAdminUsersPage({
          ...input,
          internalAdminOpenIds: getInternalAdminIds(),
        });
      }),
    detail: internalAdminProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .query(async ({ input }) => {
        return getAdminUserDetail({
          userId: input.userId,
          internalAdminOpenIds: getInternalAdminIds(),
        });
      }),
    updateStatus: internalAdminProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          status: z.enum(["active", "suspended"]),
        })
      )
      .mutation(async ({ input }) => {
        await updateAdminUserStatus(input.userId, input.status);
        return { success: true } as const;
      }),
    updateTestFlag: internalAdminProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          isTest: z.boolean(),
        })
      )
      .mutation(async ({ input }) => {
        await updateAdminUserTestFlag(input.userId, input.isTest);
        return { success: true } as const;
      }),
  }),
  stores: router({
    list: internalAdminProcedure
      .input(
        pageInput.extend({
          status: z.enum(["all", "open", "paused"]).optional().default("all"),
          testFilter: z.enum(["all", "test", "production"]).optional().default("all"),
          planFilter: z.enum(["all", "free", "standard", "pro"]).optional().default("all"),
        })
      )
      .query(async ({ input }) => {
        return getAdminStoresPage(input);
      }),
    detail: internalAdminProcedure
      .input(z.object({ storeId: z.number().int().positive() }))
      .query(async ({ input }) => {
        return getAdminStoreDetail(input.storeId);
      }),
    updateStatus: internalAdminProcedure
      .input(
        z.object({
          storeId: z.number().int().positive(),
          status: z.enum(["open", "paused"]),
        })
      )
      .mutation(async ({ input }) => {
        await updateAdminStoreIntakeStatus(input.storeId, input.status);
        return { success: true } as const;
      }),
    updateTestFlag: internalAdminProcedure
      .input(
        z.object({
          storeId: z.number().int().positive(),
          isTest: z.boolean(),
        })
      )
      .mutation(async ({ input }) => {
        await updateAdminStoreTestFlag(input.storeId, input.isTest);
        return { success: true } as const;
      }),
  }),
});
