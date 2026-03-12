/**
 * プラン別機能制限チェック
 * 各プロシージャから呼び出して、店舗のプランに応じた機能制限を強制する
 */
import { TRPCError } from "@trpc/server";
import { PLANS, type PlanId, type PlanDefinition } from "./subscription";
import { resolveEffectivePlanId, type PlanSource } from "./admin-overview-utils";

/**
 * 店舗のプランに応じた機能定義を取得
 */
export function getPlanFeatures(subscriptionPlan: PlanSource): PlanDefinition["features"] {
  const planId = resolveEffectivePlanId(subscriptionPlan) as PlanId;
  const plan = PLANS[planId] || PLANS.free;
  return plan.features;
}

/**
 * 店舗のプラン定義を取得
 */
export function getStorePlan(subscriptionPlan: PlanSource): PlanDefinition {
  const planId = resolveEffectivePlanId(subscriptionPlan) as PlanId;
  return PLANS[planId] || PLANS.free;
}

/**
 * SMS通知がプランで許可されているかチェック
 * Free: 不可 / Standard, Pro: 可
 */
export function checkSmsAllowed(subscriptionPlan: PlanSource): void {
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
export function checkReservationAllowed(subscriptionPlan: PlanSource): void {
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
export function checkMenuLimit(subscriptionPlan: PlanSource, currentCount: number): void {
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
export function checkBusinessHoursAllowed(subscriptionPlan: PlanSource): void {
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
export function checkStaffLimit(subscriptionPlan: PlanSource, currentCount: number): void {
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
export function getAnalyticsDaysLimit(subscriptionPlan: PlanSource): number {
  const features = getPlanFeatures(subscriptionPlan);
  return features.analyticsDays;
}

/**
 * CSV出力がプランで許可されているかチェック
 * Free, Standard: 不可 / Pro: 可
 */
export function checkCsvExportAllowed(subscriptionPlan: PlanSource): void {
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
export function getBrandingLevel(subscriptionPlan: PlanSource): "basic" | "custom_color" | "full" {
  const features = getPlanFeatures(subscriptionPlan);
  return features.brandingLevel;
}

/**
 * ブランディング設定の変更がプランで許可されているかチェック
 */
export function checkBrandingAllowed(subscriptionPlan: PlanSource, settingType: "color" | "logo"): void {
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
 * プランアップグレードで解放された機能一覧を返す
 * @param oldPlanId 旧プランID
 * @param newPlanId 新プランID
 * @returns 解放された機能のキーと説明の配列
 */
export function getUnlockedFeatures(
  oldPlanId: PlanSource,
  newPlanId: PlanSource
): Array<{ key: string; settingsTab?: string }> {
  const oldFeatures = getPlanFeatures(oldPlanId);
  const newFeatures = getPlanFeatures(newPlanId);
  const unlocked: Array<{ key: string; settingsTab?: string }> = [];

  // SMS通知
  if (!oldFeatures.smsEnabled && newFeatures.smsEnabled) {
    unlocked.push({ key: 'sms', settingsTab: 'notifications' });
  }
  // 予約機能
  if (!oldFeatures.reservationEnabled && newFeatures.reservationEnabled) {
    unlocked.push({ key: 'reservation', settingsTab: 'reservation' });
  }
  // メニュー無制限
  if (oldFeatures.menuLimit !== null && newFeatures.menuLimit === null) {
    unlocked.push({ key: 'menuUnlimited', settingsTab: 'menu' });
  }
  // 営業時間制御
  if (!oldFeatures.businessHoursEnabled && newFeatures.businessHoursEnabled) {
    unlocked.push({ key: 'businessHours', settingsTab: 'businessHours' });
  }
  // スタッフ数増加
  if (
    (oldFeatures.staffLimit !== null && newFeatures.staffLimit === null) ||
    (oldFeatures.staffLimit !== null && newFeatures.staffLimit !== null && newFeatures.staffLimit > oldFeatures.staffLimit)
  ) {
    unlocked.push({ key: 'staffIncrease', settingsTab: 'security' });
  }
  // 分析期間拡大
  if (newFeatures.analyticsDays > oldFeatures.analyticsDays) {
    unlocked.push({ key: 'analyticsExpanded' });
  }
  // CSVエクスポート
  if (!oldFeatures.csvExport && newFeatures.csvExport) {
    unlocked.push({ key: 'csvExport' });
  }
  // カスタムカラー
  if (oldFeatures.brandingLevel === 'basic' && newFeatures.brandingLevel !== 'basic') {
    unlocked.push({ key: 'customColor', settingsTab: 'branding' });
  }
  // カスタムロゴ
  if (oldFeatures.brandingLevel !== 'full' && newFeatures.brandingLevel === 'full') {
    unlocked.push({ key: 'customLogo', settingsTab: 'branding' });
  }
  // サポートレベル向上
  const supportOrder = { community: 0, email: 1, priority_email: 2 };
  if (supportOrder[newFeatures.supportLevel] > supportOrder[oldFeatures.supportLevel]) {
    unlocked.push({ key: 'supportUpgrade' });
  }

  return unlocked;
}

/**
 * プランダウングレードで失われる機能一覧を返す
 * @param currentPlanId 現在のプランID
 * @param targetPlanId ダウングレード先のプランID（キャンセル時は'free'）
 * @returns 失われる機能のキーと影響説明の配列
 */
export function getLostFeatures(
  currentPlanId: PlanSource,
  targetPlanId: PlanSource
): Array<{ key: string; impact: string }> {
  const currentFeatures = getPlanFeatures(currentPlanId);
  const targetFeatures = getPlanFeatures(targetPlanId);
  const lost: Array<{ key: string; impact: string }> = [];

  // SMS通知
  if (currentFeatures.smsEnabled && !targetFeatures.smsEnabled) {
    lost.push({ key: 'sms', impact: 'sms_disabled' });
  }
  // 予約機能
  if (currentFeatures.reservationEnabled && !targetFeatures.reservationEnabled) {
    lost.push({ key: 'reservation', impact: 'reservation_disabled' });
  }
  // メニュー数制限
  if (currentFeatures.menuLimit === null && targetFeatures.menuLimit !== null) {
    lost.push({ key: 'menuLimit', impact: 'menu_limited' });
  }
  // 営業時間制御
  if (currentFeatures.businessHoursEnabled && !targetFeatures.businessHoursEnabled) {
    lost.push({ key: 'businessHours', impact: 'business_hours_disabled' });
  }
  // スタッフ数減少
  if (
    (currentFeatures.staffLimit === null && targetFeatures.staffLimit !== null) ||
    (currentFeatures.staffLimit !== null && targetFeatures.staffLimit !== null && currentFeatures.staffLimit > targetFeatures.staffLimit)
  ) {
    const newLimit = targetFeatures.staffLimit;
    lost.push({ key: 'staffDecrease', impact: `staff_limited_${newLimit}` });
  }
  // 分析期間縮小
  if (currentFeatures.analyticsDays > targetFeatures.analyticsDays) {
    lost.push({ key: 'analyticsReduced', impact: `analytics_reduced_${targetFeatures.analyticsDays}` });
  }
  // CSVエクスポート
  if (currentFeatures.csvExport && !targetFeatures.csvExport) {
    lost.push({ key: 'csvExport', impact: 'csv_disabled' });
  }
  // カスタムカラー
  if (currentFeatures.brandingLevel !== 'basic' && targetFeatures.brandingLevel === 'basic') {
    lost.push({ key: 'customColor', impact: 'color_disabled' });
  }
  // カスタムロゴ
  if (currentFeatures.brandingLevel === 'full' && targetFeatures.brandingLevel !== 'full') {
    lost.push({ key: 'customLogo', impact: 'logo_disabled' });
  }
  // サポートレベル低下
  const supportOrder = { community: 0, email: 1, priority_email: 2 };
  if (supportOrder[currentFeatures.supportLevel] > supportOrder[targetFeatures.supportLevel]) {
    lost.push({ key: 'supportDowngrade', impact: 'support_downgraded' });
  }

  return lost;
}

/**
 * プラン制限の概要を返す（フロントエンド表示用）
 */
export function getPlanLimitsInfo(subscriptionPlan: PlanSource): {
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
