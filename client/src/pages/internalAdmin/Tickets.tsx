import { useAuth } from "@/_core/hooks/useAuth";
import { AdminLayout } from "@/components/internal-admin/AdminLayout";
import { IncludeTestToggle } from "@/components/internal-admin/IncludeTestToggle";
import { KpiCard } from "@/components/internal-admin/KpiCard";
import { QueryErrorAlert } from "@/components/internal-admin/QueryErrorAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { Activity, Clock3, Store, Ticket, UserCheck, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

const ticketDayOptions = [7, 30, 90] as const;
const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

const formatNumber = (value: number) => new Intl.NumberFormat("ja-JP").format(value);
const formatRate = (value: number) =>
  `${new Intl.NumberFormat("ja-JP", { style: "percent", maximumFractionDigits: 1 }).format(value)}`;

const getHeatColor = (value: number, maxValue: number) => {
  if (value <= 0 || maxValue <= 0) {
    return "hsl(var(--muted))";
  }

  const ratio = value / maxValue;
  if (ratio >= 0.75) return "#1d4ed8";
  if (ratio >= 0.5) return "#2563eb";
  if (ratio >= 0.25) return "#93c5fd";
  return "#dbeafe";
};

export default function InternalAdminTickets() {
  const { user } = useAuth();
  const [days, setDays] = useState<(typeof ticketDayOptions)[number]>(30);
  const [includeTest, setIncludeTest] = useState(false);

  const summaryQuery = trpc.admin.tickets.summary.useQuery(
    { days, includeTest },
    { enabled: Boolean(user?.isInternalAdmin) }
  );
  const byStoreQuery = trpc.admin.tickets.byStore.useQuery(
    { days, includeTest, limit: 20 },
    { enabled: Boolean(user?.isInternalAdmin) }
  );
  const peakHoursQuery = trpc.admin.tickets.peakHours.useQuery(
    { days, includeTest },
    { enabled: Boolean(user?.isInternalAdmin) }
  );
  const checkinRateQuery = trpc.admin.tickets.checkinRate.useQuery(
    { days, includeTest },
    { enabled: Boolean(user?.isInternalAdmin) }
  );

  const heatmapData = useMemo(() => {
    return peakHoursQuery.data ?? [];
  }, [peakHoursQuery.data]);

  const maxAvgCount = useMemo(
    () => heatmapData.reduce((max, row) => Math.max(max, row.avgCount), 0),
    [heatmapData]
  );
  const primaryError =
    summaryQuery.error ??
    byStoreQuery.error ??
    peakHoursQuery.error ??
    checkinRateQuery.error;

  return (
    <AdminLayout
      title="チケット統計"
      description="全店舗の受付・呼び出し・到着状況を期間別に確認できます。"
    >
      {primaryError ? <QueryErrorAlert message={primaryError.message} /> : null}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {ticketDayOptions.map(option => (
            <Button
              key={option}
              variant={days === option ? "default" : "outline"}
              onClick={() => setDays(option)}
            >
              {option}日
            </Button>
          ))}
        </div>
        <IncludeTestToggle checked={includeTest} onCheckedChange={setIncludeTest} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          title="総発券数"
          value={formatNumber(summaryQuery.data?.totalTickets ?? 0)}
          description={`過去${days}日の作成チケット`}
          icon={Ticket}
          loading={summaryQuery.isLoading}
        />
        <KpiCard
          title="呼び出し済み"
          value={formatNumber(summaryQuery.data?.calledCount ?? 0)}
          description="calledAt があるチケット"
          icon={UsersRound}
          loading={summaryQuery.isLoading}
        />
        <KpiCard
          title="到着済み"
          value={formatNumber(summaryQuery.data?.arrivedCount ?? 0)}
          description="arrivedAt または ARRIVED/DONE"
          icon={UserCheck}
          loading={summaryQuery.isLoading}
        />
        <KpiCard
          title="完了数"
          value={formatNumber(summaryQuery.data?.doneCount ?? 0)}
          description={`キャンセル ${formatNumber(summaryQuery.data?.canceledCount ?? 0)} 件`}
          icon={Activity}
          loading={summaryQuery.isLoading}
        />
        <KpiCard
          title="平均待ち時間"
          value={`${formatNumber(summaryQuery.data?.avgWaitMinutes ?? 0)}分`}
          description="createdAt → calledAt"
          icon={Clock3}
          loading={summaryQuery.isLoading}
        />
        <KpiCard
          title="キャンセル率"
          value={formatRate(summaryQuery.data?.cancelRate ?? 0)}
          description={`キャンセル ${formatNumber(summaryQuery.data?.canceledCount ?? 0)} 件`}
          icon={Activity}
          loading={summaryQuery.isLoading}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card>
          <CardHeader>
            <CardTitle>店舗別ランキング</CardTitle>
            <CardDescription>発券数の多い順に上位 20 店舗を表示します。</CardDescription>
          </CardHeader>
          <CardContent>
            {byStoreQuery.isLoading ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            ) : !byStoreQuery.data || byStoreQuery.data.length === 0 ? (
              <Empty className="rounded-2xl border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Store className="h-5 w-5" />
                  </EmptyMedia>
                  <EmptyTitle>ランキング対象の店舗がありません</EmptyTitle>
                  <EmptyDescription>期間やテストデータ設定を変更して確認してください。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>店舗</TableHead>
                    <TableHead>発券</TableHead>
                    <TableHead>完了</TableHead>
                    <TableHead>キャンセル</TableHead>
                    <TableHead>平均待ち</TableHead>
                    <TableHead className="text-right">Check-in</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byStoreQuery.data.map(item => (
                    <TableRow key={item.storeId}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{item.storeName}</div>
                          <div className="text-xs text-muted-foreground">{item.slug}</div>
                        </div>
                      </TableCell>
                      <TableCell>{formatNumber(item.totalTickets)}</TableCell>
                      <TableCell>{formatNumber(item.doneCount)}</TableCell>
                      <TableCell>{formatNumber(item.canceledCount)}</TableCell>
                      <TableCell>{formatNumber(item.avgWaitMinutes)}分</TableCell>
                      <TableCell className="text-right">{formatRate(item.checkinRate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Check-in Rate</CardTitle>
            <CardDescription>呼び出した客のうち到着した割合です。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {checkinRateQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <>
                <div className="rounded-2xl border p-5">
                  <div className="text-sm text-muted-foreground">全体比率</div>
                  <div className="mt-2 text-4xl font-semibold tracking-tight">
                    {formatRate(checkinRateQuery.data?.rate ?? 0)}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    呼び出し {formatNumber(checkinRateQuery.data?.calledCount ?? 0)} 件 / 到着{" "}
                    {formatNumber(checkinRateQuery.data?.checkedInCount ?? 0)} 件
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">分母: calledAt IS NOT NULL</Badge>
                  <Badge variant="outline">分子: arrivedAt または ARRIVED/DONE</Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>曜日 × 時間帯ヒートマップ</CardTitle>
          <CardDescription>平均発券数ベースの混雑傾向です。</CardDescription>
        </CardHeader>
        <CardContent>
          {peakHoursQuery.isLoading ? (
            <Skeleton className="h-[440px] w-full" />
          ) : !heatmapData.length ? (
            <Empty className="rounded-2xl border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Activity className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>ヒートマップに表示できるデータがありません</EmptyTitle>
                <EmptyDescription>対象期間に発券がないため、傾向を計算できません。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <div
                className="grid min-w-[980px] gap-2"
                style={{ gridTemplateColumns: "80px repeat(24, minmax(0, 1fr))" }}
              >
                <div />
                {Array.from({ length: 24 }, (_, hour) => (
                  <div
                    key={`hour-${hour}`}
                    className="text-center text-xs font-medium text-muted-foreground"
                  >
                    {hour}
                  </div>
                ))}
                {weekdayLabels.map((label, dayOfWeek) => (
                  <div key={label} className="contents">
                    <div className="flex items-center text-sm font-medium text-muted-foreground">
                      {label}
                    </div>
                    {heatmapData
                      .filter(item => item.dayOfWeek === dayOfWeek)
                      .map(item => (
                        <div
                          key={`${item.dayOfWeek}-${item.hour}`}
                          className="flex aspect-square min-h-10 items-center justify-center rounded-xl text-xs font-medium text-slate-900"
                          style={{ backgroundColor: getHeatColor(item.avgCount, maxAvgCount) }}
                          title={`${label} ${item.hour}:00 平均 ${formatNumber(item.avgCount)} 件`}
                        >
                          {item.avgCount > 0 ? item.avgCount : ""}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
