import { useParams, useLocation } from 'wouter';
import { useState, useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
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
import { ArrowLeft, Bell, BellOff, AlertCircle, CheckCircle, XCircle, Clock, MessageSquare, KeyRound } from 'lucide-react';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
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
      // Clear PIN inputs on error
      setPinDigits(['', '', '']);
      pinInputRefs[0].current?.focus();
    },
  });

  useEffect(() => {
    if (ticket) {
      setCurrentNumber(ticket.currentNumber);
      setGroupsAhead(ticket.groupsAhead);
      setStatus(ticket.status as TicketStatus);
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
      // Play notification sound if available
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
      // Show browser notification
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
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    
    const newDigits = [...pinDigits];
    newDigits[index] = digit;
    setPinDigits(newDigits);
    setPinError(null);

    // Auto-focus next input
    if (digit && index < 2) {
      pinInputRefs[index + 1].current?.focus();
    }

    // Auto-submit when all digits are entered
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
    // Focus first input after dialog opens
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
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-24" />
        </header>
        <main className="flex-1 container flex flex-col items-center justify-center gap-8 py-8">
          <Skeleton className="h-96 w-full max-w-md" />
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

  return (
    <div className={`min-h-screen flex flex-col ${isCalled ? 'bg-success/5' : 'bg-gradient-to-b from-background to-muted/30'}`}>
      {/* Header */}
      <header className="p-4 flex justify-between items-center">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/s/${params.storeSlug}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <LanguageSwitcher showLabel />
      </header>

      {/* Main Content */}
      <main className="flex-1 container flex flex-col items-center justify-center py-8">
        <Card className={`w-full max-w-md ticket-card ${isCalled ? 'ring-2 ring-success' : ''}`}>
          <CardContent className="p-6 space-y-6">
            {/* Status Badge */}
            <div className="flex justify-center">
              {getStatusBadge()}
            </div>

            {/* Your Number */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">{t('ticket.yourNumber')}</p>
              <p className={`text-7xl font-bold tabular-nums ${isCalled ? 'text-success animate-pulse' : 'text-primary'}`}>
                {ticket.number}
              </p>
            </div>

            {/* Called Message */}
            {isCalled && (
              <div className="text-center p-4 bg-success/10 rounded-lg">
                <p className="text-2xl font-bold text-success">{t('ticket.yourTurn')}</p>
                {ticket.checkinDeadlineAt && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {t('ticket.checkinDeadline')} {new Date(ticket.checkinDeadlineAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            )}

            {/* Queue Info */}
            {isActive && !isCalled && (
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
                <Button onClick={() => navigate(`/s/${params.storeSlug}`)}>
                  {t('ticket.backToStore')}
                </Button>
              </div>
            )}

            {/* Actions */}
            {isActive && (
              <div className="space-y-3">
                {/* Checkin Button (when called) */}
                {isCalled && (
                  <Button
                    size="lg"
                    className="w-full h-14 text-lg bg-success hover:bg-success/90"
                    onClick={handleOpenPinDialog}
                  >
                    <KeyRound className="mr-2 h-5 w-5" />
                    {t('ticket.checkinWithPin')}
                  </Button>
                )}

                {/* Cancel Button */}
                <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="lg" className="w-full">
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

        {/* SMS Registration */}
        {isActive && ticket && (
          <div className="w-full max-w-md mt-4">
            <SmsRegistration ticketId={ticket.id} />
          </div>
        )}

        {/* Notification Settings Link */}
        {isActive && (
          <Button
            variant="link"
            className="mt-4"
            onClick={() => navigate(`/s/${params.storeSlug}/ticket/${params.token}/notifications`)}
          >
            <Bell className="mr-2 h-4 w-4" />
            {t('notification.title')}
          </Button>
        )}

        {/* PWA Install Card - shown on ticket page for better conversion */}
        {isActive && (
          <div className="w-full max-w-md mt-6">
            <PwaInstallBanner variant="card" />
          </div>
        )}
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
            {/* PIN Input Fields */}
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

            {/* Error Message */}
            {pinError && (
              <div className="text-destructive text-sm text-center">
                <AlertCircle className="inline h-4 w-4 mr-1" />
                {pinError}
              </div>
            )}

            {/* Loading State */}
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

export default function Ticket() {
  const params = useParams<{ storeSlug: string }>();
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const supportedLocales = (store?.supportedLocales || SUPPORTED_LOCALES) as Locale[];
  const defaultLocale = (store?.defaultLocale || 'ja') as Locale;

  return (
    <LocaleProvider defaultLocale={defaultLocale} supportedLocales={supportedLocales}>
      <TicketContent />
    </LocaleProvider>
  );
}
