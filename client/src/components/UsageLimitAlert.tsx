import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  AlertTriangle,
  TrendingUp,
  UtensilsCrossed,
  Users,
  Newspaper,
  Crown,
  ArrowRight,
} from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import type { TranslationKey } from '../../../shared/i18n/translations';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';

// 80%以上で警告を表示する閾値
const WARNING_THRESHOLD = 0.8;

// セッション内での再表示を防止するためのキー
const SESSION_STORAGE_PREFIX = 'qc_usage_alert_dismissed_';

interface UsageLimitAlertProps {
  storeId: number;
}

interface ApproachingLimit {
  key: string;
  label: string;
  current: number;
  limit: number;
  percentage: number;
  icon: React.ElementType;
}

// ─── ドーナツチャート SVG コンポーネント ───

interface DonutChartProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  isAtLimit: boolean;
  icon: React.ElementType;
  label: string;
  current: number;
  limit: number;
  tooltipText: string;
}

function DonutChart({
  percentage,
  size = 96,
  strokeWidth = 8,
  isAtLimit,
  icon: Icon,
  label,
  current,
  limit,
  tooltipText,
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (percentage / 100) * circumference;
  const center = size / 2;

  // アニメーション用のstate
  const [animatedOffset, setAnimatedOffset] = useState(circumference);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedOffset(dashOffset);
    }, 150);
    return () => clearTimeout(timer);
  }, [dashOffset]);

  // 色の決定
  const trackColor = isAtLimit
    ? 'stroke-destructive/15'
    : 'stroke-amber-200 dark:stroke-amber-900/40';
  const progressColor = isAtLimit
    ? 'stroke-destructive'
    : 'stroke-amber-500';
  const textColor = isAtLimit
    ? 'text-destructive'
    : 'text-amber-600 dark:text-amber-400';
  const iconColor = isAtLimit
    ? 'text-destructive'
    : 'text-amber-600 dark:text-amber-400';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col items-center gap-2 cursor-default">
          <div className="relative" style={{ width: size, height: size }}>
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="transform -rotate-90"
            >
              {/* 背景トラック */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                className={trackColor}
              />
              {/* プログレス弧 */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                className={progressColor}
                strokeDasharray={circumference}
                strokeDashoffset={animatedOffset}
                style={{
                  transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </svg>
            {/* 中央のパーセンテージ表示 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-lg font-bold tabular-nums leading-none ${textColor}`}>
                {percentage}%
              </span>
            </div>
          </div>
          {/* ラベルと数値 */}
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1">
              <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
              <span className="text-xs font-medium text-foreground">{label}</span>
            </div>
            <span className={`text-xs font-semibold tabular-nums ${textColor}`}>
              {current} / {limit}
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── 全体サマリーのミニバーチャート ───

interface UsageSummaryBarProps {
  items: ApproachingLimit[];
}

function UsageSummaryBar({ items }: UsageSummaryBarProps) {
  const totalPercentage = items.length > 0
    ? Math.round(items.reduce((sum, item) => sum + item.percentage, 0) / items.length)
    : 0;

  const hasAtLimit = items.some(i => i.percentage >= 100);
  const barColor = hasAtLimit
    ? 'bg-destructive'
    : 'bg-amber-500';
  const bgColor = hasAtLimit
    ? 'bg-destructive/15'
    : 'bg-amber-200 dark:bg-amber-900/40';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">
          {hasAtLimit ? '⚠' : '📊'} 平均使用率
        </span>
        <span className={`font-bold tabular-nums ${
          hasAtLimit ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'
        }`}>
          {totalPercentage}%
        </span>
      </div>
      <div className={`h-1.5 rounded-full ${bgColor} overflow-hidden`}>
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`}
          style={{ width: `${Math.min(totalPercentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─── セッション管理ユーティリティ ───

function isDismissedInSession(storeId: number): boolean {
  try {
    const key = `${SESSION_STORAGE_PREFIX}${storeId}`;
    const stored = sessionStorage.getItem(key);
    if (!stored) return false;
    const data = JSON.parse(stored);
    return data.dismissed === true;
  } catch {
    return false;
  }
}

function markDismissedInSession(storeId: number, dismissedLimits: string[]): void {
  try {
    const key = `${SESSION_STORAGE_PREFIX}${storeId}`;
    sessionStorage.setItem(key, JSON.stringify({
      dismissed: true,
      limits: dismissedLimits,
      timestamp: Date.now(),
    }));
  } catch {
    // sessionStorage not available
  }
}

function getDismissedLimits(storeId: number): string[] {
  try {
    const key = `${SESSION_STORAGE_PREFIX}${storeId}`;
    const stored = sessionStorage.getItem(key);
    if (!stored) return [];
    const data = JSON.parse(stored);
    return data.limits || [];
  } catch {
    return [];
  }
}

// ─── ツールチップテキスト生成ヘルパー ───

function getTooltipText(
  t: (key: TranslationKey) => string,
  current: number,
  limit: number,
): string {
  const remaining = limit - current;
  if (remaining <= 0) {
    return t('usageLimitAlert.tooltipAtLimit');
  }
  return t('usageLimitAlert.tooltipRemaining').replace('{remaining}', String(remaining));
}

// ─── メインコンポーネント ───

export function UsageLimitAlert({ storeId }: UsageLimitAlertProps) {
  const { t } = useLocale();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const { data: usage } = trpc.subscription.getPlanUsage.useQuery(
    { storeId },
    { staleTime: 60_000 }
  );

  // 上限に近づいている項目を計算
  const approachingLimits = useMemo<ApproachingLimit[]>(() => {
    if (!usage) return [];

    const items: ApproachingLimit[] = [];

    // メニュー
    if (usage.usage.menu.limit !== null && usage.usage.menu.limit > 0) {
      const pct = usage.usage.menu.current / usage.usage.menu.limit;
      if (pct >= WARNING_THRESHOLD) {
        items.push({
          key: 'menu',
          label: t('usageLimitAlert.menuItems'),
          current: usage.usage.menu.current,
          limit: usage.usage.menu.limit,
          percentage: Math.min(Math.round(pct * 100), 100),
          icon: UtensilsCrossed,
        });
      }
    }

    // スタッフ
    if (usage.usage.staff.limit !== null && usage.usage.staff.limit > 0) {
      const pct = usage.usage.staff.current / usage.usage.staff.limit;
      if (pct >= WARNING_THRESHOLD) {
        items.push({
          key: 'staff',
          label: t('usageLimitAlert.staffAccounts'),
          current: usage.usage.staff.current,
          limit: usage.usage.staff.limit,
          percentage: Math.min(Math.round(pct * 100), 100),
          icon: Users,
        });
      }
    }

    // フィード
    if (usage.usage.feed.limit !== null && usage.usage.feed.limit > 0) {
      const pct = usage.usage.feed.current / usage.usage.feed.limit;
      if (pct >= WARNING_THRESHOLD) {
        items.push({
          key: 'feed',
          label: t('usageLimitAlert.feedPosts'),
          current: usage.usage.feed.current,
          limit: usage.usage.feed.limit,
          percentage: Math.min(Math.round(pct * 100), 100),
          icon: Newspaper,
        });
      }
    }

    return items;
  }, [usage, t]);

  // 表示判定
  useEffect(() => {
    if (!usage || hasChecked) return;
    setHasChecked(true);

    // Proプランは無制限なので表示しない
    if (usage.planId === 'pro') return;

    if (approachingLimits.length === 0) return;

    // セッション内で既に閉じた場合
    const dismissedLimits = getDismissedLimits(storeId);
    const currentLimitKeys = approachingLimits.map(l => `${l.key}:${l.current}`);
    
    // 新しい制限項目が追加された場合は再表示
    const hasNewLimits = currentLimitKeys.some(k => !dismissedLimits.includes(k));
    
    if (isDismissedInSession(storeId) && !hasNewLimits) return;

    // 少し遅延してから表示（ページ読み込み直後に表示しない）
    const timer = setTimeout(() => {
      setOpen(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [usage, approachingLimits, storeId, hasChecked]);

  const handleDismiss = useCallback(() => {
    const limitKeys = approachingLimits.map(l => `${l.key}:${l.current}`);
    markDismissedInSession(storeId, limitKeys);
    setOpen(false);
  }, [storeId, approachingLimits]);

  const handleUpgrade = useCallback(() => {
    setOpen(false);
    navigate('/admin/settings/billing');
  }, [navigate]);

  if (approachingLimits.length === 0) return null;

  const hasAtLimit = approachingLimits.some(l => l.percentage >= 100);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
              hasAtLimit
                ? 'bg-destructive/10'
                : 'bg-amber-100 dark:bg-amber-900/30'
            }`}>
              {hasAtLimit ? (
                <AlertTriangle className="h-6 w-6 text-destructive" />
              ) : (
                <TrendingUp className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              )}
            </div>
            <div>
              <DialogTitle className="text-lg">
                {hasAtLimit
                  ? t('usageLimitAlert.titleAtLimit')
                  : t('usageLimitAlert.titleApproaching')
                }
              </DialogTitle>
              <DialogDescription className="mt-1">
                {hasAtLimit
                  ? t('usageLimitAlert.descriptionAtLimit')
                  : t('usageLimitAlert.descriptionApproaching')
                }
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* ドーナツチャートグリッド */}
        <div className="py-4">
          <div className={`grid gap-4 ${
            approachingLimits.length === 1
              ? 'grid-cols-1 max-w-[140px] mx-auto'
              : approachingLimits.length === 2
              ? 'grid-cols-2 max-w-[280px] mx-auto'
              : 'grid-cols-3'
          }`}>
            {approachingLimits.map((item) => (
              <DonutChart
                key={item.key}
                percentage={item.percentage}
                isAtLimit={item.percentage >= 100}
                icon={item.icon}
                label={item.label}
                current={item.current}
                limit={item.limit}
                tooltipText={getTooltipText(t, item.current, item.limit)}
              />
            ))}
          </div>

          {/* 平均使用率サマリーバー */}
          {approachingLimits.length > 1 && (
            <div className="mt-4 pt-3 border-t">
              <UsageSummaryBar items={approachingLimits} />
            </div>
          )}

          {/* アップグレードの利点 */}
          <div className="mt-4 rounded-lg bg-primary/5 border border-primary/10 p-3">
            <div className="flex items-start gap-2">
              <Crown className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-primary">
                  {t('usageLimitAlert.upgradeTitle')}
                </p>
                <p className="text-muted-foreground mt-1">
                  {t('usageLimitAlert.upgradeDescription')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleDismiss}
            className="sm:flex-1"
          >
            {t('usageLimitAlert.dismissButton')}
          </Button>
          <Button
            onClick={handleUpgrade}
            className="sm:flex-1 gap-2"
          >
            <Crown className="h-4 w-4" />
            {t('usageLimitAlert.upgradeButton')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * フック: 使用量アラートの状態を管理
 * 外部から使用量の変化を検知してアラートを再表示するために使用
 */
export function useUsageLimitAlert(storeId: number | undefined) {
  const resetDismissal = useCallback(() => {
    if (!storeId) return;
    try {
      const key = `${SESSION_STORAGE_PREFIX}${storeId}`;
      sessionStorage.removeItem(key);
    } catch {
      // sessionStorage not available
    }
  }, [storeId]);

  return { resetDismissal };
}
