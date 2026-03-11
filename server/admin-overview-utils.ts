export type OverviewPlanId = "free" | "standard" | "pro";

export type DailyCountPoint = {
  date: string;
  count: number;
};

export type RecentActivityType =
  | "user_created"
  | "store_created"
  | "ticket_created"
  | "sms_sent"
  | "sms_charge";

export type RecentActivityItem = {
  id: string;
  type: RecentActivityType;
  occurredAt: string;
  title: string;
  description: string;
  storeId?: number;
  storeName?: string;
  userId?: number;
};

export function normalizeOverviewPlanId(
  planId: string | null | undefined
): OverviewPlanId {
  if (!planId) return "free";
  if (planId === "premium") return "pro";
  if (planId === "free" || planId === "standard" || planId === "pro") {
    return planId;
  }
  return "free";
}

export function getPlanMrr(planId: OverviewPlanId) {
  const plan = {
    free: { exclTax: 0, inclTax: 0 },
    standard: { exclTax: 1500, inclTax: 1650 },
    pro: { exclTax: 3500, inclTax: 3850 },
  }[planId];
  return {
    exclTax: plan.exclTax,
    inclTax: plan.inclTax,
  };
}

export function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fillMissingDailyCounts(
  rows: DailyCountPoint[],
  days: number,
  now: Date = new Date()
) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);

  const countMap = new Map(
    rows.map(row => [row.date, Number(row.count ?? 0)] as const)
  );

  return Array.from({ length: days }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    const dateKey = formatLocalDateKey(current);

    return {
      date: dateKey,
      count: countMap.get(dateKey) ?? 0,
    };
  });
}
