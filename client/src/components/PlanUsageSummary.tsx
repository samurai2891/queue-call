import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocation } from "wouter";
import { AnimatedCard } from "@/components/AnimatedPage";
import {
  Crown,
  UtensilsCrossed,
  Users,
  Newspaper,
  BarChart3,
  MessageSquare,
  CalendarCheck,
  Clock,
  Palette,
  Download,
  Shield,
  ArrowRight,
  Loader2,
  Check,
  X,
} from "lucide-react";

interface PlanUsageSummaryProps {
  storeId: number;
  storeName?: string;
  delay?: number;
}

export function PlanUsageSummary({ storeId, delay = 0 }: PlanUsageSummaryProps) {
  const { t } = useLocale();
  const [, navigate] = useLocation();

  const { data: usage, isLoading } = trpc.subscription.getPlanUsage.useQuery(
    { storeId },
    { staleTime: 30_000 }
  );

  if (isLoading) {
    return (
      <AnimatedCard delay={delay} hoverEffect={false}>
        <Card>
          <CardContent className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </AnimatedCard>
    );
  }

  if (!usage) return null;

  const planColors: Record<string, string> = {
    free: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    standard: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    pro: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  };

  const planBadgeColor = planColors[usage.planId] || planColors.free;

  // 使用量アイテム（数値制限があるもの）
  const quantityItems = [
    {
      icon: UtensilsCrossed,
      label: t("planUsage.menuItems"),
      current: usage.usage.menu.current,
      limit: usage.usage.menu.limit,
    },
    {
      icon: Users,
      label: t("planUsage.staffAccounts"),
      current: usage.usage.staff.current,
      limit: usage.usage.staff.limit,
    },
    {
      icon: Newspaper,
      label: t("planUsage.feedPosts"),
      current: usage.usage.feed.current,
      limit: usage.usage.feed.limit,
    },
  ];

  // ON/OFF機能
  const featureItems = [
    {
      icon: MessageSquare,
      label: t("planUsage.smsNotification"),
      enabled: usage.usage.smsEnabled,
    },
    {
      icon: CalendarCheck,
      label: t("planUsage.reservation"),
      enabled: usage.usage.reservationEnabled,
    },
    {
      icon: Clock,
      label: t("planUsage.businessHours"),
      enabled: usage.usage.businessHoursEnabled,
    },
    {
      icon: Download,
      label: t("planUsage.csvExport"),
      enabled: usage.usage.csvExport,
    },
  ];

  // 分析期間とブランディングレベル
  const analyticsDaysLabel =
    usage.usage.analyticsDays === 1
      ? t("planUsage.analyticsDaysToday")
      : `${usage.usage.analyticsDays}${t("planUsage.analyticsDaysSuffix")}`;

  const brandingLabels: Record<string, string> = {
    basic: t("planUsage.brandingBasic"),
    custom_color: t("planUsage.brandingColor"),
    full: t("planUsage.brandingFull"),
  };

  const supportLabels: Record<string, string> = {
    community: t("planUsage.supportCommunity"),
    email: t("planUsage.supportEmail"),
    priority_email: t("planUsage.supportPriority"),
  };

  const isFreePlan = usage.planId === "free";

  return (
    <AnimatedCard delay={delay} hoverEffect={false}>
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">{t("planUsage.title")}</CardTitle>
            </div>
            <Badge className={`${planBadgeColor} font-semibold`}>
              {usage.planName} {t("planUsage.planSuffix")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 数値制限の使用量 */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("planUsage.usageSection")}
            </p>
            <div className="grid gap-3">
              {quantityItems.map((item) => {
                const Icon = item.icon;
                const isUnlimited = item.limit === null;
                const limitVal = item.limit ?? 0;
                const percentage = isUnlimited
                  ? 0
                  : limitVal === 0
                    ? 100
                    : Math.min(Math.round((item.current / limitVal) * 100), 100);
                const isNearLimit = !isUnlimited && percentage >= 80;
                const isAtLimit = !isUnlimited && item.limit !== null && item.current >= item.limit;

                return (
                  <div key={item.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span>{item.label}</span>
                      </div>
                      <span
                        className={`font-medium tabular-nums ${
                          isAtLimit
                            ? "text-destructive"
                            : isNearLimit
                              ? "text-amber-600 dark:text-amber-400"
                              : ""
                        }`}
                      >
                        {item.current}
                        <span className="text-muted-foreground font-normal">
                          {" / "}
                          {isUnlimited ? "∞" : item.limit}
                        </span>
                      </span>
                    </div>
                    {!isUnlimited && (
                      <Progress
                        value={percentage}
                        className={`h-1.5 ${
                          isAtLimit
                            ? "[&>div]:bg-destructive"
                            : isNearLimit
                              ? "[&>div]:bg-amber-500"
                              : "[&>div]:bg-primary"
                        }`}
                      />
                    )}
                    {isUnlimited && (
                      <div className="h-1.5 rounded-full bg-primary/20 overflow-hidden">
                        <div className="h-full w-full bg-gradient-to-r from-primary/40 to-primary/10 rounded-full" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 機能ON/OFF */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("planUsage.featuresSection")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {featureItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className={`flex items-center gap-2 text-sm rounded-md px-2.5 py-1.5 ${
                      item.enabled
                        ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                        : "bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    {item.enabled ? (
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <X className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    )}
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate text-xs">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* その他の制限 */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("planUsage.detailsSection")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <div className="flex items-center gap-2 rounded-md bg-muted/30 px-2.5 py-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("planUsage.analyticsPeriod")}</p>
                  <p className="font-medium">{analyticsDaysLabel}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-muted/30 px-2.5 py-2">
                <Palette className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("planUsage.branding")}</p>
                  <p className="font-medium">{brandingLabels[usage.usage.brandingLevel]}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-muted/30 px-2.5 py-2">
                <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("planUsage.support")}</p>
                  <p className="font-medium">{supportLabels[usage.usage.supportLevel]}</p>
                </div>
              </div>
            </div>
          </div>

          {/* アップグレードCTA（Freeプランの場合） */}
          {isFreePlan && (
            <Button
              variant="outline"
              className="w-full group active:scale-[0.97] transition-transform"
              onClick={() => navigate("/admin/settings/billing")}
            >
              <Crown className="mr-2 h-4 w-4 text-primary" />
              {t("planUsage.upgradeButton")}
              <ArrowRight className="ml-auto h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" />
            </Button>
          )}
        </CardContent>
      </Card>
    </AnimatedCard>
  );
}
