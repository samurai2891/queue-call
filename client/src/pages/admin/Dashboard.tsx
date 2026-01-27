import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/contexts/LocaleContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Clock, TrendingUp, Calendar, BarChart3, ArrowLeft } from "lucide-react";
import { useState } from "react";
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

export default function Dashboard() {
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const [days, setDays] = useState(30);

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
    { storeId: storeId!, days },
    { enabled: !!storeId }
  );

  const { data: dailyWaitTime, isLoading: dailyWaitTimeLoading } = trpc.store.getDailyWaitTimeStats.useQuery(
    { storeId: storeId!, days },
    { enabled: !!storeId }
  );

  const { data: hourlyStats, isLoading: hourlyStatsLoading } = trpc.store.getHourlyStats.useQuery(
    { storeId: storeId!, days },
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

  const hourlyChartData = hourlyStats?.map((d) => ({
    hour: formatHour(d.hour),
    count: d.count,
    avgWait: Math.round(d.avgWaitMinutes || 0),
  })) || [];

  // Find peak hour
  const peakHour = hourlyStats?.reduce((max, curr) => 
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
            {/* Period selector */}
            <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t("dashboard.last7Days")}</SelectItem>
                <SelectItem value="14">{t("dashboard.last14Days")}</SelectItem>
                <SelectItem value="30">{t("dashboard.last30Days")}</SelectItem>
                <SelectItem value="90">{t("dashboard.last90Days")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
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
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t("dashboard.dailyVisitors")}
            </CardTitle>
            <CardDescription>{t("dashboard.dailyVisitorsDescription")}</CardDescription>
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
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="done" name={t("dashboard.completed")} fill="hsl(var(--primary))" stackId="a" />
                  <Bar dataKey="skipped" name={t("dashboard.skipped")} fill="hsl(var(--destructive))" stackId="a" />
                  <Bar dataKey="canceled" name={t("dashboard.canceled")} fill="hsl(var(--muted-foreground))" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Wait Time Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t("dashboard.waitTime")}
            </CardTitle>
            <CardDescription>{t("dashboard.waitTimeDescription")}</CardDescription>
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
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`${value}${t("dashboard.minutes")}`, '']}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="avg" 
                    name={t("dashboard.avgWait")} 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="max" 
                    name={t("dashboard.maxWait")} 
                    stroke="hsl(var(--destructive))" 
                    strokeDasharray="5 5"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="min" 
                    name={t("dashboard.minWait")} 
                    stroke="hsl(var(--muted-foreground))" 
                    strokeDasharray="5 5"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Peak Hours Chart */}
        <Card>
          <CardHeader>
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
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="count" name={t("dashboard.visitorCount")} fill="hsl(var(--primary))" />
                  <Line 
                    yAxisId="right" 
                    type="monotone" 
                    dataKey="avgWait" 
                    name={t("dashboard.avgWait")} 
                    stroke="hsl(var(--destructive))" 
                    strokeWidth={2}
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
