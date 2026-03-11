import { useState, useEffect } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  ArrowLeft, 
  Calendar, 
  Clock, 
  Users, 
  User, 
  Phone, 
  Mail,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ja, enUS, ko, zhCN, zhTW } from "date-fns/locale";

const dateLocales: Record<string, typeof ja> = {
  ja,
  en: enUS,
  ko,
  "zh-Hans": zhCN,
  "zh-Hant": zhTW,
};

type ReservationStatus = "PENDING" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELED" | "NO_SHOW";

const statusConfig: Record<ReservationStatus, { color: string; icon: typeof CheckCircle; bgColor: string }> = {
  PENDING: { color: "text-warning", icon: AlertCircle, bgColor: "bg-warning/10" },
  CONFIRMED: { color: "text-info", icon: CheckCircle, bgColor: "bg-info/10" },
  CHECKED_IN: { color: "text-success", icon: CheckCircle, bgColor: "bg-success/10" },
  COMPLETED: { color: "text-muted-foreground", icon: CheckCircle, bgColor: "bg-muted" },
  CANCELED: { color: "text-destructive", icon: XCircle, bgColor: "bg-destructive/10" },
  NO_SHOW: { color: "text-destructive", icon: XCircle, bgColor: "bg-destructive/10" },
};

export default function ReservationCheck() {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { t, locale } = useLocale();
  
  // URLパラメータから予約番号を取得
  const searchParams = new URLSearchParams(searchString);
  const initialNumber = searchParams.get("number") || "";
  
  const [reservationNumber, setReservationNumber] = useState(initialNumber);
  const [searchedNumber, setSearchedNumber] = useState(initialNumber);
  
  // 予約情報を取得
  const { data: reservation, isLoading, error, refetch } = trpc.reservation.getByNumber.useQuery(
    { reservationNumber: searchedNumber },
    { enabled: !!searchedNumber }
  );
  
  // 初期ロード時にURLパラメータがあれば検索
  useEffect(() => {
    if (initialNumber) {
      setSearchedNumber(initialNumber);
    }
  }, [initialNumber]);
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (reservationNumber.trim()) {
      setSearchedNumber(reservationNumber.trim());
      // URLを更新
      setLocation(`/s/${storeSlug}/reservation/check?number=${reservationNumber.trim()}`);
    }
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
    return labels[status] || status;
  };
  
  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, "yyyy/MM/dd (E)", { locale: dateLocales[locale] || ja });
    } catch {
      return dateStr;
    }
  };
  
  const StatusIcon = reservation ? statusConfig[reservation.status as ReservationStatus]?.icon || AlertCircle : AlertCircle;
  const statusColor = reservation ? statusConfig[reservation.status as ReservationStatus]?.color || "text-muted-foreground" : "text-muted-foreground";
  const statusBgColor = reservation ? statusConfig[reservation.status as ReservationStatus]?.bgColor || "bg-muted" : "bg-muted";
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4">
      <div className="max-w-md mx-auto">
        {/* ヘッダー */}
        <div className="mb-6">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setLocation(`/s/${storeSlug}`)}
            className="mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("common.back")}
          </Button>
          <h1 className="text-2xl font-bold">{t("reservation.checkReservation")}</h1>
          <p className="text-muted-foreground">{t("reservation.checkStatus")}</p>
        </div>
        
        {/* 検索フォーム */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="w-4 h-4" />
              {t("reservation.enterNumber")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                value={reservationNumber}
                onChange={(e) => setReservationNumber(e.target.value)}
                placeholder={t("reservation.enterNumberPlaceholder")}
                className="flex-1"
              />
              <Button type="submit" disabled={!reservationNumber.trim()}>
                {t("reservation.search")}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        {/* 検索結果 */}
        {isLoading && (
          <Card>
            <CardContent className="py-8 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        )}
        
        {error && searchedNumber && (
          <Card>
            <CardContent className="py-8 text-center">
              <XCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
              <p className="text-lg font-medium">{t("reservation.notFound")}</p>
              <p className="text-muted-foreground mt-2">{t("reservation.notFoundDesc")}</p>
            </CardContent>
          </Card>
        )}
        
        {reservation && (
          <Card>
            <CardHeader className="text-center pb-2">
              <div className={`mx-auto w-16 h-16 ${statusBgColor} rounded-full flex items-center justify-center mb-4`}>
                <StatusIcon className={`w-8 h-8 ${statusColor}`} />
              </div>
              <CardTitle>{t("reservation.checkReservation")}</CardTitle>
              <Badge variant="outline" className={`${statusColor} border-current mt-2`}>
                {getStatusLabel(reservation.status as ReservationStatus)}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 予約番号 */}
              <div className="bg-muted/50 rounded-lg p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">{t("reservation.reservationNumber")}</p>
                <p className="text-2xl font-bold font-mono">{reservation.reservationNumber}</p>
              </div>
              
              {/* 予約詳細 */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t("reservation.date")}</p>
                    <p className="font-medium">{formatDate(reservation.reservationDate)}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t("reservation.time")}</p>
                    <p className="font-medium">{reservation.reservationTime}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t("reservation.partySize")}</p>
                    <p className="font-medium">{reservation.partySize}{t("reservation.people")}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t("reservation.name")}</p>
                    <p className="font-medium">{reservation.customerName}</p>
                  </div>
                </div>
                
                {reservation.customerPhone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t("reservation.phone")}</p>
                      <p className="font-medium">{reservation.customerPhone}</p>
                    </div>
                  </div>
                )}
                
                {reservation.customerEmail && (
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t("reservation.email")}</p>
                      <p className="font-medium">{reservation.customerEmail}</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* ステータス別メッセージ */}
              {reservation.status === "PENDING" && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
                  <p className="text-yellow-800">{t("reservation.status.pending")}</p>
                </div>
              )}
              
              {reservation.status === "CONFIRMED" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                  <p className="text-blue-800">{t("reservation.status.confirmed")}</p>
                </div>
              )}
              
              {reservation.status === "CANCELED" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm">
                  <p className="text-red-800">{t("reservation.canceled")}</p>
                </div>
              )}
              
              {/* 新規予約ボタン */}
              <div className="pt-4">
                <Button 
                  onClick={() => setLocation(`/s/${storeSlug}/reservation`)} 
                  variant="outline"
                  className="w-full"
                >
                  {t("reservation.makeReservation")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* 検索前の状態 */}
        {!searchedNumber && !isLoading && (
          <Card>
            <CardContent className="py-8 text-center">
              <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t("reservation.enterNumber")}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
