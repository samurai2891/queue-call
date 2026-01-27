import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  CalendarIcon, 
  Clock, 
  Users, 
  Phone, 
  Mail, 
  User, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  UserCheck,
  FileText,
  RefreshCw,
  LogOut
} from "lucide-react";
import { format } from "date-fns";
import { ja, enUS, ko, zhCN, zhTW } from "date-fns/locale";
import { toast } from "sonner";
import { StoreLayout } from "@/components/StoreLayout";

const dateLocales: Record<string, typeof ja> = {
  ja,
  en: enUS,
  ko,
  "zh-Hans": zhCN,
  "zh-Hant": zhTW,
};

type ReservationStatus = "PENDING" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELED" | "NO_SHOW";

const statusColors: Record<ReservationStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  CONFIRMED: "bg-blue-100 text-blue-800 border-blue-200",
  CHECKED_IN: "bg-green-100 text-green-800 border-green-200",
  COMPLETED: "bg-gray-100 text-gray-800 border-gray-200",
  CANCELED: "bg-red-100 text-red-800 border-red-200",
  NO_SHOW: "bg-orange-100 text-orange-800 border-orange-200",
};

interface ReservationItem {
  id: number;
  reservationNumber: string;
  reservationDate: string;
  reservationTime: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  partySize: number;
  note: string | null;
  status: ReservationStatus;
}

const SESSION_STORAGE_KEY = 'queue-call-staff-session';

