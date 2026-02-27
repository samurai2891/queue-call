import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/contexts/LocaleContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Clock, TrendingUp, Calendar, BarChart3, ArrowLeft, Flame, Download, FileText } from "lucide-react";
import { exportToCSV, generateFilename } from "@/lib/csvExport";
import { exportToPDF, generatePDFFilename } from "@/lib/pdfExport";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// Crowd level colors
const crowdLevelColors: Record<string, string> = {
  empty: 'bg-green-100 text-green-800',
  low: 'bg-green-200 text-green-900',
  moderate: 'bg-yellow-200 text-yellow-900',
  busy: 'bg-orange-300 text-orange-900',
  crowded: 'bg-red-400 text-red-900',
};

// Day of week labels
const dayOfWeekLabels = ['dashboard.sunday', 'dashboard.monday', 'dashboard.tuesday', 'dashboard.wednesday', 'dashboard.thursday', 'dashboard.friday', 'dashboard.saturday'] as const;

// Crowd Heatmap Component
function CrowdHeatmapChart({ data, t }: { 
  data: Array<{ dayOfWeek: number; hour: number; count: number; crowdLevel: string }>;
  t: (key: any) => string;
}) {
  // Group data by dayOfWeek and hour
  const heatmapData = new Map<string, { count: number; crowdLevel: string }>();
  data.forEach(item => {
    const key = `${item.dayOfWeek}-${item.hour}`;
    heatmapData.set(key, { count: item.count, crowdLevel: item.crowdLevel });
  });

  // Generate hours (6:00 - 23:00)
  const hours = Array.from({ length: 18 }, (_, i) => i + 6);
  const days = [0, 1, 2, 3, 4, 5, 6]; // Sunday to Saturday

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Header row with hours */}
        <div className="flex">
          <div className="w-16 shrink-0" /> {/* Empty corner */}
          {hours.map(hour => (
            <div key={hour} className="flex-1 text-center text-xs text-muted-foreground py-1">
              {hour}:00
            </div>
          ))}
        </div>
        
        {/* Data rows */}
        {days.map(dayOfWeek => (
          <div key={dayOfWeek} className="flex items-center">
            <div className="w-16 shrink-0 text-xs text-muted-foreground pr-2 text-right">
              {t(dayOfWeekLabels[dayOfWeek] as any)}
            </div>
            {hours.map(hour => {
              const cellData = heatmapData.get(`${dayOfWeek}-${hour}`);
              const crowdLevel = cellData?.crowdLevel || 'empty';
              const count = cellData?.count || 0;
              
              return (
                <div
                  key={hour}
                  className={`flex-1 h-8 m-0.5 rounded flex items-center justify-center text-xs font-medium ${crowdLevelColors[crowdLevel]}`}
                  title={`${t(dayOfWeekLabels[dayOfWeek] as any)} ${hour}:00 - ${count}${t('dashboard.visitors')}`}
                >
                  {count > 0 ? count : ''}
                </div>
              );
            })}
          </div>
        ))}
        
        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 text-xs">
          <div className="flex items-center gap-1">
            <div className={`w-4 h-4 rounded ${crowdLevelColors.empty}`} />
            <span>{t('dashboard.crowdEmpty')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-4 h-4 rounded ${crowdLevelColors.low}`} />
            <span>{t('dashboard.crowdLow')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-4 h-4 rounded ${crowdLevelColors.moderate}`} />
            <span>{t('dashboard.crowdModerate')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-4 h-4 rounded ${crowdLevelColors.busy}`} />
            <span>{t('dashboard.crowdBusy')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-4 h-4 rounded ${crowdLevelColors.crowded}`} />
            <span>{t('dashboard.crowdCrowded')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const [globalDays, setGlobalDays] = useState(30);
  const [visitorDays, setVisitorDays] = useState(30);
  const [waitTimeDays, setWaitTimeDays] = useState(30);
  const [hourlyDays, setHourlyDays] = useState(30);
  const [heatmapDays, setHeatmapDays] = useState(30);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const dashboardContentRef = useRef<HTMLDivElement>(null);

  // Handler to sync all periods
  const handleGlobalDaysChange = (days: number) => {
    setGlobalDays(days);
    setVisitorDays(days);
    setWaitTimeDays(days);
    setHourlyDays(days);
    setHeatmapDays(days);
  };

  // Handler for PDF export
  const handleExportPDF = async () => {
    if (!dashboardContentRef.current) return;
    
    setIsExportingPDF(true);
    toast.info(t('dashboard.exportingPDF'));
    
    try {
      const currentStore = stores?.find(s => s.id === storeId);
      const periodLabel = globalDays === 7 ? t('dashboard.heatmapDays7') : 
                          globalDays === 90 ? t('dashboard.heatmapDays90') : 
                          t('dashboard.heatmapDays30');
      
      await exportToPDF(dashboardContentRef.current, {
        filename: generatePDFFilename('dashboard', currentStore?.name),
        title: t('dashboard.title'),
        storeName: currentStore?.name,
        period: periodLabel,
      });
      
      toast.success(t('dashboard.exportPDFSuccess'));
    } catch (error) {
      console.error('PDF export failed:', error);
      toast.error(t('dashboard.exportPDFError'));
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Get user's stores
  const { data: stores, isLoading: storesLoading } = trpc.store.getMyStores.useQuery();
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);

  // Get store ID (use first store if not selected)
  const storeId = selectedStoreId || stores?.[0]?.id;

  // Statistics queries
  const { data: summary, isLoading: summaryLoading } = trpc.store.getStatsSummary.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );

  const { data: dailyVisitors, isLoading: dailyVisitorsLoading } = trpc.store.getDailyVisitorStats.useQuery(
    { storeId: storeId!, days: visitorDays },
    { enabled: !!storeId }
  );

  const { data: dailyWaitTime, isLoading: dailyWaitTimeLoading } = trpc.store.getDailyWaitTimeStats.useQuery(
    { storeId: storeId!, days: waitTimeDays },
    { enabled: !!storeId }
  );

  const { data: hourlyStats, isLoading: hourlyStatsLoading } = trpc.store.getHourlyStats.useQuery(
    { storeId: storeId!, days: hourlyDays },
    { enabled: !!storeId }
  );

  // Crowd heatmap query
  const { data: crowdHeatmap, isLoading: crowdHeatmapLoading } = trpc.store.getCrowdHeatmap.useQuery(
    { storeId: storeId!, days: heatmapDays },
    { enabled: !!storeId }
  );

  // Loading state
  if (loading || storesLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>{t("settings.loginRequiredTitle")}</CardTitle>
            <CardDescription>{t("settings.loginRequiredDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <a href={getLoginUrl()}>{t("common.login")}</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No stores
  if (!stores || stores.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>{t("dashboard.noStores")}</CardTitle>
            <CardDescription>{t("dashboard.createStoreFirst")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/">{t("common.back")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Format date for chart
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // Format hour for chart
  const formatHour = (hour: number) => `${hour}:00`;

  // Prepare chart data
  const visitorChartData = dailyVisitors?.map((d) => ({
    date: formatDate(d.date!),
    total: d.total,
    done: d.done,
    skipped: d.skipped,
    canceled: d.canceled,
  })) || [];

  const waitTimeChartData = dailyWaitTime?.map((d) => ({
    date: formatDate(d.date!),
    avg: Math.round(d.avgWaitMinutes || 0),
    min: Math.round(d.minWaitMinutes || 0),
    max: Math.round(d.maxWaitMinutes || 0),
  })) || [];

  const hourlyChartData = hourlyStats?.map((d: { hour: number; count: number; avgWaitMinutes: number | null }) => ({
    hour: formatHour(d.hour),
    count: d.count,
    avgWait: Math.round(d.avgWaitMinutes || 0),
  })) || [];

  // Find peak hour
  const peakHour = hourlyStats?.reduce((max: { hour: number; count: number; avgWaitMinutes: number | null } | undefined, curr: { hour: number; count: number; avgWaitMinutes: number | null }) => 
    (curr.count > (max?.count || 0)) ? curr : max
  , hourlyStats[0]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold">{t("dashboard.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("dashboard.description")}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* PDF Export button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              disabled={isExportingPDF}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              {t('dashboard.exportPDF')}
            </Button>
            {/* Global period selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('dashboard.globalPeriod')}:</span>
              <Select
                value={globalDays.toString()}
                onValueChange={(v) => handleGlobalDaysChange(parseInt(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">{t('dashboard.heatmapDays7')}</SelectItem>
                  <SelectItem value="30">{t('dashboard.heatmapDays30')}</SelectItem>
                  <SelectItem value="90">{t('dashboard.heatmapDays90')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Store selector */}
            {stores.length > 1 && (
              <Select
                value={storeId?.toString()}
                onValueChange={(v) => setSelectedStoreId(parseInt(v))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id.toString()}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </header>

      <main ref={dashboardContentRef} className="max-w-7xl mx-auto px-4 py-6 space-y-6 bg-background">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Today */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.today")}</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{summary?.today.total || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("dashboard.completed")}: {summary?.today.done || 0} / {t("dashboard.avgWait")}: {summary?.today.avgWaitMinutes || 0}{t("dashboard.minutes")}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* This Week */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.thisWeek")}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{summary?.thisWeek.total || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("dashboard.completed")}: {summary?.thisWeek.done || 0} / {t("dashboard.avgWait")}: {summary?.thisWeek.avgWaitMinutes || 0}{t("dashboard.minutes")}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* This Month */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.thisMonth")}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{summary?.thisMonth.total || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("dashboard.completed")}: {summary?.thisMonth.done || 0} / {t("dashboard.avgWait")}: {summary?.thisMonth.avgWaitMinutes || 0}{t("dashboard.minutes")}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Daily Visitors Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  {t("dashboard.dailyVisitors")}
                </CardTitle>
                <CardDescription>{t("dashboard.dailyVisitorsDescription")}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={visitorDays.toString()} onValueChange={(v) => setVisitorDays(parseInt(v))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">{t("dashboard.heatmapDays7")}</SelectItem>
                    <SelectItem value="30">{t("dashboard.heatmapDays30")}</SelectItem>
                    <SelectItem value="90">{t("dashboard.heatmapDays90")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (dailyVisitors && dailyVisitors.length > 0) {
                      const currentStore = stores?.find(s => s.id === storeId);
                      exportToCSV(
                        dailyVisitors.map(d => ({
                          date: d.date,
                          total: d.total,
                          done: d.done,
                          skipped: d.skipped,
                          canceled: d.canceled,
                        })),
                        generateFilename('daily_visitors', currentStore?.name),
                        {
                          date: t('dashboard.date'),
                          total: t('dashboard.total'),
                          done: t('dashboard.completed'),
                          skipped: t('dashboard.skipped'),
                          canceled: t('dashboard.canceled'),
                        }
                      );
                    }
                  }}
                  disabled={!dailyVisitors || dailyVisitors.length === 0}
                  title={t('dashboard.exportCSV')}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {dailyVisitorsLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : visitorChartData.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                {t("dashboard.noData")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={visitorChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(0, 0, 0, 0.85)', 
                      border: 'none',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                      padding: '12px 16px',
                    }}
                    itemStyle={{
                      color: '#fff',
                      fontSize: '14px',
                      padding: '4px 0',
                    }}
                    labelStyle={{
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      marginBottom: '8px',
                    }}
                    cursor={{ fill: 'rgba(0, 0, 0, 0.1)' }}
                  />
                  <Legend />
                  <Bar dataKey="done" name={t("dashboard.completed")} fill="oklch(0.59 0.2 255)" stackId="a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="skipped" name={t("dashboard.skipped")} fill="oklch(0.7 0.18 55)" stackId="a" />
                  <Bar dataKey="canceled" name={t("dashboard.canceled")} fill="oklch(0.65 0.03 255)" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Wait Time Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {t("dashboard.waitTime")}
                </CardTitle>
                <CardDescription>{t("dashboard.waitTimeDescription")}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={waitTimeDays.toString()} onValueChange={(v) => setWaitTimeDays(parseInt(v))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">{t("dashboard.heatmapDays7")}</SelectItem>
                    <SelectItem value="30">{t("dashboard.heatmapDays30")}</SelectItem>
                    <SelectItem value="90">{t("dashboard.heatmapDays90")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (dailyWaitTime && dailyWaitTime.length > 0) {
                      const currentStore = stores?.find(s => s.id === storeId);
                      exportToCSV(
                        dailyWaitTime.map(d => ({
                          date: d.date,
                          avgWaitMinutes: d.avgWaitMinutes,
                          maxWaitMinutes: d.maxWaitMinutes,
                          minWaitMinutes: d.minWaitMinutes,
                        })),
                        generateFilename('wait_time', currentStore?.name),
                        {
                          date: t('dashboard.date'),
                          avgWaitMinutes: t('dashboard.avgWaitTime'),
                          maxWaitMinutes: t('dashboard.maxWaitTime'),
                          minWaitMinutes: t('dashboard.minWaitTime'),
                        }
                      );
                    }
                  }}
                  disabled={!dailyWaitTime || dailyWaitTime.length === 0}
                  title={t('dashboard.exportCSV')}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {dailyWaitTimeLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : waitTimeChartData.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                {t("dashboard.noData")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={waitTimeChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" unit={t("dashboard.minutes")} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(0, 0, 0, 0.85)', 
                      border: 'none',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                      padding: '12px 16px',
                    }}
                    itemStyle={{
                      color: '#fff',
                      fontSize: '14px',
                      padding: '4px 0',
                    }}
                    labelStyle={{
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      marginBottom: '8px',
                    }}
                    formatter={(value: number) => [`${value}${t("dashboard.minutes")}`, '']}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="avg" 
                    name={t("dashboard.avgWait")} 
                    stroke="oklch(0.6 0.18 160)" 
                    strokeWidth={3}
                    dot={{ fill: 'oklch(0.6 0.18 160)', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: 'oklch(0.6 0.18 160)' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="max" 
                    name={t("dashboard.maxWait")} 
                    stroke="oklch(0.6 0.22 25)" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: 'oklch(0.6 0.22 25)', r: 3 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="min" 
                    name={t("dashboard.minWait")} 
                    stroke="oklch(0.55 0.25 290)" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: 'oklch(0.55 0.25 290)', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Crowd Heatmap */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Flame className="h-5 w-5" />
                  {t("dashboard.crowdHeatmap")}
                </CardTitle>
                <CardDescription>{t("dashboard.crowdHeatmapDescription")}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={heatmapDays.toString()} onValueChange={(v) => setHeatmapDays(Number(v))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">{t("dashboard.heatmapDays7")}</SelectItem>
                    <SelectItem value="30">{t("dashboard.heatmapDays30")}</SelectItem>
                    <SelectItem value="90">{t("dashboard.heatmapDays90")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (crowdHeatmap && crowdHeatmap.length > 0) {
                      const currentStore = stores?.find(s => s.id === storeId);
                      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
                      exportToCSV(
                        crowdHeatmap.map((d: { dayOfWeek: number; hour: number; count: number; crowdLevel: string }) => ({
                          dayOfWeek: t(`dashboard.${dayNames[d.dayOfWeek]}`),
                          hour: `${d.hour}:00`,
                          count: d.count,
                          crowdLevel: d.crowdLevel,
                        })),
                        generateFilename('crowd_heatmap', currentStore?.name),
                        {
                          dayOfWeek: t('dashboard.dayOfWeek'),
                          hour: t('dashboard.hour'),
                          count: t('dashboard.count'),
                          crowdLevel: t('store.crowdLevel'),
                        }
                      );
                    }
                  }}
                  disabled={!crowdHeatmap || crowdHeatmap.length === 0}
                  title={t('dashboard.exportCSV')}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {crowdHeatmapLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !crowdHeatmap || crowdHeatmap.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                {t("dashboard.noData")}
              </div>
            ) : (
              <CrowdHeatmapChart data={crowdHeatmap} t={t} />
            )}
          </CardContent>
        </Card>

        {/* Peak Hours Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  {t("dashboard.peakHours")}
                </CardTitle>
                <CardDescription>
                  {t("dashboard.peakHoursDescription")}
                  {peakHour && (
                    <span className="ml-2 font-medium text-primary">
                      {t("dashboard.peakTime")}: {formatHour(peakHour.hour)} ({peakHour.count}{t("dashboard.visitors")})
                    </span>
                  )}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={hourlyDays.toString()} onValueChange={(v) => setHourlyDays(parseInt(v))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">{t("dashboard.heatmapDays7")}</SelectItem>
                    <SelectItem value="30">{t("dashboard.heatmapDays30")}</SelectItem>
                    <SelectItem value="90">{t("dashboard.heatmapDays90")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (hourlyStats && hourlyStats.length > 0) {
                      const currentStore = stores?.find(s => s.id === storeId);
                      exportToCSV(
                        hourlyStats.map((d: { hour: number; count: number; avgWaitMinutes: number }) => ({
                          hour: `${d.hour}:00`,
                          count: d.count,
                          avgWaitMinutes: d.avgWaitMinutes,
                        })),
                        generateFilename('hourly_stats', currentStore?.name),
                        {
                          hour: t('dashboard.hour'),
                          count: t('dashboard.count'),
                          avgWaitMinutes: t('dashboard.avgWaitTime'),
                        }
                      );
                    }
                  }}
                  disabled={!hourlyStats || hourlyStats.length === 0}
                  title={t('dashboard.exportCSV')}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {hourlyStatsLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : hourlyChartData.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                {t("dashboard.noData")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={hourlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="hour" className="text-xs" />
                  <YAxis yAxisId="left" className="text-xs" />
                  <YAxis yAxisId="right" orientation="right" className="text-xs" unit={t("dashboard.minutes")} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(0, 0, 0, 0.85)', 
                      border: 'none',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                      padding: '12px 16px',
                    }}
                    itemStyle={{
                      color: '#fff',
                      fontSize: '14px',
                      padding: '4px 0',
                    }}
                    labelStyle={{
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      marginBottom: '8px',
                    }}
                    cursor={{ fill: 'rgba(0, 0, 0, 0.1)' }}
                  />
                  <Legend />
                  <Bar 
                    yAxisId="left" 
                    dataKey="count" 
                    name={t("dashboard.visitorCount")} 
                    fill="oklch(0.55 0.22 270)" 
                    radius={[4, 4, 0, 0]}
                  />
                  <Line 
                    yAxisId="right" 
                    type="monotone" 
                    dataKey="avgWait" 
                    name={t("dashboard.avgWait")} 
                    stroke="oklch(0.75 0.18 80)" 
                    strokeWidth={3}
                    dot={{ fill: 'oklch(0.75 0.18 80)', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: 'oklch(0.75 0.18 80)' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
