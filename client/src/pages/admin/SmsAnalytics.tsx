import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  BarChart3,
  MessageSquare,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Wallet,
  Calendar,
  Activity,
} from 'lucide-react';

import { getLoginUrl } from '@/const';

type Period = 'daily' | 'weekly' | 'monthly';

function SmsAnalyticsContent() {
  const [, navigate] = useLocation();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { t, locale } = useLocale();

  const [period, setPeriod] = useState<Period>('daily');

  const daysForPeriod = useMemo(() => {
    switch (period) {
      case 'daily': return 30;
      case 'weekly': return 90;
      case 'monthly': return 365;
    }
  }, [period]);

  // Get user's store
  const { data: store, isLoading: storesLoading } = trpc.store.getByOwner.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Get SMS analytics data
  const { data: analyticsData, isLoading: analyticsLoading } = trpc.stripe.getSmsAnalytics.useQuery(
    {
      storeId: store?.id!,
      period,
      days: daysForPeriod,
    },
    { enabled: !!store?.id }
  );

  // Get SMS balance
  const { data: balanceData } = trpc.stripe.getSmsBalance.useQuery(
    { storeId: store?.id! },
    { enabled: !!store?.id }
  );

  // Auth check
  if (authLoading || storesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">{t('settings.smsAnalyticsNoData')}</p>
            <Button className="mt-4" onClick={() => navigate('/admin/settings?tab=notifications')}>
              {t('common.back')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = analyticsData?.summary;
  const dataPoints = analyticsData?.dataPoints ?? [];

  // Format chart data labels based on period
  const chartData = dataPoints.map((dp) => {
    let label: string;
    if (period === 'daily') {
      const d = new Date(dp.date);
      label = `${d.getMonth() + 1}/${d.getDate()}`;
    } else if (period === 'weekly') {
      const d = new Date(dp.date);
      label = `${d.getMonth() + 1}/${d.getDate()}~`;
    } else {
      const parts = dp.date.split('-');
      label = `${parseInt(parts[1])}${t('settings.smsAnalyticsMonth')}`;
    }
    return {
      ...dp,
      label,
    };
  });

  const periodButtons: { value: Period; labelKey: string }[] = [
    { value: 'daily', labelKey: 'settings.smsAnalyticsPeriodDaily' },
    { value: 'weekly', labelKey: 'settings.smsAnalyticsPeriodWeekly' },
    { value: 'monthly', labelKey: 'settings.smsAnalyticsPeriodMonthly' },
  ];

  const customTooltipStyle = {
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '8px 12px',
    color: 'var(--popover-foreground)',
    fontSize: '12px',
  };

  const formatYen = (value: number) => `¥${value.toLocaleString()}`;
  const formatCount = (value: number) => `${value}${locale === 'ja' ? '通' : ''}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/settings?tab=notifications')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t('settings.smsAnalyticsTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">{store.name}</p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">¥{(balanceData?.balance ?? 0).toLocaleString()}</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Period selector */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center rounded-lg border bg-muted/30 p-1 gap-1">
            {periodButtons.map((btn) => (
              <button
                key={btn.value}
                onClick={() => setPeriod(btn.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  period === btn.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                }`}
              >
                {t(btn.labelKey as any)}
              </button>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        {analyticsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <MessageSquare className="h-4 w-4" />
                  {t('settings.smsAnalyticsTotalSend')}
                </div>
                <p className="text-2xl font-bold tabular-nums">
                  {(summary?.totalSendCount ?? 0).toLocaleString()}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    {t('settings.smsAnalyticsMessages')}
                  </span>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <TrendingDown className="h-4 w-4" />
                  {t('settings.smsAnalyticsTotalCost')}
                </div>
                <p className="text-2xl font-bold tabular-nums">
                  ¥{(summary?.totalSendCost ?? 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <CreditCard className="h-4 w-4" />
                  {t('settings.smsAnalyticsTotalCharge')}
                </div>
                <p className="text-2xl font-bold tabular-nums text-green-600">
                  ¥{(summary?.totalChargeAmount ?? 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Activity className="h-4 w-4" />
                  {t('settings.smsAnalyticsAvgDaily')}
                </div>
                <p className="text-2xl font-bold tabular-nums">
                  {summary?.avgDailySendCount ?? 0}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    {t('settings.smsAnalyticsMessagesPerDay')}
                  </span>
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Send count chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              {t('settings.smsAnalyticsSendChart')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                {t('settings.smsAnalyticsNoData')}
              </div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="sendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      interval={period === 'daily' ? Math.floor(chartData.length / 8) : 0}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={customTooltipStyle}
                      formatter={(value: number) => [formatCount(value), t('settings.smsAnalyticsSendCount')]}
                      labelFormatter={(label) => label}
                    />
                    <Area
                      type="monotone"
                      dataKey="sendCount"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#sendGradient)"
                      name={t('settings.smsAnalyticsSendCount') as string}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cost chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              {t('settings.smsAnalyticsCostChart')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                {t('settings.smsAnalyticsNoData')}
              </div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      interval={period === 'daily' ? Math.floor(chartData.length / 8) : 0}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `¥${v}`}
                    />
                    <Tooltip
                      contentStyle={customTooltipStyle}
                      formatter={(value: number, name: string) => {
                        const label = name === 'sendCost'
                          ? t('settings.smsAnalyticsSendCost')
                          : t('settings.smsAnalyticsChargeAmount');
                        return [formatYen(value), label];
                      }}
                      labelFormatter={(label) => label}
                    />
                    <Legend
                      formatter={(value) => {
                        if (value === 'sendCost') return t('settings.smsAnalyticsSendCost');
                        if (value === 'chargeAmount') return t('settings.smsAnalyticsChargeAmount');
                        return value;
                      }}
                    />
                    <Bar
                      dataKey="sendCost"
                      fill="var(--destructive)"
                      radius={[4, 4, 0, 0]}
                      name="sendCost"
                      opacity={0.8}
                    />
                    <Bar
                      dataKey="chargeAmount"
                      fill="var(--success)"
                      radius={[4, 4, 0, 0]}
                      name="chargeAmount"
                      opacity={0.8}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charge vs Consume trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {t('settings.smsAnalyticsTrendChart')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                {t('settings.smsAnalyticsNoData')}
              </div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      interval={period === 'daily' ? Math.floor(chartData.length / 8) : 0}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={customTooltipStyle}
                      formatter={(value: number, name: string) => {
                        const label = name === 'sendCount'
                          ? t('settings.smsAnalyticsSendCount')
                          : t('settings.smsAnalyticsChargeCount');
                        return [value, label];
                      }}
                      labelFormatter={(label) => label}
                    />
                    <Legend
                      formatter={(value) => {
                        if (value === 'sendCount') return t('settings.smsAnalyticsSendCount');
                        if (value === 'chargeCount') return t('settings.smsAnalyticsChargeCount');
                        return value;
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="sendCount"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={period !== 'daily'}
                      name="sendCount"
                    />
                    <Line
                      type="monotone"
                      dataKey="chargeCount"
                      stroke="var(--success)"
                      strokeWidth={2}
                      dot={period !== 'daily'}
                      name="chargeCount"
                      strokeDasharray="5 5"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation links */}
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => navigate('/admin/sms-transactions')}>
            {t('settings.smsViewAllTransactions')}
          </Button>
          <Button variant="outline" onClick={() => navigate('/admin/sms-history')}>
            {t('settings.smsTransactionHistory')}
          </Button>
        </div>
      </main>
    </div>
  );
}

export default function SmsAnalytics() {
  return (
    <LocaleProvider defaultLocale="ja" supportedLocales={SUPPORTED_LOCALES}>
      <SmsAnalyticsContent />
    </LocaleProvider>
  );
}
