import { useParams, useLocation, useSearch } from 'wouter';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { 
  Settings as SettingsIcon, 
  Store, 
  Clock, 
  Bell, 
  Menu, 
  Monitor, 
  Shield,
  Loader2,
  Save,
  RefreshCw,
  ArrowLeft,
  Plus,
  ChevronUp,
  ChevronDown,
  Trash2,
  ImagePlus,
  CreditCard,
  MessageSquare,
  Wallet,
  History,
  ExternalLink,
  Copy,
  CalendarDays,
  QrCode,
  FolderPlus,
  Pencil,
  X,
  Palette,
  RotateCcw,
  Upload,
} from 'lucide-react';

import { toast } from 'sonner';
import { getLoginUrl } from '@/const';
import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';
import { QRCodeGenerator } from '@/components/QRCodeGenerator';
import { VapidSettings } from '@/components/VapidSettings';

const LOCALE_OPTIONS = [
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'zh-Hant', label: '繁體中文' },
];


// SMSチャージ金額オプション
const SMS_CHARGE_OPTIONS = [
  { amount: 5000, label: '¥5,000', messages: 200 },
  { amount: 10000, label: '¥10,000', messages: 400 },
  { amount: 30000, label: '¥30,000', messages: 1200 },
  { amount: 50000, label: '¥50,000', messages: 2000 },
];

const MIN_SMS_CHARGE_AMOUNT = 500;
const MAX_SMS_CHARGE_AMOUNT = 100000;
const SMS_COST_PER_MESSAGE = 25; // 1通あたり25円


