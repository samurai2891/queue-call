import { AdminLayout } from "@/components/internal-admin/AdminLayout";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { Building2, Loader2, Search, Store, Wallet } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { toast } from "sonner";

type StoreStatus = "open" | "paused";

const pageSize = 20;

const formatDateTime = (value: string) => format(new Date(value), "yyyy/MM/dd HH:mm");

export default function InternalAdminStores() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [statusFilter, setStatusFilter] = useState<"all" | StoreStatus>("all");
  const [testFilter, setTestFilter] = useState<"all" | "test" | "production">("all");
  const [planFilter, setPlanFilter] = useState<"all" | "free" | "standard" | "pro">("all");
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [draftStatus, setDraftStatus] = useState<StoreStatus>("open");
  const [draftIsTest, setDraftIsTest] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);

  const listQuery = trpc.admin.stores.list.useQuery(
    {
      page,
      pageSize,
      query: deferredQuery,
      status: statusFilter,
      testFilter,
      planFilter,
    },
    {
      placeholderData: previous => previous,
    }
  );

  const detailQuery = trpc.admin.stores.detail.useQuery(
    { storeId: selectedStoreId ?? 0 },
    {
      enabled: selectedStoreId !== null,
    }
  );

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, statusFilter, testFilter, planFilter]);

  useEffect(() => {
    if (!detailQuery.data) return;
    setDraftStatus(detailQuery.data.intakeStatus);
    setDraftIsTest(detailQuery.data.isTest);
  }, [detailQuery.data]);

  const updateStatusMutation = trpc.admin.stores.updateStatus.useMutation({
    onSuccess: async () => {
      toast.success("店舗状態を更新しました");
      await Promise.all([
        utils.admin.stores.list.invalidate(),
        utils.admin.stores.detail.invalidate(),
      ]);
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const updateTestFlagMutation = trpc.admin.stores.updateTestFlag.useMutation({
    onSuccess: async () => {
      toast.success("テストフラグを更新しました");
      await Promise.all([
        utils.admin.stores.list.invalidate(),
        utils.admin.stores.detail.invalidate(),
      ]);
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const selectedStore = detailQuery.data;
  const statusChanged = selectedStore ? draftStatus !== selectedStore.intakeStatus : false;
  const testFlagChanged = selectedStore ? draftIsTest !== selectedStore.isTest : false;

  const saveStatus = async (nextStatus: StoreStatus) => {
    if (!selectedStoreId) return;
    await updateStatusMutation.mutateAsync({
      storeId: selectedStoreId,
      status: nextStatus,
    });
    setConfirmPause(false);
  };

  return (
    <AdminLayout
      title="店舗管理"
      description="店舗の稼働状態、プラン、テストフラグを横断して管理できます。"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>検索とフィルター</CardTitle>
              <CardDescription>店舗名、slug、owner 情報で検索できます。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2 xl:col-span-4">
                <Label htmlFor="store-search">検索</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="store-search"
                    className="pl-9"
                    placeholder="店舗名、slug、owner"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>受付状態</Label>
                <Select value={statusFilter} onValueChange={value => setStatusFilter(value as "all" | StoreStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="open">受付中</SelectItem>
                    <SelectItem value="paused">一時停止</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>テスト</Label>
                <Select value={testFilter} onValueChange={value => setTestFilter(value as typeof testFilter)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="production">本番店舗</SelectItem>
                    <SelectItem value="test">テスト店舗</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>プラン</Label>
                <Select value={planFilter} onValueChange={value => setPlanFilter(value as typeof planFilter)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <div className="rounded-xl border px-3 py-2 text-sm text-muted-foreground">
                  {listQuery.data?.total ?? 0} 件
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>店舗一覧</CardTitle>
              <CardDescription>行を選択すると詳細パネルを表示します。</CardDescription>
            </CardHeader>
            <CardContent>
              {listQuery.isLoading ? (
                <div className="space-y-3">
                  {[...Array(6)].map((_, index) => (
                    <Skeleton key={index} className="h-14 w-full" />
                  ))}
                </div>
              ) : !listQuery.data || listQuery.data.items.length === 0 ? (
                <Empty className="rounded-2xl border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Building2 className="h-5 w-5" />
                    </EmptyMedia>
                    <EmptyTitle>一致する店舗が見つかりません</EmptyTitle>
                    <EmptyDescription>検索条件またはフィルターを調整してください。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>店舗</TableHead>
                          <TableHead>契約</TableHead>
                          <TableHead>owner</TableHead>
                          <TableHead>残高</TableHead>
                          <TableHead className="text-right">作成日</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {listQuery.data.items.map(item => (
                          <TableRow
                            key={item.id}
                            className="cursor-pointer"
                            onClick={() => setSelectedStoreId(item.id)}
                          >
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{item.name}</div>
                                <div className="text-xs text-muted-foreground">{item.slug}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant={item.intakeStatus === "open" ? "secondary" : "outline"}>
                                  {item.intakeStatus === "open" ? "受付中" : "一時停止"}
                                </Badge>
                                <Badge variant="outline">{item.subscriptionPlan}</Badge>
                                {item.isTest ? <Badge variant="outline">テスト</Badge> : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{item.owner.name || item.owner.email || item.owner.openId}</div>
                                <div className="text-xs text-muted-foreground">{item.owner.openId}</div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              ¥{item.smsBalance.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {formatDateTime(item.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {listQuery.data.page} / {listQuery.data.totalPages} ページ
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setPage(current => Math.max(1, current - 1))}
                        disabled={page <= 1 || listQuery.isFetching}
                      >
                        前へ
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setPage(current =>
                            Math.min(listQuery.data?.totalPages ?? current, current + 1)
                          )
                        }
                        disabled={page >= (listQuery.data?.totalPages ?? 1) || listQuery.isFetching}
                      >
                        次へ
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="hidden xl:block">
          <CardHeader>
            <CardTitle>運用メモ</CardTitle>
            <CardDescription>店舗状態更新は既存 `intakeStatus` を利用します。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>`paused` は受付停止であり、店舗レコード自体の無効化ではありません。</p>
            <p>`is_test` は KPI 既定除外と検証導線の識別に使います。</p>
            <p>プラン別の実契約状態は `subscriptionPlan` と `subscriptionStatus` を併せて確認します。</p>
          </CardContent>
        </Card>
      </div>

      <Sheet open={selectedStoreId !== null} onOpenChange={open => !open && setSelectedStoreId(null)}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>店舗詳細</SheetTitle>
            <SheetDescription>受付状態とテストフラグをここから更新できます。</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {detailQuery.isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : !selectedStore ? (
              <Empty className="rounded-2xl border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Building2 className="h-5 w-5" />
                  </EmptyMedia>
                  <EmptyTitle>店舗詳細を取得できません</EmptyTitle>
                  <EmptyDescription>一覧から別の店舗を選択してください。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardContent className="grid gap-4 p-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">店舗名</div>
                      <div className="font-medium">{selectedStore.name}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">slug</div>
                      <div className="font-mono text-xs">{selectedStore.slug}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={selectedStore.intakeStatus === "open" ? "secondary" : "outline"}>
                        {selectedStore.intakeStatus === "open" ? "受付中" : "一時停止"}
                      </Badge>
                      <Badge variant="outline">{selectedStore.subscriptionPlan}</Badge>
                      {selectedStore.subscriptionStatus ? (
                        <Badge variant="outline">{selectedStore.subscriptionStatus}</Badge>
                      ) : null}
                      {selectedStore.isTest ? <Badge variant="outline">テスト</Badge> : null}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">管理操作</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>受付状態</Label>
                      <Select value={draftStatus} onValueChange={value => setDraftStatus(value as StoreStatus)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">受付中</SelectItem>
                          <SelectItem value="paused">一時停止</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        className="w-full"
                        disabled={!statusChanged || updateStatusMutation.isPending}
                        onClick={() => {
                          if (draftStatus === "paused") {
                            setConfirmPause(true);
                            return;
                          }
                          void saveStatus(draftStatus);
                        }}
                      >
                        {updateStatusMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        受付状態を保存
                      </Button>
                    </div>

                    <div className="space-y-3 rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="font-medium">テスト店舗</div>
                          <div className="text-sm text-muted-foreground">
                            KPI 既定除外と検証用管理の対象にします。
                          </div>
                        </div>
                        <Switch checked={draftIsTest} onCheckedChange={setDraftIsTest} />
                      </div>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={!testFlagChanged || updateTestFlagMutation.isPending}
                        onClick={() =>
                          selectedStoreId
                            ? updateTestFlagMutation.mutate({
                                storeId: selectedStoreId,
                                isTest: draftIsTest,
                              })
                            : undefined
                        }
                      >
                        {updateTestFlagMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        テストフラグを保存
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">契約者</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <div className="text-muted-foreground">表示名</div>
                      <div className="font-medium">
                        {selectedStore.owner.name || selectedStore.owner.email || selectedStore.owner.openId}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">openId</div>
                      <div className="font-mono text-xs">{selectedStore.owner.openId}</div>
                    </div>
                    {selectedStore.owner.email ? (
                      <div>
                        <div className="text-muted-foreground">メールアドレス</div>
                        <div className="font-medium">{selectedStore.owner.email}</div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={selectedStore.owner.status === "active" ? "secondary" : "destructive"}>
                        {selectedStore.owner.status === "active" ? "有効" : "停止"}
                      </Badge>
                      {selectedStore.owner.isTest ? <Badge variant="outline">テストユーザー</Badge> : null}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">設定サマリー</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 text-sm md:grid-cols-2">
                    <div className="rounded-xl border p-4">
                      <div className="text-muted-foreground">日次リセット</div>
                      <div className="mt-1 font-medium">{selectedStore.settingsSummary.resetTime}</div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">SMS残高</span>
                      </div>
                      <div className="mt-1 font-medium">¥{selectedStore.smsBalance.toLocaleString()}</div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <div className="text-muted-foreground">Push通知</div>
                      <div className="mt-1 font-medium">
                        {selectedStore.settingsSummary.pushEnabled ? "有効" : "無効"}
                      </div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <div className="text-muted-foreground">SMS通知</div>
                      <div className="mt-1 font-medium">
                        {selectedStore.settingsSummary.smsEnabled ? "有効" : "無効"}
                      </div>
                    </div>
                    <div className="rounded-xl border p-4 md:col-span-2">
                      <div className="text-muted-foreground">予約機能</div>
                      <div className="mt-1 font-medium">
                        {selectedStore.settingsSummary.reservationEnabled ? "有効" : "無効"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmPause} onOpenChange={setConfirmPause}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>店舗受付を停止しますか</AlertDialogTitle>
            <AlertDialogDescription>
              intakeStatus を `paused` に変更すると、この店舗の受付は一時停止されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={() => void saveStatus("paused")}>
              停止する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
