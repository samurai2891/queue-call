import { useParams, useLocation } from 'wouter';
import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Minus, Plus, AlertCircle, Loader2, Users, Clock, Activity } from 'lucide-react';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { AnimatedPage, AnimatedCard } from '@/components/AnimatedPage';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BrandThemeProvider } from '@/components/BrandThemeProvider';
import { toast } from 'sonner';
import { RATE_LIMITED_ERR_MSG } from '@shared/const';
import { checkBusinessHours, getTodayBusinessHoursText } from '../../../../shared/businessHours';
import type { Locale } from '@/contexts/LocaleContext';


function JoinQueueContent() {
  const params = useParams<{ storeSlug: string }>();
  const [, navigate] = useLocation();
  const { t, locale } = useLocale();
  
  const [partySize, setPartySize] = useState(2);
  const [note, setNote] = useState('');

  const { data: store, isLoading: storeLoading, error: storeError } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  // 待ち状況を取得
  const { data: queueStatus } = trpc.store.getQueueStatus.useQuery(
    { storeId: store?.id || 0 },
    { enabled: !!store?.id, refetchInterval: 10000 }
  );

  // Business hours check (must be before early returns)
  const businessHoursStatus = useMemo(() => {
    return checkBusinessHours(store?.settings?.businessHours as any);
  }, [store?.settings?.businessHours]);

  const todayHoursText = useMemo(() => {
    return getTodayBusinessHoursText(store?.settings?.businessHours as any);
  }, [store?.settings?.businessHours]);

  const createTicketMutation = trpc.ticket.create.useMutation({
    onSuccess: (ticket) => {
      navigate(`/s/${params.storeSlug}/ticket/${ticket.ticketToken}`);
    },
    onError: (error) => {
      const message = error.message === RATE_LIMITED_ERR_MSG
        ? t('common.rateLimited')
        : error.message;
      toast.error(message);
    },

  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!store) return;

    createTicketMutation.mutate({
      storeId: store.id,
      partySize,
      note: note.trim() || undefined,
      locale,
      source: 'web',
    });
  };

  const decrementPartySize = () => {
    if (partySize > 1) setPartySize(partySize - 1);
  };

  const incrementPartySize = () => {
    const maxSize = store?.settings?.kiosk?.maxPartySize || 10;
    if (partySize < maxSize) setPartySize(partySize + 1);
  };

  // 混雑レベルに応じた色とラベルを取得
  const getCrowdInfo = (level: string) => {
    switch (level) {
      case 'empty':
        return { color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' };
      case 'low':
        return { color: 'text-green-600', bg: 'bg-green-50 border-green-200', dot: 'bg-green-500' };
      case 'moderate':
        return { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' };
      case 'busy':
        return { color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' };
      case 'crowded':
        return { color: 'text-red-600', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' };
      default:
        return { color: 'text-muted-foreground', bg: 'bg-muted/50 border-border', dot: 'bg-muted-foreground' };
    }
  };

  if (storeLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="p-4 flex justify-between items-center">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-10 w-10 rounded-md" />
        </header>
        <main className="flex-1 container flex flex-col items-center justify-center gap-4 py-8">
          <Skeleton className="h-24 w-full max-w-md rounded-xl" />
          <Skeleton className="h-80 w-full max-w-md rounded-xl" />
        </main>
      </div>
    );
  }

  if (storeError || !store) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold">{t('common.error')}</h1>
        <Button variant="outline" onClick={() => navigate(`/s/${params.storeSlug}`)}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const isPaused = store.intakeStatus === 'paused';
  const isOutsideBusinessHours = !businessHoursStatus.isOpen;

  if (isPaused || isOutsideBusinessHours) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="p-4 flex justify-between items-center">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/s/${params.storeSlug}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <LanguageSwitcher showLabel />
        </header>
        <main className="flex-1 container flex flex-col items-center justify-center gap-4 py-8">
          <AnimatedPage variant="zoom-fade" delay={100}>
            <div className="flex flex-col items-center gap-4">
              {isOutsideBusinessHours ? (
                <>
                  <Clock className="h-16 w-16 text-destructive" />
                  <h1 className="text-2xl font-bold">{t('store.outsideBusinessHours')}</h1>
                  <p className="text-muted-foreground text-center max-w-sm">
                    {businessHoursStatus.reason === 'closed_day'
                      ? t('store.closedDayMessage')
                      : t('store.closedMessage')}
                  </p>
                  {todayHoursText && (
                    <p className="text-sm text-muted-foreground">
                      {t('store.businessHoursToday')}: {todayHoursText}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <AlertCircle className="h-16 w-16 text-warning" />
                  <h1 className="text-2xl font-bold">{t('store.intakePaused')}</h1>
                </>
              )}
              <Button variant="outline" onClick={() => navigate(`/s/${params.storeSlug}`)}>
                {t('common.back')}
              </Button>
            </div>
          </AnimatedPage>
        </main>
      </div>
    );
  }

  const crowdInfo = queueStatus ? getCrowdInfo(queueStatus.crowdLevel) : null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="p-4 flex justify-between items-center">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="active:scale-90 transition-transform" onClick={() => navigate(`/s/${params.storeSlug}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2">
          {store.settings?.branding?.logoUrl && (
            <img src={store.settings.branding.logoThumbUrl || store.settings.branding.logoUrl} alt={store.name} className="h-8 w-8 rounded-lg object-contain" />
          )}
          <h1 className="text-lg font-semibold">{store.name}</h1>
        </div>
        <LanguageSwitcher showLabel />
      </header>

      {/* Main Content */}
      <main className="flex-1 container flex flex-col items-center py-4 px-4 gap-4">
        
        {/* 待ち状況カード — animated entrance */}
        {queueStatus && (
          <AnimatedCard delay={100} hoverEffect={false} className="w-full max-w-md">
            <Card className="w-full border shadow-sm">
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  {/* 待ち組数 */}
                  <div className="flex flex-col items-center gap-1">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <span className="text-2xl font-bold tabular-nums">{queueStatus.waitingCount}</span>
                    <span className="text-xs text-muted-foreground">{t('join.waitingGroups')}</span>
                  </div>
                  
                  {/* 予想待ち時間 */}
                  {queueStatus.showEstimatedWaitTime && queueStatus.estimatedWaitMinutes !== null && (
                    <div className="flex flex-col items-center gap-1">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      <span className="text-2xl font-bold tabular-nums">
                        {queueStatus.estimatedWaitMinutes > 0 ? `~${queueStatus.estimatedWaitMinutes}` : '-'}
                      </span>
                      <span className="text-xs text-muted-foreground">{t('join.estimatedMinutes')}</span>
                    </div>
                  )}
                  
                  {/* 混雑レベル */}
                  {queueStatus.showCrowdLevel && crowdInfo && (
                    <div className="flex flex-col items-center gap-1">
                      <Activity className="h-5 w-5 text-muted-foreground" />
                      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-sm font-medium border ${crowdInfo.bg} ${crowdInfo.color}`}>
                        <span className={`w-2 h-2 rounded-full ${crowdInfo.dot} animate-pulse`} />
                        {t(`store.crowdLevel.${queueStatus.crowdLevel}` as any)}
                      </div>
                      <span className="text-xs text-muted-foreground">{t('join.crowdStatus')}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </AnimatedCard>
        )}

        {/* 発券フォーム — animated entrance */}
        <AnimatedCard delay={200} hoverEffect={false} className="w-full max-w-md">
          <Card className="w-full shadow-sm">
            <CardContent className="p-5">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Join Notice - 受付注意事項 */}
                {store?.settings?.customMessages?.joinNotice && (
                  <div className="rounded-lg bg-muted/50 border border-border/50 p-3">
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {store.settings.customMessages.joinNotice}
                    </p>
                  </div>
                )}

                {/* Party Size - 拡大版 */}
                <div className="space-y-4">
                  <Label className="text-base font-medium">{t('join.partySize')}</Label>
                  <div className="flex items-center justify-center gap-5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-16 w-16 rounded-full text-xl shrink-0 active:scale-90 transition-transform"
                      onClick={decrementPartySize}
                      disabled={partySize <= 1}
                    >
                      <Minus className="h-7 w-7" />
                    </Button>
                    <div className="text-center min-w-[120px]">
                      <span className="text-6xl font-bold tabular-nums leading-none transition-all duration-200">{partySize}</span>
                      <span className="text-lg text-muted-foreground ml-1">{t('common.people')}</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-16 w-16 rounded-full text-xl shrink-0 active:scale-90 transition-transform"
                      onClick={incrementPartySize}
                      disabled={partySize >= (store?.settings?.kiosk?.maxPartySize || 10)}
                    >
                      <Plus className="h-7 w-7" />
                    </Button>
                  </div>
                </div>

                {/* Note */}
                <div className="space-y-2">
                  <Label htmlFor="note">{t('join.note')}</Label>
                  <Textarea
                    id="note"
                    placeholder={t('join.notePlaceholder')}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={500}
                  />
                </div>

                {/* Submit Button - 視覚的に強化 */}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-16 text-xl font-bold active:scale-[0.97] transition-transform"
                  disabled={createTicketMutation.isPending}
                >
                  {createTicketMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                      {t('join.submitting')}
                    </>
                  ) : (
                    t('join.submit')
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </AnimatedCard>
      </main>

      {/* PWA Install Banner */}
      <PwaInstallBanner variant="banner" />
    </div>
  );
}

export default function JoinQueue() {
  const params = useParams<{ storeSlug: string }>();
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const supportedLocales = (store?.supportedLocales || SUPPORTED_LOCALES) as Locale[];
  const defaultLocale = (store?.defaultLocale || 'ja') as Locale;

  const branding = store?.settings?.branding as { primaryColor?: string; secondaryColor?: string; accentColor?: string } | undefined;

  return (
    <LocaleProvider defaultLocale={defaultLocale} supportedLocales={supportedLocales}>
      <BrandThemeProvider branding={branding}>
        <JoinQueueContent />
      </BrandThemeProvider>
    </LocaleProvider>
  );
}
