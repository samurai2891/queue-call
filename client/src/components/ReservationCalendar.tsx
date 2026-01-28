import { useState, useMemo } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  Users,
  Clock,
  Phone
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addDays, addMonths, subMonths, addWeeks, subWeeks, isSameDay, parseISO } from "date-fns";
import { ja, enUS, ko, zhCN, zhTW } from "date-fns/locale";

const dateLocales: Record<string, typeof ja> = {
  ja,
  en: enUS,
  ko,
  "zh-Hans": zhCN,
  "zh-Hant": zhTW,
};

type ReservationStatus = "PENDING" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELED" | "NO_SHOW";

interface DaySummary {
  date: string;
  total: number;
  pending: number;
  confirmed: number;
  checkedIn: number;
  completed: number;
  canceled: number;
  noShow: number;
}

interface Reservation {
  id: number;
  reservationNumber: string;
  reservationDate: string;
  reservationTime: string;
  customerName: string;
  customerPhone: string | null;
  partySize: number;
  status: ReservationStatus;
}

interface ReservationCalendarProps {
  monthlySummary: DaySummary[];
  weeklyReservations: Reservation[];
  currentMonth: Date;
  currentWeekStart: Date;
  onMonthChange: (date: Date) => void;
  onWeekChange: (date: Date) => void;
  onDateSelect: (date: Date) => void;
  onReservationClick?: (reservation: Reservation) => void;
  isLoading?: boolean;
}

const statusColors: Record<ReservationStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  CONFIRMED: "bg-blue-100 text-blue-800 border-blue-200",
  CHECKED_IN: "bg-green-100 text-green-800 border-green-200",
  COMPLETED: "bg-gray-100 text-gray-800 border-gray-200",
  CANCELED: "bg-red-100 text-red-800 border-red-200",
  NO_SHOW: "bg-orange-100 text-orange-800 border-orange-200",
};

