import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  CreditCard,
  MessageSquare,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Wallet,
  History,
  Filter,
} from 'lucide-react';

import { getLoginUrl } from '@/const';

const PAGE_SIZE = 20;

type FilterType = 'all' | 'charge' | 'send';

function SmsTransactionsContent() {
  const [, navigate] = useLocation();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { t, locale } = useLocale();

  const [page, setPage] = useState(0);
  const [filterType, setFilterType] = useState<FilterType>('all');

  // Get user's store
  const { data: store, isLoading: storesLoading } = trpc.store.getByOwner.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Get SMS transactions with pagination and filter
  const { data: txData, isLoading: txLoading, refetch: refetchTx } = trpc.stripe.getSmsTransactions.useQuery(
    {
      storeId: store?.id!,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      ...(filterType !== 'all' ? { type: filterType } : {}),
    },
    { enabled: !!store?.id }
  );

  // Get SMS balance
  const { data: balanceData } = trpc.stripe.getSmsBalance.useQuery(
    { storeId: store?.id! },
    { enabled: !!store?.id }
  );

  const formatDate = (date: string | Date | number): string => {
    const d = new Date(date);
    return d.toLocaleString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleFilterChange = (newFilter: FilterType) => {
    setFilterType(newFilter);
    setPage(0); // フィルター変更時にページをリセット
  };

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
            <p className="text-muted-foreground">{t('settings.smsTransactionNoRecords')}</p>
            <Button className="mt-4" onClick={() => navigate('/admin/settings/notifications')}>
              {t('common.back')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const transactions = txData?.transactions ?? [];
  const total = txData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total);

  const filterButtons: { value: FilterType; labelKey: string; icon?: React.ReactNode }[] = [
    { value: 'all', labelKey: 'settings.smsTransactionFilterAll' },
    { value: 'charge', labelKey: 'settings.smsTransactionFilterCharge', icon: <CreditCard className="h-3.5 w-3.5" /> },
    { value: 'send', labelKey: 'settings.smsTransactionFilterSend', icon: <MessageSquare className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/settings/notifications')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <History className="h-5 w-5" />
              {t('settings.smsTransactionHistory')}
            </h1>
            <p className="text-sm text-muted-foreground">{store.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">¥{(balanceData?.balance ?? 0).toLocaleString()}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchTx()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        {/* Filter bar */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center rounded-lg border bg-muted/30 p-1 gap-1">
            {filterButtons.map((btn) => (
              <button
                key={btn.value}
                onClick={() => handleFilterChange(btn.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filterType === btn.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                }`}
              >
                {btn.icon}
                {t(btn.labelKey as any)}
              </button>
            ))}
          </div>
          {filterType !== 'all' && (
            <span className="text-sm text-muted-foreground">
              {total}{t('settings.smsTransactionFilterAll') === 'すべて' ? '件' : ''}
            </span>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            {txLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-12 text-center">
                <History className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">{t('settings.smsTransactionNoRecords')}</p>
                {filterType !== 'all' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => handleFilterChange('all')}
                  >
                    {t('settings.smsTransactionFilterAll')}
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">{t('settings.smsTransactionDate')}</TableHead>
                        <TableHead>{t('settings.smsTransactionType')}</TableHead>
                        <TableHead>{t('settings.smsTransactionDescription')}</TableHead>
                        <TableHead className="text-right">{t('settings.smsTransactionAmount')}</TableHead>
                        <TableHead className="text-right">{t('settings.smsBalanceTitle')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(tx.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={tx.type === 'charge' ? 'default' : 'secondary'}
                              className={tx.type === 'charge' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : ''}
                            >
                              <span className="flex items-center gap-1">
                                {tx.type === 'charge' ? (
                                  <CreditCard className="h-3 w-3" />
                                ) : (
                                  <MessageSquare className="h-3 w-3" />
                                )}
                                {tx.type === 'charge'
                                  ? t('settings.smsTransactionCharge')
                                  : t('settings.smsTransactionSend')}
                              </span>
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                            {tx.description || '-'}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${tx.amount > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {tx.amount > 0 ? '+' : ''}¥{tx.amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            ¥{tx.balanceAfter.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile list */}
                <div className="md:hidden divide-y">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge
                          variant={tx.type === 'charge' ? 'default' : 'secondary'}
                          className={tx.type === 'charge' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : ''}
                        >
                          <span className="flex items-center gap-1">
                            {tx.type === 'charge' ? (
                              <CreditCard className="h-3 w-3" />
                            ) : (
                              <MessageSquare className="h-3 w-3" />
                            )}
                            {tx.type === 'charge'
                              ? t('settings.smsTransactionCharge')
                              : t('settings.smsTransactionSend')}
                          </span>
                        </Badge>
                        <span className={`font-medium ${tx.amount > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {tx.amount > 0 ? '+' : ''}¥{tx.amount.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{formatDate(tx.createdAt)}</span>
                        <span>{t('settings.smsBalanceTitle')}: ¥{tx.balanceAfter.toLocaleString()}</span>
                      </div>
                      {tx.description && (
                        <p className="text-xs text-muted-foreground truncate">{tx.description}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-muted-foreground">
                      {rangeStart}-{rangeEnd} / {total}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 0}
                        onClick={() => setPage(p => p - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {page + 1} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage(p => p + 1)}
                      >
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

export default function SmsTransactions() {
  return (
    <LocaleProvider defaultLocale="ja" supportedLocales={SUPPORTED_LOCALES}>
      <SmsTransactionsContent />
    </LocaleProvider>
  );
}
