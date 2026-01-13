import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { getLoginUrl } from '@/const';

const PAGE_SIZE = 20;

type SmsStatus = 'pending' | 'sent' | 'delivered' | 'failed';

const STATUS_CONFIG: Record<SmsStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: '送信中', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  sent: { label: '送信済み', color: 'bg-blue-100 text-blue-800', icon: Send },
  delivered: { label: '配信完了', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  failed: { label: '失敗', color: 'bg-red-100 text-red-800', icon: XCircle },
};

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  call: '呼び出し',
  recall: '再通知',
  reminder: 'リマインダー',
  custom: 'カスタム',
};

function formatPhoneNumber(phone: string): string {
  // Mask middle digits for privacy
  if (phone.length > 8) {
    return phone.slice(0, 4) + '****' + phone.slice(-4);
  }
  return phone;
}

function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SmsHistory() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<SmsStatus | 'all'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);

  // Get user's store
  const { data: store, isLoading: storesLoading } = trpc.store.getByOwner.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Get SMS logs
  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = trpc.smsLogs.getLogs.useQuery(
    {
      storeId: store?.id!,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      status: statusFilter === 'all' ? undefined : statusFilter,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    },
    { enabled: !!store?.id }
  );

  // Get SMS stats
  const { data: stats, isLoading: statsLoading } = trpc.smsLogs.getStats.useQuery(
    { storeId: store?.id!, days: 30 },
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
            <p className="text-muted-foreground">店舗が見つかりません</p>
            <Button className="mt-4" onClick={() => navigate('/admin')}>
              ダッシュボードに戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPages = Math.ceil((logsData?.total || 0) / PAGE_SIZE);

  const handleFilter = () => {
    setPage(0);
    refetchLogs();
  };

  const handleClearFilters = () => {
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(0);
  };

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
              <MessageSquare className="h-5 w-5" />
              SMS送信履歴
            </h1>
            <p className="text-sm text-muted-foreground">{store.name}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            更新
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm">送信成功（30日）</span>
              </div>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-2xl font-bold text-green-600">{stats?.totalSent || 0}通</p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">送信失敗（30日）</span>
              </div>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-2xl font-bold text-red-600">{stats?.totalFailed || 0}通</p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Wallet className="h-4 w-4" />
                <span className="text-sm">消費クレジット（30日）</span>
              </div>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-2xl font-bold">¥{(stats?.totalCredits || 0).toLocaleString()}</p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Wallet className="h-4 w-4" />
                <span className="text-sm">現在の残高</span>
              </div>
              <p className="text-2xl font-bold text-primary">
                ¥{(balanceData?.balance || 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              フィルター
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>ステータス</Label>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as SmsStatus | 'all')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="pending">送信中</SelectItem>
                    <SelectItem value="sent">送信済み</SelectItem>
                    <SelectItem value="delivered">配信完了</SelectItem>
                    <SelectItem value="failed">失敗</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>開始日</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label>終了日</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              
              <div className="flex items-end gap-2">
                <Button onClick={handleFilter} className="flex-1">
                  検索
                </Button>
                <Button variant="outline" onClick={handleClearFilters}>
                  クリア
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">送信履歴</CardTitle>
            <CardDescription>
              {logsData?.total || 0}件中 {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, logsData?.total || 0)}件を表示
            </CardDescription>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : logsData?.logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>送信履歴がありません</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日時</TableHead>
                        <TableHead>宛先</TableHead>
                        <TableHead>タイプ</TableHead>
                        <TableHead>内容</TableHead>
                        <TableHead>ステータス</TableHead>
                        <TableHead className="text-right">クレジット</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logsData?.logs.map((log) => {
                        const statusConfig = STATUS_CONFIG[log.status as SmsStatus];
                        const StatusIcon = statusConfig?.icon || Clock;
                        
                        return (
                          <TableRow key={log.id}>
                            <TableCell className="whitespace-nowrap">
                              {formatDate(log.createdAt)}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {formatPhoneNumber(log.phoneE164)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {MESSAGE_TYPE_LABELS[log.messageType] || log.messageType}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {log.messageContent}
                            </TableCell>
                            <TableCell>
                              <Badge className={statusConfig?.color || ''}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {statusConfig?.label || log.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              ¥{log.creditConsumed}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      ページ {page + 1} / {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        前へ
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                      >
                        次へ
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
