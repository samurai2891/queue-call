import { useState } from 'react';
import { useLocation } from 'wouter';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
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
  Download,
} from 'lucide-react';
import { toast } from 'sonner';

import { getLoginUrl } from '@/const';

const PAGE_SIZE = 20;

type SmsStatus = 'pending' | 'sent' | 'delivered' | 'failed';

function formatPhoneNumber(phone: string): string {
  // Mask middle digits for privacy
  if (phone.length > 8) {
    return phone.slice(0, 4) + '****' + phone.slice(-4);
  }
  return phone;
}

function SmsHistoryContent() {

  const [, navigate] = useLocation();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { t, locale } = useLocale();

  const formatMessage = (key: string, params: Record<string, string | number>) => {
    return Object.entries(params).reduce(
      (message, [param, value]) => message.replace(`{${param}}`, String(value)),
      t(key)
    );
  };

  const statusConfig: Record<SmsStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
    pending: { label: t('smsHistory.status.pending'), color: 'bg-yellow-100 text-yellow-800', icon: Clock },
    sent: { label: t('smsHistory.status.sent'), color: 'bg-blue-100 text-blue-800', icon: Send },
    delivered: { label: t('smsHistory.status.delivered'), color: 'bg-green-100 text-green-800', icon: CheckCircle },
    failed: { label: t('smsHistory.status.failed'), color: 'bg-red-100 text-red-800', icon: XCircle },
  };

  const messageTypeLabels: Record<string, string> = {
    call: t('smsHistory.type.call'),
    recall: t('smsHistory.type.recall'),
    reminder: t('smsHistory.type.reminder'),
    custom: t('smsHistory.type.custom'),
  };

  const formatDate = (date: string | Date): string => {
    const d = new Date(date);
    return d.toLocaleString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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

  const exportCsvMutation = trpc.smsLogs.exportCsv.useMutation({
    onError: () => {
      toast.error(t('smsHistory.exportFailed'));
    },
  });

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
            <p className="text-muted-foreground">{t('smsHistory.storeNotFound')}</p>
            <Button className="mt-4" onClick={() => navigate('/admin')}>
              {t('smsHistory.backToDashboard')}
            </Button>

          </CardContent>
        </Card>
      </div>
    );
  }

  const totalLogs = logsData?.total || 0;
  const rangeStart = totalLogs === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, totalLogs);
  const totalPages = Math.ceil(totalLogs / PAGE_SIZE);


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

  const handleExportCsv = async () => {
    if (!store?.id) return;

    try {
      const csvResult = await exportCsvMutation.mutateAsync({
        storeId: store.id,
        status: statusFilter === 'all' ? undefined : statusFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      const csvBlob = new Blob([csvResult.csv], { type: 'text/csv;charset=utf-8;' });
      const downloadUrl = window.URL.createObjectURL(csvBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = csvResult.filename;
      downloadLink.click();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      toast.error(t('smsHistory.exportFailed'));
    }
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
              {t('smsHistory.title')}

            </h1>
            <p className="text-sm text-muted-foreground">{store.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={exportCsvMutation.isPending}
            >
              <Download className="h-4 w-4 mr-2" />
              {exportCsvMutation.isPending
                ? t('smsHistory.exporting')
                : t('smsHistory.exportCsv')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('smsHistory.refresh')}

            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm">{t('smsHistory.statsSent')}</span>

              </div>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-2xl font-bold text-green-600">
                  {formatMessage('smsHistory.messageCount', { count: stats?.totalSent || 0 })}
                </p>

              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{t('smsHistory.statsFailed')}</span>

              </div>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-2xl font-bold text-red-600">
                  {formatMessage('smsHistory.messageCount', { count: stats?.totalFailed || 0 })}
                </p>

              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Wallet className="h-4 w-4" />
                <span className="text-sm">{t('smsHistory.statsCreditsUsed')}</span>

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
                <span className="text-sm">{t('smsHistory.statsCurrentBalance')}</span>

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
              {t('smsHistory.filtersTitle')}

            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{t('smsHistory.filterStatus')}</Label>

                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as SmsStatus | 'all')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('smsHistory.filterAll')}</SelectItem>
                    <SelectItem value="pending">{t('smsHistory.status.pending')}</SelectItem>
                    <SelectItem value="sent">{t('smsHistory.status.sent')}</SelectItem>
                    <SelectItem value="delivered">{t('smsHistory.status.delivered')}</SelectItem>
                    <SelectItem value="failed">{t('smsHistory.status.failed')}</SelectItem>

                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>{t('smsHistory.filterStartDate')}</Label>

                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label>{t('smsHistory.filterEndDate')}</Label>

                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              
              <div className="flex items-end gap-2">
                <Button onClick={handleFilter} className="flex-1">
                  {t('smsHistory.filterSearch')}
                </Button>
                <Button variant="outline" onClick={handleClearFilters}>
                  {t('smsHistory.filterClear')}
                </Button>

              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('smsHistory.logsTitle')}</CardTitle>
            <CardDescription>
              {formatMessage('smsHistory.logsDescription', {
                total: totalLogs,
                start: rangeStart,
                end: rangeEnd,
              })}
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
                <p>{t('smsHistory.logsEmpty')}</p>

              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('smsHistory.tableDate')}</TableHead>
                        <TableHead>{t('smsHistory.tableRecipient')}</TableHead>
                        <TableHead>{t('smsHistory.tableType')}</TableHead>
                        <TableHead>{t('smsHistory.tableMessage')}</TableHead>
                        <TableHead>{t('smsHistory.tableStatus')}</TableHead>
                        <TableHead className="text-right">{t('smsHistory.tableCredits')}</TableHead>

                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logsData?.logs.map((log) => {
                        const currentStatus = statusConfig[log.status as SmsStatus];
                        const StatusIcon = currentStatus?.icon || Clock;

                        
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
                                {messageTypeLabels[log.messageType] || log.messageType}

                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {log.messageContent}
                            </TableCell>
                            <TableCell>
                              <Badge className={currentStatus?.color || ''}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {currentStatus?.label || log.status}
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
                      {formatMessage('smsHistory.paginationLabel', {
                        page: page + 1,
                        totalPages,
                      })}

                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        {t('smsHistory.prevPage')}

                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                      >
                        {t('smsHistory.nextPage')}
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

export default function SmsHistory() {
  return (
    <LocaleProvider defaultLocale="ja" supportedLocales={SUPPORTED_LOCALES}>
      <SmsHistoryContent />
    </LocaleProvider>
  );
}

