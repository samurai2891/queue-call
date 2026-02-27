import { useParams, Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, ClipboardList, UtensilsCrossed, AlertCircle, Clock } from 'lucide-react';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { CrowdLevelBadge } from '@/components/CrowdLevelIndicator';
import { AnimatedPage, AnimatedCard } from '@/components/AnimatedPage';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useSSE } from '@/hooks/useSSE';
import { useState, useEffect } from 'react';
import type { Locale } from '@/contexts/LocaleContext';

type CrowdLevel = 'empty' | 'low' | 'moderate' | 'busy' | 'crowded';

function StoreTopContent() {
  const params = useParams<{ storeSlug: string }>();
  const { t } = useLocale();
  
  const { data: store, isLoading: storeLoading, error: storeError } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const { data: queueStatus, refetch: refetchQueue } = trpc.store.getQueueStatus.useQuery(
    { storeId: store?.id || 0 },
    { enabled: !!store?.id, refetchInterval: 30000 }
  );

  const [currentNumber, setCurrentNumber] = useState(0);
  const [waitingCount, setWaitingCount] = useState(0);
  const [estimatedWaitMinutes, setEstimatedWaitMinutes] = useState<number | null>(null);
  const [showEstimatedWaitTime, setShowEstimatedWaitTime] = useState(false);
  const [showCrowdLevel, setShowCrowdLevel] = useState(false);
  const [crowdLevel, setCrowdLevel] = useState<CrowdLevel>('empty');

  useEffect(() => {
    if (queueStatus) {
      setCurrentNumber(queueStatus.currentNumber);
      setWaitingCount(queueStatus.waitingCount);
      setEstimatedWaitMinutes(queueStatus.estimatedWaitMinutes);
      setShowEstimatedWaitTime(queueStatus.showEstimatedWaitTime);
      setShowCrowdLevel(queueStatus.showCrowdLevel);
      setCrowdLevel(queueStatus.crowdLevel as CrowdLevel);
    }
  }, [queueStatus]);

  // SSE for real-time updates
  useSSE({
    scope: 'board',
    storeId: store?.id || 0,
    storeSlug: params.storeSlug,
    enabled: !!store?.id,
    onQueueUpdate: (data) => {
      setCurrentNumber(data.currentNumber);
      setWaitingCount(data.waitingCount);
      // SSE更新時に混雑レベルを再計算
      refetchQueue();
    },
  });

  if (storeLoading) {
    return (
      <div className="min-h-screen flex flex-col animate-pulse">
        <header className="p-4 flex justify-end">
          <Skeleton className="h-10 w-10" />
        </header>
        <main className="flex-1 container flex flex-col items-center justify-center gap-8 py-8">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-32 w-full max-w-md rounded-xl" />
          <div className="flex gap-4 w-full max-w-md">
            <Skeleton className="h-14 flex-1 rounded-lg" />
            <Skeleton className="h-14 flex-1 rounded-lg" />
          </div>
        </main>
      </div>
    );
  }

  if (storeError || !store) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold">{t('common.error')}</h1>
        <p className="text-muted-foreground">{t('store.notFound')}</p>

        <Link href="/">
          <Button variant="outline">{t('common.back')}</Button>
        </Link>
      </div>
    );
  }

  const isPaused = store.intakeStatus === 'paused';

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="p-4 flex justify-between items-center">
        <ThemeToggle />
        <LanguageSwitcher showLabel />
      </header>

      {/* Main Content */}
      <main className="flex-1 container flex flex-col items-center justify-center gap-8 py-8">
        {/* Store Name — fade-up entrance */}
        <AnimatedPage variant="fade-up" delay={50}>
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold">{store.name}</h1>
            <p className="text-muted-foreground mt-2">{t('store.welcome')}</p>
          </div>
        </AnimatedPage>

        {/* Crowd Level Badge */}
        {showCrowdLevel && (
          <AnimatedPage variant="zoom-fade" delay={150}>
            <CrowdLevelBadge level={crowdLevel} />
          </AnimatedPage>
        )}

        {/* Queue Status Card — animated card with hover */}
        <AnimatedCard delay={200} hoverEffect={false} className="w-full max-w-md">
          <Card className="w-full">
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Current Number */}
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">{t('store.currentNumber')}</p>
                  <p className="text-5xl font-bold tabular-nums text-primary">
                    {currentNumber || '-'}
                  </p>
                </div>
                
                {/* Waiting Groups */}
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">{t('store.waitingGroups')}</p>
                  <div className="flex items-center justify-center gap-2">
                    <Users className="h-6 w-6 text-muted-foreground" />
                    <p className="text-5xl font-bold tabular-nums">
                      {waitingCount}
                    </p>
                    <span className="text-lg text-muted-foreground">{t('common.groups')}</span>
                  </div>
                </div>
              </div>

              {/* Estimated Wait Time */}
              {showEstimatedWaitTime && estimatedWaitMinutes !== null && (
                <div className="mt-6 p-4 bg-primary/5 rounded-lg">
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <p className="text-sm text-muted-foreground">{t('store.estimatedWait')}</p>
                  </div>
                  <p className="text-3xl font-bold text-center mt-2 text-primary">
                    {estimatedWaitMinutes} {t('store.minutes')}
                  </p>
                </div>
              )}

              {/* Intake Status */}
              {isPaused && (
                <div className="mt-6 p-3 bg-warning/10 rounded-lg text-center">
                  <p className="text-warning font-medium">{t('store.intakePaused')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </AnimatedCard>

        {/* Action Buttons — staggered entrance */}
        <AnimatedPage variant="fade-up" delay={350}>
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
            <Link href={`/s/${params.storeSlug}/join`} className="flex-1">
              <Button 
                size="lg" 
                className="w-full h-14 text-lg active:scale-[0.97] transition-transform"
                disabled={isPaused}
              >
                <ClipboardList className="mr-2 h-5 w-5" />
                {t('store.joinQueue')}
              </Button>
            </Link>
            <Link href={`/s/${params.storeSlug}/menu`} className="flex-1">
              <Button variant="outline" size="lg" className="w-full h-14 text-lg active:scale-[0.97] transition-transform">
                <UtensilsCrossed className="mr-2 h-5 w-5" />
                {t('store.viewMenu')}
              </Button>
            </Link>
          </div>
        </AnimatedPage>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-sm text-muted-foreground">
        {t('common.poweredBy')}
      </footer>

      {/* PWA Install Banner */}
      <PwaInstallBanner variant="banner" />
    </div>
  );
}

export default function StoreTop() {
  const params = useParams<{ storeSlug: string }>();
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const supportedLocales = (store?.supportedLocales || SUPPORTED_LOCALES) as Locale[];
  const defaultLocale = (store?.defaultLocale || 'ja') as Locale;

  return (
    <LocaleProvider defaultLocale={defaultLocale} supportedLocales={supportedLocales}>
      <StoreTopContent />
    </LocaleProvider>
  );
}
