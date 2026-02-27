import { useParams, useLocation } from 'wouter';
import { useState, useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { BrandThemeProvider } from '@/components/BrandThemeProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Bell, BellOff, AlertCircle, CheckCircle, XCircle, Clock, MessageSquare, KeyRound, BellRing } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { AnimatedPage, AnimatedCard } from '@/components/AnimatedPage';
import { toast } from 'sonner';
import { useSSE } from '@/hooks/useSSE';
import { SmsRegistration } from '@/components/SmsRegistration';
import type { Locale } from '@/contexts/LocaleContext';

type TicketStatus = 'WAITING' | 'CALLED' | 'ARRIVED' | 'SKIPPED' | 'DONE' | 'CANCELED' | 'EXPIRED';

function TicketContent() {
  const params = useParams<{ storeSlug: string; token: string }>();
  const [, navigate] = useLocation();
  const { t } = useLocale();
  
  const [currentNumber, setCurrentNumber] = useState(0);
  const [groupsAhead, setGroupsAhead] = useState(0);
  const [status, setStatus] = useState<TicketStatus>('WAITING');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinDigits, setPinDigits] = useState(['', '', '']);
  const [pinError, setPinError] = useState<string | null>(null);
  const pinInputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const [waitAlertMinutes, setWaitAlertMinutes] = useState<number | null>(null);

  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const { data: ticket, isLoading, error, refetch } = trpc.ticket.getByToken.useQuery(
    { token: params.token || '' },
    { enabled: !!params.token }
  );

  const cancelMutation = trpc.ticket.cancel.useMutation({
    onSuccess: () => {
      toast.success(t('ticket.status.CANCELED'));
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const setWaitAlertMutation = trpc.ticket.setWaitAlert.useMutation({
    onSuccess: (data) => {
      if (data.alertMinutes) {
        toast.success(t('ticket.waitAlertSet').replace('{minutes}', String(data.alertMinutes)));
      } else {
        toast.success(t('ticket.waitAlertDisabled'));
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const checkinWithPinMutation = trpc.ticket.checkinWithPin.useMutation({
    onSuccess: () => {
      toast.success(t('ticket.status.ARRIVED'));
      setShowPinDialog(false);
      setPinDigits(['', '', '']);
      setPinError(null);
      refetch();
    },
    onError: (error) => {
      setPinError(error.message);
      setPinDigits(['', '', '']);
      pinInputRefs[0].current?.focus();
    },
  });

  useEffect(() => {
    if (ticket) {
      setCurrentNumber(ticket.currentNumber);
      setGroupsAhead(ticket.groupsAhead);
      setStatus(ticket.status as TicketStatus);
      setWaitAlertMinutes(ticket.waitAlertMinutes ?? null);
    }
  }, [ticket]);

  // SSE for real-time updates
  useSSE({
    scope: 'ticket',
    storeId: store?.id || 0,
    storeSlug: params.storeSlug,
    ticketToken: params.token,
    enabled: !!store?.id && !!params.token,
    onQueueUpdate: (data) => {
      setCurrentNumber(data.currentNumber);
      refetch();
    },
    onTicketUpdate: (data) => {
      setStatus(data.status as TicketStatus);
      if (data.groupsAhead !== undefined) {
        setGroupsAhead(data.groupsAhead);
      }
      refetch();
    },
    onCalled: () => {
      setStatus('CALLED');
      refetch();
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
      if (Notification.permission === 'granted') {
        new Notification(t('notification.called'), {
          body: t('notification.calledBody'),
          icon: '/icons/icon-192x192.png',
        });
      }
    },
  });

  const handleCancel = () => {
    if (params.token) {
      cancelMutation.mutate({ token: params.token });
    }
    setShowCancelDialog(false);
  };

  const handlePinDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = digit;
    setPinDigits(newDigits);
    setPinError(null);

    if (digit && index < 2) {
      pinInputRefs[index + 1].current?.focus();
    }

    if (digit && index === 2 && newDigits.every(d => d !== '')) {
      const pin = newDigits.join('');
      if (params.token) {
        checkinWithPinMutation.mutate({ ticketToken: params.token, pin });
      }
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    }
  };

  const handleOpenPinDialog = () => {
    setShowPinDialog(true);
    setPinDigits(['', '', '']);
    setPinError(null);
    setTimeout(() => {
      pinInputRefs[0].current?.focus();
    }, 100);
  };

  const getStatusBadge = () => {
    const statusConfig: Record<TicketStatus, { class: string; icon: React.ReactNode }> = {
      WAITING: { class: 'waiting', icon: <Clock className="h-4 w-4" /> },
      CALLED: { class: 'called', icon: <Bell className="h-4 w-4" /> },
      ARRIVED: { class: 'arrived', icon: <CheckCircle className="h-4 w-4" /> },
      SKIPPED: { class: 'skipped', icon: <AlertCircle className="h-4 w-4" /> },
      DONE: { class: 'done', icon: <CheckCircle className="h-4 w-4" /> },
      CANCELED: { class: 'canceled', icon: <XCircle className="h-4 w-4" /> },
      EXPIRED: { class: 'canceled', icon: <XCircle className="h-4 w-4" /> },
    };

    const config = statusConfig[status];
    return (
      <div className={`status-badge ${config.class}`}>
        {config.icon}
        <span className="ml-1">{t(`ticket.status.${status}`)}</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="p-4 flex justify-between items-center">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </header>
        <main className="flex-1 container flex flex-col items-center justify-center gap-8 py-8">
          <div className="w-full max-w-md space-y-4">
            <Skeleton className="h-8 w-24 mx-auto rounded-full" />
            <Skeleton className="h-24 w-32 mx-auto rounded-lg" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold">{t('common.error')}</h1>
        <p className="text-muted-foreground">{t('checkin.notFound')}</p>
        <Button variant="outline" onClick={() => navigate(`/s/${params.storeSlug}`)}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const isActive = status === 'WAITING' || status === 'CALLED';
  const isCalled = status === 'CALLED';

  // ========== P0-1: CALLED状態 — フルスクリーン緑背景 ==========
  if (isCalled) {
    return (
      <div className="min-h-screen flex flex-col called-fullscreen-bg">
        {/* Header - minimal */}
        <header className="p-3 flex justify-between items-center relative z-10">
          <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10 active:scale-90 transition-transform" onClick={() => navigate(`/s/${params.storeSlug}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <LanguageSwitcher showLabel />
        </header>

        {/* Main - 番号を巨大表示 */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 pb-8 relative z-10">
          {/* パルスアニメーション背景リング */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-72 rounded-full bg-white/10 animate-ping-slow" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-56 h-56 rounded-full bg-white/5 animate-ping-slower" />
          </div>

          {/* ステータスラベル — animated entrance */}
          <AnimatedPage variant="zoom-fade" delay={100}>
            <div className="mb-4 px-5 py-2 rounded-full bg-white/20 backdrop-blur-sm">
              <p className="text-white font-bold text-lg tracking-wider flex items-center gap-2">
                <Bell className="h-5 w-5 animate-bounce" />
                {t('ticket.calledHeading')}
              </p>
            </div>
          </AnimatedPage>

          {/* 番号 — 超巨大 */}
          <AnimatedPage variant="zoom-fade" delay={200}>
            <p className="text-[8rem] sm:text-[10rem] font-black text-white tabular-nums leading-none drop-shadow-lg relative z-10">
              {ticket.number}
            </p>
          </AnimatedPage>

          {/* お店にお戻りください */}
          <AnimatedPage variant="fade-up" delay={350}>
            <p className="text-white/90 text-xl font-semibold mt-4 mb-8">
              {t('ticket.pleaseReturn')}
            </p>
          </AnimatedPage>

          {/* 到着確認ボタン — 巨大化 */}
          <AnimatedPage variant="fade-up" delay={450}>
            <Button
              size="lg"
              className="w-full max-w-xs h-16 text-xl font-bold bg-white text-emerald-700 hover:bg-white/90 shadow-2xl rounded-2xl active:scale-[0.97] transition-transform"
              onClick={handleOpenPinDialog}
            >
              <KeyRound className="mr-3 h-6 w-6" />
              {t('ticket.checkinWithPin')}
            </Button>
          </AnimatedPage>

          {/* 期限表示 */}
          {ticket.checkinDeadlineAt && (
            <AnimatedPage variant="fade" delay={550}>
              <div className="mt-4 px-4 py-2 rounded-lg bg-white/15 backdrop-blur-sm">
                <p className="text-white/90 text-sm">
                  {new Date(ticket.checkinDeadlineAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + t('ticket.checkinDeadline')}
                </p>
              </div>
            </AnimatedPage>
          )}

          {/* キャンセルリンク — 控えめ */}
          <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
            <AlertDialogTrigger asChild>
              <button className="mt-6 text-white/50 text-sm underline underline-offset-4 hover:text-white/70 transition-colors">
                {t('ticket.cancelButton')}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('ticket.cancelConfirm')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.no')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancel}>
                  {t('common.yes')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </main>

        {/* PIN Input Dialog */}
        <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center">{t('ticket.enterPin')}</DialogTitle>
              <DialogDescription className="text-center">
                {t('ticket.pinRequired')}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-6 py-4">
              <div className="flex gap-4 justify-center">
                {[0, 1, 2].map((index) => (
                  <Input
                    key={index}
                    ref={pinInputRefs[index]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={pinDigits[index]}
                    onChange={(e) => handlePinDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(index, e)}
                    className="w-16 h-20 text-4xl text-center font-bold"
                    disabled={checkinWithPinMutation.isPending}
                  />
                ))}
              </div>
              {pinError && (
                <div className="text-destructive text-sm text-center">
                  <AlertCircle className="inline h-4 w-4 mr-1" />
                  {pinError}
                </div>
              )}
              {checkinWithPinMutation.isPending && (
                <div className="text-muted-foreground text-sm">
                  {t('common.loading')}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ========== WAITING / 完了 / その他の状態 ==========
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
          {store?.settings?.branding?.logoUrl && (
            <img src={store.settings.branding.logoUrl} alt={store?.name || ''} className="h-7 w-7 rounded-lg object-contain" />
          )}
        </div>
        <LanguageSwitcher showLabel />
      </header>

      {/* Main Content */}
      <main className="flex-1 container flex flex-col items-center justify-center py-8">
        <AnimatedCard delay={100} hoverEffect={false} className="w-full max-w-md">
          <Card className="w-full ticket-card">
            <CardContent className="p-6 space-y-6">
              {/* Status Badge */}
              <div className="flex justify-center">
                {getStatusBadge()}
              </div>

              {/* Your Number */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">{t('ticket.yourNumber')}</p>
                <p className="text-7xl font-bold tabular-nums text-primary">
                  {ticket.number}
                </p>
              </div>

              {/* Queue Info */}
              {isActive && !isCalled && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">{t('ticket.currentlyCalling')}</p>
                      <p className="text-3xl font-bold tabular-nums">{currentNumber || '-'}</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">{t('ticket.groupsAhead')}</p>
                      <p className="text-3xl font-bold tabular-nums">
                        {groupsAhead}
                        <span className="text-lg text-muted-foreground ml-1">{t('ticket.groupsAheadSuffix')}</span>
                      </p>
                    </div>
                  </div>
                  
                  {/* Estimated Wait Time */}
                  {ticket.estimatedWaitMinutes !== null && ticket.estimatedWaitMinutes !== undefined && (
                    <div className="p-4 bg-primary/5 rounded-lg text-center border border-primary/20">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-primary" />
                        <p className="text-sm text-muted-foreground">{t('ticket.estimatedWait')}</p>
                      </div>
                      <p className="text-2xl font-bold text-primary">
                        {ticket.estimatedWaitMinutes === 0 
                          ? t('ticket.estimatedWaitNow')
                          : t('ticket.estimatedWaitMinutes').replace('{minutes}', String(ticket.estimatedWaitMinutes))
                        }
                      </p>
                    </div>
                  )}

                  {/* Wait Time Alert Setting */}
                  <div className="p-4 bg-muted/30 rounded-lg border">
                    <div className="flex items-center gap-2 mb-3">
                      <BellRing className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium">{t('ticket.waitAlertTitle')}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      {t('ticket.waitAlertDescription')}
                    </p>
                    <Select
                      value={waitAlertMinutes?.toString() || 'off'}
                      onValueChange={(value) => {
                        const minutes = value === 'off' ? null : parseInt(value, 10);
                        setWaitAlertMinutes(minutes);
                        if (params.token) {
                          setWaitAlertMutation.mutate({ token: params.token, alertMinutes: minutes });
                        }
                      }}
                      disabled={setWaitAlertMutation.isPending}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('ticket.waitAlertOff')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">{t('ticket.waitAlertOff')}</SelectItem>
                        <SelectItem value="5">{t('ticket.waitAlertMinutesOption').replace('{minutes}', '5')}</SelectItem>
                        <SelectItem value="10">{t('ticket.waitAlertMinutesOption').replace('{minutes}', '10')}</SelectItem>
                        <SelectItem value="15">{t('ticket.waitAlertMinutesOption').replace('{minutes}', '15')}</SelectItem>
                        <SelectItem value="20">{t('ticket.waitAlertMinutesOption').replace('{minutes}', '20')}</SelectItem>
                        <SelectItem value="30">{t('ticket.waitAlertMinutesOption').replace('{minutes}', '30')}</SelectItem>
                      </SelectContent>
                    </Select>
                    {waitAlertMinutes && ticket.waitAlertSentAt && (
                      <p className="text-xs text-success mt-2 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {t('ticket.waitAlertSent')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Ticket Details */}
              <div className="text-center text-sm text-muted-foreground space-y-1">
                <p>{ticket.partySize} {t('common.people')}</p>
                {ticket.note && <p className="italic">"{ticket.note}"</p>}
              </div>

              {/* Completed/Expired Message */}
              {!isActive && (
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground">
                    {status === 'DONE' ? t('ticket.completedMessage') : 
                     status === 'CANCELED' ? t('ticket.canceledMessage') :
                     status === 'EXPIRED' ? t('ticket.expiredMessage') :
                     status === 'SKIPPED' ? t('ticket.skippedMessage') : ''}
                  </p>
                  <Button className="active:scale-[0.97] transition-transform" onClick={() => navigate(`/s/${params.storeSlug}`)}>
                    {t('ticket.backToStore')}
                  </Button>
                </div>
              )}

              {/* Actions (WAITING only) */}
              {isActive && !isCalled && (
                <div className="space-y-3">
                  <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="lg" className="w-full active:scale-[0.97] transition-transform">
                        <XCircle className="mr-2 h-5 w-5" />
                        {t('ticket.cancelButton')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('ticket.cancelConfirm')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.no')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancel}>
                          {t('common.yes')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </CardContent>
          </Card>
        </AnimatedCard>

        {/* SMS Registration */}
        {isActive && ticket && (
          <AnimatedPage variant="fade-up" delay={250}>
            <div className="w-full max-w-md mt-4">
              <SmsRegistration ticketId={ticket.id} />
            </div>
          </AnimatedPage>
        )}

        {/* Inline Notification Enable Button */}
        {isActive && !isCalled && (
          <AnimatedPage variant="fade-up" delay={350}>
            <div className="w-full max-w-md mt-4">
              <Button
                variant="outline"
                size="lg"
                className="w-full h-14 text-base active:scale-[0.97] transition-transform"
                onClick={async () => {
                  if (!('Notification' in window)) {
                    toast.error(t('notification.pushUnsupported'));
                    return;
                  }
                  if (Notification.permission === 'granted') {
                    toast.success(t('notification.pushEnabled'));
                    return;
                  }
                  if (Notification.permission === 'denied') {
                    toast.error(t('notification.pushDenied'));
                    return;
                  }
                  const result = await Notification.requestPermission();
                  if (result === 'granted') {
                    toast.success(t('notification.pushEnabled'));
                  } else {
                    toast.error(t('notification.pushDenied'));
                  }
                }}
              >
                <Bell className="mr-2 h-5 w-5" />
                {typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
                  ? t('notification.pushEnabled')
                  : t('ticket.enableNotifications')}
              </Button>
            </div>
          </AnimatedPage>
        )}

        {/* PWA Install Card */}
        {isActive && (
          <AnimatedPage variant="fade-up" delay={450}>
            <div className="w-full max-w-md mt-6">
              <PwaInstallBanner variant="card" />
            </div>
          </AnimatedPage>
        )}
      </main>
    </div>
  );
}

export default function Ticket() {
  const params = useParams<{ storeSlug: string }>();
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const supportedLocales = (store?.supportedLocales || SUPPORTED_LOCALES) as Locale[];
  const defaultLocale = (store?.defaultLocale || 'ja') as Locale;

  const branding = store?.settings?.branding as { primaryColor?: string; secondaryColor?: string; accentColor?: string; logoUrl?: string; logoKey?: string } | undefined;

  return (
    <LocaleProvider defaultLocale={defaultLocale} supportedLocales={supportedLocales}>
      <BrandThemeProvider branding={branding}>
        <TicketContent />
      </BrandThemeProvider>
    </LocaleProvider>
  );
}