export function ReservationCalendar({
  monthlySummary,
  weeklyReservations,
  currentMonth,
  currentWeekStart,
  onMonthChange,
  onWeekChange,
  onDateSelect,
  onReservationClick,
  isLoading,
}: ReservationCalendarProps) {
  const { t, locale } = useLocale();
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const dateLocale = dateLocales[locale] || ja;

  // 月間カレンダーのデータを生成
  const monthCalendarData = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // 週の開始日（日曜日）から始める
    const startDate = startOfWeek(firstDay, { weekStartsOn: 0 });
    const endDate = endOfWeek(lastDay, { weekStartsOn: 0 });
    
    const weeks: Date[][] = [];
    let currentDate = startDate;
    
    while (currentDate <= endDate) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(currentDate));
        currentDate = addDays(currentDate, 1);
      }
      weeks.push(week);
    }
    
    return weeks;
  }, [currentMonth]);

  // 週間カレンダーのデータを生成
  const weekCalendarData = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(addDays(currentWeekStart, i));
    }
    return days;
  }, [currentWeekStart]);

  // 日付ごとのサマリーをマップに変換
  const summaryMap = useMemo(() => {
    const map = new Map<string, DaySummary>();
    monthlySummary.forEach(s => map.set(s.date, s));
    return map;
  }, [monthlySummary]);

  // 日付ごとの予約をグループ化
  const reservationsByDate = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    weeklyReservations.forEach(r => {
      const existing = map.get(r.reservationDate) || [];
      existing.push(r);
      map.set(r.reservationDate, existing);
    });
    // 時間順にソート
    map.forEach((reservations, date) => {
      map.set(date, reservations.sort((a, b) => a.reservationTime.localeCompare(b.reservationTime)));
    });
    return map;
  }, [weeklyReservations]);

  const weekDayNames = useMemo(() => {
    return [0, 1, 2, 3, 4, 5, 6].map(day => {
      const date = addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), day);
      return format(date, "EEE", { locale: dateLocale });
    });
  }, [dateLocale]);

  const getDaySummary = (date: Date): DaySummary | undefined => {
    const dateStr = format(date, "yyyy-MM-dd");
    return summaryMap.get(dateStr);
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentMonth.getMonth();
  };

  const isToday = (date: Date) => {
    return isSameDay(date, new Date());
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            {t("reservation.calendarView")}
          </CardTitle>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "month" | "week")}>
            <TabsList>
              <TabsTrigger value="month">{t("reservation.monthView")}</TabsTrigger>
              <TabsTrigger value="week">{t("reservation.weekView")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === "month" ? (
          // 月間ビュー
          <div>
            {/* 月のナビゲーション */}
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => onMonthChange(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-lg font-semibold">
                {format(currentMonth, "yyyy年 M月", { locale: dateLocale })}
              </h3>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onMonthChange(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* カレンダーグリッド */}
            <div className="border rounded-lg overflow-hidden">
              {/* 曜日ヘッダー */}
              <div className="grid grid-cols-7 bg-muted">
                {weekDayNames.map((day, i) => (
                  <div
                    key={i}
                    className={`p-2 text-center text-sm font-medium ${
                      i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""
                    }`}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* 日付グリッド */}
              {monthCalendarData.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 border-t">
                  {week.map((date, dayIndex) => {
                    const summary = getDaySummary(date);
                    const inCurrentMonth = isCurrentMonth(date);
                    const today = isToday(date);

                    return (
                      <div
                        key={dayIndex}
                        className={`min-h-[80px] p-1 border-r last:border-r-0 cursor-pointer hover:bg-muted/50 transition-colors ${
                          !inCurrentMonth ? "bg-muted/30 text-muted-foreground" : ""
                        } ${today ? "bg-primary/5" : ""}`}
                        onClick={() => onDateSelect(date)}
                      >
                        <div className={`text-sm font-medium mb-1 ${
                          dayIndex === 0 ? "text-red-500" : dayIndex === 6 ? "text-blue-500" : ""
                        } ${today ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : ""}`}>
                          {format(date, "d")}
                        </div>
                        {summary && summary.total > 0 && (
                          <div className="space-y-0.5">
                            <div className="text-xs font-medium">
                              {summary.total}{t("reservation.reservationCount")}
                            </div>
                            <div className="flex flex-wrap gap-0.5">
                              {summary.confirmed > 0 && (
                                <span className="inline-block w-2 h-2 rounded-full bg-blue-500" title={`${t("reservation.status.confirmed")}: ${summary.confirmed}`} />
                              )}
                              {summary.pending > 0 && (
                                <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" title={`${t("reservation.status.pending")}: ${summary.pending}`} />
                              )}
                              {summary.checkedIn > 0 && (
                                <span className="inline-block w-2 h-2 rounded-full bg-green-500" title={`${t("reservation.status.checkedIn")}: ${summary.checkedIn}`} />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* 凡例 */}
            <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {t("reservation.status.confirmed")}
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                {t("reservation.status.pending")}
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {t("reservation.status.checkedIn")}
              </div>
            </div>
          </div>
        ) : (
          // 週間ビュー
          <div>
            {/* 週のナビゲーション */}
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => onWeekChange(subWeeks(currentWeekStart, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-lg font-semibold">
                {format(currentWeekStart, "yyyy年 M月 d日", { locale: dateLocale })} - {format(addDays(currentWeekStart, 6), "M月 d日", { locale: dateLocale })}
              </h3>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onWeekChange(addWeeks(currentWeekStart, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* 週間カレンダー */}
            <div className="space-y-4">
              {weekCalendarData.map((date, index) => {
                const dateStr = format(date, "yyyy-MM-dd");
                const reservations = reservationsByDate.get(dateStr) || [];
                const today = isToday(date);

                return (
                  <div
                    key={index}
                    className={`border rounded-lg overflow-hidden ${today ? "ring-2 ring-primary" : ""}`}
                  >
                    {/* 日付ヘッダー */}
                    <div
                      className={`p-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 ${
                        index === 0 ? "text-red-500" : index === 6 ? "text-blue-500" : ""
                      } ${today ? "bg-primary/10" : "bg-muted"}`}
                      onClick={() => onDateSelect(date)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {format(date, "M/d (EEE)", { locale: dateLocale })}
                        </span>
                        {today && (
                          <Badge variant="default" className="text-xs">
                            {t("reservation.today")}
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {reservations.length}{t("reservation.reservationCount")}
                      </span>
                    </div>

                    {/* 予約リスト */}
                    {reservations.length > 0 ? (
                      <div className="divide-y">
                        {reservations.map((reservation) => (
                          <div
                            key={reservation.id}
                            className="p-3 hover:bg-muted/30 cursor-pointer transition-colors"
                            onClick={() => onReservationClick?.(reservation)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 text-sm font-medium">
                                  <Clock className="h-4 w-4 text-muted-foreground" />
                                  {reservation.reservationTime}
                                </div>
                                <div className="font-medium">{reservation.customerName}</div>
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <Users className="h-4 w-4" />
                                  {reservation.partySize}{t("reservation.people")}
                                </div>
                                {reservation.customerPhone && (
                                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                    <Phone className="h-3 w-3" />
                                    {reservation.customerPhone}
                                  </div>
                                )}
                              </div>
                              <Badge className={statusColors[reservation.status]}>
                                {t(`reservation.status.${reservation.status.toLowerCase()}` as any)}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-muted-foreground text-sm">
                        {t("reservation.noReservations")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
