import { AdminLayout } from "@/components/internal-admin/AdminLayout";
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
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { Loader2, Search, Shield, Store, Users } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { toast } from "sonner";

type UserStatus = "active" | "suspended";

const pageSize = 20;

const formatDateTime = (value: string) => format(new Date(value), "yyyy/MM/dd HH:mm");

const userStatusLabel: Record<UserStatus, string> = {
  active: "有効",
  suspended: "停止",
};

export default function InternalAdminUsers() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [statusFilter, setStatusFilter] = useState<"all" | UserStatus>("all");
  const [testFilter, setTestFilter] = useState<"all" | "test" | "production">("all");
  const [internalAdminFilter, setInternalAdminFilter] = useState<
    "all" | "internal_admin" | "non_internal_admin"
  >("all");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [draftStatus, setDraftStatus] = useState<UserStatus>("active");
  const [draftIsTest, setDraftIsTest] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<UserStatus | null>(null);

  const listQuery = trpc.admin.users.list.useQuery(
    {
      page,
      pageSize,
      query: deferredQuery,
      status: statusFilter,
      testFilter,
      internalAdminFilter,
    },
    {
      placeholderData: previous => previous,
    }
  );

  const detailQuery = trpc.admin.users.detail.useQuery(
    { userId: selectedUserId ?? 0 },
    {
      enabled: selectedUserId !== null,
    }
  );

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, statusFilter, testFilter, internalAdminFilter]);

  useEffect(() => {
    if (!detailQuery.data) return;
    setDraftStatus(detailQuery.data.status);
    setDraftIsTest(detailQuery.data.isTest);
  }, [detailQuery.data]);

  const updateStatusMutation = trpc.admin.users.updateStatus.useMutation({
    onSuccess: async () => {
      toast.success("ユーザー状態を更新しました");
      await Promise.all([
        utils.admin.users.list.invalidate(),
        utils.admin.users.detail.invalidate(),
      ]);
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const updateTestFlagMutation = trpc.admin.users.updateTestFlag.useMutation({
    onSuccess: async () => {
      toast.success("テストフラグを更新しました");
      await Promise.all([
        utils.admin.users.list.invalidate(),
        utils.admin.users.detail.invalidate(),
      ]);
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const selectedUser = detailQuery.data;
  const statusChanged = selectedUser ? draftStatus !== selectedUser.status : false;
  const testFlagChanged = selectedUser ? draftIsTest !== selectedUser.isTest : false;
  const primaryError = listQuery.error ?? detailQuery.error;

  const saveStatus = async (nextStatus: UserStatus) => {
    if (!selectedUserId) return;
    await updateStatusMutation.mutateAsync({
      userId: selectedUserId,
      status: nextStatus,
    });
    setConfirmStatus(null);
  };

  return (
    <AdminLayout
      title="ユーザー管理"
      description="契約者アカウントを横断して検索し、状態とテストフラグを更新できます。"
    >
      {primaryError ? <QueryErrorAlert message={primaryError.message} /> : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>検索とフィルター</CardTitle>
              <CardDescription>openId / 名前 / メールアドレスで絞り込みます。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2 xl:col-span-4">
                <Label htmlFor="user-search">検索</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="user-search"
                    className="pl-9"
                    placeholder="名前、メール、openId"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>状態</Label>
                <Select value={statusFilter} onValueChange={value => setStatusFilter(value as "all" | UserStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="active">有効</SelectItem>
                    <SelectItem value="suspended">停止</SelectItem>
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
                    <SelectItem value="production">本番ユーザー</SelectItem>
                    <SelectItem value="test">テストユーザー</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>内部管理</Label>
                <Select
                  value={internalAdminFilter}
                  onValueChange={value => setInternalAdminFilter(value as typeof internalAdminFilter)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="internal_admin">内部管理者</SelectItem>
                    <SelectItem value="non_internal_admin">契約者のみ</SelectItem>
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
              <CardTitle>ユーザー一覧</CardTitle>
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
                      <Users className="h-5 w-5" />
                    </EmptyMedia>
                    <EmptyTitle>一致するユーザーが見つかりません</EmptyTitle>
                    <EmptyDescription>検索条件またはフィルターを調整してください。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ユーザー</TableHead>
                          <TableHead>状態</TableHead>
                          <TableHead>種別</TableHead>
                          <TableHead>最終ログイン</TableHead>
                          <TableHead className="text-right">作成日</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {listQuery.data.items.map(item => (
                          <TableRow
                            key={item.id}
                            className="cursor-pointer"
                            onClick={() => setSelectedUserId(item.id)}
                          >
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{item.name || item.email || item.openId}</div>
                                <div className="text-xs text-muted-foreground">{item.openId}</div>
                                {item.email ? (
                                  <div className="text-xs text-muted-foreground">{item.email}</div>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.status === "active" ? "secondary" : "destructive"}>
                                {userStatusLabel[item.status]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                {item.isTest ? <Badge variant="outline">テスト</Badge> : null}
                                {item.isInternalAdmin ? (
                                  <Badge className="gap-1">
                                    <Shield className="h-3 w-3" />
                                    内部管理者
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">契約者</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDateTime(item.lastSignedIn)}
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
            <CardDescription>この画面では allowlist 自体の更新は行いません。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>`status=suspended` は認証必須のアプリ利用全体を停止します。</p>
            <p>`is_test` は統計除外とテスト導線の識別に使います。</p>
            <p>内部管理者の付与・剥奪は `INTERNAL_ADMIN_IDS` の更新で行います。</p>
          </CardContent>
        </Card>
      </div>

      <Sheet open={selectedUserId !== null} onOpenChange={open => !open && setSelectedUserId(null)}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>ユーザー詳細</SheetTitle>
            <SheetDescription>状態とテストフラグをここから更新できます。</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {detailQuery.isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : !selectedUser ? (
              <Empty className="rounded-2xl border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Users className="h-5 w-5" />
                  </EmptyMedia>
                  <EmptyTitle>ユーザー詳細を取得できません</EmptyTitle>
                  <EmptyDescription>一覧から別のユーザーを選択してください。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardContent className="grid gap-4 p-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">表示名</div>
                      <div className="font-medium">{selectedUser.name || "-"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">メールアドレス</div>
                      <div className="font-medium">{selectedUser.email || "-"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">openId</div>
                      <div className="font-mono text-xs">{selectedUser.openId}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={selectedUser.status === "active" ? "secondary" : "destructive"}>
                        {userStatusLabel[selectedUser.status]}
                      </Badge>
                      {selectedUser.isTest ? <Badge variant="outline">テスト</Badge> : null}
                      {selectedUser.isInternalAdmin ? (
                        <Badge className="gap-1">
                          <Shield className="h-3 w-3" />
                          内部管理者
                        </Badge>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">管理操作</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>状態</Label>
                      <Select value={draftStatus} onValueChange={value => setDraftStatus(value as UserStatus)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">有効</SelectItem>
                          <SelectItem value="suspended">停止</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        className="w-full"
                        disabled={!statusChanged || updateStatusMutation.isPending}
                        onClick={() => {
                          if (draftStatus === "suspended") {
                            setConfirmStatus("suspended");
                            return;
                          }
                          void saveStatus(draftStatus);
                        }}
                      >
                        {updateStatusMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        状態を保存
                      </Button>
                    </div>

                    <div className="space-y-3 rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="font-medium">テストユーザー</div>
                          <div className="text-sm text-muted-foreground">
                            統計除外と検証導線の対象にします。
                          </div>
                        </div>
                        <Switch checked={draftIsTest} onCheckedChange={setDraftIsTest} />
                      </div>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={!testFlagChanged || updateTestFlagMutation.isPending}
                        onClick={() =>
                          selectedUserId
                            ? updateTestFlagMutation.mutate({
                                userId: selectedUserId,
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
                    <CardTitle className="text-base">所有店舗</CardTitle>
                    <CardDescription>{selectedUser.stores.length} 店舗</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedUser.stores.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                        所有店舗はありません。
                      </div>
                    ) : (
                      selectedUser.stores.map(store => (
                        <div key={store.id} className="rounded-xl border p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-medium">{store.name}</div>
                              <div className="text-xs text-muted-foreground">{store.slug}</div>
                            </div>
                            <Store className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge variant="outline">actual {store.subscriptionPlan}</Badge>
                            {store.effectiveSubscriptionPlan !== store.subscriptionPlan ? (
                              <Badge>
                                effective {store.effectiveSubscriptionPlan}
                              </Badge>
                            ) : null}
                            <Badge variant={store.intakeStatus === "open" ? "secondary" : "outline"}>
                              {store.intakeStatus === "open" ? "受付中" : "一時停止"}
                            </Badge>
                            {store.isTest ? <Badge variant="outline">テスト</Badge> : null}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmStatus !== null} onOpenChange={open => !open && setConfirmStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ユーザーを停止しますか</AlertDialogTitle>
            <AlertDialogDescription>
              suspended にすると、このアカウントは認証必須のアプリ利用全体から拒否されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={() => void saveStatus("suspended")}>
              停止する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
