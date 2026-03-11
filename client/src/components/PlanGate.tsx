import { Lock, Crown, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';

interface PlanGateProps {
  /** 機能がアンロックされているか */
  allowed: boolean;
  /** 必要なプラン名 (例: "Standard", "Pro") */
  requiredPlan: string;
  /** ゲートの説明文 */
  description?: string;
  /** 子要素 */
  children: React.ReactNode;
  /** オーバーレイ表示にするか（false の場合は完全に隠す） */
  overlay?: boolean;
  /** コンパクト表示（インラインバッジ） */
  compact?: boolean;
}

/**
 * プラン制限のゲートコンポーネント
 * allowed=false の場合、子要素の上にロックオーバーレイを表示する
 */
export function PlanGate({ allowed, requiredPlan, description, children, overlay = true, compact = false }: PlanGateProps) {
  const [, navigate] = useLocation();

  if (allowed) {
    return <>{children}</>;
  }

  if (compact) {
    return (
      <div className="relative">
        <div className="opacity-50 pointer-events-none select-none">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-1 text-xs font-medium border border-amber-500/20">
            <Crown className="h-3 w-3" />
            {requiredPlan}
          </span>
        </div>
      </div>
    );
  }

  if (!overlay) {
    return (
      <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">{requiredPlan}プラン以上で利用可能</h4>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          onClick={() => navigate('/admin/settings/billing')}
        >
          <Crown className="h-3.5 w-3.5 mr-1.5" />
          プランをアップグレード
          <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="opacity-40 pointer-events-none select-none blur-[1px]">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-[2px] rounded-lg">
        <div className="text-center space-y-3 max-w-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h4 className="font-semibold text-sm">{requiredPlan}プラン以上で利用可能</h4>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            onClick={() => navigate('/admin/settings/billing')}
          >
            <Crown className="h-3.5 w-3.5 mr-1.5" />
            プランをアップグレード
            <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * プランバッジ - 機能名の横に表示する小さなバッジ
 */
export function PlanBadge({ plan, className }: { plan: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-medium border border-amber-500/20 ${className || ''}`}>
      <Crown className="h-2.5 w-2.5" />
      {plan}
    </span>
  );
}
