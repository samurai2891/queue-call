import { useAuth } from "@/_core/hooks/useAuth";
import { AdminLayout } from "@/components/internal-admin/AdminLayout";
import { IncludeTestToggle } from "@/components/internal-admin/IncludeTestToggle";
import { KpiCard } from "@/components/internal-admin/KpiCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  BellRing,
  Database,
  KeyRound,
  MessageSquare,
  ShieldAlert,
  Signal,
} from "lucide-react";
import { useState } from "react";

const formatNumber = (value: number) => new Intl.NumberFormat("ja-JP").format(value);
const formatCurrency = (value: number) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));

export default function InternalAdminSystem() {
  const { user } = useAuth();
  const [includeTest, setIncludeTest] = useState(false);

  const pushStatsQuery = trpc.admin.system.pushStats.useQuery(
    { includeTest },
    { enabled: Boolean(user?.isInternalAdmin) }
  );
  const smsStatsQuery = trpc.admin.system.smsStats.useQuery(
    { includeTest },
    { enabled: Boolean(user?.isInternalAdmin) }
  );
  const vapidStatusQuery = trpc.admin.system.vapidStatus.useQuery(
    { includeTest },
    { enabled: Boolean(user?.isInternalAdmin) }
  );
  const healthQuery = trpc.admin.system.health.useQuery(undefined, {
    enabled: Boolean(user?.isInternalAdmin),
  });

  return (
    <AdminLayout
      title="システム監視"
      description="Push / SMS / VAPID / DB の状態を read-only で確認します。"
    >
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <Alert className="max-w-3xl">
          <Signal className="h-4 w-4" />
          <AlertTitle>Phase 6 は read-only です</AlertTitle>
          <AlertDescription>
            この画面には VAPID 生成や test push 実行ボタンは出しません。既存の運用操作は別導線のまま維持します。
          </AlertDescription>
        </Alert>
        <IncludeTestToggle checked={includeTest} onCheckedChange={setIncludeTest} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Push 購読数"
          value={formatNumber(pushStatsQuery.data?.totalSubscriptions ?? 0)}
          description={`直近30日追加 ${formatNumber(pushStatsQuery.data?.subscriptionsLast30d ?? 0)} 件`}
          icon={BellRing}
          loading={pushStatsQuery.isLoading}
        />
        <KpiCard
          title="SMS送信数 (30d)"
          value={formatNumber(smsStatsQuery.data?.sent30d ?? 0)}
          description={`24h ${formatNumber(smsStatsQuery.data?.sent24h ?? 0)} 件`}
          icon={MessageSquare}
          loading={smsStatsQuery.isLoading}
        />
        <KpiCard
          title="VAPID"
          value={vapidStatusQuery.data?.configured ? "Configured" : "Not Configured"}
          description={`鍵保持店舗 ${formatNumber(vapidStatusQuery.data?.storesWithKeys ?? 0)} / ${formatNumber(vapidStatusQuery.data?.totalStores ?? 0)}`}
          icon={KeyRound}
          loading={vapidStatusQuery.isLoading}
        />
        <KpiCard
          title="DB Health"
          value={healthQuery.data?.queryOk ? "Healthy" : "Degraded"}
          description={
            healthQuery.data?.latencyMs !== null && healthQuery.data?.latencyMs !== undefined
              ? `Latency ${formatNumber(healthQuery.data.latencyMs)} ms`
              : "Latency -"
          }
          icon={Database}
          loading={healthQuery.isLoading}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Push 監視</CardTitle>
            <CardDescription>persistent な成功/失敗ログは無いため、既存 signal のみ表示します。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {pushStatsQuery.isLoading ? (
              [...Array(4)].map((_, index) => <Skeleton key={index} className="h-24 w-full" />)
            ) : (
              <>
                <div className="rounded-2xl border p-4">
                  <div className="text-sm text-muted-foreground">push 対応 ticket 数</div>
                  <div className="mt-2 text-2xl font-semibold">{formatNumber(pushStatsQuery.data?.ticketsWithPush ?? 0)}</div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="text-sm text-muted-foreground">push 利用 store 数</div>
                  <div className="mt-2 text-2xl font-semibold">{formatNumber(pushStatsQuery.data?.storesWithPush ?? 0)}</div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="text-sm text-muted-foreground">VAPID 状態</div>
                  <div className="mt-2">
                    <Badge variant={pushStatsQuery.data?.vapidConfigured ? "secondary" : "destructive"}>
                      {pushStatsQuery.data?.vapidConfigured ? "設定済み" : "未設定"}
                    </Badge>
                  </div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="text-sm text-muted-foreground">注記</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    成功率・失敗理由の永続ログは未実装です。
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SMS 監視</CardTitle>
            <CardDescription>`sms_logs` と `sms_transactions` から 24h / 30d 指標を集計します。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {smsStatsQuery.isLoading ? (
              [...Array(6)].map((_, index) => <Skeleton key={index} className="h-24 w-full" />)
            ) : (
              <>
                <div className="rounded-2xl border p-4">
                  <div className="text-sm text-muted-foreground">24h 送信</div>
                  <div className="mt-2 text-2xl font-semibold">{formatNumber(smsStatsQuery.data?.sent24h ?? 0)}</div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="text-sm text-muted-foreground">24h 失敗</div>
                  <div className="mt-2 text-2xl font-semibold">{formatNumber(smsStatsQuery.data?.failed24h ?? 0)}</div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="text-sm text-muted-foreground">30d 送信</div>
                  <div className="mt-2 text-2xl font-semibold">{formatNumber(smsStatsQuery.data?.sent30d ?? 0)}</div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="text-sm text-muted-foreground">30d 失敗</div>
                  <div className="mt-2 text-2xl font-semibold">{formatNumber(smsStatsQuery.data?.failed30d ?? 0)}</div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="text-sm text-muted-foreground">30d 消費</div>
                  <div className="mt-2 text-2xl font-semibold">{formatCurrency(smsStatsQuery.data?.creditsConsumed30d ?? 0)}</div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="text-sm text-muted-foreground">30d チャージ</div>
                  <div className="mt-2 text-2xl font-semibold">{formatCurrency(smsStatsQuery.data?.chargeAmount30d ?? 0)}</div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle>VAPID 状態</CardTitle>
            <CardDescription>環境変数と store settings の状態を合成して表示します。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {vapidStatusQuery.isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <>
                {!vapidStatusQuery.data?.configured ? (
                  <Alert variant="destructive">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>VAPID は未設定です</AlertTitle>
                    <AlertDescription>Push 通知は利用できません。</AlertDescription>
                  </Alert>
                ) : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border p-4">
                    <div className="text-sm text-muted-foreground">適用 source</div>
                    <div className="mt-2 text-lg font-semibold">{vapidStatusQuery.data?.source ?? "-"}</div>
                  </div>
                  <div className="rounded-2xl border p-4">
                    <div className="text-sm text-muted-foreground">公開鍵 / 秘密鍵</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={vapidStatusQuery.data?.publicKeyPresent ? "secondary" : "destructive"}>
                        public {vapidStatusQuery.data?.publicKeyPresent ? "ok" : "missing"}
                      </Badge>
                      <Badge variant={vapidStatusQuery.data?.hasPrivateKey ? "secondary" : "destructive"}>
                        private {vapidStatusQuery.data?.hasPrivateKey ? "ok" : "missing"}
                      </Badge>
                    </div>
                  </div>
                  <div className="rounded-2xl border p-4 md:col-span-2">
                    <div className="text-sm text-muted-foreground">鍵保持店舗数</div>
                    <div className="mt-2 text-lg font-semibold">
                      {formatNumber(vapidStatusQuery.data?.storesWithKeys ?? 0)} / {formatNumber(vapidStatusQuery.data?.totalStores ?? 0)} 店舗
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>DB ヘルス</CardTitle>
            <CardDescription>`SELECT 1` ベースの最小ヘルスチェックです。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {healthQuery.isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={healthQuery.data?.databaseUrlConfigured ? "secondary" : "destructive"}>
                    DATABASE_URL {healthQuery.data?.databaseUrlConfigured ? "configured" : "missing"}
                  </Badge>
                  <Badge variant={healthQuery.data?.dbConnected ? "secondary" : "destructive"}>
                    DB {healthQuery.data?.dbConnected ? "connected" : "not connected"}
                  </Badge>
                  <Badge variant={healthQuery.data?.queryOk ? "secondary" : "destructive"}>
                    Query {healthQuery.data?.queryOk ? "ok" : "failed"}
                  </Badge>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="text-sm text-muted-foreground">応答時間</div>
                  <div className="mt-2 text-lg font-semibold">
                    {healthQuery.data?.latencyMs !== null && healthQuery.data?.latencyMs !== undefined
                      ? `${formatNumber(healthQuery.data.latencyMs)} ms`
                      : "-"}
                  </div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="text-sm text-muted-foreground">最終確認</div>
                  <div className="mt-2 text-sm font-medium">
                    {healthQuery.data?.checkedAt ? formatDateTime(healthQuery.data.checkedAt) : "-"}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