export default function ReservationManagement() {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const { t, locale } = useLocale();
  
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(SESSION_STORAGE_KEY);
    }
    return null;
  });
  const [pin, setPin] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: "confirm" | "checkIn" | "cancel" | "noShow";
    reservationId: number;
    reservationNumber: string;
  } | null>(null);
  
  // 店舗情報を取得
  const { data: storeData, isLoading: storeLoading } = trpc.store.getBySlug.useQuery(
    { slug: storeSlug || "" },
    { enabled: !!storeSlug }
  );
  
  const store = storeData;
  
  // セッション検証
  const { data: session, isLoading: sessionLoading, error: sessionError } = trpc.staff.getSession.useQuery(
    { sessionToken: sessionToken || '' },
    { enabled: !!sessionToken, retry: false }
  );
  
  useEffect(() => {
    if (sessionError) {
      setSessionToken(null);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [sessionError]);
  
  // 予約一覧を取得
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const { data: reservationsData, isLoading: reservationsLoading, refetch } = trpc.reservation.listByStore.useQuery(
    { 
      storeSlug: storeSlug || "", 
      staffToken: sessionToken || "",
      date: dateStr 
    },
    { enabled: !!storeSlug && !!sessionToken && !!session }
  );
  
  const utils = trpc.useUtils();
  
  // ログイン
  const loginMutation = trpc.staff.login.useMutation({
    onSuccess: (data) => {
      setSessionToken(data.sessionToken);
      sessionStorage.setItem(SESSION_STORAGE_KEY, data.sessionToken);
      setPin('');
      setIsLoggingIn(false);
    },
    onError: () => {
      toast.error(t('staff.wrongPin'));
      setIsLoggingIn(false);
    },
  });
  
  // ログアウト
  const logoutMutation = trpc.staff.logout.useMutation({
    onSuccess: () => {
      setSessionToken(null);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    },
  });
  
  // 予約確認
  const confirmReservation = trpc.reservation.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(t("reservation.status.confirmed"));
      utils.reservation.listByStore.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  // チェックイン
  const checkInReservation = trpc.reservation.checkIn.useMutation({
    onSuccess: () => {
      toast.success(t("reservation.status.checkedIn"));
      utils.reservation.listByStore.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  // キャンセル
  const cancelReservation = trpc.reservation.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(t("reservation.canceled"));
      utils.reservation.listByStore.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  // ノーショー
  const markNoShow = trpc.reservation.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(t("reservation.status.noShow"));
      utils.reservation.listByStore.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  const handleLogin = () => {
    if (!storeSlug || !pin) return;
    setIsLoggingIn(true);
    if (store) {
      loginMutation.mutate({ storeId: store.id, pin });
    }
  };
  
  const handleLogout = () => {
    if (!sessionToken) return;
    logoutMutation.mutate({ sessionToken });
  };
  
  const handleAction = (action: "confirm" | "checkIn" | "cancel" | "noShow", reservationId: number, reservationNumber: string) => {
    setConfirmDialog({ open: true, action, reservationId, reservationNumber });
  };
  
  const executeAction = async () => {
    if (!confirmDialog || !sessionToken || !storeSlug) return;
    
    const { action, reservationId } = confirmDialog;
    
    switch (action) {
      case "confirm":
        await confirmReservation.mutateAsync({ 
          storeSlug, 
          staffToken: sessionToken, 
          reservationId, 
          status: "CONFIRMED" 
        });
        break;
      case "checkIn":
        await checkInReservation.mutateAsync({ 
          storeSlug, 
          staffToken: sessionToken, 
          reservationId 
        });
        break;
      case "cancel":
        await cancelReservation.mutateAsync({ 
          storeSlug, 
          staffToken: sessionToken, 
          reservationId, 
          status: "CANCELED" 
        });
        break;
      case "noShow":
        await markNoShow.mutateAsync({ 
          storeSlug, 
          staffToken: sessionToken, 
          reservationId, 
          status: "NO_SHOW" 
        });
        break;
    }
    
    setConfirmDialog(null);
  };
  
  const getStatusLabel = (status: ReservationStatus) => {
    const labels: Record<ReservationStatus, string> = {
      PENDING: t("reservation.status.pending"),
      CONFIRMED: t("reservation.status.confirmed"),
      CHECKED_IN: t("reservation.status.checkedIn"),
      COMPLETED: t("reservation.status.completed"),
      CANCELED: t("reservation.status.canceled"),
      NO_SHOW: t("reservation.status.noShow"),
    };
    return labels[status];
  };
  
  const getActionLabel = (action: "confirm" | "checkIn" | "cancel" | "noShow") => {
    const labels = {
      confirm: t("reservation.confirmReservation"),
      checkIn: t("reservation.checkIn"),
      cancel: t("reservation.cancelReservation"),
      noShow: t("reservation.markNoShow"),
    };
    return labels[action];
  };
  
  // ローディング中
  if (storeLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  // 未ログイン（スタッフPINログイン画面）
  if (!sessionToken || !session) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4">
        <div className="max-w-md mx-auto mt-8">
          <Card>
            <CardHeader>
              <h2 className="text-xl font-bold">{t("reservation.management")}</h2>
              <p className="text-muted-foreground">{t("staff.pinPlaceholder")}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin">{t("staff.pinLabel")}</Label>
                <Input
                  id="pin"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="****"
                  maxLength={6}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLogin();
                  }}
                />
              </div>
              <Button 
                onClick={handleLogin} 
                disabled={!pin || isLoggingIn}
                className="w-full"
              >
                {isLoggingIn ? t("common.loading") : t("common.login")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  
  const reservations: ReservationItem[] = (reservationsData || []) as ReservationItem[];
  
  // ステータス別に分類
  const pendingReservations = reservations.filter(r => r.status === "PENDING");
  const confirmedReservations = reservations.filter(r => r.status === "CONFIRMED");
  const checkedInReservations = reservations.filter(r => r.status === "CHECKED_IN");
  
  const content = (
    <div className="p-4 space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("reservation.management")}</h1>
          <p className="text-muted-foreground">{t("reservation.managementDesc")}</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedDate, "yyyy/MM/dd (E)", { locale: dateLocales[locale] || ja })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                locale={dateLocales[locale] || ja}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* 予約一覧 */}
      {reservationsLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : reservations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("reservation.noReservations")}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">
              {t("smsHistory.filterAll")} ({reservations.length})
            </TabsTrigger>
            <TabsTrigger value="pending">
              {t("reservation.status.pending")} ({pendingReservations.length})
            </TabsTrigger>
            <TabsTrigger value="confirmed">
              {t("reservation.status.confirmed")} ({confirmedReservations.length})
            </TabsTrigger>
            <TabsTrigger value="checkedIn">
              {t("reservation.status.checkedIn")} ({checkedInReservations.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="all" className="space-y-4 mt-4">
            {reservations.map((reservation) => (
              <ReservationCard
                key={reservation.id}
                reservation={reservation}
                statusColors={statusColors}
                getStatusLabel={getStatusLabel}
                onAction={handleAction}
                t={t}
              />
            ))}
          </TabsContent>
          
          <TabsContent value="pending" className="space-y-4 mt-4">
            {pendingReservations.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {t("reservation.noReservations")}
                </CardContent>
              </Card>
            ) : (
              pendingReservations.map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  statusColors={statusColors}
                  getStatusLabel={getStatusLabel}
                  onAction={handleAction}
                  t={t}
                />
              ))
            )}
          </TabsContent>
          
          <TabsContent value="confirmed" className="space-y-4 mt-4">
            {confirmedReservations.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {t("reservation.noReservations")}
                </CardContent>
              </Card>
            ) : (
              confirmedReservations.map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  statusColors={statusColors}
                  getStatusLabel={getStatusLabel}
                  onAction={handleAction}
                  t={t}
                />
              ))
            )}
          </TabsContent>
          
          <TabsContent value="checkedIn" className="space-y-4 mt-4">
            {checkedInReservations.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {t("reservation.noReservations")}
                </CardContent>
              </Card>
            ) : (
              checkedInReservations.map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  statusColors={statusColors}
                  getStatusLabel={getStatusLabel}
                  onAction={handleAction}
                  t={t}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
      
      {/* 確認ダイアログ */}
      <AlertDialog open={confirmDialog?.open} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog && getActionLabel(confirmDialog.action)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("reservation.reservationNumber")}: {confirmDialog?.reservationNumber}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={executeAction}>
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
  
  return (
    <StoreLayout storeSlug={storeSlug || ""} storeName={store?.name || ""}>
      {content}
    </StoreLayout>
  );
}

