import { useAuth } from "@/_core/hooks/useAuth";
import { AdminLayout } from "@/components/internal-admin/AdminLayout";
import { IncludeTestToggle } from "@/components/internal-admin/IncludeTestToggle";
import { KpiCard } from "@/components/internal-admin/KpiCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  BarChart3,
  Building2,
  CreditCard,
  MessageSquare,
  Shield,
  Ticket,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const pieColors = ["#2563eb", "#0f766e", "#b45309"];

const formatCompactDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const formatNumber = (value: number) => new Intl.NumberFormat("ja-JP").format(value);

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);

const activityLabelMap = {
  user_created: "ユーザー登録",
  store_created: "店舗作成",
  ticket_created: "チケット",
  sms_sent: "SMS送信",
  sms_charge: "SMSチャージ",
} as const;

export default function InternalAdminOverview() {
  const { user } = useAuth();
  const [includeTest, setIncludeTest] = useState(false);

  const kpiQuery = trpc.admin.overview.kpi.useQuery(
    { includeTest },
    {
      enabled: Boolean(user?.isInternalAdmin),
    }
  );
  const ticketChartQuery = trpc.admin.overview.ticketChart.useQuery(
    { includeTest, days: 30 },
    {
      enabled: Boolean(user?.isInternalAdmin),
    }
  );
  const planDistributionQuery = trpc.admin.overview.planDistribution.useQuery(
    { includeTest },
    {
      enabled: Boolean(user?.isInternalAdmin),
    }
  );
  const recentActivityQuery = trpc.admin.overview.recentActivity.useQuery(
    { includeTest, limit: 20 },
    {
      enabled: Boolean(user?.isInternalAdmin),
    }
  );
  const statusQuery = trpc.admin.status.useQuery(undefined, {
    enabled: Boolean(user?.isInternalAdmin),
  });

  const isLoading =
    kpiQuery.isLoading ||
    ticketChartQuery.isLoading ||
    planDistributionQuery.isLoading ||
    recentActivityQuery.isLoading;

  const planChartData = useMemo(() => {
    return (planDistributionQuery.data ?? []).map(item => ({
      ...item,
      name:
        item.planId === "free"
          ? "Free"
          : item.planId === "standard"
            ? "Standard"
            : "Pro",
    }));
  }, [planDistributionQuery.data]);

  return (
    <AdminLayout
      title="概要"
      description="サービス全体の利用状況を、テストデータの含有を切り替えながら確認できます。"
    >
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm text-muted-foreground">
            Auth Subject: {statusQuery.data?.authSubject ?? "-"}
          </div>
        </div>
        <IncludeTestToggle checked={includeTest} onCheckedChange={setIncludeTest} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          title="総ユーザー数"
          value={formatNumber(kpiQuery.data?.totalUsers ?? 0)}
          description="テストユーザーを既定で除外"
          icon={Users}
          loading={kpiQuery.isLoading}
        />
        <KpiCard
          title="アクティブ店舗数"
          value={formatNumber(kpiQuery.data?.activeStores30d ?? 0)}
          description="過去30日に発券がある店舗"
          icon={Building2}
          loading={kpiQuery.isLoading}
        />
        <KpiCard
          title="本日の発券数"
          value={formatNumber(kpiQuery.data?.ticketsToday ?? 0)}
          description="本日作成されたチケット"
          icon={Ticket}
          loading={kpiQuery.isLoading}
        />
        <KpiCard
          title="SMS送信数"
          value={formatNumber(kpiQuery.data?.smsSent30d ?? 0)}
          description="過去30日の SMS ログ件数"
          icon={MessageSquare}
          loading={kpiQuery.isLoading}
        />
        <KpiCard
          title="MRR"
          value={formatCurrency(kpiQuery.data?.mrrInclTax ?? 0)}
          secondaryValue={`税抜 ${formatCurrency(kpiQuery.data?.mrrExclTax ?? 0)}`}
          description="有効契約中の店舗のみ"
          icon={CreditCard}
          loading={kpiQuery.isLoading}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <Card>
          <CardHeader>
            <CardTitle>過去30日の日別発券数</CardTitle>
            <CardDescription>チケット作成数の推移</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            {ticketChartQuery.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : ticketChartQuery.data && ticketChartQuery.data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ticketChartQuery.data}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tickFormatter={formatCompactDate} className="text-xs" />
                  <YAxis className="text-xs" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                    }}
                    labelFormatter={value => `日付: ${value}`}
                    formatter={(value: number) => [`${formatNumber(value)} 件`, "発券数"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Empty className="h-full rounded-2xl border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BarChart3 className="h-5 w-5" />
                  </EmptyMedia>
                  <EmptyTitle>表示できる発券データがありません</EmptyTitle>
                  <EmptyDescription>
                    条件に一致するチケットがまだ作成されていません。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>プラン分布</CardTitle>
            <CardDescription>店舗数ベースの契約プラン内訳</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {planDistributionQuery.isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : planChartData.some(item => item.count > 0) ? (
              <div className="space-y-4">
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={planChartData}
                        dataKey="count"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                      >
                        {planChartData.map((entry, index) => (
                          <Cell key={entry.planId} fill={pieColors[index % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `${formatNumber(value)} 店舗`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid gap-2">
                  {planChartData.map((item, index) => (
                    <div key={item.planId} className="flex items-center justify-between rounded-xl border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: pieColors[index % pieColors.length] }}
                        />
                        <span className="text-sm font-medium">{item.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatNumber(item.count)} 店舗
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Empty className="rounded-2xl border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Shield className="h-5 w-5" />
                  </EmptyMedia>
                  <EmptyTitle>プラン分布データがありません</EmptyTitle>
                  <EmptyDescription>
                    条件に一致する店舗がまだ存在しません。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>直近アクティビティ</CardTitle>
          <CardDescription>ユーザー、店舗、チケット、SMS の最新イベント</CardDescription>
        </CardHeader>
        <CardContent>
          {recentActivityQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : recentActivityQuery.data && recentActivityQuery.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>種別</TableHead>
                  <TableHead>内容</TableHead>
                  <TableHead>店舗</TableHead>
                  <TableHead className="text-right">日時</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivityQuery.data.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {activityLabelMap[item.type] ?? item.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{item.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {item.description}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.storeName ?? "-"}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {new Date(item.occurredAt).toLocaleString("ja-JP")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="rounded-2xl border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Activity className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>直近アクティビティはまだありません</EmptyTitle>
                <EmptyDescription>
                  ユーザー登録や店舗作成、チケット発券、SMS 操作が発生するとここに並びます。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      {statusQuery.error || kpiQuery.error || ticketChartQuery.error || planDistributionQuery.error || recentActivityQuery.error ? (
        <Card className="mt-4 border-destructive/40">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-destructive">
            <Activity className="h-4 w-4" />
            <span>
              {statusQuery.error?.message ||
                kpiQuery.error?.message ||
                ticketChartQuery.error?.message ||
                planDistributionQuery.error?.message ||
                recentActivityQuery.error?.message}
            </span>
          </CardContent>
        </Card>
      ) : null}
    </AdminLayout>
  );
}
