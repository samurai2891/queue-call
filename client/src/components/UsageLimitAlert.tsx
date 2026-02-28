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
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  TrendingUp,
  UtensilsCrossed,
  Users,
  Newspaper,
  Crown,
  ArrowRight,
  X,
} from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
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

/**
 * セッション内でアラートが表示済みかチェック
 */
function isDismissedInSession(storeId: number): boolean {
  try {
    const key = `${SESSION_STORAGE_PREFIX}${storeId}`;
    const stored = sessionStorage.getItem(key);
    if (!stored) return false;
    const data = JSON.parse(stored);
    // 同じセッション内で閉じた場合は再表示しない
    // ただし使用量が増えた場合（新しいアイテムが追加された場合）は再表示
    return data.dismissed === true;
  } catch {
    return false;
  }
}

/**
 * セッション内でアラートを閉じたことを記録
 */
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

/**
 * セッション内で閉じた時の制限キーを取得
 */
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
    navigate('/admin/settings?tab=billing');
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

        <div className="py-4 space-y-4">
          {approachingLimits.map((item) => {
            const Icon = item.icon;
            const isAtLimit = item.percentage >= 100;

            return (
              <div key={item.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${
                      isAtLimit ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'
                    }`} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold tabular-nums ${
                      isAtLimit ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      {item.current} / {item.limit}
                    </span>
                    <Badge
                      variant={isAtLimit ? 'destructive' : 'outline'}
                      className={`text-xs ${
                        !isAtLimit ? 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400' : ''
                      }`}
                    >
                      {item.percentage}%
                    </Badge>
                  </div>
                </div>
                <Progress
                  value={item.percentage}
                  className={`h-2 ${
                    isAtLimit
                      ? '[&>div]:bg-destructive'
                      : '[&>div]:bg-amber-500'
                  }`}
                />
              </div>
            );
          })}

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
  /**
   * 使用量が変化した場合にセッションの閉じた記録をリセット
   * （新しいアイテムが追加された場合に再表示するため）
   */
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