// SMS残高カードコンポーネント
function SmsBalanceCard({ storeId, autoChargeEnabled, autoChargeThreshold, autoChargeAmount, onAutoChargeChange }: {
  storeId?: number;
  autoChargeEnabled?: boolean;
  autoChargeThreshold?: number;
  autoChargeAmount?: number;
  onAutoChargeChange?: (field: string, value: any) => void;
}) {
  const { t } = useLocale();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const formatMessage = (key: string, params: Record<string, string | number>) => {
    return Object.entries(params).reduce(
      (message, [param, value]) => message.replace(`{${param}}`, String(value)),
      t(key as any)
    );
  };
  const [isCharging, setIsCharging] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [showChargePrompt, setShowChargePrompt] = useState(false);
  const [chargePromptDismissed, setChargePromptDismissed] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  // 低残高閾値: 自動チャージ設定の閾値と連動（未設定時はデフォルト1000円）
  const lowBalanceThreshold = autoChargeEnabled && autoChargeThreshold ? autoChargeThreshold : 1000;
  const [chargeResult, setChargeResult] = useState<'success' | 'canceled' | null>(null);
  const prevBalanceRef = useRef<number | null>(null);
  const shouldAnimateRef = useRef(false);

  // SMS残高取得
  const { data: balanceData, isLoading: balanceLoading, refetch: refetchBalance } = trpc.stripe.getSmsBalance.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );

  // カウントアップアニメーション
  const { displayValue: animatedBalance, isAnimating, triggerAnimation } = useAnimatedCounter(
    balanceData?.balance ?? 0,
    { duration: 1500 }
  );

  // Stripe Checkoutからのリダイレクト結果を検出
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const chargeStatus = params.get('charge');
    if (chargeStatus === 'success') {
      setChargeResult('success');
      shouldAnimateRef.current = true;
      toast.success(t('settings.smsChargeSuccess'));
      // URLパラメータをクリーンアップ
      const cleanUrl = window.location.pathname + '?tab=notifications';
      window.history.replaceState({}, '', cleanUrl);
      // 残高を再取得してアニメーションを発火
      refetchBalance();
    } else if (chargeStatus === 'canceled') {
      setChargeResult('canceled');
      toast.info(t('settings.smsChargeCanceled'));
      const cleanUrl = window.location.pathname + '?tab=notifications';
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [searchString, t, refetchBalance]);

  // 残高データが更新されたらアニメーションを発火
  useEffect(() => {
    const newBalance = balanceData?.balance ?? 0;
    if (shouldAnimateRef.current && prevBalanceRef.current !== null && newBalance !== prevBalanceRef.current) {
      triggerAnimation(prevBalanceRef.current);
      shouldAnimateRef.current = false;
    }
    prevBalanceRef.current = newBalance;
  }, [balanceData?.balance, triggerAnimation]);
  
  // SMS取引履歴取得
  const { data: transactionsData, isLoading: transactionsLoading } = trpc.stripe.getSmsTransactions.useQuery(
    { storeId: storeId!, limit: 5 },
    { enabled: !!storeId }
  );
  const transactions = transactionsData?.transactions;
  
  // Stripe Checkoutセッション作成
  const createCheckoutSession = trpc.stripe.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      // Stripe Checkoutページにリダイレクト
      window.location.href = data.url;
    },
    onError: (error) => {
      toast.error(`${t('settings.smsChargeStartFailed')}: ${error.message}`);

      setIsCharging(false);
    },
  });
  
  const balance = balanceData?.balance ?? 0;
  const messagesRemaining = Math.floor(balance / SMS_COST_PER_MESSAGE);
  const isLowBalance = balance < lowBalanceThreshold;
  const isCriticalBalance = balance < MIN_SMS_CHARGE_AMOUNT;
  const customAmountValue = Number.parseInt(customAmount, 10);
  const isCustomAmountValid = Number.isFinite(customAmountValue)
    && customAmountValue >= MIN_SMS_CHARGE_AMOUNT
    && customAmountValue <= MAX_SMS_CHARGE_AMOUNT;
  const customMessages = isCustomAmountValid
    ? Math.floor(customAmountValue / SMS_COST_PER_MESSAGE)
    : 0;
  
  // 残高が少ない場合に自動でチャージ促進モーダルを表示
  useEffect(() => {
    if (!isCriticalBalance) {
      if (chargePromptDismissed) {
        setChargePromptDismissed(false);
      }
      return;
    }

    if (isCriticalBalance && !showChargePrompt && !chargePromptDismissed) {
      setShowChargePrompt(true);
    }
  }, [isCriticalBalance, showChargePrompt, chargePromptDismissed]);

  
  const handleCharge = async (amount: number) => {
    if (!storeId) return;
    if (amount < MIN_SMS_CHARGE_AMOUNT || amount > MAX_SMS_CHARGE_AMOUNT) {
      toast.error(
        formatMessage('settings.smsChargeRangeError', {
          min: MIN_SMS_CHARGE_AMOUNT.toLocaleString(),
          max: MAX_SMS_CHARGE_AMOUNT.toLocaleString(),
        })
      );

      return;
    }
    setIsCharging(true);
    setSelectedAmount(amount);
    
    createCheckoutSession.mutate({
      storeId,
      amount,
    });
  };

  
  if (balanceLoading) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    </div>
  );
}



  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <span className="font-medium">{t('settings.smsBalanceTitle')}</span>

          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetchBalance()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        
        {/* チャージ結果バナー */}
        {chargeResult === 'success' && (
          <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-800">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                {t('settings.smsChargeSuccess')}
              </p>
            </div>
            <p className="text-xs text-green-700 dark:text-green-300 mt-1 ml-7">
              {t('settings.smsChargeSuccessHelp')}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 ml-5 text-green-700 dark:text-green-300 hover:text-green-900"
              onClick={() => setChargeResult(null)}
            >
              {t('common.close')}
            </Button>
          </div>
        )}
        {chargeResult === 'canceled' && (
          <div className="mt-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-yellow-500 flex items-center justify-center">
                <X className="h-3 w-3 text-white" />
              </div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                {t('settings.smsChargeCanceled')}
              </p>
            </div>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1 ml-7">
              {t('settings.smsChargeCanceledHelp')}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 ml-5 text-yellow-700 dark:text-yellow-300 hover:text-yellow-900"
              onClick={() => { setChargeResult(null); setShowChargePrompt(true); }}
            >
              {t('settings.smsChargeRetry')}
            </Button>
          </div>
        )}

        <div className="mt-3">
          <div className={`text-3xl font-bold transition-colors duration-500 ${
            isAnimating
              ? 'text-green-600 dark:text-green-400'
              : isLowBalance
                ? 'text-destructive'
                : ''
          }`}>
            <span className={isAnimating ? 'inline-block animate-pulse' : ''}>
              ¥{animatedBalance.toLocaleString()}
            </span>
            {isAnimating && (
              <span className="ml-2 text-sm font-normal text-green-500 animate-bounce inline-block">↑</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatMessage('settings.smsBalanceAvailable', {
              count: messagesRemaining,
              cost: SMS_COST_PER_MESSAGE,
            })}
          </p>

          {isLowBalance && (
            <div className={`mt-2 p-3 rounded-lg ${isCriticalBalance ? 'bg-destructive/10 border border-destructive/30' : 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800'}`}>
              <p className={`text-sm font-medium ${isCriticalBalance ? 'text-destructive' : 'text-yellow-800 dark:text-yellow-200'}`}>
                {isCriticalBalance
                  ? t('settings.smsBalanceCritical')
                  : t('settings.smsBalanceLow')}
              </p>
              <p className={`text-xs mt-1 ${isCriticalBalance ? 'text-destructive/80' : 'text-yellow-700 dark:text-yellow-300'}`}>
                {isCriticalBalance
                  ? t('settings.smsBalanceCriticalHelp')
                  : t('settings.smsBalanceLowHelp')}
              </p>
              {/* 閾値情報 */}
              <p className={`text-xs mt-1 ${isCriticalBalance ? 'text-destructive/60' : 'text-yellow-600 dark:text-yellow-400'}`}>
                {formatMessage('settings.smsLowBalanceThresholdInfo', { threshold: lowBalanceThreshold.toLocaleString() })}
              </p>
              {/* 自動チャージ未設定時の案内 */}
              {!autoChargeEnabled && (
                <p className={`text-xs mt-1 italic ${isCriticalBalance ? 'text-destructive/60' : 'text-yellow-600 dark:text-yellow-400'}`}>
                  {t('settings.smsAutoChargeRecommendation')}
                </p>
              )}
              {/* 自動チャージ有効時のステータス表示 */}
              {autoChargeEnabled && (
                <div className={`text-xs mt-1 flex items-center gap-1 ${isCriticalBalance ? 'text-destructive/60' : 'text-yellow-600 dark:text-yellow-400'}`}>
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  {t('settings.smsAutoChargeActiveStatus')}
                </div>
              )}
              <Button
                size="sm"
                variant={isCriticalBalance ? 'destructive' : 'outline'}
                className="mt-2 w-full"
                onClick={() => setShowChargePrompt(true)}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                {t('settings.smsChargeNow')}
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {/* チャージ促進モーダル */}
      {showChargePrompt && (
        <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="text-center mb-4">
              <div className={`inline-flex p-3 rounded-full ${isCriticalBalance ? 'bg-destructive/10' : 'bg-warning/10'} mb-3`}>
                <Wallet className={`h-8 w-8 ${isCriticalBalance ? 'text-destructive' : 'text-warning'}`} />
              </div>
              <h3 className="text-lg font-bold">
                {isCriticalBalance
                  ? t('settings.smsBalanceModalCriticalTitle')
                  : t('settings.smsBalanceModalTitle')}

              </h3>
              <p className="text-sm text-muted-foreground mt-2">
                {t('settings.smsBalanceCurrentPrefix')}
                <span className="font-bold">¥{balance.toLocaleString()}</span>
                {formatMessage('settings.smsBalanceCurrentSuffix', { count: messagesRemaining })}
              </p>

            </div>
            
            <div className="grid grid-cols-2 gap-2 mb-4">
              {SMS_CHARGE_OPTIONS.map((option) => (
                <Button
                  key={option.amount}
                  variant={option.amount === 10000 ? 'default' : 'outline'}
                  className="flex flex-col h-auto py-3"
                  disabled={isCharging}
                  onClick={() => handleCharge(option.amount)}
                >
                  {isCharging && selectedAmount === option.amount ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span className="font-bold">{option.label}</span>
                      <span className="text-xs opacity-70">
                        {formatMessage('settings.smsChargeMessageCount', { count: option.messages })}
                      </span>

                      {option.amount === 10000 && (
                        <span className="text-xs bg-primary/20 px-2 py-0.5 rounded mt-1">
                          {t('settings.recommended')}
                        </span>

                      )}
                    </>
                  )}
                </Button>
              ))}
            </div>

            <div className="space-y-2 mb-4">
              <Label className="text-sm font-medium">{t('settings.smsCustomAmount')}</Label>

              <div className="flex gap-2">
                <Input
                  type="number"
                  min={MIN_SMS_CHARGE_AMOUNT}
                  max={MAX_SMS_CHARGE_AMOUNT}
                  step={100}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder={formatMessage('settings.smsChargePlaceholder', {
                    min: MIN_SMS_CHARGE_AMOUNT.toLocaleString(),
                  })}

                />
                <Button
                  disabled={isCharging || !isCustomAmountValid}
                  onClick={() => handleCharge(customAmountValue)}
                >
                  {isCharging && selectedAmount === customAmountValue ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t('settings.smsChargeAction')
                  )}

                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatMessage('settings.smsChargeRange', {
                  min: MIN_SMS_CHARGE_AMOUNT.toLocaleString(),
                  max: MAX_SMS_CHARGE_AMOUNT.toLocaleString(),
                })}
                {isCustomAmountValid && (
                  <span className="ml-1">
                    {formatMessage('settings.smsChargeMessageCount', { count: customMessages })}
                  </span>
                )}
              </p>

            </div>
            
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setShowChargePrompt(false);
                setChargePromptDismissed(true);
              }}
            >
              {t('settings.smsChargeLater')}

            </Button>


          </div>
        </div>
      )}
      
      <div className="p-4 space-y-4">
        <div>
          <Label className="text-sm font-medium">{t('settings.smsChargeSelect')}</Label>

          <div className="grid grid-cols-2 gap-2 mt-2">
            {SMS_CHARGE_OPTIONS.map((option) => (
              <Button
                key={option.amount}
                variant="outline"
                className="flex flex-col h-auto py-3"
                disabled={isCharging}
                onClick={() => handleCharge(option.amount)}
              >
                {isCharging && selectedAmount === option.amount ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span className="font-bold">{option.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatMessage('settings.smsChargeMessageCount', { count: option.messages })}
                    </span>

                  </>
                )}
              </Button>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            <Label className="text-sm font-medium">{t('settings.smsCustomAmount')}</Label>

            <div className="flex gap-2">
              <Input
                type="number"
                min={MIN_SMS_CHARGE_AMOUNT}
                max={MAX_SMS_CHARGE_AMOUNT}
                step={100}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder={formatMessage('settings.smsChargePlaceholder', {
                  min: MIN_SMS_CHARGE_AMOUNT.toLocaleString(),
                })}

              />
              <Button
                disabled={isCharging || !isCustomAmountValid}
                onClick={() => handleCharge(customAmountValue)}
              >
                {isCharging && selectedAmount === customAmountValue ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('settings.smsChargeAction')
                )}

              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatMessage('settings.smsChargeRange', {
                min: MIN_SMS_CHARGE_AMOUNT.toLocaleString(),
                max: MAX_SMS_CHARGE_AMOUNT.toLocaleString(),
              })}
              {isCustomAmountValid && (
                <span className="ml-1">
                  {formatMessage('settings.smsChargeMessageCount', { count: customMessages })}
                </span>
              )}
            </p>

          </div>
        </div>

        
        {transactions && transactions.length > 0 && (
          <div>
            <Label className="text-sm font-medium">{t('settings.smsRecentTransactions')}</Label>

            <div className="mt-2 space-y-2">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    {tx.type === 'charge' ? (
                      <CreditCard className="h-4 w-4 text-green-500" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-blue-500" />
                    )}
                    <span className="text-muted-foreground">
                      {tx.type === 'charge'
                        ? t('settings.smsTransactionCharge')
                        : t('settings.smsTransactionSend')}

                    </span>
                  </div>
                  <span className={tx.amount > 0 ? 'text-green-600' : 'text-muted-foreground'}>
                    {tx.amount > 0 ? '+' : ''}¥{tx.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
            {/* 全取引履歴へのリンク */}
            <div className="flex items-center gap-3 mt-2">
              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto text-xs"
                onClick={() => navigate(`/admin/sms-transactions`)}
              >
                {t('settings.smsViewAllTransactions')}
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto text-xs"
                onClick={() => navigate(`/admin/sms-analytics`)}
              >
                {t('settings.smsAnalyticsViewDashboard')}
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        )}
        
        {/* 自動チャージ設定 */}
        {onAutoChargeChange && (
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">{t('settings.smsAutoCharge')}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('settings.smsAutoChargeDescription')}
                </p>
              </div>
              <Switch
                checked={autoChargeEnabled ?? false}
                onCheckedChange={(checked) => onAutoChargeChange('smsAutoChargeEnabled', checked)}
              />
            </div>
            
            {autoChargeEnabled && (
              <div className="mt-3 space-y-3 pl-1">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('settings.smsAutoChargeThreshold')}</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">¥</span>
                    <Input
                      type="number"
                      min={500}
                      max={50000}
                      step={500}
                      value={autoChargeThreshold ?? 1000}
                      onChange={(e) => onAutoChargeChange('smsAutoChargeThreshold', Number(e.target.value))}
                      className="w-32 h-8 text-sm"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.smsAutoChargeThresholdHelp')}
                  </p>
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('settings.smsAutoChargeAmount')}</Label>
                  <Select
                    value={String(autoChargeAmount ?? 5000)}
                    onValueChange={(val) => onAutoChargeChange('smsAutoChargeAmount', Number(val))}
                  >
                    <SelectTrigger className="w-48 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SMS_CHARGE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.amount} value={String(opt.amount)}>
                          {opt.label}（{formatMessage('settings.smsChargeMessageCount', { count: opt.messages })}）
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.smsAutoChargeAmountHelp')}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type MenuItemDraft = {
  nameJa: string;
  descJa: string;
  price: string;
  categoryId: string;
  photoFile?: File | null;
};

type FeedPostDraft = {
  titleJa: string;
  captionJa: string;
  price: string;
  photoFile?: File | null;
};


function SettingsContent() {

  const params = useParams<{ section?: string }>();
  const [, navigate] = useLocation();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const { t } = useLocale();

  const formatMessage = (key: string, params: Record<string, string | number>) => {
    return Object.entries(params).reduce(
      (message, [param, value]) => message.replace(`{${param}}`, String(value)),
      t(key as any)
    );
  };


  const [activeTab, setActiveTab] = useState(params.section || 'general');
  const [isSaving, setIsSaving] = useState(false);
  const [reorderConfirmOpen, setReorderConfirmOpen] = useState(false);

  
  // Form state
  const [formData, setFormData] = useState({

    // General
    name: '',
    slug: '',
    defaultLocale: 'ja',
    supportedLocales: ['ja', 'en'],
    
    // Queue
    dailyResetTime: '04:00',
    checkinGraceMinutes: 5,
    autoSkipEnabled: false,
    autoSkipMinutes: 10,
    enableReorder: false,
    reorderMaxMove: 3,
    reorderReasonRequired: true,
    showEstimatedWaitTime: false,
    showCrowdLevel: false,
    crowdLevelLow: 3,
    crowdLevelModerate: 7,
    crowdLevelBusy: 12,
    maxTicketsPerHour: 50,
    
    // Notifications
    pushEnabled: true,
    smsEnabled: false,
    
    // SMS Auto Charge
    smsAutoChargeEnabled: false,
    smsAutoChargeThreshold: 1000,
    smsAutoChargeAmount: 5000,
    recallLimitSeconds: 60,
    recallMaxCount: 3,
    pushTemplateCalled: t('settings.pushTemplateDefaultCalled'),
    pushTemplateRecall: t('settings.pushTemplateDefaultRecall'),
    smsTemplateCalled: t('settings.smsTemplateDefaultCalled'),
    smsTemplateRecall: t('settings.smsTemplateDefaultRecall'),

    
    // Menu

    menuSwitchStyle: 'toggle',
    menuDefaultView: 'feed',
    photoDefaultSize: 'large',
    allowPhotoSizeToggle: true,
    
    // Kiosk
    kioskAutoResetSeconds: 15,
    kioskMaxPartySize: 10,
    
    // Board
    boardNextCount: 3,
    
    // Reservation
    reservationEnabled: false,
    reservationStartTime: '11:00',
    reservationEndTime: '21:00',
    reservationSlotDuration: 30,
    reservationAvailableDays: [0, 1, 2, 3, 4, 5, 6],
    reservationAdvanceDays: 30,
    reservationMaxPerSlot: 5,
    reservationMaxPartySize: 10,
    reservationAutoConfirm: true,
    reservationSmsReminder: false,
    
    // Security
    staffPin: '',
    managerPin: '',
    
    // Branding
    brandPrimaryColor: '',
    brandSecondaryColor: '',
    brandAccentColor: '',
    
    // Custom Messages
    welcomeMessage: '',
    joinNotice: '',
    ticketMessage: '',
    kioskMessage: '',
    
    // Business Hours
    businessHoursEnabled: false,
    businessHoursTimezone: 'Asia/Tokyo',
    businessHoursSchedule: {
      '0': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
      '1': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
      '2': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
      '3': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
      '4': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
      '5': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
      '6': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
    } as Record<string, { isOpen: boolean; openTime: string; closeTime: string }>,
  });

  const [newMenuItem, setNewMenuItem] = useState<MenuItemDraft>({
    nameJa: '',
    descJa: '',
    price: '',
    categoryId: '',
    photoFile: null,
  });
  const [newFeedPost, setNewFeedPost] = useState<FeedPostDraft>({
    titleJa: '',
    captionJa: '',
    price: '',
    photoFile: null,
  });
  const [menuItemDrafts, setMenuItemDrafts] = useState<Record<number, MenuItemDraft>>({});
  const [feedPostDrafts, setFeedPostDrafts] = useState<Record<number, FeedPostDraft>>({});
  const [menuItemFileKey, setMenuItemFileKey] = useState(0);
  const [feedPostFileKey, setFeedPostFileKey] = useState(0);
  const [isCreatingMenuItem, setIsCreatingMenuItem] = useState(false);
  const [isCreatingFeedPost, setIsCreatingFeedPost] = useState(false);
  const [updatingMenuItemId, setUpdatingMenuItemId] = useState<number | null>(null);
  const [updatingFeedPostId, setUpdatingFeedPostId] = useState<number | null>(null);

  // Category management state
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [updatingCategoryId, setUpdatingCategoryId] = useState<number | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null);

  // Get user's store
  const { data: store, isLoading: storeLoading, refetch: refetchStore } = trpc.store.getByOwner.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: menuCategories, refetch: refetchCategories } = trpc.menu.getCategories.useQuery(
    { storeId: store?.id || 0 },
    { enabled: !!store?.id }
  );

  const { data: adminCategories, refetch: refetchAdminCategories } = trpc.menu.getAdminCategories.useQuery(
    { storeId: store?.id || 0 },
    { enabled: !!store?.id }
  );

  const {
    data: adminItems,
    isLoading: adminItemsLoading,
    refetch: refetchAdminItems,
  } = trpc.menu.getAdminItems.useQuery(
    { storeId: store?.id || 0 },
    { enabled: !!store?.id }
  );

  const {
    data: adminFeedPosts,
    isLoading: adminFeedLoading,
    refetch: refetchAdminFeedPosts,
  } = trpc.menu.getAdminFeed.useQuery(
    { storeId: store?.id || 0 },
    { enabled: !!store?.id }
  );

  const sortedMenuItems = useMemo(() => {
    if (!adminItems) return [];
    return [...adminItems].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [adminItems]);

  // Group menu items by category for display
  const groupedMenuItems = useMemo(() => {
    if (!adminItems) return { categorized: [], uncategorized: [] };
    
    const sortedCategories = adminCategories 
      ? [...adminCategories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      : [];
    
    const categorized: Array<{
      category: typeof sortedCategories[0];
      items: typeof adminItems;
    }> = [];
    
    const uncategorized: typeof adminItems = [];
    
    // Group items by category
    const itemsByCategory = new Map<number, typeof adminItems>();
    adminItems.forEach(item => {
      if (item.categoryId) {
        const existing = itemsByCategory.get(item.categoryId) || [];
        existing.push(item);
        itemsByCategory.set(item.categoryId, existing);
      } else {
        uncategorized.push(item);
      }
    });
    
    // Build categorized array in category sort order
    sortedCategories.forEach(category => {
      const items = itemsByCategory.get(category.id) || [];
      if (items.length > 0) {
        categorized.push({
          category,
          items: items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
        });
      }
    });
    
    return {
      categorized,
      uncategorized: uncategorized.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    };
  }, [adminItems, adminCategories]);

  const sortedFeedPosts = useMemo(() => {
    if (!adminFeedPosts) return [];
    return [...adminFeedPosts].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [adminFeedPosts]);

  const storeUrls = useMemo(() => {
    if (!store) return null;
    const baseUrl = window.location.origin;
    const slug = store.slug;
    return {
      store: `${baseUrl}/s/${slug}`,
      // キオスクもアクセスキー不要
      kiosk: `${baseUrl}/s/${slug}/kiosk/display`,
      // ボードもアクセスキー不要
      board: `${baseUrl}/s/${slug}/board/display`,
      staff: `${baseUrl}/s/${slug}/staff`,
    };
  }, [store]);

  useEffect(() => {

    if (store) {
      const settings = store.settings || {};
      setFormData({
        name: store.name || '',
        slug: store.slug || '',
        defaultLocale: store.defaultLocale || 'ja',
        supportedLocales: store.supportedLocales || ['ja', 'en'],
        
        dailyResetTime: (settings.queue as any)?.dailyResetTime || store.resetTime || '04:00',

        checkinGraceMinutes: settings.queue?.checkinGraceMinutes || 5,
        autoSkipEnabled: settings.queue?.autoSkip ?? true,
        autoSkipMinutes: settings.queue?.checkinGraceMinutes || 5,
        enableReorder: settings.queue?.enableReorder || false,
        reorderMaxMove: settings.queue?.reorderMaxMove || 3,
        reorderReasonRequired: settings.queue?.reorderReasonRequired || true,
        showEstimatedWaitTime: settings.queue?.showEstimatedWaitTime ?? false,
        showCrowdLevel: settings.queue?.showCrowdLevel ?? false,
        crowdLevelLow: settings.queue?.crowdLevelThresholds?.low ?? 3,
        crowdLevelModerate: settings.queue?.crowdLevelThresholds?.moderate ?? 7,
        crowdLevelBusy: settings.queue?.crowdLevelThresholds?.busy ?? 12,
        maxTicketsPerHour: settings.queue?.maxTicketsPerHour ?? 50,
        
        pushEnabled: settings.notifications?.pushEnabled ?? true,
        smsEnabled: settings.notifications?.smsEnabled || false,
        
        smsAutoChargeEnabled: settings.smsAutoCharge?.enabled ?? false,
        smsAutoChargeThreshold: settings.smsAutoCharge?.thresholdBalance ?? 1000,
        smsAutoChargeAmount: settings.smsAutoCharge?.chargeAmount ?? 5000,
        recallLimitSeconds: settings.notifications?.recallLimitSeconds || 60,
        recallMaxCount: settings.notifications?.recallMaxCount || 3,
        pushTemplateCalled: settings.notifications?.pushTemplateCalled || t('settings.pushTemplateDefaultCalled'),
        pushTemplateRecall: settings.notifications?.pushTemplateRecall || t('settings.pushTemplateDefaultRecall'),
        smsTemplateCalled: settings.notifications?.smsTemplateCalled || t('settings.smsTemplateDefaultCalled'),
        smsTemplateRecall: settings.notifications?.smsTemplateRecall || t('settings.smsTemplateDefaultRecall'),

        
        menuSwitchStyle: settings.menu?.switchStyle || 'toggle',

        menuDefaultView: settings.menu?.defaultView || 'feed',
        photoDefaultSize: settings.menu?.photoDefaultSize || 'large',
        allowPhotoSizeToggle: settings.menu?.allowCustomerPhotoSizeToggle ?? true,
        
        kioskAutoResetSeconds: settings.kiosk?.autoResetSeconds || 15,
        kioskMaxPartySize: settings.kiosk?.maxPartySize || 10,
        
        boardNextCount: settings.board?.nextCount || 3,
        
        // Reservation
        reservationEnabled: settings.reservation?.enabled ?? false,
        reservationStartTime: settings.reservation?.timeSlots?.[0] || '11:00',
        reservationEndTime: settings.reservation?.timeSlots?.[settings.reservation?.timeSlots?.length - 1] || '21:00',
        reservationSlotDuration: 30, // デフォルト30分
        reservationAvailableDays: settings.reservation?.availableDays || [0, 1, 2, 3, 4, 5, 6],
        reservationAdvanceDays: settings.reservation?.advanceDays || 30,
        reservationMaxPerSlot: settings.reservation?.maxPerSlot || 5,
        reservationMaxPartySize: settings.reservation?.maxPartySize || 10,
        reservationAutoConfirm: settings.reservation?.autoConfirm ?? true,
        reservationSmsReminder: settings.reservation?.smsReminder ?? false,
        
        staffPin: '',
        managerPin: '',
        
        // Branding
        brandPrimaryColor: settings.branding?.primaryColor || '',
        brandSecondaryColor: settings.branding?.secondaryColor || '',
        brandAccentColor: settings.branding?.accentColor || '',
        
        // Custom Messages
        welcomeMessage: settings.customMessages?.welcomeMessage || '',
        joinNotice: settings.customMessages?.joinNotice || '',
        ticketMessage: settings.customMessages?.ticketMessage || '',
        kioskMessage: settings.customMessages?.kioskMessage || '',
        
        // Business Hours
        businessHoursEnabled: settings.businessHours?.enabled ?? false,
        businessHoursTimezone: settings.businessHours?.timezone || 'Asia/Tokyo',
        businessHoursSchedule: settings.businessHours?.schedule || {
          '0': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '1': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '2': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '3': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '4': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '5': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '6': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
        },
      });
    }
  }, [store]);

  const updateStoreMutation = trpc.store.update.useMutation({
    onSuccess: () => {
      toast.success(t('settings.saveSuccess'));

      refetchStore();
      setIsSaving(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsSaving(false);
    },
  });

  const createStoreMutation = trpc.store.create.useMutation({
    onSuccess: () => {
      toast.success(t('settings.storeCreated'));

      refetchStore();
      setIsSaving(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsSaving(false);
    },
  });



  const createMenuItemMutation = trpc.menu.createItem.useMutation();
  const updateMenuItemMutation = trpc.menu.updateItem.useMutation();
  const deleteMenuItemMutation = trpc.menu.deleteItem.useMutation();
  const createFeedPostMutation = trpc.menu.createFeedPost.useMutation();
  const updateFeedPostMutation = trpc.menu.updateFeedPost.useMutation();
  const deleteFeedPostMutation = trpc.menu.deleteFeedPost.useMutation();

  // Category mutations
  const createCategoryMutation = trpc.menu.createCategory.useMutation();
  const updateCategoryMutation = trpc.menu.updateCategory.useMutation();
  const deleteCategoryMutation = trpc.menu.deleteCategory.useMutation();

  // Logo mutations
  const saveLogoMutation = trpc.store.saveLogo.useMutation({
    onSuccess: () => {
      toast.success(t('settings.logoUploadSuccess'));
      refetchStore();
      setIsUploadingLogo(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsUploadingLogo(false);
    },
  });

  const removeLogoMutation = trpc.store.removeLogo.useMutation({
    onSuccess: () => {
      toast.success(t('settings.logoRemoveSuccess'));
      refetchStore();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !store) return;

    setIsUploadingLogo(true);
    try {
      const result = await uploadImage(file, 'logo', store.id);
      saveLogoMutation.mutate({
        storeId: store.id,
        logoUrl: result.publicUrl,
        logoKey: result.key,
        logoThumbUrl: result.thumbUrl,
        logoThumbKey: result.thumbKey,
        logoOriginalUrl: result.originalUrl,
        logoOriginalKey: result.originalKey,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.logoUploadFailed');
      toast.error(message);
      setIsUploadingLogo(false);
    }
    // Reset file input
    e.target.value = '';
  };

  const handleLogoRemove = () => {
    if (!store) return;
    removeLogoMutation.mutate({ storeId: store.id });
  };

  const handleSave = () => {
    // バリデーション
    if (formData.autoSkipEnabled) {
      if (formData.autoSkipMinutes < 1 || formData.autoSkipMinutes > 60) {
        toast.error(t('settings.autoSkipValidation'));

        return;
      }
    }
    
    setIsSaving(true);
    
    const settings = {
      queue: {
        dailyResetTime: formData.dailyResetTime,
        checkinGraceMinutes: formData.autoSkipMinutes, // 猶予時間を保存
        autoSkip: formData.autoSkipEnabled,
        enableReorder: formData.enableReorder,
        reorderMaxMove: formData.reorderMaxMove,
        reorderReasonRequired: formData.reorderReasonRequired,
        showEstimatedWaitTime: formData.showEstimatedWaitTime,
        showCrowdLevel: formData.showCrowdLevel,
        crowdLevelThresholds: {
          low: formData.crowdLevelLow,
          moderate: formData.crowdLevelModerate,
          busy: formData.crowdLevelBusy,
        },
        maxTicketsPerHour: formData.maxTicketsPerHour,
      },
      notifications: {
        pushEnabled: formData.pushEnabled,
        smsEnabled: formData.smsEnabled,
        recallLimitSeconds: formData.recallLimitSeconds,
        recallMaxCount: formData.recallMaxCount,
        pushTemplateCalled: formData.pushTemplateCalled,
        pushTemplateRecall: formData.pushTemplateRecall,
        smsTemplateCalled: formData.smsTemplateCalled,
        smsTemplateRecall: formData.smsTemplateRecall,
      },

      menu: {
        switchStyle: formData.menuSwitchStyle,
        defaultView: formData.menuDefaultView,
        photoDefaultSize: formData.photoDefaultSize,
        allowPhotoSizeToggle: formData.allowPhotoSizeToggle,
      },
      kiosk: {
        autoResetSeconds: formData.kioskAutoResetSeconds,
        maxPartySize: formData.kioskMaxPartySize,
      },
      board: {
        nextCount: formData.boardNextCount,
      },
      reservation: {
        enabled: formData.reservationEnabled,
        timeSlots: generateTimeSlots(
          formData.reservationStartTime,
          formData.reservationEndTime,
          formData.reservationSlotDuration
        ),
        availableDays: formData.reservationAvailableDays,
        advanceDays: formData.reservationAdvanceDays,
        maxPerSlot: formData.reservationMaxPerSlot,
        maxPartySize: formData.reservationMaxPartySize,
        autoConfirm: formData.reservationAutoConfirm,
        smsReminder: formData.reservationSmsReminder,
      },
      branding: {
        primaryColor: formData.brandPrimaryColor || undefined,
        secondaryColor: formData.brandSecondaryColor || undefined,
        accentColor: formData.brandAccentColor || undefined,
        // Preserve existing logo data (managed separately via saveLogo/removeLogo)
        ...(store?.settings?.branding?.logoUrl ? {
          logoUrl: store.settings.branding.logoUrl,
          logoKey: store.settings.branding.logoKey,
          ...(store.settings.branding.logoThumbUrl && { logoThumbUrl: store.settings.branding.logoThumbUrl }),
          ...(store.settings.branding.logoThumbKey && { logoThumbKey: store.settings.branding.logoThumbKey }),
          ...(store.settings.branding.logoOriginalUrl && { logoOriginalUrl: store.settings.branding.logoOriginalUrl }),
          ...(store.settings.branding.logoOriginalKey && { logoOriginalKey: store.settings.branding.logoOriginalKey }),
        } : {}),
      },
      customMessages: {
        welcomeMessage: formData.welcomeMessage || undefined,
        joinNotice: formData.joinNotice || undefined,
        ticketMessage: formData.ticketMessage || undefined,
        kioskMessage: formData.kioskMessage || undefined,
      },
      businessHours: {
        enabled: formData.businessHoursEnabled,
        timezone: formData.businessHoursTimezone,
        schedule: formData.businessHoursSchedule,
      },
      smsAutoCharge: {
        enabled: formData.smsAutoChargeEnabled,
        thresholdBalance: formData.smsAutoChargeThreshold,
        chargeAmount: formData.smsAutoChargeAmount,
      },
    };

    if (store) {
      updateStoreMutation.mutate({
        storeId: store.id,
        name: formData.name,
        slug: formData.slug,
        defaultLocale: formData.defaultLocale,
        supportedLocales: formData.supportedLocales,
        settings,
        staffPin: formData.staffPin || undefined,
        managerPin: formData.managerPin || undefined,
      });
    } else {
      createStoreMutation.mutate({
        name: formData.name,
        slug: formData.slug,
        defaultLocale: formData.defaultLocale,
        supportedLocales: formData.supportedLocales,
        settings,
        staffPin: formData.staffPin || '1234',
        managerPin: formData.managerPin || '9999',
      });
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleReorderToggle = (checked: boolean) => {
    if (checked && !formData.enableReorder) {
      setReorderConfirmOpen(true);
      return;
    }
    updateField('enableReorder', checked);
  };

  const confirmEnableReorder = () => {
    updateField('enableReorder', true);
    setReorderConfirmOpen(false);
  };


  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('settings.copySuccess'));

    } catch (error) {
      toast.error(t('settings.copyFailed'));

    }
  };

  const parsePrice = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  // 時間枠を生成するヘルパー関数
  const generateTimeSlots = (startTime: string, endTime: string, duration: number): string[] => {
    const slots: string[] = [];
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    let currentMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    while (currentMinutes <= endMinutes) {
      const hours = Math.floor(currentMinutes / 60);
      const mins = currentMinutes % 60;
      slots.push(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`);
      currentMinutes += duration;
    }
    
    return slots;
  };

  const uploadImage = async (file: File, kind: 'menu' | 'feed' | 'logo', storeId: number) => {
    if (!file.type) {
      throw new Error(t('settings.uploadTypeUnknown'));

    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error(t('settings.uploadTypeInvalid'));

    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error(t('settings.uploadSizeExceeded'));

    }

    const presignResponse = await fetch('/api/media/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        mime: file.type,
        size: file.size,
        kind,
        storeId,
      }),
    });

    if (!presignResponse.ok) {
      const message = await presignResponse
        .text()
        .catch(() => t('settings.uploadPrepareFailed'));
      throw new Error(message || t('settings.uploadPrepareFailed'));

    }

    const { uploadUrl, publicUrl, key } = await presignResponse.json();
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      credentials: 'include',
      body: file,
    });

    if (!uploadResponse.ok) {
      const message = await uploadResponse
        .text()
        .catch(() => t('settings.uploadFailed'));
      throw new Error(message || t('settings.uploadFailed'));

    }

    // Upload response may include additional URLs for logo (thumb, original)
    const uploadResult = await uploadResponse.json().catch(() => ({}));
    return {
      publicUrl: publicUrl as string,
      key: key as string,
      thumbUrl: uploadResult.thumbUrl as string | undefined,
      thumbKey: uploadResult.thumbKey as string | undefined,
      originalUrl: uploadResult.originalUrl as string | undefined,
      originalKey: uploadResult.originalKey as string | undefined,
    };
  };

  const getNextSortOrder = (items: Array<{ sortOrder?: number }>) => {
    if (items.length === 0) return 0;
    return Math.max(...items.map(item => item.sortOrder ?? 0)) + 1;
  };

  const updateMenuItemDraft = (item: NonNullable<typeof adminItems>[number], updates: Partial<MenuItemDraft>) => {
    setMenuItemDrafts(prev => {
      const current = prev[item.id] ?? {
        nameJa: item.nameJa ?? '',
        descJa: item.descJa ?? '',
        price: item.price !== null && item.price !== undefined ? String(item.price) : '',
        categoryId: item.categoryId ? String(item.categoryId) : '',
        photoFile: null,
      };
      return { ...prev, [item.id]: { ...current, ...updates } };
    });
  };

  const updateFeedPostDraft = (post: NonNullable<typeof adminFeedPosts>[number], updates: Partial<FeedPostDraft>) => {
    setFeedPostDrafts(prev => {
      const current = prev[post.id] ?? {
        titleJa: post.titleJa ?? '',
        captionJa: post.captionJa ?? '',
        price: post.price !== null && post.price !== undefined ? String(post.price) : '',
        photoFile: null,
      };
      return { ...prev, [post.id]: { ...current, ...updates } };
    });
  };

  // Category management handlers
  const handleCreateCategory = async () => {
    if (!store) return;
    if (!newCategoryName.trim()) {
      toast.error(t('settings.categoryNameRequired'));
      return;
    }

    setIsCreatingCategory(true);
    try {
      const maxSortOrder = adminCategories?.reduce((max, cat) => Math.max(max, cat.sortOrder ?? 0), 0) ?? 0;
      await createCategoryMutation.mutateAsync({
        storeId: store.id,
        nameJa: newCategoryName.trim(),
        sortOrder: maxSortOrder + 1,
      });

      setNewCategoryName('');
      await refetchAdminCategories();
      await refetchCategories();
      toast.success(t('settings.categoryCreateSuccess'));
    } catch (error) {
      console.error('Failed to create category:', error);
      toast.error(t('settings.categoryCreateError'));
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleUpdateCategory = async (categoryId: number) => {
    if (!store) return;
    if (!editingCategoryName.trim()) {
      toast.error(t('settings.categoryNameRequired'));
      return;
    }

    setUpdatingCategoryId(categoryId);
    try {
      await updateCategoryMutation.mutateAsync({
        storeId: store.id,
        categoryId,
        nameJa: editingCategoryName.trim(),
      });

      setEditingCategoryId(null);
      setEditingCategoryName('');
      await refetchAdminCategories();
      await refetchCategories();
      await refetchAdminItems();
      toast.success(t('settings.categoryUpdateSuccess'));
    } catch (error) {
      console.error('Failed to update category:', error);
      toast.error(t('settings.categoryUpdateError'));
    } finally {
      setUpdatingCategoryId(null);
    }
  };

  const handleDeleteCategory = async (categoryId: number) => {
    if (!store) return;

    setDeletingCategoryId(categoryId);
    try {
      await deleteCategoryMutation.mutateAsync({
        storeId: store.id,
        categoryId,
      });

      await refetchAdminCategories();
      await refetchCategories();
      await refetchAdminItems();
      toast.success(t('settings.categoryDeleteSuccess'));
    } catch (error) {
      console.error('Failed to delete category:', error);
      toast.error(t('settings.categoryDeleteError'));
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const handleMoveCategoryUp = async (categoryId: number) => {
    if (!store || !adminCategories) return;
    const sortedCategories = [...adminCategories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const index = sortedCategories.findIndex(c => c.id === categoryId);
    if (index <= 0) return;

    const currentCategory = sortedCategories[index];
    const prevCategory = sortedCategories[index - 1];

    try {
      await updateCategoryMutation.mutateAsync({
        storeId: store.id,
        categoryId: currentCategory.id,
        sortOrder: prevCategory.sortOrder ?? 0,
      });
      await updateCategoryMutation.mutateAsync({
        storeId: store.id,
        categoryId: prevCategory.id,
        sortOrder: currentCategory.sortOrder ?? 0,
      });
      await refetchAdminCategories();
      await refetchCategories();
    } catch (error) {
      console.error('Failed to reorder category:', error);
      toast.error(t('settings.categoryReorderError'));
    }
  };

  const handleMoveCategoryDown = async (categoryId: number) => {
    if (!store || !adminCategories) return;
    const sortedCategories = [...adminCategories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const index = sortedCategories.findIndex(c => c.id === categoryId);
    if (index < 0 || index >= sortedCategories.length - 1) return;

    const currentCategory = sortedCategories[index];
    const nextCategory = sortedCategories[index + 1];

    try {
      await updateCategoryMutation.mutateAsync({
        storeId: store.id,
        categoryId: currentCategory.id,
        sortOrder: nextCategory.sortOrder ?? 0,
      });
      await updateCategoryMutation.mutateAsync({
        storeId: store.id,
        categoryId: nextCategory.id,
        sortOrder: currentCategory.sortOrder ?? 0,
      });
      await refetchAdminCategories();
      await refetchCategories();
    } catch (error) {
      console.error('Failed to reorder category:', error);
      toast.error(t('settings.categoryReorderError'));
    }
  };

  const handleCreateMenuItem = async () => {
    if (!store) return;
    if (!newMenuItem.nameJa.trim()) {
      toast.error(t('settings.menuNameRequired'));

      return;
    }

    setIsCreatingMenuItem(true);
    try {
      let photoUrl: string | undefined;
      let photoThumbUrl: string | undefined;
      if (newMenuItem.photoFile) {
        const result = await uploadImage(newMenuItem.photoFile, 'menu', store.id);
        photoUrl = result.publicUrl;
        photoThumbUrl = result.thumbUrl;
      }

      await createMenuItemMutation.mutateAsync({
        storeId: store.id,
        nameJa: newMenuItem.nameJa.trim(),
        descJa: newMenuItem.descJa.trim() || undefined,
        price: parsePrice(newMenuItem.price),
        categoryId: newMenuItem.categoryId ? Number(newMenuItem.categoryId) : undefined,
        photoLargeUrl: photoUrl,
        photoSmallUrl: photoThumbUrl || photoUrl,
        sortOrder: getNextSortOrder(sortedMenuItems),
      });

      setNewMenuItem({
        nameJa: '',
        descJa: '',
        price: '',
        categoryId: '',
        photoFile: null,
      });
      setMenuItemFileKey(prev => prev + 1);
      await refetchAdminItems();
      toast.success(t('settings.menuCreateSuccess'));

    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.menuCreateFailed');

      toast.error(message);
    } finally {
      setIsCreatingMenuItem(false);
    }
  };

  const handleSaveMenuItem = async (item: NonNullable<typeof adminItems>[number]) => {
    if (!store) return;
    const draft = menuItemDrafts[item.id];
    if (!draft) return;

    setUpdatingMenuItemId(item.id);
    try {
      let photoUrl: string | undefined;
      let photoThumbUrl: string | undefined;
      if (draft.photoFile) {
        const result = await uploadImage(draft.photoFile, 'menu', store.id);
        photoUrl = result.publicUrl;
        photoThumbUrl = result.thumbUrl;
      }

      await updateMenuItemMutation.mutateAsync({
        storeId: store.id,
        itemId: item.id,
        nameJa: draft.nameJa.trim(),
        descJa: draft.descJa.trim() || undefined,
        price: parsePrice(draft.price),
        categoryId: draft.categoryId ? Number(draft.categoryId) : null,
        photoLargeUrl: photoUrl,
        photoSmallUrl: photoThumbUrl || photoUrl,
      });

      setMenuItemDrafts(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await refetchAdminItems();
      toast.success(t('settings.menuUpdateSuccess'));

    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.menuUpdateFailed');

      toast.error(message);
    } finally {
      setUpdatingMenuItemId(null);
    }
  };

  const handleToggleMenuItem = async (itemId: number, isActive: boolean) => {
    if (!store) return;
    try {
      await updateMenuItemMutation.mutateAsync({ storeId: store.id, itemId, isActive });
      await refetchAdminItems();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.statusUpdateFailed');

      toast.error(message);
    }
  };

  const handleMoveMenuItem = async (itemId: number, direction: 'up' | 'down') => {
    if (!store) return;
    const index = sortedMenuItems.findIndex(item => item.id === itemId);
    if (index < 0) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const targetItem = sortedMenuItems[targetIndex];
    const currentItem = sortedMenuItems[index];
    if (!targetItem || !currentItem) return;

    try {
      await updateMenuItemMutation.mutateAsync({
        storeId: store.id,
        itemId: currentItem.id,
        sortOrder: targetIndex,
      });
      await updateMenuItemMutation.mutateAsync({
        storeId: store.id,
        itemId: targetItem.id,
        sortOrder: index,
      });
      await refetchAdminItems();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.sortFailed');

      toast.error(message);
    }
  };

  const handleDeleteMenuItem = async (itemId: number) => {
    if (!store) return;
    if (!window.confirm(t('settings.menuDeleteConfirm'))) return;


    try {
      await deleteMenuItemMutation.mutateAsync({ storeId: store.id, itemId });
      await refetchAdminItems();
      toast.success(t('settings.menuDeleteSuccess'));

    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.deleteFailed');

      toast.error(message);
    }
  };

  const handleCreateFeedPost = async () => {
    if (!store) return;
    if (!newFeedPost.photoFile) {
      toast.error(t('settings.feedImageRequired'));

      return;
    }

    setIsCreatingFeedPost(true);
    try {
      const uploadResult = await uploadImage(newFeedPost.photoFile, 'feed', store.id);
      await createFeedPostMutation.mutateAsync({
        storeId: store.id,
        photoLargeUrl: uploadResult.publicUrl,
        photoSmallUrl: uploadResult.publicUrl,
        titleJa: newFeedPost.titleJa.trim() || undefined,
        captionJa: newFeedPost.captionJa.trim() || undefined,
        price: parsePrice(newFeedPost.price),
        sortOrder: getNextSortOrder(sortedFeedPosts),
      });

      setNewFeedPost({
        titleJa: '',
        captionJa: '',
        price: '',
        photoFile: null,
      });
      setFeedPostFileKey(prev => prev + 1);
      await refetchAdminFeedPosts();
      toast.success(t('settings.feedCreateSuccess'));

    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.feedCreateFailed');

      toast.error(message);
    } finally {
      setIsCreatingFeedPost(false);
    }
  };

  const handleSaveFeedPost = async (post: NonNullable<typeof adminFeedPosts>[number]) => {
    if (!store) return;
    const draft = feedPostDrafts[post.id];
    if (!draft) return;

    setUpdatingFeedPostId(post.id);
    try {
      let photoUrl: string | undefined;
      if (draft.photoFile) {
        const result = await uploadImage(draft.photoFile, 'feed', store.id);
        photoUrl = result.publicUrl;
      }

      await updateFeedPostMutation.mutateAsync({
        storeId: store.id,
        feedPostId: post.id,
        titleJa: draft.titleJa.trim() || undefined,
        captionJa: draft.captionJa.trim() || undefined,
        price: parsePrice(draft.price),
        photoLargeUrl: photoUrl,
        photoSmallUrl: photoUrl,
      });

      setFeedPostDrafts(prev => {
        const next = { ...prev };
        delete next[post.id];
        return next;
      });
      await refetchAdminFeedPosts();
      toast.success(t('settings.feedUpdateSuccess'));

    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.feedUpdateFailed');

      toast.error(message);
    } finally {
      setUpdatingFeedPostId(null);
    }
  };

  const handleToggleFeedPost = async (feedPostId: number, isActive: boolean) => {
    if (!store) return;
    try {
      await updateFeedPostMutation.mutateAsync({ storeId: store.id, feedPostId, isActive });
      await refetchAdminFeedPosts();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.statusUpdateFailed');

      toast.error(message);
    }
  };

  const handleMoveFeedPost = async (feedPostId: number, direction: 'up' | 'down') => {
    if (!store) return;
    const index = sortedFeedPosts.findIndex(post => post.id === feedPostId);
    if (index < 0) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const targetPost = sortedFeedPosts[targetIndex];
    const currentPost = sortedFeedPosts[index];
    if (!targetPost || !currentPost) return;

    try {
      await updateFeedPostMutation.mutateAsync({
        storeId: store.id,
        feedPostId: currentPost.id,
        sortOrder: targetIndex,
      });
      await updateFeedPostMutation.mutateAsync({
        storeId: store.id,
        feedPostId: targetPost.id,
        sortOrder: index,
      });
      await refetchAdminFeedPosts();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.sortFailed');

      toast.error(message);
    }
  };

  const handleDeleteFeedPost = async (feedPostId: number) => {
    if (!store) return;
    if (!window.confirm(t('settings.feedDeleteConfirm'))) return;


    try {
      await deleteFeedPostMutation.mutateAsync({ storeId: store.id, feedPostId });
      await refetchAdminFeedPosts();
      toast.success(t('settings.feedDeleteSuccess'));

    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.deleteFailed');

      toast.error(message);
    }
  };

  if (authLoading || storeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <SettingsIcon className="h-16 w-16 text-muted-foreground" />
        <h1 className="text-2xl font-bold">{t('settings.loginRequiredTitle')}</h1>
        <p className="text-muted-foreground">{t('settings.loginRequiredDescription')}</p>
        <Button onClick={() => window.location.href = getLoginUrl()}>
          {t('common.login')}
        </Button>

      </div>
    );
  }

  const tabs = [
    { id: 'general', label: t('settings.general'), icon: Store },
    { id: 'queue', label: t('settings.queue'), icon: Clock },
    { id: 'notifications', label: t('settings.notifications'), icon: Bell },
    { id: 'menu', label: t('settings.menu'), icon: Menu },
    { id: 'kiosk', label: t('settings.kiosk'), icon: Monitor },
    { id: 'board', label: t('settings.board'), icon: Monitor },
    { id: 'reservation', label: t('settings.reservation'), icon: CalendarDays },
    { id: 'branding', label: t('settings.branding'), icon: Palette },
    { id: 'messages', label: t('settings.customMessages'), icon: MessageSquare },
    { id: 'businessHours', label: t('settings.businessHours'), icon: Clock },
    { id: 'qrcode', label: t('settings.qrcode'), icon: QrCode },
    { id: 'security', label: t('settings.security'), icon: Shield },
    { id: 'billing', label: t('settings.billing') || 'プラン・お支払い', icon: CreditCard },
  ];



  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">{t('settings.title')}</h1>

          </div>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t('common.save')}
          </Button>

        </div>
      </header>

      <main className="container py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Mobile: Dropdown Select */}
          <div className="md:hidden">
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="w-full h-12">
                <SelectValue>
                  {(() => {
                    const currentTab = tabs.find(tab => tab.id === activeTab);
                    if (currentTab) {
                      const IconComponent = currentTab.icon;
                      return (
                        <div className="flex items-center gap-3">
                          <IconComponent className="h-5 w-5" />
                          <span>{currentTab.label}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {tabs.map(tab => {
                  const IconComponent = tab.icon;
                  return (
                    <SelectItem key={tab.id} value={tab.id} className="h-12">
                      <div className="flex items-center gap-3">
                        <IconComponent className="h-5 w-5" />
                        <span>{tab.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop: Tab List */}
          <TabsList className="hidden md:flex flex-wrap justify-start gap-2 h-auto p-2">
            {tabs.map(tab => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex flex-col gap-1 py-2 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <tab.icon className="h-4 w-4" />
                <span className="text-xs">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.general')}</CardTitle>
                <CardDescription>{t('settings.generalDescription')}</CardDescription>

              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('settings.storeName')}</Label>

                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      placeholder={t('settings.storeNamePlaceholder')}

                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">{t('settings.slugLabel')}</Label>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">/s/</span>
                      <Input
                        id="slug"
                        value={formData.slug}
                        onChange={(e) => updateField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        placeholder="my-store"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-medium">{t('settings.languageSettings')}</h3>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="defaultLocale">{t('settings.defaultLocale')}</Label>

                      <Select
                        value={formData.defaultLocale}
                        onValueChange={(value) => updateField('defaultLocale', value)}
                      >
                        <SelectTrigger id="defaultLocale">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LOCALE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('settings.supportedLocales')}</Label>

                      <div className="flex flex-wrap gap-2">
                        {LOCALE_OPTIONS.map(opt => (
                          <Button
                            key={opt.value}
                            variant={formData.supportedLocales.includes(opt.value) ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                              const newLocales = formData.supportedLocales.includes(opt.value)
                                ? formData.supportedLocales.filter(l => l !== opt.value)
                                : [...formData.supportedLocales, opt.value];
                              updateField('supportedLocales', newLocales);
                            }}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Queue Settings */}
          <TabsContent value="queue">
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.queue')}</CardTitle>
                <CardDescription>{t('settings.queueDescription')}</CardDescription>

              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="dailyResetTime">{t('settings.resetTime')}</Label>

                    <Input
                      id="dailyResetTime"
                      type="time"
                      value={formData.dailyResetTime}
                      onChange={(e) => updateField('dailyResetTime', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="checkinGraceMinutes">{t('settings.checkinGraceMinutes')}</Label>

                    <Input
                      id="checkinGraceMinutes"
                      type="number"
                      min={1}
                      max={30}
                      value={Number.isNaN(formData.checkinGraceMinutes) ? '' : formData.checkinGraceMinutes}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        updateField('checkinGraceMinutes', Number.isNaN(val) ? 5 : val);
                      }}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="maxTicketsPerHour">{t('settings.maxTicketsPerHour')}</Label>
                    <Input
                      id="maxTicketsPerHour"
                      type="number"
                      min={10}
                      max={500}
                      value={Number.isNaN(formData.maxTicketsPerHour) ? '' : formData.maxTicketsPerHour}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        updateField('maxTicketsPerHour', Number.isNaN(val) ? 50 : val);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">{t('settings.maxTicketsPerHourHelp')}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('settings.autoSkip')}</Label>
                      <p className="text-sm text-muted-foreground">{t('settings.autoSkipDescription')}</p>

                    </div>
                    <Switch
                      checked={formData.autoSkipEnabled}
                      onCheckedChange={(checked) => updateField('autoSkipEnabled', checked)}
                    />
                  </div>
                  {formData.autoSkipEnabled && (
                    <div className="space-y-2 ml-4">
                      <Label htmlFor="autoSkipMinutes">{t('settings.autoSkipMinutes')}</Label>

                      <Input
                        id="autoSkipMinutes"
                        type="number"
                        min={1}
                        max={60}
                        value={Number.isNaN(formData.autoSkipMinutes) ? '' : formData.autoSkipMinutes}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          updateField('autoSkipMinutes', Number.isNaN(val) ? 5 : val);
                        }}
                        className="w-32"
                      />
                      <p className="text-xs text-muted-foreground">{t('settings.autoSkipHelp')}</p>

                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('settings.enableReorder')}</Label>
                      <p className="text-sm text-muted-foreground">{t('settings.enableReorderDescription')}</p>

                    </div>
                    <Switch
                      checked={formData.enableReorder}
                      onCheckedChange={handleReorderToggle}
                    />

                  </div>
                  {formData.enableReorder && (
                    <div className="grid gap-4 md:grid-cols-2 ml-4">
                      <div className="space-y-2">
                        <Label htmlFor="reorderMaxMove">{t('settings.reorderMaxMove')}</Label>

                        <Input
                          id="reorderMaxMove"
                          type="number"
                          min={1}
                          max={10}
                          value={Number.isNaN(formData.reorderMaxMove) ? '' : formData.reorderMaxMove}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            updateField('reorderMaxMove', Number.isNaN(val) ? 3 : val);
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="reorderReasonRequired"
                          checked={formData.reorderReasonRequired}
                          onCheckedChange={(checked) => updateField('reorderReasonRequired', checked)}
                        />
                        <Label htmlFor="reorderReasonRequired">{t('settings.reorderReasonRequired')}</Label>

                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('settings.showEstimatedWaitTime')}</Label>
                      <p className="text-sm text-muted-foreground">{t('settings.showEstimatedWaitTimeDescription')}</p>
                    </div>
                    <Switch
                      checked={formData.showEstimatedWaitTime}
                      onCheckedChange={(checked) => updateField('showEstimatedWaitTime', checked)}
                    />
                  </div>
                </div>

                <Separator />

                {/* 混雑状況表示設定 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('settings.showCrowdLevel')}</Label>
                      <p className="text-sm text-muted-foreground">{t('settings.showCrowdLevelDescription')}</p>
                    </div>
                    <Switch
                      checked={formData.showCrowdLevel}
                      onCheckedChange={(checked) => updateField('showCrowdLevel', checked)}
                    />
                  </div>

                  {formData.showCrowdLevel && (
                    <div className="space-y-4 pl-4 border-l-2 border-muted">
                      <p className="text-sm font-medium text-muted-foreground">{t('settings.crowdLevelThresholds')}</p>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="text-green-600">{t('settings.crowdLevelLow')}</Label>
                          <Input
                            type="number"
                            min="1"
                            max="100"
                            value={formData.crowdLevelLow}
                            onChange={(e) => updateField('crowdLevelLow', parseInt(e.target.value) || 3)}
                          />
                          <p className="text-xs text-muted-foreground">{t('settings.crowdLevelLowDescription')}</p>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-yellow-600">{t('settings.crowdLevelModerate')}</Label>
                          <Input
                            type="number"
                            min="1"
                            max="100"
                            value={formData.crowdLevelModerate}
                            onChange={(e) => updateField('crowdLevelModerate', parseInt(e.target.value) || 7)}
                          />
                          <p className="text-xs text-muted-foreground">{t('settings.crowdLevelModerateDescription')}</p>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-orange-600">{t('settings.crowdLevelBusy')}</Label>
                          <Input
                            type="number"
                            min="1"
                            max="100"
                            value={formData.crowdLevelBusy}
                            onChange={(e) => updateField('crowdLevelBusy', parseInt(e.target.value) || 12)}
                          />
                          <p className="text-xs text-muted-foreground">{t('settings.crowdLevelBusyDescription')}</p>
                        </div>
                      </div>
                      
                      <p className="text-xs text-muted-foreground">{t('settings.crowdLevelCrowdedDescription')}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notification Settings */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.notifications')}</CardTitle>
                <CardDescription>{t('settings.notificationsDescription')}</CardDescription>

              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                      <Label>{t('settings.pushEnabled')}</Label>
                      <p className="text-sm text-muted-foreground">{t('settings.pushEnabledDescription')}</p>

                  </div>
                  <Switch
                    checked={formData.pushEnabled}
                    onCheckedChange={(checked) => updateField('pushEnabled', checked)}
                  />
                </div>

                {formData.pushEnabled && (
                  <div className="space-y-4 ml-4">
                    <div className="space-y-2">
                      <Label htmlFor="pushTemplateCalled">{t('settings.pushTemplateCalled')}</Label>
                      <Textarea
                        id="pushTemplateCalled"
                        value={formData.pushTemplateCalled}
                        onChange={(e) => updateField('pushTemplateCalled', e.target.value)}
                        placeholder={t('settings.pushTemplateVariables')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pushTemplateRecall">{t('settings.pushTemplateRecall')}</Label>
                      <Textarea
                        id="pushTemplateRecall"
                        value={formData.pushTemplateRecall}
                        onChange={(e) => updateField('pushTemplateRecall', e.target.value)}
                        placeholder={t('settings.pushTemplateVariables')}
                      />
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-4">

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('settings.smsEnabled')}</Label>
                      <p className="text-sm text-muted-foreground">{t('settings.smsEnabledDescription')}</p>

                    </div>
                    <Switch
                      checked={formData.smsEnabled}
                      onCheckedChange={(checked) => updateField('smsEnabled', checked)}
                    />
                  </div>
                  {formData.smsEnabled && (
                    <div className="space-y-4 ml-4">
                      {/* SMS残高表示 */}
                      <SmsBalanceCard
                        storeId={store?.id}
                        autoChargeEnabled={formData.smsAutoChargeEnabled}
                        autoChargeThreshold={formData.smsAutoChargeThreshold}
                        autoChargeAmount={formData.smsAutoChargeAmount}
                        onAutoChargeChange={updateField}
                      />
                      
                      <div className="space-y-2">
                        <Label htmlFor="smsTemplateCalled">{t('settings.smsTemplateCalled')}</Label>

                        <Textarea
                          id="smsTemplateCalled"
                          value={formData.smsTemplateCalled}
                          onChange={(e) => updateField('smsTemplateCalled', e.target.value)}
                          placeholder={t('settings.smsTemplateVariables')}
                        />

                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smsTemplateRecall">{t('settings.smsTemplateRecall')}</Label>

                        <Textarea
                          id="smsTemplateRecall"
                          value={formData.smsTemplateRecall}
                          onChange={(e) => updateField('smsTemplateRecall', e.target.value)}
                          placeholder={t('settings.smsTemplateVariables')}
                        />

                      </div>
                      
                      {/* SMS送信履歴へのリンク */}
                      <div className="pt-4 border-t">
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => navigate('/admin/sms-history')}
                        >
                          <History className="h-4 w-4 mr-2" />
                          {t('settings.smsHistoryLink')}

                          <ExternalLink className="h-4 w-4 ml-auto" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="recallLimitSeconds">{t('settings.recallLimit')}</Label>

                    <Input
                      id="recallLimitSeconds"
                      type="number"
                      min={30}
                      max={300}
                      value={Number.isNaN(formData.recallLimitSeconds) ? '' : formData.recallLimitSeconds}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        updateField('recallLimitSeconds', Number.isNaN(val) ? 60 : val);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recallMaxCount">{t('settings.recallMaxCount')}</Label>

                    <Input
                      id="recallMaxCount"
                      type="number"
                      min={1}
                      max={10}
                      value={Number.isNaN(formData.recallMaxCount) ? '' : formData.recallMaxCount}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        updateField('recallMaxCount', Number.isNaN(val) ? 3 : val);
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Menu Settings */}
          <TabsContent value="menu">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('settings.menu')}</CardTitle>
                  <CardDescription>{t('settings.menuDescription')}</CardDescription>

                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="menuSwitchStyle">{t('settings.menuSwitchStyle')}</Label>

                      <Select
                        value={formData.menuSwitchStyle}
                        onValueChange={(value) => updateField('menuSwitchStyle', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="toggle">{t('settings.menuSwitchToggle')}</SelectItem>
                          <SelectItem value="tabs">{t('settings.menuSwitchTabs')}</SelectItem>

                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="menuDefaultView">{t('settings.defaultView')}</Label>

                      <Select
                        value={formData.menuDefaultView}
                        onValueChange={(value) => updateField('menuDefaultView', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="feed">{t('menu.feed')}</SelectItem>
                          <SelectItem value="list">{t('menu.list')}</SelectItem>

                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="photoDefaultSize">{t('settings.photoDefaultSize')}</Label>

                      <Select
                        value={formData.photoDefaultSize}
                        onValueChange={(value) => updateField('photoDefaultSize', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="large">{t('menu.large')}</SelectItem>
                          <SelectItem value="small">{t('menu.small')}</SelectItem>

                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="allowPhotoSizeToggle"
                        checked={formData.allowPhotoSizeToggle}
                        onCheckedChange={(checked) => updateField('allowPhotoSizeToggle', checked)}
                      />
                      <Label htmlFor="allowPhotoSizeToggle">{t('settings.allowPhotoSizeToggle')}</Label>

                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Category Management Card */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('settings.categoryManagement')}</CardTitle>
                  <CardDescription>{t('settings.categoryManagementDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Add new category */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <FolderPlus className="h-4 w-4" />
                      {t('settings.categoryAddNew')}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder={t('settings.categoryNamePlaceholder')}
                        className="flex-1"
                      />
                      <Button
                        onClick={handleCreateCategory}
                        disabled={isCreatingCategory || createCategoryMutation.isPending}
                      >
                        {isCreatingCategory ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        {t('common.add')}
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {/* Category list */}
                  <div className="space-y-2">
                    {!adminCategories || adminCategories.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('settings.categoryNoCategories')}</p>
                    ) : (
                      [...adminCategories]
                        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                        .map((category, index, sortedArr) => {
                          const itemCount = adminItems?.filter(item => item.categoryId === category.id).length ?? 0;
                          const isEditing = editingCategoryId === category.id;

                          return (
                            <div
                              key={category.id}
                              className="flex items-center gap-2 rounded-lg border p-3"
                            >
                              {isEditing ? (
                                <>
                                  <Input
                                    value={editingCategoryName}
                                    onChange={(e) => setEditingCategoryName(e.target.value)}
                                    className="flex-1"
                                    autoFocus
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateCategory(category.id)}
                                    disabled={updatingCategoryId === category.id}
                                  >
                                    {updatingCategoryId === category.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Save className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingCategoryId(null);
                                      setEditingCategoryName('');
                                    }}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <div className="flex-1">
                                    <span className="font-medium">{category.nameJa}</span>
                                    <span className="ml-2 text-sm text-muted-foreground">
                                      ({formatMessage('settings.categoryItemCount', { count: itemCount })})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleMoveCategoryUp(category.id)}
                                      disabled={index === 0}
                                    >
                                      <ChevronUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleMoveCategoryDown(category.id)}
                                      disabled={index === sortedArr.length - 1}
                                    >
                                      <ChevronDown className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => {
                                        setEditingCategoryId(category.id);
                                        setEditingCategoryName(category.nameJa ?? '');
                                      }}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() => {
                                        if (confirm(t('settings.categoryDeleteConfirm'))) {
                                          handleDeleteCategory(category.id);
                                        }
                                      }}
                                      disabled={deletingCategoryId === category.id}
                                    >
                                      {deletingCategoryId === category.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('settings.menuListTitle')}</CardTitle>
                  <CardDescription>{t('settings.menuListDescription')}</CardDescription>

                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <ImagePlus className="h-4 w-4" />
                      {t('settings.menuAddNew')}

                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="newMenuName">{t('settings.menuItemName')}</Label>

                        <Input
                          id="newMenuName"
                          value={newMenuItem.nameJa}
                          onChange={(e) => setNewMenuItem(prev => ({ ...prev, nameJa: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newMenuPrice">{t('settings.menuItemPrice')}</Label>

                        <Input
                          id="newMenuPrice"
                          type="number"
                          min={0}
                          value={newMenuItem.price}
                          onChange={(e) => setNewMenuItem(prev => ({ ...prev, price: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newMenuDesc">{t('settings.menuItemDescription')}</Label>

                      <Textarea
                        id="newMenuDesc"
                        value={newMenuItem.descJa}
                        onChange={(e) => setNewMenuItem(prev => ({ ...prev, descJa: e.target.value }))}
                      />
                    </div>
                    {menuCategories && menuCategories.length > 0 && (
                      <div className="space-y-2">
                        <Label htmlFor="newMenuCategory">{t('settings.menuItemCategory')}</Label>

                        <Select
                          value={newMenuItem.categoryId || 'none'}
                          onValueChange={(value) =>
                            setNewMenuItem(prev => ({ ...prev, categoryId: value === 'none' ? '' : value }))
                          }
                        >
                          <SelectTrigger id="newMenuCategory">
                            <SelectValue placeholder={t('settings.menuItemCategoryNone')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t('settings.menuItemCategoryNone')}</SelectItem>

                            {menuCategories.map(category => (
                              <SelectItem key={category.id} value={String(category.id)}>
                                {category.nameJa}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="newMenuPhoto">{t('settings.menuItemPhoto')}</Label>

                      <Input
                        key={menuItemFileKey}
                        id="newMenuPhoto"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) =>
                          setNewMenuItem(prev => ({
                            ...prev,
                            photoFile: e.target.files?.[0] ?? null,
                          }))
                        }
                      />
                      <p className="text-xs text-muted-foreground">{t('settings.menuItemPhotoHelp')}</p>

                    </div>
                    <Button onClick={handleCreateMenuItem} disabled={isCreatingMenuItem || createMenuItemMutation.isPending}>
                      {isCreatingMenuItem ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      {t('common.add')}
                    </Button>

                  </div>

                  <Separator />

                  <div className="space-y-4">
                    {adminItemsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('common.loading')}
                      </div>

                    ) : sortedMenuItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('settings.menuNoItems')}</p>

                    ) : (
                      sortedMenuItems.map((item, index) => {
                        const draft = menuItemDrafts[item.id] ?? {
                          nameJa: item.nameJa ?? '',
                          descJa: item.descJa ?? '',
                          price: item.price !== null && item.price !== undefined ? String(item.price) : '',
                          categoryId: item.categoryId ? String(item.categoryId) : '',
                          photoFile: null,
                        };

                        return (
                          <div
                            key={item.id}
                            className={`rounded-lg border p-4 ${item.isActive ? '' : 'opacity-60'}`}
                          >
                            <div className="flex flex-col gap-4 md:flex-row">
                              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                                {item.photoLargeUrl ? (
                                  <img
                                    src={item.photoSmallUrl || item.photoLargeUrl}
                                    alt={item.nameJa ?? ''}
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                    {t('common.noImage')}
                                  </div>
                                )}

                              </div>
                              <div className="flex-1 space-y-3">
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-1">
                                    <Label>{t('settings.menuItemName')}</Label>
                                    <Input
                                      value={draft.nameJa}
                                      onChange={(e) => updateMenuItemDraft(item, { nameJa: e.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>{t('settings.menuItemPrice')}</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      value={draft.price}
                                      onChange={(e) => updateMenuItemDraft(item, { price: e.target.value })}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label>{t('settings.menuItemDescription')}</Label>
                                  <Textarea
                                    value={draft.descJa}
                                    onChange={(e) => updateMenuItemDraft(item, { descJa: e.target.value })}
                                  />
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                  {menuCategories && menuCategories.length > 0 && (
                                    <div className="space-y-1">
                                      <Label>{t('settings.menuItemCategory')}</Label>
                                      <Select
                                        value={draft.categoryId || 'none'}
                                        onValueChange={(value) =>
                                          updateMenuItemDraft(item, { categoryId: value === 'none' ? '' : value })
                                        }
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder={t('settings.menuItemCategoryNone')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">{t('settings.menuItemCategoryNone')}</SelectItem>
                                          {menuCategories.map(category => (
                                            <SelectItem key={category.id} value={String(category.id)}>
                                              {category.nameJa}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                  <div className="space-y-1">
                                    <Label>{t('settings.imageUpdate')}</Label>
                                    <Input
                                      type="file"
                                      accept="image/jpeg,image/png,image/webp"
                                      onChange={(e) =>
                                        updateMenuItemDraft(item, { photoFile: e.target.files?.[0] ?? null })
                                      }
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={item.isActive}
                                      onCheckedChange={(checked) => handleToggleMenuItem(item.id, checked)}
                                    />
                                    <span className="text-sm">{t('common.published')}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      onClick={() => handleMoveMenuItem(item.id, 'up')}
                                      disabled={index === 0}
                                    >
                                      <ChevronUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      onClick={() => handleMoveMenuItem(item.id, 'down')}
                                      disabled={index === sortedMenuItems.length - 1}
                                    >
                                      <ChevronDown className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => handleSaveMenuItem(item)}
                                    disabled={updatingMenuItemId === item.id}
                                  >
                                    {updatingMenuItemId === item.id ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <Save className="mr-2 h-4 w-4" />
                                    )}
                                    {t('common.save')}
                                  </Button>

                                  <Button variant="destructive" size="sm" onClick={() => handleDeleteMenuItem(item.id)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {t('common.delete')}
                                  </Button>

                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('settings.feedListTitle')}</CardTitle>
                  <CardDescription>{t('settings.feedListDescription')}</CardDescription>

                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <ImagePlus className="h-4 w-4" />
                      {t('settings.feedAddNew')}

                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="newFeedTitle">{t('settings.feedTitleLabel')}</Label>

                        <Input
                          id="newFeedTitle"
                          value={newFeedPost.titleJa}
                          onChange={(e) => setNewFeedPost(prev => ({ ...prev, titleJa: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newFeedPrice">{t('settings.menuItemPrice')}</Label>

                        <Input
                          id="newFeedPrice"
                          type="number"
                          min={0}
                          value={newFeedPost.price}
                          onChange={(e) => setNewFeedPost(prev => ({ ...prev, price: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newFeedCaption">{t('settings.feedCaptionLabel')}</Label>

                      <Textarea
                        id="newFeedCaption"
                        value={newFeedPost.captionJa}
                        onChange={(e) => setNewFeedPost(prev => ({ ...prev, captionJa: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newFeedPhoto">{t('settings.menuItemPhoto')}</Label>

                      <Input
                        key={feedPostFileKey}
                        id="newFeedPhoto"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) =>
                          setNewFeedPost(prev => ({
                            ...prev,
                            photoFile: e.target.files?.[0] ?? null,
                          }))
                        }
                      />
                      <p className="text-xs text-muted-foreground">{t('settings.menuItemPhotoHelp')}</p>

                    </div>
                    <Button onClick={handleCreateFeedPost} disabled={isCreatingFeedPost || createFeedPostMutation.isPending}>
                      {isCreatingFeedPost ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      {t('common.add')}
                    </Button>

                  </div>

                  <Separator />

                  <div className="space-y-4">
                    {adminFeedLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('common.loading')}
                      </div>

                    ) : sortedFeedPosts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('settings.feedNoItems')}</p>

                    ) : (
                      sortedFeedPosts.map((post, index) => {
                        const draft = feedPostDrafts[post.id] ?? {
                          titleJa: post.titleJa ?? '',
                          captionJa: post.captionJa ?? '',
                          price: post.price !== null && post.price !== undefined ? String(post.price) : '',
                          photoFile: null,
                        };

                        return (
                          <div
                            key={post.id}
                            className={`rounded-lg border p-4 ${post.isActive ? '' : 'opacity-60'}`}
                          >
                            <div className="flex flex-col gap-4 md:flex-row">
                              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                                {post.photoLargeUrl ? (
                                  <img
                                    src={post.photoSmallUrl || post.photoLargeUrl}
                                    alt={post.titleJa ?? ''}
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                    {t('common.noImage')}
                                  </div>
                                )}

                              </div>
                              <div className="flex-1 space-y-3">
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-1">
                                    <Label>{t('settings.feedTitleLabel')}</Label>
                                    <Input
                                      value={draft.titleJa}
                                      onChange={(e) => updateFeedPostDraft(post, { titleJa: e.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>{t('settings.menuItemPrice')}</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      value={draft.price}
                                      onChange={(e) => updateFeedPostDraft(post, { price: e.target.value })}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label>{t('settings.feedCaptionLabel')}</Label>
                                  <Textarea
                                    value={draft.captionJa}
                                    onChange={(e) => updateFeedPostDraft(post, { captionJa: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>{t('settings.imageUpdate')}</Label>
                                  <Input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={(e) => updateFeedPostDraft(post, { photoFile: e.target.files?.[0] ?? null })}
                                  />
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={post.isActive}
                                      onCheckedChange={(checked) => handleToggleFeedPost(post.id, checked)}
                                    />
                                    <span className="text-sm">{t('common.published')}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      onClick={() => handleMoveFeedPost(post.id, 'up')}
                                      disabled={index === 0}
                                    >
                                      <ChevronUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      onClick={() => handleMoveFeedPost(post.id, 'down')}
                                      disabled={index === sortedFeedPosts.length - 1}
                                    >
                                      <ChevronDown className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => handleSaveFeedPost(post)}
                                    disabled={updatingFeedPostId === post.id}
                                  >
                                    {updatingFeedPostId === post.id ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <Save className="mr-2 h-4 w-4" />
                                    )}
                                    {t('common.save')}
                                  </Button>

                                  <Button variant="destructive" size="sm" onClick={() => handleDeleteFeedPost(post.id)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {t('common.delete')}
                                  </Button>

                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Kiosk Settings */}
          <TabsContent value="kiosk">
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.kiosk')}</CardTitle>
                <CardDescription>{t('settings.kioskDescription')}</CardDescription>

              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="kioskAutoResetSeconds">{t('settings.kioskAutoReset')}</Label>

                    <Input
                      id="kioskAutoResetSeconds"
                      type="number"
                      min={5}
                      max={60}
                      value={Number.isNaN(formData.kioskAutoResetSeconds) ? '' : formData.kioskAutoResetSeconds}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        updateField('kioskAutoResetSeconds', Number.isNaN(val) ? 15 : val);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">{t('settings.kioskAutoResetHelp')}</p>

                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="kioskMaxPartySize">{t('settings.kioskMaxPartySize')}</Label>

                    <Input
                      id="kioskMaxPartySize"
                      type="number"
                      min={1}
                      max={50}
                      value={Number.isNaN(formData.kioskMaxPartySize) ? '' : formData.kioskMaxPartySize}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        updateField('kioskMaxPartySize', Number.isNaN(val) ? 10 : val);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">{t('settings.kioskMaxPartySizeHelp')}</p>

                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Board Settings */}
          <TabsContent value="board">
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.board')}</CardTitle>
                <CardDescription>{t('settings.boardDescription')}</CardDescription>

              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="boardNextCount">{t('settings.boardNextCount')}</Label>

                  <Input
                    id="boardNextCount"
                    type="number"
                    min={1}
                    max={10}
                    value={Number.isNaN(formData.boardNextCount) ? '' : formData.boardNextCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      updateField('boardNextCount', Number.isNaN(val) ? 3 : val);
                    }}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">{t('settings.boardNextCountHelp')}</p>

                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reservation Settings */}
          <TabsContent value="reservation">
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.reservation')}</CardTitle>
                <CardDescription>{t('settings.reservationDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 予約受付ON/OFF */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{t('settings.reservationEnabled')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.reservationEnabledDescription')}
                    </p>
                  </div>
                  <Switch
                    checked={formData.reservationEnabled}
                    onCheckedChange={(checked) => updateField('reservationEnabled', checked)}
                  />
                </div>

                {formData.reservationEnabled && (
                  <>
                    <Separator />
                    
                    {/* 時間設定 */}
                    <div className="space-y-4">
                      <h3 className="font-medium">{t('settings.reservationTimeSettings')}</h3>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor="reservationStartTime">{t('settings.reservationStartTime')}</Label>
                          <Input
                            id="reservationStartTime"
                            type="time"
                            value={formData.reservationStartTime}
                            onChange={(e) => updateField('reservationStartTime', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reservationEndTime">{t('settings.reservationEndTime')}</Label>
                          <Input
                            id="reservationEndTime"
                            type="time"
                            value={formData.reservationEndTime}
                            onChange={(e) => updateField('reservationEndTime', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reservationSlotDuration">{t('settings.reservationSlotDuration')}</Label>
                          <Select
                            value={String(formData.reservationSlotDuration)}
                            onValueChange={(value) => updateField('reservationSlotDuration', Number(value))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="15">15分</SelectItem>
                              <SelectItem value="30">30分</SelectItem>
                              <SelectItem value="60">60分</SelectItem>
                              <SelectItem value="90">90分</SelectItem>
                              <SelectItem value="120">120分</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">{t('settings.reservationSlotDurationHelp')}</p>
                        </div>
                      </div>
                    </div>

                    {/* 予約可能曜日 */}
                    <div className="space-y-4">
                      <Label>{t('settings.reservationAvailableDays')}</Label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { day: 0, label: t('settings.daySunday') },
                          { day: 1, label: t('settings.dayMonday') },
                          { day: 2, label: t('settings.dayTuesday') },
                          { day: 3, label: t('settings.dayWednesday') },
                          { day: 4, label: t('settings.dayThursday') },
                          { day: 5, label: t('settings.dayFriday') },
                          { day: 6, label: t('settings.daySaturday') },
                        ].map(({ day, label }) => (
                          <Button
                            key={day}
                            type="button"
                            variant={formData.reservationAvailableDays.includes(day) ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                              const days = formData.reservationAvailableDays;
                              if (days.includes(day)) {
                                updateField('reservationAvailableDays', days.filter(d => d !== day));
                              } else {
                                updateField('reservationAvailableDays', [...days, day].sort());
                              }
                            }}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* 予約可能日数 */}
                    <div className="space-y-2">
                      <Label htmlFor="reservationAdvanceDays">{t('settings.reservationAdvanceDays')}</Label>
                      <Input
                        id="reservationAdvanceDays"
                        type="number"
                        min={1}
                        max={90}
                        value={formData.reservationAdvanceDays}
                        onChange={(e) => updateField('reservationAdvanceDays', Number(e.target.value))}
                        className="w-32"
                      />
                      <p className="text-xs text-muted-foreground">{t('settings.reservationAdvanceDaysHelp')}</p>
                    </div>

                    <Separator />

                    {/* 容量設定 */}
                    <div className="space-y-4">
                      <h3 className="font-medium">{t('settings.reservationCapacity')}</h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="reservationMaxPerSlot">{t('settings.reservationMaxPerSlot')}</Label>
                          <Input
                            id="reservationMaxPerSlot"
                            type="number"
                            min={1}
                            max={100}
                            value={formData.reservationMaxPerSlot}
                            onChange={(e) => updateField('reservationMaxPerSlot', Number(e.target.value))}
                            className="w-32"
                          />
                          <p className="text-xs text-muted-foreground">{t('settings.reservationMaxPerSlotHelp')}</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reservationMaxPartySize">{t('settings.reservationMaxPartySize')}</Label>
                          <Input
                            id="reservationMaxPartySize"
                            type="number"
                            min={1}
                            max={50}
                            value={formData.reservationMaxPartySize}
                            onChange={(e) => updateField('reservationMaxPartySize', Number(e.target.value))}
                            className="w-32"
                          />
                          <p className="text-xs text-muted-foreground">{t('settings.reservationMaxPartySizeHelp')}</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* その他の設定 */}
                    <div className="space-y-4">
                      <h3 className="font-medium">{t('settings.reservationOptions')}</h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label>{t('settings.reservationAutoConfirm')}</Label>
                            <p className="text-sm text-muted-foreground">
                              {t('settings.reservationAutoConfirmDescription')}
                            </p>
                          </div>
                          <Switch
                            checked={formData.reservationAutoConfirm}
                            onCheckedChange={(checked) => updateField('reservationAutoConfirm', checked)}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label>{t('settings.reservationSmsReminder')}</Label>
                            <p className="text-sm text-muted-foreground">
                              {t('settings.reservationSmsReminderDescription')}
                            </p>
                          </div>
                          <Switch
                            checked={formData.reservationSmsReminder}
                            onCheckedChange={(checked) => updateField('reservationSmsReminder', checked)}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Branding Settings */}
          <TabsContent value="branding">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  {t('settings.branding')}
                </CardTitle>
                <CardDescription>{t('settings.brandingDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Store Logo */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">{t('settings.logoTitle')}</Label>
                    <p className="text-xs text-muted-foreground mt-1">{t('settings.logoDescription')}</p>
                  </div>
                  <div className="flex items-start gap-6">
                    {/* Logo Preview */}
                    <div className="flex-shrink-0">
                      {store?.settings?.branding?.logoUrl ? (
                        <div className="relative group">
                          <img
                            src={store.settings.branding.logoUrl}
                            alt={t('settings.logoCurrent')}
                            className="h-24 w-24 rounded-xl border-2 border-border object-contain bg-muted/30 p-1"
                          />
                          <button
                            type="button"
                            onClick={handleLogoRemove}
                            disabled={removeLogoMutation.isPending}
                            className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/90"
                            title={t('settings.logoRemove')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20">
                          <Store className="h-8 w-8 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                    {/* Upload Controls */}
                    <div className="flex flex-col gap-2">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleLogoUpload}
                          className="hidden"
                          disabled={isUploadingLogo}
                        />
                        <div className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all hover:bg-muted/50 active:scale-95 ${isUploadingLogo ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          {isUploadingLogo ? (
                            <><Loader2 className="h-4 w-4 animate-spin" />{t('settings.logoUploading')}</>
                          ) : (
                            <><Upload className="h-4 w-4" />{t('settings.logoUpload')}</>
                          )}
                        </div>
                      </label>
                      <p className="text-xs text-muted-foreground">{t('settings.logoUploadHint')}</p>
                      {store?.settings?.branding?.logoUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-fit text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={handleLogoRemove}
                          disabled={removeLogoMutation.isPending}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          {t('settings.logoRemove')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Presets */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">{t('settings.brandPresets')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {(['default', 'warm', 'cool', 'nature', 'elegant', 'vivid'] as const).map((presetKey) => {
                      const presetColors = {
                        default: { primary: '#3366cc', secondary: '#6699cc', accent: '#ff6633' },
                        warm: { primary: '#d4532b', secondary: '#e8a44a', accent: '#c2185b' },
                        cool: { primary: '#1976d2', secondary: '#42a5f5', accent: '#00bcd4' },
                        nature: { primary: '#2e7d32', secondary: '#66bb6a', accent: '#ff8f00' },
                        elegant: { primary: '#37474f', secondary: '#78909c', accent: '#c6a052' },
                        vivid: { primary: '#7b1fa2', secondary: '#e91e63', accent: '#ff5722' },
                      };
                      const preset = presetColors[presetKey];
                      return (
                        <button
                          key={presetKey}
                          type="button"
                          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all hover:bg-muted/50 active:scale-95"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              brandPrimaryColor: preset.primary,
                              brandSecondaryColor: preset.secondary,
                              brandAccentColor: preset.accent,
                            }));
                          }}
                        >
                          <div className="flex gap-0.5">
                            <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: preset.primary }} />
                            <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: preset.secondary }} />
                            <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: preset.accent }} />
                          </div>
                          <span>{t(`settings.brandPreset${presetKey.charAt(0).toUpperCase() + presetKey.slice(1)}` as any)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                {/* Color Pickers */}
                <div className="grid gap-6 md:grid-cols-3">
                  {/* Primary Color */}
                  <div className="space-y-3">
                    <Label htmlFor="brandPrimaryColor">{t('settings.brandPrimaryColor')}</Label>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <input
                          type="color"
                          id="brandPrimaryColor"
                          value={formData.brandPrimaryColor || '#3366cc'}
                          onChange={(e) => updateField('brandPrimaryColor', e.target.value)}
                          className="h-10 w-10 cursor-pointer rounded-lg border-2 border-border"
                        />
                      </div>
                      <Input
                        value={formData.brandPrimaryColor}
                        onChange={(e) => updateField('brandPrimaryColor', e.target.value)}
                        placeholder="#3366cc"
                        className="w-28 font-mono text-sm"
                        maxLength={7}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{t('settings.brandPrimaryColorHelp')}</p>
                  </div>

                  {/* Secondary Color */}
                  <div className="space-y-3">
                    <Label htmlFor="brandSecondaryColor">{t('settings.brandSecondaryColor')}</Label>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <input
                          type="color"
                          id="brandSecondaryColor"
                          value={formData.brandSecondaryColor || '#6699cc'}
                          onChange={(e) => updateField('brandSecondaryColor', e.target.value)}
                          className="h-10 w-10 cursor-pointer rounded-lg border-2 border-border"
                        />
                      </div>
                      <Input
                        value={formData.brandSecondaryColor}
                        onChange={(e) => updateField('brandSecondaryColor', e.target.value)}
                        placeholder="#6699cc"
                        className="w-28 font-mono text-sm"
                        maxLength={7}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{t('settings.brandSecondaryColorHelp')}</p>
                  </div>

                  {/* Accent Color */}
                  <div className="space-y-3">
                    <Label htmlFor="brandAccentColor">{t('settings.brandAccentColor')}</Label>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <input
                          type="color"
                          id="brandAccentColor"
                          value={formData.brandAccentColor || '#ff6633'}
                          onChange={(e) => updateField('brandAccentColor', e.target.value)}
                          className="h-10 w-10 cursor-pointer rounded-lg border-2 border-border"
                        />
                      </div>
                      <Input
                        value={formData.brandAccentColor}
                        onChange={(e) => updateField('brandAccentColor', e.target.value)}
                        placeholder="#ff6633"
                        className="w-28 font-mono text-sm"
                        maxLength={7}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{t('settings.brandAccentColorHelp')}</p>
                  </div>
                </div>

                {/* Reset Button */}
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        brandPrimaryColor: '',
                        brandSecondaryColor: '',
                        brandAccentColor: '',
                      }));
                      toast.success(t('settings.brandReset'));
                    }}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t('settings.brandReset')}
                  </Button>
                </div>

                <Separator />

                {/* Preview */}
                <div className="space-y-4">
                  <Label className="text-sm font-medium">{t('settings.brandPreview')}</Label>
                  <div className="rounded-xl border bg-card p-6 space-y-4">
                    {/* Button Preview */}
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">{t('settings.brandPreviewButton')}</p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90"
                          style={{ backgroundColor: formData.brandPrimaryColor || '#3366cc' }}
                        >
                          {t('settings.brandPrimaryColor')}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90"
                          style={{ backgroundColor: formData.brandSecondaryColor || '#6699cc' }}
                        >
                          {t('settings.brandSecondaryColor')}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90"
                          style={{ backgroundColor: formData.brandAccentColor || '#ff6633' }}
                        >
                          {t('settings.brandAccentColor')}
                        </button>
                      </div>
                    </div>
                    {/* Card Preview */}
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">{t('settings.brandPreviewCard')}</p>
                      <div className="rounded-lg border-l-4 bg-muted/30 p-4" style={{ borderLeftColor: formData.brandPrimaryColor || '#3366cc' }}>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full text-white text-sm font-bold" style={{ backgroundColor: formData.brandPrimaryColor || '#3366cc' }}>
                            A1
                          </div>
                          <div>
                            <p className="font-medium" style={{ color: formData.brandPrimaryColor || '#3366cc' }}>
                              {t('settings.brandPreviewText')}
                            </p>
                            <p className="text-sm text-muted-foreground">2名 ・ 待ち時間: 約5分</p>
                          </div>
                          <div className="ml-auto">
                            <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: formData.brandAccentColor || '#ff6633' }}>
                              呼び出し中
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Custom Messages Settings */}
          <TabsContent value="messages">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  {t('settings.customMessages')}
                </CardTitle>
                <CardDescription>{t('settings.customMessagesDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Welcome Message */}
                <div className="space-y-2">
                  <Label htmlFor="welcomeMessage" className="text-base font-medium">
                    {t('settings.welcomeMessage')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.welcomeMessageHelp')}
                  </p>
                  <Textarea
                    id="welcomeMessage"
                    value={formData.welcomeMessage}
                    onChange={(e) => {
                      if (e.target.value.length <= 200) {
                        setFormData({ ...formData, welcomeMessage: e.target.value });
                      }
                    }}
                    placeholder={t('settings.welcomeMessagePlaceholder')}
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {t('settings.messageCharCount').replace('{count}', String(formData.welcomeMessage.length))}
                  </p>
                </div>

                <Separator />

                {/* Join Notice */}
                <div className="space-y-2">
                  <Label htmlFor="joinNotice" className="text-base font-medium">
                    {t('settings.joinNotice')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.joinNoticeHelp')}
                  </p>
                  <Textarea
                    id="joinNotice"
                    value={formData.joinNotice}
                    onChange={(e) => {
                      if (e.target.value.length <= 200) {
                        setFormData({ ...formData, joinNotice: e.target.value });
                      }
                    }}
                    placeholder={t('settings.joinNoticePlaceholder')}
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {t('settings.messageCharCount').replace('{count}', String(formData.joinNotice.length))}
                  </p>
                </div>

                <Separator />

                {/* Ticket Message */}
                <div className="space-y-2">
                  <Label htmlFor="ticketMessage" className="text-base font-medium">
                    {t('settings.ticketMessage')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.ticketMessageHelp')}
                  </p>
                  <Textarea
                    id="ticketMessage"
                    value={formData.ticketMessage}
                    onChange={(e) => {
                      if (e.target.value.length <= 200) {
                        setFormData({ ...formData, ticketMessage: e.target.value });
                      }
                    }}
                    placeholder={t('settings.ticketMessagePlaceholder')}
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {t('settings.messageCharCount').replace('{count}', String(formData.ticketMessage.length))}
                  </p>
                </div>

                <Separator />

                {/* Kiosk Message */}
                <div className="space-y-2">
                  <Label htmlFor="kioskMessage" className="text-base font-medium">
                    {t('settings.kioskMessage')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.kioskMessageHelp')}
                  </p>
                  <Textarea
                    id="kioskMessage"
                    value={formData.kioskMessage}
                    onChange={(e) => {
                      if (e.target.value.length <= 200) {
                        setFormData({ ...formData, kioskMessage: e.target.value });
                      }
                    }}
                    placeholder={t('settings.kioskMessagePlaceholder')}
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {t('settings.messageCharCount').replace('{count}', String(formData.kioskMessage.length))}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Business Hours Settings */}
          <TabsContent value="businessHours">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {t('settings.businessHours')}
                </CardTitle>
                <CardDescription>{t('settings.businessHoursDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Enable toggle */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">
                      {t('settings.businessHoursEnabled')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.businessHoursEnabledHelp')}
                    </p>
                  </div>
                  <Switch
                    checked={formData.businessHoursEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, businessHoursEnabled: checked })}
                  />
                </div>

                {formData.businessHoursEnabled && (
                  <>
                    {/* Timezone */}
                    <div className="space-y-2">
                      <Label className="text-base font-medium">
                        {t('settings.businessHoursTimezone')}
                      </Label>
                      <Select
                        value={formData.businessHoursTimezone}
                        onValueChange={(value) => setFormData({ ...formData, businessHoursTimezone: value })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST, UTC+9)</SelectItem>
                          <SelectItem value="Asia/Seoul">Asia/Seoul (KST, UTC+9)</SelectItem>
                          <SelectItem value="Asia/Shanghai">Asia/Shanghai (CST, UTC+8)</SelectItem>
                          <SelectItem value="Asia/Hong_Kong">Asia/Hong_Kong (HKT, UTC+8)</SelectItem>
                          <SelectItem value="Asia/Taipei">Asia/Taipei (CST, UTC+8)</SelectItem>
                          <SelectItem value="Asia/Singapore">Asia/Singapore (SGT, UTC+8)</SelectItem>
                          <SelectItem value="Asia/Bangkok">Asia/Bangkok (ICT, UTC+7)</SelectItem>
                          <SelectItem value="America/New_York">America/New_York (EST, UTC-5)</SelectItem>
                          <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST, UTC-8)</SelectItem>
                          <SelectItem value="Europe/London">Europe/London (GMT, UTC+0)</SelectItem>
                          <SelectItem value="Europe/Paris">Europe/Paris (CET, UTC+1)</SelectItem>
                          <SelectItem value="Australia/Sydney">Australia/Sydney (AEST, UTC+10)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    {/* Weekly Schedule */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-medium">
                          {t('settings.businessHoursSchedule')}
                        </Label>
                      </div>
                      <div className="space-y-2">
                        {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                          const dayKey = String(day);
                          const dayData = formData.businessHoursSchedule[dayKey] || { isOpen: true, openTime: '09:00', closeTime: '21:00' };
                          const dayNames = ['day.sun', 'day.mon', 'day.tue', 'day.wed', 'day.thu', 'day.fri', 'day.sat'];
                          return (
                            <div key={day} className="flex items-center gap-3 rounded-lg border p-3">
                              <div className="w-10 text-center font-medium text-sm">
                                {t(dayNames[day] as any)}
                              </div>
                              <Switch
                                checked={dayData.isOpen}
                                onCheckedChange={(checked) => {
                                  setFormData({
                                    ...formData,
                                    businessHoursSchedule: {
                                      ...formData.businessHoursSchedule,
                                      [dayKey]: { ...dayData, isOpen: checked },
                                    },
                                  });
                                }}
                              />
                              {dayData.isOpen ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <Input
                                    type="time"
                                    value={dayData.openTime}
                                    onChange={(e) => {
                                      setFormData({
                                        ...formData,
                                        businessHoursSchedule: {
                                          ...formData.businessHoursSchedule,
                                          [dayKey]: { ...dayData, openTime: e.target.value },
                                        },
                                      });
                                    }}
                                    className="w-28"
                                  />
                                  <span className="text-muted-foreground">~</span>
                                  <Input
                                    type="time"
                                    value={dayData.closeTime}
                                    onChange={(e) => {
                                      setFormData({
                                        ...formData,
                                        businessHoursSchedule: {
                                          ...formData.businessHoursSchedule,
                                          [dayKey]: { ...dayData, closeTime: e.target.value },
                                        },
                                      });
                                    }}
                                    className="w-28"
                                  />
                                  {day === 0 && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="ml-auto text-xs"
                                      onClick={() => {
                                        const sundayData = formData.businessHoursSchedule['0'] || { isOpen: true, openTime: '09:00', closeTime: '21:00' };
                                        const newSchedule: Record<string, { isOpen: boolean; openTime: string; closeTime: string }> = {};
                                        for (let d = 0; d <= 6; d++) {
                                          newSchedule[String(d)] = { ...sundayData };
                                        }
                                        setFormData({ ...formData, businessHoursSchedule: newSchedule });
                                      }}
                                    >
                                      {t('settings.businessHoursCopyToAll')}
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  {t('settings.businessHoursClosedDay')}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* QR Code Settings */}
          <TabsContent value="qrcode">
            {store && (
              <QRCodeGenerator
                storeSlug={store.slug}
                storeName={store.name}
              />
            )}
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.security')}</CardTitle>
                <CardDescription>{t('settings.securityDescription')}</CardDescription>

              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="staffPin">{t('settings.staffPin')}</Label>

                    <Input
                      id="staffPin"
                      type="password"
                      value={formData.staffPin}
                      onChange={(e) => updateField('staffPin', e.target.value)}
                      placeholder={t('settings.pinPlaceholder')}
                      maxLength={8}
                    />

                    <p className="text-xs text-muted-foreground">{t('settings.staffPinHelp')}</p>

                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="managerPin">{t('settings.managerPin')}</Label>

                    <Input
                      id="managerPin"
                      type="password"
                      value={formData.managerPin}
                      onChange={(e) => updateField('managerPin', e.target.value)}
                      placeholder={t('settings.pinPlaceholder')}
                      maxLength={8}
                    />

                    <p className="text-xs text-muted-foreground">{t('settings.managerPinHelp')}</p>

                  </div>
                </div>

                {store && storeUrls && (
                  <>
                    <Separator />
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <h3 className="font-medium">{t('settings.accessUrlsTitle')}</h3>

                        <div className="space-y-2 text-sm">
                          <p><strong>{t('settings.storeUrlLabel')}:</strong> {storeUrls.store}</p>
                          <p><strong>{t('settings.staffUrlLabel')}:</strong> {storeUrls.staff}</p>

                        </div>
                      </div>
                      <div className="space-y-4">
                        <h3 className="font-medium">{t('settings.kioskBoardUrlsTitle')}</h3>

                        <div className="space-y-4">
                          {/* キオスクURL（アクセスキー不要） */}
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-medium">{t('settings.kioskUrlLabel')}</span>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(storeUrls.kiosk)}
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  {t('settings.copyUrl')}
                                </Button>
                              </div>
                            </div>
                            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs font-mono break-all">
                              {storeUrls.kiosk}
                            </div>
                          </div>
                          {/* ボードURL（アクセスキー不要） */}
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-medium">{t('settings.boardUrlLabel')}</span>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(storeUrls.board)}
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  {t('settings.copyUrl')}
                                </Button>
                              </div>
                            </div>
                            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs font-mono break-all">
                              {storeUrls.board}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

              </CardContent>
            </Card>

            {/* VAPID Settings for Push Notifications */}
            <div className="mt-6">
              <VapidSettings t={t as (key: string) => string} storeId={store?.id} />
            </div>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing">
            <BillingTab store={store} t={t as (key: string) => string} />
          </TabsContent>
        </Tabs>

        <AlertDialog open={reorderConfirmOpen} onOpenChange={setReorderConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('settings.enableReorderConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('settings.enableReorderConfirmDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmEnableReorder}>
                {t('settings.enableReorderAction')}
              </AlertDialogAction>
            </AlertDialogFooter>

          </AlertDialogContent>
        </AlertDialog>


      </main>
    </div>
  );
}

// ==================== Billing Tab Component ====================
function BillingTab({ store, t }: { store: any; t: (key: string) => string }) {
  const utils = trpc.useUtils();
  const { data: subInfo, isLoading } = trpc.subscription.getInfo.useQuery(
    { storeId: store?.id },
    { enabled: !!store?.id }
  );

  const createCheckout = trpc.subscription.createCheckout.useMutation({
    onSuccess: (result) => {
      if (result.type === 'checkout' && result.url) {
        toast.info(t('settings.redirectingToCheckout'));
        window.open(result.url, '_blank');
      } else if (result.type === 'plan_changed') {
        toast.success(t('settings.planChangedSuccess'));
        utils.subscription.getInfo.invalidate();
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelSub = trpc.subscription.cancel.useMutation({
    onSuccess: () => {
      toast.success(t('settings.subscriptionCanceled'));
      utils.subscription.getInfo.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const reactivateSub = trpc.subscription.reactivate.useMutation({
    onSuccess: () => {
      toast.success(t('settings.subscriptionReactivated'));
      utils.subscription.getInfo.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const currentPlan = subInfo?.plan;
  const planId = currentPlan?.id || 'free';
  const status = subInfo?.status;
  const cancelAtPeriodEnd = subInfo?.cancelAtPeriodEnd;

  const getStatusBadge = () => {
    if (planId === 'free') return <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{t('settings.planStatusFree')}</span>;
    if (cancelAtPeriodEnd) return <span className="inline-flex items-center rounded-full bg-yellow-500/10 text-yellow-600 px-2.5 py-0.5 text-xs font-medium">{t('settings.planStatusCanceled')}</span>;
    if (status === 'active') return <span className="inline-flex items-center rounded-full bg-green-500/10 text-green-600 px-2.5 py-0.5 text-xs font-medium">{t('settings.planStatusActive')}</span>;
    if (status === 'past_due') return <span className="inline-flex items-center rounded-full bg-red-500/10 text-red-600 px-2.5 py-0.5 text-xs font-medium">{t('settings.planStatusPastDue')}</span>;
    return <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{t('settings.planStatusFree')}</span>;
  };

  const plans = [
    { id: 'standard' as const, name: 'Standard', price: 1500, priceTax: 1650 },
    { id: 'pro' as const, name: 'Pro', price: 3500, priceTax: 3850 },
  ];

  return (
    <div className="space-y-6">
      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.currentPlan')}</CardTitle>
          <CardDescription>{t('settings.billingDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold">{currentPlan?.name || 'Free'}</h3>
              {currentPlan && currentPlan.priceMonthly > 0 && (
                <p className="text-muted-foreground">
                  ¥{currentPlan.priceMonthlyTax.toLocaleString()}{t('settings.perMonth')}
                  <span className="text-xs ml-1">({t('settings.taxIncluded')})</span>
                </p>
              )}
            </div>
            {getStatusBadge()}
          </div>

          {/* Next billing / Expiry */}
          {subInfo?.currentPeriodEnd && (
            <div className="text-sm text-muted-foreground">
              {cancelAtPeriodEnd ? (
                <p>{t('settings.planExpiresAt')}: {new Date(subInfo.currentPeriodEnd).toLocaleDateString()}</p>
              ) : (
                <p>{t('settings.planNextBilling')}: {new Date(subInfo.currentPeriodEnd).toLocaleDateString()}</p>
              )}
            </div>
          )}

          {/* Monthly ticket usage */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{t('settings.monthlyTicketUsage')}</span>
              <span className="text-sm text-muted-foreground">
                {subInfo?.monthlyTicketCount || 0} / {subInfo?.monthlyTicketLimit ? subInfo.monthlyTicketLimit : t('settings.monthlyTicketUnlimited')}
              </span>
            </div>
            {subInfo?.monthlyTicketLimit && (
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary rounded-full h-2 transition-all"
                  style={{ width: `${Math.min(100, ((subInfo.monthlyTicketCount || 0) / subInfo.monthlyTicketLimit) * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {status === 'active' && !cancelAtPeriodEnd && planId !== 'free' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelDialogOpen(true)}
                disabled={cancelSub.isPending}
              >
                {cancelSub.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('settings.cancelSubscription')}
              </Button>
            )}
            {cancelAtPeriodEnd && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => reactivateSub.mutate({ storeId: store.id })}
                disabled={reactivateSub.isPending}
              >
                {reactivateSub.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('settings.reactivateSubscription')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <Card>
        <CardHeader>
          <CardTitle>{planId === 'free' ? t('settings.upgradePlan') : t('settings.changePlan')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => {
              const isCurrent = planId === plan.id;
              return (
                <div
                  key={plan.id}
                  className={`rounded-lg border p-4 space-y-3 ${
                    isCurrent ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-lg">{plan.name}</h4>
                    {isCurrent && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium">
                        {t('settings.currentPlan')}
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold">
                    ¥{plan.priceTax.toLocaleString()}
                    <span className="text-sm font-normal text-muted-foreground">{t('settings.perMonth')}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    (¥{plan.price.toLocaleString()} + {t('settings.taxIncluded')})
                  </p>
                  {!isCurrent && (
                    <Button
                      className="w-full"
                      variant={plan.id === 'standard' && planId === 'free' ? 'default' : 'outline'}
                      onClick={() => createCheckout.mutate({ storeId: store.id, planId: plan.id })}
                      disabled={createCheckout.isPending}
                    >
                      {createCheckout.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {planId === 'free' ? `${plan.name} ${t('settings.subscribeTo')}` : t('settings.changePlan')}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.cancelSubscription')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.cancelSubscriptionConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                cancelSub.mutate({ storeId: store.id });
                setCancelDialogOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('settings.cancelSubscription')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Settings() {
  return (
    <LocaleProvider defaultLocale="ja" supportedLocales={SUPPORTED_LOCALES}>
      <SettingsContent />
    </LocaleProvider>
  );
}