// 予約カードコンポーネント
function ReservationCard({
  reservation,
  statusColors,
  getStatusLabel,
  onAction,
  t,
}: {
  reservation: ReservationItem;
  statusColors: Record<ReservationStatus, string>;
  getStatusLabel: (status: ReservationStatus) => string;
  onAction: (action: "confirm" | "checkIn" | "cancel" | "noShow", reservationId: number, reservationNumber: string) => void;
  t: (key: any) => string;
}) {
  const canConfirm = reservation.status === "PENDING";
  const canCheckIn = reservation.status === "CONFIRMED";
  const canCancel = reservation.status === "PENDING" || reservation.status === "CONFIRMED";
  const canMarkNoShow = reservation.status === "CONFIRMED";
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold">{reservation.reservationNumber}</span>
            <Badge className={statusColors[reservation.status]}>
              {getStatusLabel(reservation.status)}
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span className="font-medium">{reservation.reservationTime}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <span>{reservation.customerName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span>{reservation.partySize}{t("reservation.people")}</span>
          </div>
          {reservation.customerPhone && (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span>{reservation.customerPhone}</span>
            </div>
          )}
          {reservation.customerEmail && (
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="truncate">{reservation.customerEmail}</span>
            </div>
          )}
        </div>
        
        {reservation.note && (
          <div className="flex items-start gap-2 text-sm bg-muted/50 rounded p-2">
            <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
            <span>{reservation.note}</span>
          </div>
        )}
        
        {/* アクションボタン */}
        {(canConfirm || canCheckIn || canCancel || canMarkNoShow) && (
          <div className="flex flex-wrap gap-2 pt-2">
            {canConfirm && (
              <Button 
                size="sm" 
                onClick={() => onAction("confirm", reservation.id, reservation.reservationNumber)}
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                {t("reservation.confirmReservation")}
              </Button>
            )}
            {canCheckIn && (
              <Button 
                size="sm" 
                onClick={() => onAction("checkIn", reservation.id, reservation.reservationNumber)}
              >
                <UserCheck className="w-4 h-4 mr-1" />
                {t("reservation.checkIn")}
              </Button>
            )}
            {canMarkNoShow && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onAction("noShow", reservation.id, reservation.reservationNumber)}
              >
                <AlertTriangle className="w-4 h-4 mr-1" />
                {t("reservation.markNoShow")}
              </Button>
            )}
            {canCancel && (
              <Button 
                size="sm" 
                variant="destructive"
                onClick={() => onAction("cancel", reservation.id, reservation.reservationNumber)}
              >
                <XCircle className="w-4 h-4 mr-1" />
                {t("common.cancel")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
