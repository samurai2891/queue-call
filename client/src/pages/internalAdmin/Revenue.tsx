import { useAuth } from "@/_core/hooks/useAuth";
import { AdminLayout } from "@/components/internal-admin/AdminLayout";
import { IncludeTestToggle } from "@/components/internal-admin/IncludeTestToggle";
import { KpiCard } from "@/components/internal-admin/KpiCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { AlertTriangle, BarChart3, CreditCard, ExternalLink, ReceiptText, TrendingDown, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const revenueDayOptions = [30, 90, 365] as const;

const formatNumber = (value: number) => new Intl.NumberFormat("ja-JP").format(value);
const formatCurrency = (value: number) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
const formatRate = (value: number) =>
  new Intl.NumberFormat("ja-JP", { style: "percent", maximumFractionDigits: 1 }).format(value);
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export default function InternalAdminRevenue() {
  const { user } = useAuth();
  const [days, setDays] = useState<(typeof revenueDayOptions)[number]>(90);
  const [includeTest, setIncludeTest] = useState(false);

  const mrrQuery = trpc.admin.revenue.mrr.useQuery(
    { includeTest },
    { enabled: Boolean(user?.isInternalAdmin) }
  );
  const planBreakdownQuery = trpc.admin.revenue.planBreakdown.useQuery(
    { includeTest },
    { enabled: Boolean(user?.isInternalAdmin) }
  );
  const recentPaymentsQuery = trpc.admin.revenue.recentPayments.useQuery(
    { days, includeTest, limit: 20 },
    { enabled: Boolean(user?.isInternalAdmin) }
  );
  const churnRateQuery = trpc.admin.revenue.churnRate.useQuery(
    { days, includeTest },
    { enabled: Boolean(user?.isInternalAdmin) }
  );

  const planChartData = useMemo(
    () =>
      (planBreakdownQuery.data ?? []).map(item => ({
        ...item,
        name: item.planId === "free" ? "Free" : item.planId === "standard" ? "Standard" : "Pro",
      })),
    [planBreakdownQuery.data]
  );

  const stripeErrorMessage = recentPaymentsQuery.error?.message ?? churnRateQuery.error?.message ?? null;

  return (
    <AdminLayout
      title="収益"
      description="現在の契約状態は DB、決済履歴と churn は Stripe 参照で表示します。"
    >
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {revenueDayOptions.map(option => (
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

      {stripeErrorMessage ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle />
          <AlertTitle>Stripe 収益データを取得できません</AlertTitle>
          <AlertDescription>{stripeErrorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="MRR"
          value={formatCurrency(mrrQuery.data?.mrrInclTax ?? 0)}
          secondaryValue={`税抜 ${formatCurrency(mrrQuery.data?.mrrExclTax ?? 0)}`}
          description="paid store のみ"
          icon={Wallet}
          loading={mrrQuery.isLoading}
        />
        <KpiCard
          title="有料契約店舗"
          value={formatNumber(mrrQuery.data?.paidStores ?? 0)}
          description="active / cancel_at_period_end"
          icon={CreditCard}
          loading={mrrQuery.isLoading}
        />
        <KpiCard
          title="Churn Rate"
          value={formatRate(churnRateQuery.data?.rate ?? 0)}
          description={`過去${days}日の実解約比率`}
          secondaryValue={`解約 ${formatNumber(churnRateQuery.data?.canceledCount ?? 0)} / 期首 ${formatNumber(churnRateQuery.data?.activeStartCount ?? 0)}`}
          icon={TrendingDown}
          loading={churnRateQuery.isLoading}
        />
        <KpiCard
          title="直近請求件数"
          value={formatNumber(recentPaymentsQuery.data?.length ?? 0)}
          description={`過去${days}日の subscription invoice`}
          icon={ReceiptText}
          loading={recentPaymentsQuery.isLoading}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card>
          <CardHeader>
            <CardTitle>プラン別内訳</CardTitle>
            <CardDescription>店舗数と MRR の内訳を並べて確認します。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {planBreakdownQuery.isLoading ? (
              <Skeleton className="h-[320px] w-full" />
            ) : planChartData.some(item => item.storeCount > 0) ? (
              <>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={planChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          name === "mrrInclTax" ? formatCurrency(value) : formatNumber(value),
                          name === "mrrInclTax" ? "MRR(税込)" : "店舗数",
                        ]}
                      />
                      <Bar dataKey="storeCount" fill="#2563eb" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {planChartData.map(item => (
                    <div key={item.planId} className="rounded-2xl border p-4">
                      <div className="text-sm text-muted-foreground">{item.name}</div>
                      <div className="mt-2 text-lg font-semibold">{formatNumber(item.storeCount)} 店舗</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        税込 {formatCurrency(item.mrrInclTax)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        税抜 {formatCurrency(item.mrrExclTax)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <Empty className="rounded-2xl border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BarChart3 className="h-5 w-5" />
                  </EmptyMedia>
                  <EmptyTitle>プラン内訳データがありません</EmptyTitle>
                  <EmptyDescription>契約店舗がまだ存在しないため、内訳を表示できません。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>直近 Stripe 請求</CardTitle>
            <CardDescription>subscription invoice のみ表示します。SMS チャージは含めません。</CardDescription>
          </CardHeader>
          <CardContent>
            {recentPaymentsQuery.isLoading ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            ) : !recentPaymentsQuery.data || recentPaymentsQuery.data.length === 0 ? (
              <Empty className="rounded-2xl border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ReceiptText className="h-5 w-5" />
                  </EmptyMedia>
                  <EmptyTitle>表示できる請求履歴がありません</EmptyTitle>
                  <EmptyDescription>対象期間に subscription invoice がありません。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>店舗</TableHead>
                    <TableHead>金額</TableHead>
                    <TableHead>状態</TableHead>
                    <TableHead>支払日</TableHead>
                    <TableHead className="text-right">請求書</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPaymentsQuery.data.map(item => (
                    <TableRow key={item.invoiceId}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{item.storeName}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.invoiceId}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(item.amountPaid)}</TableCell>
                      <TableCell>{item.status ?? "-"}</TableCell>
                      <TableCell>{formatDateTime(item.paidAt)}</TableCell>
                      <TableCell className="text-right">
                        {item.hostedInvoiceUrl ? (
                          <Button variant="outline" size="sm" asChild>
                            <a href={item.hostedInvoiceUrl} target="_blank" rel="noreferrer">
                              開く
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
