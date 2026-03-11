import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Clock, Users, Phone, Mail, User, FileText, CheckCircle, ArrowLeft } from "lucide-react";
import { format, addDays, isBefore, startOfDay } from "date-fns";
import { ja, enUS, ko, zhCN, zhTW } from "date-fns/locale";

const dateLocales: Record<string, typeof ja> = {
  ja,
  en: enUS,
  ko,
  "zh-Hans": zhCN,
  "zh-Hant": zhTW,
};

export default function Reservation() {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const [, setLocation] = useLocation();
  const { t, locale } = useLocale();
  
  // フォーム状態
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [note, setNote] = useState("");
  
  // 予約完了状態
  const [reservationComplete, setReservationComplete] = useState(false);
  const [reservationNumber, setReservationNumber] = useState("");
  
  // 予約設定を取得
  const { data: settingsData, isLoading: settingsLoading } = trpc.reservation.getSettings.useQuery(
    { storeSlug: storeSlug || "" },
    { enabled: !!storeSlug }
  );
  
  // 選択した日付の空き状況を取得
  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const { data: slotsData, isLoading: slotsLoading } = trpc.reservation.getAvailableSlots.useQuery(
    { storeSlug: storeSlug || "", date: dateStr },
    { enabled: !!storeSlug && !!dateStr }
  );
  
  // 予約作成
  const createReservation = trpc.reservation.create.useMutation({
    onSuccess: (data) => {
      setReservationComplete(true);
      setReservationNumber(data.reservation.reservationNumber);
    },
  });
  
  const settings = settingsData?.settings;
  const storeName = settingsData?.storeName || "";
  
  // 予約可能な日付範囲
  const minDate = startOfDay(new Date());
  const maxDate = addDays(minDate, settings?.advanceDays || 30);
  
  // 予約可能な曜日をチェック
  const isDateDisabled = (date: Date) => {
    if (isBefore(date, minDate) || isBefore(maxDate, date)) {
      return true;
    }
    const dayOfWeek = date.getDay();
    const availableDays = settings?.availableDays || [0, 1, 2, 3, 4, 5, 6];
    return !availableDays.includes(dayOfWeek);
  };
  
  // 人数選択肢
  const partySizeOptions = useMemo(() => {
    const max = settings?.maxPartySize || 10;
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [settings?.maxPartySize]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedDate || !selectedTime || !customerName) {
      return;
    }
    
    createReservation.mutate({
      storeSlug: storeSlug || "",
      reservationDate: format(selectedDate, "yyyy-MM-dd"),
      reservationTime: selectedTime,
      customerName,
      customerPhone: customerPhone || undefined,
      customerEmail: customerEmail || undefined,
      partySize,
      note: note || undefined,
      locale,
    });
  };
  
  if (settingsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!settings?.enabled) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4">
        <div className="max-w-md mx-auto mt-8">
          <Card>
            <CardHeader>
              <CardTitle>{t("reservation.notAvailable")}</CardTitle>
              <CardDescription>
                {t("reservation.notAvailableDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setLocation(`/s/${storeSlug}`)} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t("common.back")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  
  // 予約完了画面
  if (reservationComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4">
        <div className="max-w-md mx-auto mt-8">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle>{t("reservation.complete")}</CardTitle>
              <CardDescription>
                {t("reservation.completeDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">{t("reservation.reservationNumber")}</p>
                <p className="text-2xl font-bold font-mono">{reservationNumber}</p>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("reservation.date")}</span>
                  <span>{selectedDate && format(selectedDate, "yyyy/MM/dd", { locale: dateLocales[locale] || ja })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("reservation.time")}</span>
                  <span>{selectedTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("reservation.partySize")}</span>
                  <span>{partySize}{t("reservation.people")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("reservation.name")}</span>
                  <span>{customerName}</span>
                </div>
              </div>
              
              <div className="pt-4 space-y-2">
                <Button 
                  onClick={() => setLocation(`/s/${storeSlug}/reservation/check?number=${reservationNumber}`)} 
                  className="w-full"
                >
                  {t("reservation.checkStatus")}
                </Button>
                <Button 
                  onClick={() => setLocation(`/s/${storeSlug}`)} 
                  variant="outline"
                  className="w-full"
                >
                  {t("common.back")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  
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
          <h1 className="text-2xl font-bold">{storeName}</h1>
          <p className="text-muted-foreground">{t("reservation.title")}</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 日付選択 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarIcon className="w-4 h-4" />
                {t("reservation.selectDate")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? (
                      format(selectedDate, "yyyy/MM/dd (E)", { locale: dateLocales[locale] || ja })
                    ) : (
                      <span className="text-muted-foreground">{t("reservation.selectDatePlaceholder")}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      setSelectedDate(date);
                      setSelectedTime(""); // 日付変更時に時間をリセット
                    }}
                    disabled={isDateDisabled}
                    locale={dateLocales[locale] || ja}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>
          
          {/* 時間選択 */}
          {selectedDate && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {t("reservation.selectTime")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {slotsLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slotsData?.slots.map((slot) => (
                      <Button
                        key={slot.time}
                        type="button"
                        variant={selectedTime === slot.time ? "default" : "outline"}
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.time)}
                        className="h-12"
                      >
                        <div className="text-center">
                          <div>{slot.time}</div>
                          {slot.available && (
                            <div className="text-xs opacity-70">
                              {t("reservation.remaining")}: {slot.remaining}
                            </div>
                          )}
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
                {slotsData?.slots.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    {t("reservation.noSlotsAvailable")}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* 人数選択 */}
          {selectedTime && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  {t("reservation.partySize")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={partySize.toString()} onValueChange={(v) => setPartySize(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {partySizeOptions.map((size) => (
                      <SelectItem key={size} value={size.toString()}>
                        {size}{t("reservation.people")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}
          
          {/* 連絡先入力 */}
          {selectedTime && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {t("reservation.contactInfo")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="flex items-center gap-1">
                    {t("reservation.name")}
                    <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder={t("reservation.namePlaceholder")}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {t("reservation.phone")}
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder={t("reservation.phonePlaceholder")}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {t("reservation.email")}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder={t("reservation.emailPlaceholder")}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="note" className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {t("reservation.note")}
                  </Label>
                  <Textarea
                    id="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("reservation.notePlaceholder")}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* 送信ボタン */}
          {selectedTime && customerName && (
            <Button 
              type="submit" 
              className="w-full h-12 text-lg"
              disabled={createReservation.isPending}
            >
              {createReservation.isPending ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                t("reservation.submit")
              )}
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
