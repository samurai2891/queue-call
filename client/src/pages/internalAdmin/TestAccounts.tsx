import { AdminLayout } from "@/components/internal-admin/AdminLayout";
import { QueryErrorAlert } from "@/components/internal-admin/QueryErrorAlert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Search,
  Store,
  TestTube2,
  User2,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";

const candidatePageSize = 8;

const fixedTestStores = [
  {
    slug: "test-free",
    label: "Free",
    defaultName: "Test Store Free",
  },
  {
    slug: "test-standard",
    label: "Standard",
    defaultName: "Test Store Standard",
  },
  {
    slug: "test-pro",
    label: "Pro",
    defaultName: "Test Store Pro",
  },
] as const;

const formatDateTime = (value: string | null | undefined) =>
  value ? format(new Date(value), "yyyy/MM/dd HH:mm") : "-";

const getStoreLinks = (slug: string) => [
  { href: `/s/${slug}`, label: "公開ページ" },
  { href: `/s/${slug}/kiosk`, label: "Kiosk" },
  { href: `/s/${slug}/board`, label: "Board" },
  { href: `/s/${slug}/reservation`, label: "Reservation" },
];

export default function InternalAdminTestAccounts() {
  const utils = trpc.useUtils();
  const [candidateQuery, setCandidateQuery] = useState("");
  const deferredCandidateQuery = useDeferredValue(candidateQuery.trim());
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [setupConfirmOpen, setSetupConfirmOpen] = useState(false);
  const [resetStoreTarget, setResetStoreTarget] = useState<{ id: number; name: string } | null>(null);
  const [resetAllTarget, setResetAllTarget] = useState<{ userId: number; label: string } | null>(null);

  const statsQuery = trpc.admin.testAccounts.stats.useQuery(undefined, {
    placeholderData: previous => previous,
  });

  const accountsQuery = trpc.admin.testAccounts.list.useQuery(undefined, {
    placeholderData: previous => previous,
  });

  const candidatesQuery = trpc.admin.users.list.useQuery(
    {
      page: 1,
      pageSize: candidatePageSize,
      query: deferredCandidateQuery,
      status: "active",
      testFilter: "production",
      internalAdminFilter: "non_internal_admin",
    },
    {
      placeholderData: previous => previous,
    }
  );

  const setupMutation = trpc.admin.testAccounts.setup.useMutation({
    onSuccess: async result => {
      toast.success(`テストアカウントをセットアップしました (${result.storesCreated} 作成 / ${result.storesUpdated} 更新)`);
      setSetupConfirmOpen(false);
      await Promise.all([
        utils.admin.testAccounts.list.invalidate(),
        utils.admin.testAccounts.stats.invalidate(),
        utils.admin.users.list.invalidate(),
        utils.admin.users.detail.invalidate(),
        utils.admin.stores.list.invalidate(),
        utils.admin.stores.detail.invalidate(),
      ]);
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const resetStoreMutation = trpc.admin.testAccounts.resetStore.useMutation({
    onSuccess: async () => {
      toast.success("テスト店舗をリセットしました");
      setResetStoreTarget(null);
      await Promise.all([
        utils.admin.testAccounts.list.invalidate(),
        utils.admin.testAccounts.stats.invalidate(),
        utils.admin.stores.list.invalidate(),
        utils.admin.stores.detail.invalidate(),
      ]);
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const resetAllMutation = trpc.admin.testAccounts.resetAll.useMutation({
    onSuccess: async result => {
      toast.success(`${result.resetStores} 店舗をリセットしました`);
      setResetAllTarget(null);
      await Promise.all([
        utils.admin.testAccounts.list.invalidate(),
        utils.admin.testAccounts.stats.invalidate(),
        utils.admin.stores.list.invalidate(),
        utils.admin.stores.detail.invalidate(),
      ]);
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const selectedCandidate =
    candidatesQuery.data?.items.find(user => user.id === selectedUserId) ??
    accountsQuery.data?.find(account => account.user.id === selectedUserId)?.user;
  const primaryError =
    statsQuery.error ?? accountsQuery.error ?? candidatesQuery.error;

  return (
    <AdminLayout
      title="テストアカウント"
      description="既存ユーザーを 1 人選んで test user 化し、fixed slug の 3 店舗を upsert します。"
    >
      <div className="space-y-4">
        {primaryError ? <QueryErrorAlert message={primaryError.message} /> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardDescription>テストユーザー数</CardDescription>
              <CardTitle className="text-3xl">{statsQuery.data?.testUsers ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>テスト店舗数</CardDescription>
              <CardTitle className="text-3xl">{statsQuery.data?.testStores ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>3 店舗セットアップ状態</CardDescription>
              <CardTitle className="text-2xl">
                {statsQuery.data?.storesReady ? "Ready" : "Not Ready"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>最終更新</CardDescription>
              <CardTitle className="text-base">{formatDateTime(statsQuery.data?.lastUpdatedAt)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>セットアップ</CardTitle>
              <CardDescription>
                新規 auth ユーザーは作成せず、既存ユーザーを選んで test user 化します。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="test-account-search">既存ユーザー検索</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="test-account-search"
                    className="pl-9"
                    placeholder="名前、メール、openId"
                    value={candidateQuery}
                    onChange={event => setCandidateQuery(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {candidatesQuery.isLoading ? (
                  [...Array(4)].map((_, index) => <Skeleton key={index} className="h-20 w-full" />)
                ) : !candidatesQuery.data || candidatesQuery.data.items.length === 0 ? (
                  <Empty className="rounded-2xl border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <User2 className="h-5 w-5" />
                      </EmptyMedia>
                      <EmptyTitle>候補ユーザーが見つかりません</EmptyTitle>
                      <EmptyDescription>active な契約者アカウントのみ検索対象です。</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  candidatesQuery.data.items.map(user => {
                    const isSelected = selectedUserId === user.id;
                    return (
                      <button
                        key={user.id}
                        type="button"
                        className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                          isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                        }`}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="font-medium">{user.name || user.email || user.openId}</div>
                            <div className="text-xs text-muted-foreground">{user.openId}</div>
                            {user.email ? (
                              <div className="text-xs text-muted-foreground">{user.email}</div>
                            ) : null}
                          </div>
                          {isSelected ? <Badge>選択中</Badge> : <Badge variant="outline">選択</Badge>}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="rounded-2xl border border-dashed p-4">
                <div className="text-sm text-muted-foreground">現在の選択</div>
                <div className="mt-2 font-medium">
                  {selectedCandidate
                    ? selectedCandidate.name || selectedCandidate.email || selectedCandidate.openId
                    : "未選択"}
                </div>
                {selectedCandidate ? (
                  <div className="mt-1 text-xs text-muted-foreground">{selectedCandidate.openId}</div>
                ) : null}
              </div>

              <Button
                className="w-full"
                disabled={selectedUserId === null || setupMutation.isPending}
                onClick={() => setSetupConfirmOpen(true)}
              >
                {setupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
                テストアカウントをセットアップ
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>運用ルール</CardTitle>
              <CardDescription>Phase 4 の固定仕様です。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>`test-free` / `test-standard` / `test-pro` を固定 slug として扱います。</p>
              <p>再セットアップ時は不足店舗を作成し、既存店舗の `is_test` と `test_plan_override` を補正します。</p>
              <p>リセット対象は operational data のみで、店舗本体、メニュー、フィード、スタッフ、課金履歴は残します。</p>
              <p>direct link は公開ページ、kiosk、board、reservation の 4 本だけ表示します。</p>
            </CardContent>
          </Card>
        </div>

        {accountsQuery.isLoading ? (
          <div className="space-y-4">
            {[...Array(2)].map((_, index) => (
              <Skeleton key={index} className="h-72 w-full" />
            ))}
          </div>
        ) : !accountsQuery.data || accountsQuery.data.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <Empty className="rounded-2xl border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <TestTube2 className="h-5 w-5" />
                  </EmptyMedia>
                  <EmptyTitle>テストアカウントはまだセットアップされていません</EmptyTitle>
                  <EmptyDescription>左側で既存ユーザーを選んで、3 店舗の fixed slug を作成してください。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          accountsQuery.data.map(account => (
            <Card key={account.user.id}>
              <CardHeader className="gap-4 md:flex md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{account.user.name || account.user.email || account.user.openId}</CardTitle>
                    <Badge variant={account.user.status === "active" ? "secondary" : "destructive"}>
                      {account.user.status === "active" ? "active" : "suspended"}
                    </Badge>
                    {account.user.isTest ? <Badge variant="outline">test user</Badge> : null}
                  </div>
                  <CardDescription>{account.user.openId}</CardDescription>
                  {account.user.email ? <CardDescription>{account.user.email}</CardDescription> : null}
                </div>

                <Button
                  variant="destructive"
                  disabled={resetAllMutation.isPending}
                  onClick={() =>
                    setResetAllTarget({
                      userId: account.user.id,
                      label: account.user.name || account.user.email || account.user.openId,
                    })
                  }
                >
                  {resetAllMutation.isPending && resetAllTarget?.userId === account.user.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  Reset All
                </Button>
              </CardHeader>

              <CardContent className="grid gap-4 xl:grid-cols-3">
                {fixedTestStores.map(definition => {
                  const store = account.stores.find(item => item.slug === definition.slug);
                  return (
                    <Card key={definition.slug} className="gap-4 py-5">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-lg">{definition.label}</CardTitle>
                            <CardDescription>{definition.slug}</CardDescription>
                          </div>
                          {store ? (
                            <Badge variant={store.intakeStatus === "open" ? "secondary" : "outline"}>
                              {store.intakeStatus === "open" ? "受付中" : "一時停止"}
                            </Badge>
                          ) : (
                            <Badge variant="outline">未作成</Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-1 text-sm">
                          <div className="font-medium">{store?.name ?? definition.defaultName}</div>
                          <div className="text-muted-foreground">
                            testPlanOverride: {store?.testPlanOverride ?? definition.label.toLowerCase()}
                          </div>
                          <div className="text-muted-foreground">
                            actualPlan: {store?.subscriptionPlan ?? "-"}
                          </div>
                          <div className="text-muted-foreground">
                            effectivePlan: {store?.effectiveSubscriptionPlan ?? definition.label.toLowerCase()}
                          </div>
                          <div className="text-muted-foreground">
                            currentNumber: {store?.currentNumber ?? "-"}
                          </div>
                          <div className="text-muted-foreground">
                            updatedAt: {formatDateTime(store?.updatedAt)}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {store?.isTest ? <Badge variant="outline">is_test</Badge> : null}
                          {store ? (
                            <Badge variant="outline">
                              <CheckCircle2 className="h-3 w-3" />
                              Ready
                            </Badge>
                          ) : null}
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          {getStoreLinks(definition.slug).map(link => (
                            <Button key={link.href} variant="outline" size="sm" asChild>
                              <a href={link.href} target="_blank" rel="noreferrer">
                                {link.label}
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          ))}
                        </div>

                        <Button
                          variant="destructive"
                          className="w-full"
                          disabled={!store || resetStoreMutation.isPending}
                          onClick={() =>
                            store
                              ? setResetStoreTarget({
                                  id: store.id,
                                  name: store.name,
                                })
                              : undefined
                          }
                        >
                          {resetStoreMutation.isPending && resetStoreTarget?.id === store?.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Store className="h-4 w-4" />
                          )}
                          Reset Store
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <AlertDialog open={setupConfirmOpen} onOpenChange={setSetupConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>テストアカウントをセットアップしますか</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCandidate
                ? `${selectedCandidate.name || selectedCandidate.email || selectedCandidate.openId} を test user 化し、test-free / test-standard / test-pro を upsert します。`
                : "選択中のユーザーに対して 3 店舗をセットアップします。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedUserId !== null) {
                  void setupMutation.mutateAsync({ userId: selectedUserId });
                }
              }}
            >
              実行する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={resetStoreTarget !== null}
        onOpenChange={open => !open && setResetStoreTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>テスト店舗をリセットしますか</AlertDialogTitle>
            <AlertDialogDescription>
              {resetStoreTarget
                ? `${resetStoreTarget.name} の tickets / push_subscriptions / sms_subscriptions / reservations / staff_sessions / queue_audit_logs を削除し、stores.settings とカウンタ類を初期化します。`
                : "対象店舗をリセットします。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (resetStoreTarget) {
                  void resetStoreMutation.mutateAsync({ storeId: resetStoreTarget.id });
                }
              }}
            >
              Reset Store
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={resetAllTarget !== null}
        onOpenChange={open => !open && setResetAllTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>全テスト店舗をリセットしますか</AlertDialogTitle>
            <AlertDialogDescription>
              {resetAllTarget
                ? `${resetAllTarget.label} 配下の test stores をまとめてリセットします。`
                : "選択中ユーザー配下のテスト店舗をまとめてリセットします。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (resetAllTarget) {
                  void resetAllMutation.mutateAsync({ userId: resetAllTarget.userId });
                }
              }}
            >
              Reset All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
