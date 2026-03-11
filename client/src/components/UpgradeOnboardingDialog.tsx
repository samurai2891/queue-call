import React, { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'wouter';
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
  PartyPopper,
  MessageSquare,
  CalendarDays,
  Menu,
  Clock,
  Users,
  BarChart3,
  FileSpreadsheet,
  Palette,
  ImagePlus,
  Headphones,
  Check,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';

interface UnlockedFeature {
  key: string;
  settingsTab?: string;
}

interface UpgradeOnboardingDialogProps {
  open: boolean;
  onClose: () => void;
  newPlanName: string;
  unlockedFeatures: UnlockedFeature[];
  storeId?: number;
}

const FEATURE_ICON_MAP: Record<string, React.ElementType> = {
  sms: MessageSquare,
  reservation: CalendarDays,
  menuUnlimited: Menu,
  businessHours: Clock,
  staffIncrease: Users,
  analyticsExpanded: BarChart3,
  csvExport: FileSpreadsheet,
  customColor: Palette,
  customLogo: ImagePlus,
  supportUpgrade: Headphones,
};

const FEATURE_TRANSLATION_KEY_MAP: Record<string, string> = {
  sms: 'onboarding.feature.sms',
  reservation: 'onboarding.feature.reservation',
  menuUnlimited: 'onboarding.feature.menuUnlimited',
  businessHours: 'onboarding.feature.businessHours',
  staffIncrease: 'onboarding.feature.staffIncrease',
  analyticsExpanded: 'onboarding.feature.analyticsExpanded',
  csvExport: 'onboarding.feature.csvExport',
  customColor: 'onboarding.feature.customColor',
  customLogo: 'onboarding.feature.customLogo',
  supportUpgrade: 'onboarding.feature.supportUpgrade',
};

export function UpgradeOnboardingDialog({
  open,
  onClose,
  newPlanName,
  unlockedFeatures,
}: UpgradeOnboardingDialogProps) {
  const [, navigate] = useLocation();
  const { t } = useLocale();
  const [checkedFeatures, setCheckedFeatures] = useState<Set<string>>(new Set());
  const [animatedIn, setAnimatedIn] = useState(false);

  useEffect(() => {
    if (open) {
      setCheckedFeatures(new Set());
      setAnimatedIn(false);
      const timer = setTimeout(() => setAnimatedIn(true), 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Stagger animation for feature items
  const [visibleCount, setVisibleCount] = useState(0);
  useEffect(() => {
    if (open && animatedIn) {
      setVisibleCount(0);
      const interval = setInterval(() => {
        setVisibleCount(prev => {
          if (prev >= unlockedFeatures.length) {
            clearInterval(interval);
            return prev;
          }
          return prev + 1;
        });
      }, 120);
      return () => clearInterval(interval);
    }
  }, [open, animatedIn, unlockedFeatures.length]);

  const handleFeatureClick = (feature: UnlockedFeature) => {
    setCheckedFeatures(prev => {
      const next = new Set(prev);
      next.add(feature.key);
      return next;
    });
    if (feature.settingsTab) {
      onClose();
      navigate(`/admin/settings/${feature.settingsTab}`);
    }
  };

  const allChecked = useMemo(
    () => unlockedFeatures.every(f => checkedFeatures.has(f.key)),
    [unlockedFeatures, checkedFeatures]
  );

  if (unlockedFeatures.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-center space-y-3">
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg transition-all duration-500 ${animatedIn ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
            <PartyPopper className="h-8 w-8 text-white" />
          </div>
          <DialogTitle className={`text-xl transition-all duration-500 delay-150 ${animatedIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
            <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent font-bold">
              {newPlanName}
            </span>
            {' '}{t('onboarding.upgradeTitle' as any) || 'プランへようこそ！'}
          </DialogTitle>
          <DialogDescription className={`transition-all duration-500 delay-200 ${animatedIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
            {t('onboarding.upgradeDescription' as any) || '以下の新機能が使えるようになりました。タップして設定画面に移動できます。'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {unlockedFeatures.map((feature, index) => {
            const Icon = FEATURE_ICON_MAP[feature.key] || Sparkles;
            const translationKey = FEATURE_TRANSLATION_KEY_MAP[feature.key];
            const label = translationKey ? (t(translationKey as any) || feature.key) : feature.key;
            const isChecked = checkedFeatures.has(feature.key);
            const isVisible = index < visibleCount;

            return (
              <button
                key={feature.key}
                onClick={() => handleFeatureClick(feature)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 text-left
                  ${isVisible ? 'translate-x-0 opacity-100' : '-translate-x-8 opacity-0'}
                  ${isChecked
                    ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                    : 'bg-card hover:bg-accent/50 border-border hover:border-primary/30'
                  }
                `}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-300 ${
                  isChecked
                    ? 'bg-green-100 dark:bg-green-900/30'
                    : 'bg-primary/10'
                }`}>
                  {isChecked ? (
                    <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <Icon className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isChecked ? 'text-green-700 dark:text-green-300' : ''}`}>
                    {label}
                  </p>
                  {feature.settingsTab && !isChecked && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      {t('onboarding.goToSettings' as any) || '設定画面へ移動'}
                      <ArrowRight className="h-3 w-3" />
                    </p>
                  )}
                </div>
                {!isChecked && (
                  <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[10px] font-semibold border border-amber-500/20 shrink-0">
                    NEW
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            onClick={onClose}
            className="w-full"
            variant={allChecked ? 'default' : 'outline'}
          >
            {allChecked
              ? (t('onboarding.allDone' as any) || 'すべて確認しました')
              : (t('onboarding.dismissLater' as any) || 'あとで確認する')
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ローカルストレージを使ったオンボーディング状態管理フック
 */
export function useUpgradeOnboarding(storeId: number | undefined) {
  const STORAGE_PREFIX = 'qc_onboarding_';

  /** オンボーディングを表示済みとしてマーク */
  const markDismissed = (planId: string) => {
    if (!storeId) return;
    const key = `${STORAGE_PREFIX}${storeId}_${planId}`;
    localStorage.setItem(key, JSON.stringify({
      dismissedAt: Date.now(),
      planId,
    }));
  };

  /** オンボーディングが未表示かチェック */
  const shouldShow = (planId: string): boolean => {
    if (!storeId) return false;
    const key = `${STORAGE_PREFIX}${storeId}_${planId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return true;
    try {
      const data = JSON.parse(stored);
      // 7日以内に閉じた場合は再表示しない
      if (Date.now() - data.dismissedAt < 7 * 24 * 60 * 60 * 1000) {
        return false;
      }
      return true;
    } catch {
      return true;
    }
  };

  /** アップグレード情報をローカルストレージに保存（Checkout前に呼ぶ） */
  const savePendingUpgrade = (previousPlan: string, newPlan: string) => {
    if (!storeId) return;
    const key = `${STORAGE_PREFIX}pending_${storeId}`;
    localStorage.setItem(key, JSON.stringify({
      previousPlan,
      newPlan,
      timestamp: Date.now(),
    }));
  };

  /** 保留中のアップグレード情報を取得して削除 */
  const consumePendingUpgrade = (): { previousPlan: string; newPlan: string } | null => {
    if (!storeId) return null;
    const key = `${STORAGE_PREFIX}pending_${storeId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    try {
      const data = JSON.parse(stored);
      // 1時間以内のものだけ有効
      if (Date.now() - data.timestamp > 60 * 60 * 1000) {
        localStorage.removeItem(key);
        return null;
      }
      localStorage.removeItem(key);
      return { previousPlan: data.previousPlan, newPlan: data.newPlan };
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  };

  /** NEWバッジの表示判定（アップグレードから7日以内） */
  const isFeatureNew = (featureKey: string, currentPlanId: string): boolean => {
    if (!storeId) return false;
    const key = `${STORAGE_PREFIX}upgraded_${storeId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return false;
    try {
      const data = JSON.parse(stored);
      if (data.planId !== currentPlanId) return false;
      if (Date.now() - data.upgradedAt > 7 * 24 * 60 * 60 * 1000) return false;
      return data.unlockedKeys?.includes(featureKey) || false;
    } catch {
      return false;
    }
  };

  /** アップグレード完了情報を保存（NEWバッジ用） */
  const saveUpgradeInfo = (planId: string, unlockedKeys: string[]) => {
    if (!storeId) return;
    const key = `${STORAGE_PREFIX}upgraded_${storeId}`;
    localStorage.setItem(key, JSON.stringify({
      planId,
      unlockedKeys,
      upgradedAt: Date.now(),
    }));
  };

  return {
    markDismissed,
    shouldShow,
    savePendingUpgrade,
    consumePendingUpgrade,
    isFeatureNew,
    saveUpgradeInfo,
  };
}
