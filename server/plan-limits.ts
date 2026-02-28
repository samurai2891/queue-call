/**
 * プラン別機能制限チェック
 * 各プロシージャから呼び出して、店舗のプランに応じた機能制限を強制する
 */
import { TRPCError } from "@trpc/server";
import { PLANS, type PlanId, type PlanDefinition } from "./subscription";

/**
 * 店舗のプランに応じた機能定義を取得
 */
export function getPlanFeatures(subscriptionPlan: string | null | undefined): PlanDefinition["features"] {
  const planId = (subscriptionPlan || "free") as PlanId;
  const plan = PLANS[planId] || PLANS.free;
  return plan.features;
}

/**
 * 店舗のプラン定義を取得
 */
export function getStorePlan(subscriptionPlan: string | null | undefined): PlanDefinition {
  const planId = (subscriptionPlan || "free") as PlanId;
  return PLANS[planId] || PLANS.free;
}

/**
 * SMS通知がプランで許可されているかチェック
 * Free: 不可 / Standard, Pro: 可
 */
export function checkSmsAllowed(subscriptionPlan: string | null | undefined): void {
  const features = getPlanFeatures(subscriptionPlan);
  if (!features.smsEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "SMS通知はStandard以上のプランで利用できます。プランをアップグレードしてください。",
    });
  }
}

/**
 * 予約機能がプランで許可されているかチェック
 * Free: 不可 / Standard, Pro: 可
 */
export function checkReservationAllowed(subscriptionPlan: string | null | undefined): void {
  const features = getPlanFeatures(subscriptionPlan);
  if (!features.reservationEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "予約機能はStandard以上のプランで利用できます。プランをアップグレードしてください。",
    });
  }
}

/**
 * メニュー/フィード数がプランの上限内かチェック
 * Free: 5品まで / Standard, Pro: 無制限
 */
export function checkMenuLimit(subscriptionPlan: string | null | undefined, currentCount: number): void {
  const features = getPlanFeatures(subscriptionPlan);
  if (features.menuLimit !== null && currentCount >= features.menuLimit) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `メニューは${features.menuLimit}品までです。Standard以上のプランにアップグレードすると無制限にご利用いただけます。`,
    });
  }
}

/**
 * 営業時間制御がプランで許可されているかチェック
 * Free: 不可 / Standard, Pro: 可
 */
export function checkBusinessHoursAllowed(subscriptionPlan: string | null | undefined): void {
  const features = getPlanFeatures(subscriptionPlan);
  if (!features.businessHoursEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "営業時間制御はStandard以上のプランで利用できます。プランをアップグレードしてください。",
    });
  }
}

/**
 * スタッフアカウント数がプランの上限内かチェック
 * Free: 1名 / Standard: 3名 / Pro: 無制限
 */
export function checkStaffLimit(subscriptionPlan: string | null | undefined, currentCount: number): void {
  const features = getPlanFeatures(subscriptionPlan);
  if (features.staffLimit !== null && currentCount >= features.staffLimit) {
    const planName = features.staffLimit === 1 ? "Standard" : "Pro";
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `スタッフは${features.staffLimit}名までです。${planName}以上のプランにアップグレードすると${features.staffLimit === 1 ? "3名まで" : "無制限に"}ご利用いただけます。`,
    });
  }
}

/**
 * 分析データの日数制限を取得
 * Free: 1日（当日のみ） / Standard: 30日 / Pro: 90日
 */
export function getAnalyticsDaysLimit(subscriptionPlan: string | null | undefined): number {
  const features = getPlanFeatures(subscriptionPlan);
  return features.analyticsDays;
}

/**
 * CSV出力がプランで許可されているかチェック
 * Free, Standard: 不可 / Pro: 可
 */
export function checkCsvExportAllowed(subscriptionPlan: string | null | undefined): void {
  const features = getPlanFeatures(subscriptionPlan);
  if (!features.csvExport) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "CSV出力はProプランで利用できます。プランをアップグレードしてください。",
    });
  }
}

/**
 * ブランディングレベルを取得
 * Free: basic（Queue Callロゴ表示） / Standard: custom_color / Pro: full
 */
export function getBrandingLevel(subscriptionPlan: string | null | undefined): "basic" | "custom_color" | "full" {
  const features = getPlanFeatures(subscriptionPlan);
  return features.brandingLevel;
}

/**
 * ブランディング設定の変更がプランで許可されているかチェック
 */
export function checkBrandingAllowed(subscriptionPlan: string | null | undefined, settingType: "color" | "logo"): void {
  const level = getBrandingLevel(subscriptionPlan);
  if (settingType === "color" && level === "basic") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "カスタムカラーはStandard以上のプランで利用できます。プランをアップグレードしてください。",
    });
  }
  if (settingType === "logo" && level !== "full") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "カスタムロゴはProプランで利用できます。プランをアップグレードしてください。",
    });
  }
}

/**
 * プラン制限の概要を返す（フロントエンド表示用）
 */
export function getPlanLimitsInfo(subscriptionPlan: string | null | undefined): {
  planId: string;
  planName: string;
  smsEnabled: boolean;
  reservationEnabled: boolean;
  menuLimit: number | null;
  analyticsDays: number;
  csvExport: boolean;
  businessHoursEnabled: boolean;
  staffLimit: number | null;
  brandingLevel: "basic" | "custom_color" | "full";
  supportLevel: "community" | "email" | "priority_email";
} {
  const plan = getStorePlan(subscriptionPlan);
  return {
    planId: plan.id,
    planName: plan.nameJa,
    ...plan.features,
  };
}
