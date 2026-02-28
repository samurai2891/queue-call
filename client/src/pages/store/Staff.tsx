import { useParams, useLocation } from 'wouter';
import { StoreLayout } from '@/components/StoreLayout';
import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Phone, 
  Users, 
  Clock, 
  CheckCircle, 
  XCircle, 
  SkipForward, 
  Bell, 
  LogOut,
  Pause,
  Play,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { useSSE } from '@/hooks/useSSE';
import { AnimatedPage, AnimatedCard } from '@/components/AnimatedPage';
import { RATE_LIMITED_ERR_MSG } from '@shared/const';
import { checkBusinessHours } from '../../../../shared/businessHours';
import type { Locale } from '@/contexts/LocaleContext';


type TicketStatus = 'WAITING' | 'CALLED' | 'ARRIVED' | 'SKIPPED' | 'DONE' | 'CANCELED' | 'EXPIRED';

interface Ticket {
  id: number;
  number: number;
  partySize: number;
  status: TicketStatus;
  note: string | null;
  createdAt: Date;
  calledAt: Date | null;
  checkinDeadlineAt: Date | null;
}

const SESSION_STORAGE_KEY = 'queue-call-staff-session';

function StaffContent() {
  const params = useParams<{ storeSlug: string }>();
  const [, navigate] = useLocation();
  const { t } = useLocale();
  
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(SESSION_STORAGE_KEY);
    }
    return null;
  });
  const [pin, setPin] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [role, setRole] = useState<'staff' | 'manager' | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [intakeStatus, setIntakeStatus] = useState<'open' | 'paused'>('open');
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [reorderModeEnabled, setReorderModeEnabled] = useState(false);
  const [reorderDialogOpen, setReorderDialogOpen] = useState(false);
  const [reorderReason, setReorderReason] = useState('');
  const [reorderTarget, setReorderTarget] = useState<{ ticketId: number; delta: number } | null>(null);
  const [manualPartySize, setManualPartySize] = useState(2);
  const [manualNote, setManualNote] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [businessHoursOverride, setBusinessHoursOverride] = useState(false);


  const { data: store, isLoading: storeLoading, error: storeError } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const reorderEnabled = store?.settings?.queue?.enableReorder ?? false;
  const reorderMaxMove = store?.settings?.queue?.reorderMaxMove ?? 3;
  const reorderReasonRequired = store?.settings?.queue?.reorderReasonRequired ?? false;
  const manualMaxPartySize = store?.settings?.kiosk?.maxPartySize ?? 10;


  // Verify session
  const { data: session, isLoading: sessionLoading, error: sessionError } = trpc.staff.getSession.useQuery(
    { sessionToken: sessionToken || '' },
    { enabled: !!sessionToken, retry: false }
  );

  useEffect(() => {
    if (sessionError) {
      setSessionToken(null);
      setRole(null);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [sessionError]);

  // Get waiting list

  const { data: waitingList, refetch: refetchWaitingList } = trpc.staff.getWaitingList.useQuery(
    { sessionToken: sessionToken || '', storeId: store?.id || 0 },
    { enabled: !!sessionToken && !!session && !!store?.id, refetchInterval: 30000 }
  );

  useEffect(() => {
    if (waitingList) {
      setTickets(waitingList as Ticket[]);
    }
  }, [waitingList]);

  useEffect(() => {
    if (store) {
      setIntakeStatus(store.intakeStatus as 'open' | 'paused');
      setBusinessHoursOverride(store.settings?.businessHours?.override === true);
    }
  }, [store]);

  useEffect(() => {
    if (!reorderEnabled) {
      setReorderModeEnabled(false);
    }
  }, [reorderEnabled]);

  // SSE for real-time updates
  useSSE({
    scope: 'staff',
    storeId: store?.id || 0,
    storeSlug: params.storeSlug,
    enabled: !!store?.id && !!sessionToken && !!session,
    onQueueUpdate: () => {

      refetchWaitingList();
    },
    onIntakeStatus: (data) => {
      setIntakeStatus(data.status);
    },
  });

  // Mutations
  const loginMutation = trpc.staff.login.useMutation({
    onSuccess: (data) => {
      setSessionToken(data.sessionToken);
      setRole(data.role as 'staff' | 'manager');
      sessionStorage.setItem(SESSION_STORAGE_KEY, data.sessionToken);
      setPin('');
      setIsLoggingIn(false);
    },
    onError: (error: any) => {
      if (error.message === RATE_LIMITED_ERR_MSG) {
        toast.error(t('common.rateLimited'));
      } else {
        toast.error(t('staff.wrongPin'));
      }
      setIsLoggingIn(false);
    },
  });


  const logoutMutation = trpc.staff.logout.useMutation({
    onSuccess: () => {
      setSessionToken(null);
      setRole(null);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    },
  });

  const callNextMutation = trpc.staff.callNext.useMutation({
    onMutate: async () => {
      // Optimistically move the first WAITING ticket to CALLED status to prevent double-call
      setTickets(prev => {
        const firstWaiting = prev.find(t => t.status === 'WAITING');
        if (!firstWaiting) return prev;
        return prev.map(t =>
          t.id === firstWaiting.id ? { ...t, status: 'CALLED' as const } : t
        );
      });
    },
    onSuccess: (ticket) => {
      toast.success(`${t('staff.call')}: #${ticket.number}`);
      refetchWaitingList();
    },
    onError: (error: any) => {
      toast.error(error.message);
      refetchWaitingList();
    },
  });

  const manualCreateMutation = trpc.staff.createManual.useMutation({
    onSuccess: () => {
      toast.success(t('staff.manualAddSuccess'));
      refetchWaitingList();
      setManualNote('');
      setManualPartySize(Math.min(2, manualMaxPartySize));
    },
    onError: (error: any) => {
      const message = error.message === 'Intake is paused'
        ? t('staff.manualAddDisabled')
        : error.message;
      toast.error(message);
    },
  });
 
  const recallMutation = trpc.staff.recall.useMutation({
    onSuccess: () => {
      toast.success(t('staff.recall'));
      refetchWaitingList();
    },
    onError: (error: any) => {
      toast.error(error.message);
      refetchWaitingList();
    },
  });

  const skipMutation = trpc.staff.skip.useMutation({
    onMutate: async (variables) => {
      // Optimistically remove the skipped ticket from local state
      setTickets(prev => prev.filter(t => t.id !== variables.ticketId));
    },
    onSuccess: () => {
      toast.success(t('staff.skip'));
      refetchWaitingList();
      setSkipDialogOpen(false);
      setSkipReason('');
      setSelectedTicketId(null);
    },
    onError: (error: any) => {
      toast.error(error.message);
      refetchWaitingList();
    },
  });

  const moveTicketMutation = trpc.staff.moveTicket.useMutation({
    onSuccess: () => {
      toast.success(t('staff.reorderSuccess'));
      refetchWaitingList();
      setReorderDialogOpen(false);
      setReorderReason('');
      setReorderTarget(null);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
 
  const doneMutation = trpc.staff.done.useMutation({
    onMutate: async (variables) => {
      // Optimistically remove the done ticket from local state to prevent double-click
      setTickets(prev => prev.filter(t => t.id !== variables.ticketId));
    },
    onSuccess: () => {
      toast.success(t('staff.done'));
      refetchWaitingList();
    },
    onError: (error: any) => {
      toast.error(error.message);
      refetchWaitingList();
    },
  });

  const toggleIntakeMutation = trpc.staff.toggleIntake.useMutation({
    onSuccess: () => {
      const newStatus = intakeStatus === 'open' ? 'paused' : 'open';
      setIntakeStatus(newStatus);
      toast.success(newStatus === 'open' ? t('staff.intakeOpen') : t('staff.intakePaused'));
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const toggleOverrideMutation = trpc.staff.toggleBusinessHoursOverride.useMutation({
    onSuccess: (data) => {
      setBusinessHoursOverride(data.override);
      toast.success(
        data.override
          ? t('staff.businessHoursOverrideOn')
          : t('staff.businessHoursOverrideOff')
      );
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!store || !pin) return;
    setIsLoggingIn(true);
    loginMutation.mutate({ storeId: store.id, pin });
  };

  const handleLogout = () => {
    if (sessionToken) {
      logoutMutation.mutate({ sessionToken });
    }
  };

  const handleCallNext = () => {
    if (!sessionToken || !store) return;
    callNextMutation.mutate({ sessionToken, storeId: store.id });
  };

  const handleManualCreate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!sessionToken || !store) return;
    manualCreateMutation.mutate({
      sessionToken,
      storeId: store.id,
      partySize: manualPartySize,
      note: manualNote.trim() || undefined,
    });
  };

  const handleManualPartySizeChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      setManualPartySize(1);
      return;
    }
    const clamped = Math.max(1, Math.min(parsed, manualMaxPartySize));
    setManualPartySize(clamped);
  };
 
  const handleRecall = (ticketId: number) => {

    if (!sessionToken) return;
    recallMutation.mutate({ sessionToken, ticketId });
  };

  const handleSkip = (ticketId: number) => {

    setSelectedTicketId(ticketId);
    setSkipDialogOpen(true);
  };

  const confirmSkip = () => {
    if (!sessionToken || !selectedTicketId) return;
    skipMutation.mutate({ sessionToken, ticketId: selectedTicketId, reason: skipReason || undefined });
  };

  const handleMoveTicket = (ticketId: number, delta: number) => {
    if (!sessionToken) return;
    if (reorderReasonRequired) {
      setReorderTarget({ ticketId, delta });
      setReorderDialogOpen(true);
      return;
    }
    moveTicketMutation.mutate({ sessionToken, ticketId, delta });
  };

  const confirmReorder = () => {
    if (!sessionToken || !reorderTarget) return;
    moveTicketMutation.mutate({
      sessionToken,
      ticketId: reorderTarget.ticketId,
      delta: reorderTarget.delta,
      reason: reorderReason.trim() || undefined,
    });
  };

  const handleReorderDialogChange = (open: boolean) => {
    setReorderDialogOpen(open);
    if (!open) {
      setReorderReason('');
      setReorderTarget(null);
    }
  };
 
  const handleDone = (ticketId: number) => {
    if (!sessionToken) return;
    doneMutation.mutate({ sessionToken, ticketId });
  };

  const handleToggleIntake = () => {
    if (!sessionToken || !store) return;
    const newStatus = intakeStatus === 'open' ? 'paused' : 'open';
    toggleIntakeMutation.mutate({ sessionToken, storeId: store.id, status: newStatus });
  };

  const handleToggleOverride = (checked: boolean) => {
    if (!sessionToken || !store) return;
    toggleOverrideMutation.mutate({ sessionToken, storeId: store.id, override: checked });
  };

  // Business hours status
  const businessHoursEnabled = store?.settings?.businessHours?.enabled === true;
  const businessHoursStatus = businessHoursEnabled ? checkBusinessHours(store?.settings?.businessHours as any) : null;
  const isOutsideBusinessHours = businessHoursStatus ? !businessHoursStatus.isOpen : false;

  const getStatusBadge = (status: TicketStatus) => {
    const variants: Record<TicketStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      WAITING: { variant: 'secondary', label: t('ticket.status.WAITING') },
      CALLED: { variant: 'default', label: t('ticket.status.CALLED') },
      ARRIVED: { variant: 'default', label: t('ticket.status.ARRIVED') },
      SKIPPED: { variant: 'outline', label: t('ticket.status.SKIPPED') },
      DONE: { variant: 'secondary', label: t('ticket.status.DONE') },
      CANCELED: { variant: 'destructive', label: t('ticket.status.CANCELED') },
      EXPIRED: { variant: 'destructive', label: t('ticket.status.EXPIRED') },
    };
    const config = variants[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (storeLoading || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
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

  // Login Screen — Numpad UI
  if (!sessionToken || !session) {
    const handleNumpadPress = (digit: string) => {
      if (pin.length < 8) {
        setPin(prev => prev + digit);
      }
    };
    const handleNumpadDelete = () => {
      setPin(prev => prev.slice(0, -1));
    };
    const handleNumpadClear = () => {
      setPin('');
    };

    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/30">
        <header className="p-4 flex justify-between items-center">
          <Button variant="ghost" size="icon" className="active:scale-90 transition-transform" onClick={() => navigate(`/s/${params.storeSlug}`)}>
            <XCircle className="h-5 w-5" />
          </Button>
          <LanguageSwitcher showLabel />
        </header>
        <main className="flex-1 container flex flex-col items-center justify-center py-4">
          <AnimatedCard delay={100} hoverEffect={false} className="w-full max-w-sm">
            <Card className="w-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-center">{t('staff.login')}</CardTitle>
                <CardDescription className="text-center">{t('staff.pinLabel')}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  {/* PIN dots display */}
                  <div className="flex items-center justify-center gap-3 py-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-4 w-4 rounded-full transition-all duration-200 ${
                          i < pin.length
                            ? 'bg-primary scale-110'
                            : 'bg-muted border-2 border-muted-foreground/20'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Hidden input for form submission */}
                  <input type="hidden" value={pin} />

                  {/* Numpad grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                      <Button
                        key={digit}
                        type="button"
                        variant="outline"
                        className="h-14 text-2xl font-semibold hover:bg-accent active:scale-90 transition-transform"
                        onClick={() => handleNumpadPress(digit)}
                      >
                        {digit}
                      </Button>
                    ))}
                    {/* Bottom row: Clear, 0, Delete */}
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-14 text-sm font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-transform"
                      onClick={handleNumpadClear}
                    >
                      {t('staff.numpadClear')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-14 text-2xl font-semibold hover:bg-accent active:scale-90 transition-transform"
                      onClick={() => handleNumpadPress('0')}
                    >
                      0
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-14 text-lg font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-transform"
                      onClick={handleNumpadDelete}
                    >
                      ⌫
                    </Button>
                  </div>

                  {/* Login button */}
                  <Button
                    type="submit"
                    className="w-full h-14 text-lg active:scale-[0.97] transition-transform"
                    disabled={isLoggingIn || !pin}
                  >
                    {isLoggingIn ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : null}
                    {t('staff.login')}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </AnimatedCard>
        </main>
      </div>
    );
  }

  // Staff Dashboard
  const waitingTickets = tickets.filter(t => t.status === 'WAITING');
  const calledTickets = tickets.filter(t => t.status === 'CALLED');
  const arrivedTickets = tickets.filter(t => t.status === 'ARRIVED');
  const waitingIndexMap = new Map(waitingTickets.map((ticket, index) => [ticket.id, index]));
  const lastWaitingIndex = waitingTickets.length - 1;
  const canReorder = reorderEnabled && reorderModeEnabled && reorderMaxMove > 0;

  return (
    <StoreLayout storeSlug={params.storeSlug || ''} storeName={store.name}>
      <div className="min-h-screen flex flex-col bg-background">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background border-b">
          <div className="container py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">{store.name}</h1>
              <Badge variant={role === 'manager' ? 'default' : 'secondary'}>
              {role === 'manager' ? t('staff.roleManager') : t('staff.roleStaff')}
            </Badge>

          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* P0-4: 「次を呼ぶ」ボタン + ステータスをsticky固定 */}
      <div className="sticky top-[53px] z-10 bg-background border-b shadow-sm">
        <div className="container py-3 space-y-3">
          {/* Call Next Button — 最も重要なアクション */}
          <Button
            size="lg"
            className="w-full h-14 text-lg"
            onClick={handleCallNext}
            disabled={callNextMutation.isPending || waitingTickets.length === 0}
          >
            {callNextMutation.isPending ? (
              <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            ) : (
              <Bell className="mr-2 h-6 w-6" />
            )}
            {t('staff.call')} ({waitingTickets.length})
          </Button>

          {/* Stats — コンパクトなインライン表示 */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center justify-center gap-2 p-2 bg-muted/50 rounded-lg">
              <span className="text-lg font-bold text-primary tabular-nums">{waitingTickets.length}</span>
              <span className="text-xs text-muted-foreground">{t('ticket.status.WAITING')}</span>
            </div>
            <div className="flex items-center justify-center gap-2 p-2 bg-muted/50 rounded-lg">
              <span className="text-lg font-bold text-warning tabular-nums">{calledTickets.length}</span>
              <span className="text-xs text-muted-foreground">{t('ticket.status.CALLED')}</span>
            </div>
            <div className="flex items-center justify-center gap-2 p-2 bg-muted/50 rounded-lg">
              <span className="text-lg font-bold text-success tabular-nums">{arrivedTickets.length}</span>
              <span className="text-xs text-muted-foreground">{t('ticket.status.ARRIVED')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="container py-4 space-y-4">
        {/* Intake Status */}
        <div className="flex items-center justify-between p-3 bg-card rounded-lg border">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{t('staff.intake')}</span>
            <Badge variant={intakeStatus === 'open' ? 'default' : 'destructive'}>
              {intakeStatus === 'open' ? t('staff.intakeOpen') : t('staff.intakePaused')}
            </Badge>
          </div>
          <Button
            variant={intakeStatus === 'open' ? 'destructive' : 'default'}
            size="sm"
            onClick={handleToggleIntake}
            disabled={toggleIntakeMutation.isPending}
          >
            {intakeStatus === 'open' ? (
              <>
                <Pause className="mr-2 h-4 w-4" />
                {t('staff.pauseIntake')}
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                {t('staff.resumeIntake')}
              </>
            )}
          </Button>
        </div>

        {/* Business Hours Override — 営業時間外受付許可 */}
        {businessHoursEnabled && isOutsideBusinessHours && (
          <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-warning/50">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" />
                <span className="text-sm font-medium">{t('staff.businessHoursOverride')}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {businessHoursOverride
                  ? t('staff.businessHoursOverrideOnDesc')
                  : t('staff.businessHoursOverrideOffDesc')}
              </p>
            </div>
            <Switch
              checked={businessHoursOverride}
              onCheckedChange={handleToggleOverride}
              disabled={toggleOverrideMutation.isPending}
            />
          </div>
        )}

        {/* Business Hours Override Active Banner */}
        {businessHoursEnabled && businessHoursOverride && (
          <Alert className="border-warning/50 bg-warning/5">
            <AlertCircle className="h-4 w-4 text-warning" />
            <AlertTitle className="text-warning">{t('staff.businessHoursOverrideActive')}</AlertTitle>
            <AlertDescription className="text-xs">
              {t('staff.businessHoursOverrideActiveDesc')}
            </AlertDescription>
          </Alert>
        )}

        {/* Manual Add — 折りたたみ */}
        <div className="bg-card rounded-lg border">
          <button
            type="button"
            className="w-full flex items-center justify-between p-3 text-left"
            onClick={() => setShowManualForm(!showManualForm)}
          >
            <span className="text-sm font-medium">{t('staff.manualAddTitle')}</span>
            {showManualForm ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {showManualForm && (
            <div className="px-3 pb-3 border-t">
              <p className="text-xs text-muted-foreground mt-2 mb-3">{t('staff.manualAddDescription')}</p>
              <form className="space-y-3" onSubmit={handleManualCreate}>
                <div className="grid gap-3 md:grid-cols-[160px,1fr]">
                  <div className="space-y-1">
                    <Label htmlFor="manualPartySize">{t('join.partySize')}</Label>
                    <Input
                      id="manualPartySize"
                      type="number"
                      min={1}
                      max={manualMaxPartySize}
                      value={manualPartySize}
                      onChange={(e) => handleManualPartySizeChange(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="manualNote">{t('join.note')}</Label>
                    <Textarea
                      id="manualNote"
                      value={manualNote}
                      onChange={(e) => setManualNote(e.target.value)}
                      placeholder={t('join.notePlaceholder')}
                      rows={2}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={manualCreateMutation.isPending || intakeStatus !== 'open'}
                  >
                    {manualCreateMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t('staff.manualAddAction')}
                  </Button>
                  {intakeStatus !== 'open' && (
                    <p className="text-xs text-muted-foreground">{t('staff.manualAddDisabled')}</p>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>

        {reorderEnabled && (
          <div className="flex items-center justify-between p-3 bg-card rounded-lg border">
            <div className="space-y-1">
              <span className="text-sm font-medium">{t('staff.reorderMode')}</span>
              <p className="text-xs text-muted-foreground">
                {reorderModeEnabled ? t('staff.reorderModeOn') : t('staff.reorderModeOff')}
              </p>
            </div>
            <Switch
              checked={reorderModeEnabled}
              onCheckedChange={(checked) => setReorderModeEnabled(checked)}
            />
          </div>
        )}

        {reorderEnabled && reorderModeEnabled && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('staff.reorderMode')}</AlertTitle>
            <AlertDescription>{t('staff.reorderWarning')}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* Ticket List */}
      <div className="flex-1 container pb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{t('staff.waitingList')}</h2>
          <Button variant="ghost" size="sm" onClick={() => refetchWaitingList()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-400px)]">
          {tickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('staff.noWaiting')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => {
                const waitingIndex = waitingIndexMap.get(ticket.id);
                const canMoveUp = canReorder && ticket.status === 'WAITING' && waitingIndex !== undefined && waitingIndex > 0;
                const canMoveDown = canReorder && ticket.status === 'WAITING' && waitingIndex !== undefined && waitingIndex < lastWaitingIndex;

                return (
                  <Card key={ticket.id} className={ticket.status === 'CALLED' ? 'ring-2 ring-primary' : ''}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div className="text-3xl font-bold tabular-nums">#{ticket.number}</div>
                          <div>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(ticket.status)}
                              <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {ticket.partySize}
                              </span>
                            </div>
                            {ticket.note && (
                              <p className="text-sm text-muted-foreground mt-1 italic">"{ticket.note}"</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(ticket.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {ticket.status === 'WAITING' && canReorder && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={t('staff.moveUp')}
                                onClick={() => handleMoveTicket(ticket.id, -1)}
                                disabled={!canMoveUp || moveTicketMutation.isPending}
                              >
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={t('staff.moveDown')}
                                onClick={() => handleMoveTicket(ticket.id, 1)}
                                disabled={!canMoveDown || moveTicketMutation.isPending}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {ticket.status === 'CALLED' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRecall(ticket.id)}
                                disabled={recallMutation.isPending || doneMutation.isPending || skipMutation.isPending}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSkip(ticket.id)}
                                disabled={skipMutation.isPending || doneMutation.isPending}
                              >
                                <SkipForward className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        {ticket.status === 'ARRIVED' && (
                          <Button
                            size="sm"
                            onClick={() => handleDone(ticket.id)}
                            disabled={doneMutation.isPending}
                          >
                            <CheckCircle className="mr-1 h-4 w-4" />
                            {t('staff.done')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Skip Dialog */}
      <AlertDialog open={skipDialogOpen} onOpenChange={setSkipDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('staff.skip')}</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3 mt-2">
                <Label htmlFor="skipReason">{t('staff.reorderReason')}</Label>
                <Input
                  id="skipReason"
                  placeholder={t('staff.reorderReasonPlaceholder')}
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value)}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSkip}>
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reorder Dialog */}
      <AlertDialog open={reorderDialogOpen} onOpenChange={handleReorderDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('staff.reorderConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3 mt-2">
                <Label htmlFor="reorderReason">{t('staff.reorderReason')}</Label>
                <Input
                  id="reorderReason"
                  placeholder={t('staff.reorderReasonPlaceholder')}
                  value={reorderReason}
                  onChange={(e) => setReorderReason(e.target.value)}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReorder}
              disabled={moveTicketMutation.isPending || (reorderReasonRequired && !reorderReason.trim())}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </StoreLayout>
  );
}

export default function Staff() {
  const params = useParams<{ storeSlug: string }>();
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const supportedLocales = (store?.supportedLocales || SUPPORTED_LOCALES) as Locale[];
  const defaultLocale = (store?.defaultLocale || 'ja') as Locale;

  return (
    <LocaleProvider defaultLocale={defaultLocale} supportedLocales={supportedLocales}>
      <StaffContent />
    </LocaleProvider>
  );
}
