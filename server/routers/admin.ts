import { z } from "zod";
import { router, internalAdminProcedure } from "../_core/trpc";
import { getAuthSubject, getInternalAdminIds } from "../_core/internalAdmin";
import {
  getOverviewKpis,
  getOverviewPlanDistribution,
  getOverviewRecentActivity,
  getOverviewTicketChart,
} from "../db";

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
});
