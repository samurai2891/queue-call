import { useParams, useLocation } from 'wouter';
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
import { RATE_LIMITED_ERR_MSG } from '@shared/const';
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
      setRole(data.role);
      sessionStorage.setItem(SESSION_STORAGE_KEY, data.sessionToken);
      setPin('');
      setIsLoggingIn(false);
    },
    onError: (error) => {
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
    onSuccess: (ticket) => {
      toast.success(`${t('staff.call')}: #${ticket.number}`);
      refetchWaitingList();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const manualCreateMutation = trpc.staff.createManual.useMutation({
    onSuccess: () => {
      toast.success(t('staff.manualAddSuccess'));
      refetchWaitingList();
      setManualNote('');
      setManualPartySize(Math.min(2, manualMaxPartySize));
    },
    onError: (error) => {
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
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const skipMutation = trpc.staff.skip.useMutation({
 
    onSuccess: () => {
      toast.success(t('staff.skip'));
      refetchWaitingList();
      setSkipDialogOpen(false);
      setSkipReason('');
      setSelectedTicketId(null);
    },
    onError: (error) => {
      toast.error(error.message);
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
    onError: (error) => {
      toast.error(error.message);
    },
  });
 
  const doneMutation = trpc.staff.done.useMutation({
    onSuccess: () => {
      toast.success(t('staff.done'));
      refetchWaitingList();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const toggleIntakeMutation = trpc.staff.toggleIntake.useMutation({
    onSuccess: () => {
      const newStatus = intakeStatus === 'open' ? 'paused' : 'open';
      setIntakeStatus(newStatus);
      toast.success(newStatus === 'open' ? t('staff.intakeOpen') : t('staff.intakePaused'));
    },
    onError: (error) => {
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

  // Login Screen
  if (!sessionToken || !session) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/30">
        <header className="p-4 flex justify-between items-center">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/s/${params.storeSlug}`)}>
            <XCircle className="h-5 w-5" />
          </Button>
          <LanguageSwitcher showLabel />
        </header>
        <main className="flex-1 container flex flex-col items-center justify-center py-8">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-center">{t('staff.login')}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="pin">{t('staff.pinLabel')}</Label>

                  <Input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    placeholder={t('staff.pinPlaceholder')}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="text-center text-2xl tracking-widest"
                    maxLength={8}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoggingIn || !pin}
                >
                  {isLoggingIn ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('staff.login')}
                </Button>
              </form>
            </CardContent>
          </Card>
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

      {/* Controls */}
      <div className="container py-4 space-y-4">
        {/* Intake Status */}
        <div className="flex items-center justify-between p-4 bg-card rounded-lg border">
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

        <Card>
          <CardHeader>
            <CardTitle>{t('staff.manualAddTitle')}</CardTitle>
            <CardDescription>{t('staff.manualAddDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleManualCreate}>
              <div className="grid gap-4 md:grid-cols-[160px,1fr]">
                <div className="space-y-2">
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
                <div className="space-y-2">
                  <Label htmlFor="manualNote">{t('join.note')}</Label>
                  <Textarea
                    id="manualNote"
                    value={manualNote}
                    onChange={(e) => setManualNote(e.target.value)}
                    placeholder={t('join.notePlaceholder')}
                    rows={3}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Button
                  type="submit"
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
          </CardContent>
        </Card>

        {reorderEnabled && (

          <div className="flex items-center justify-between p-4 bg-card rounded-lg border">
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

        {/* Call Next Button */}
        <Button
          size="lg"
          className="w-full h-16 text-xl"
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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{waitingTickets.length}</p>
              <p className="text-xs text-muted-foreground">{t('ticket.status.WAITING')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-warning">{calledTickets.length}</p>
              <p className="text-xs text-muted-foreground">{t('ticket.status.CALLED')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-success">{arrivedTickets.length}</p>
              <p className="text-xs text-muted-foreground">{t('ticket.status.ARRIVED')}</p>
            </CardContent>
          </Card>
        </div>
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
                                disabled={recallMutation.isPending}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSkip(ticket.id)}
                              >
                                <SkipForward className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        {ticket.status === 'ARRIVED' && (
                          <Button
                            size="sm"
                            onClick={() => handleDone(ticket.id)}
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
