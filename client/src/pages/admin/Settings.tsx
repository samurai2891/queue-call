import { useParams, useLocation } from 'wouter';
import { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';

import { toast } from 'sonner';
import { getLoginUrl } from '@/const';
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
  { amount: 5000, label: '¥5,000', messages: 250 },
  { amount: 10000, label: '¥10,000', messages: 500 },
  { amount: 30000, label: '¥30,000', messages: 1500 },
  { amount: 50000, label: '¥50,000', messages: 2500 },
];

const MIN_SMS_CHARGE_AMOUNT = 500;
const MAX_SMS_CHARGE_AMOUNT = 100000;
const SMS_COST_PER_MESSAGE = 20; // 1通あたり20円


// SMS残高カードコンポーネント
function SmsBalanceCard({ storeId }: { storeId?: number }) {
  const { t } = useLocale();
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
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState(1000);


  
  // SMS残高取得
  const { data: balanceData, isLoading: balanceLoading, refetch: refetchBalance } = trpc.stripe.getSmsBalance.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );
  
  // SMS取引履歴取得
  const { data: transactions, isLoading: transactionsLoading } = trpc.stripe.getSmsTransactions.useQuery(
    { storeId: storeId!, limit: 5 },
    { enabled: !!storeId }
  );
  
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
        
        <div className="mt-3">
          <div className={`text-3xl font-bold ${isLowBalance ? 'text-destructive' : ''}`}>
            ¥{balance.toLocaleString()}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatMessage('settings.smsBalanceAvailable', {
              count: messagesRemaining,
              cost: SMS_COST_PER_MESSAGE,
            })}
          </p>

          {isLowBalance && (
            <div className={`mt-2 p-3 rounded-lg ${isCriticalBalance ? 'bg-destructive/10 border border-destructive/30' : 'bg-yellow-50 border border-yellow-200'}`}>
              <p className={`text-sm font-medium ${isCriticalBalance ? 'text-destructive' : 'text-yellow-800'}`}>
                {isCriticalBalance
                  ? t('settings.smsBalanceCritical')
                  : t('settings.smsBalanceLow')}

              </p>
              <p className={`text-xs mt-1 ${isCriticalBalance ? 'text-destructive/80' : 'text-yellow-700'}`}>
                {isCriticalBalance
                  ? t('settings.smsBalanceCriticalHelp')
                  : t('settings.smsBalanceLowHelp')}

              </p>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="text-center mb-4">
              <div className={`inline-flex p-3 rounded-full ${isCriticalBalance ? 'bg-destructive/10' : 'bg-yellow-100'} mb-3`}>
                <Wallet className={`h-8 w-8 ${isCriticalBalance ? 'text-destructive' : 'text-yellow-600'}`} />
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
    
    // Notifications
    pushEnabled: true,
    smsEnabled: false,
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

  // Get user's store
  const { data: store, isLoading: storeLoading, refetch: refetchStore } = trpc.store.getByOwner.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: menuCategories } = trpc.menu.getCategories.useQuery(
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
        
        pushEnabled: settings.notifications?.pushEnabled ?? true,
        smsEnabled: settings.notifications?.smsEnabled || false,
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

  const uploadImage = async (file: File, kind: 'menu' | 'feed', storeId: number) => {
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

    const { uploadUrl, publicUrl } = await presignResponse.json();
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

    return publicUrl as string;
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

  const handleCreateMenuItem = async () => {
    if (!store) return;
    if (!newMenuItem.nameJa.trim()) {
      toast.error(t('settings.menuNameRequired'));

      return;
    }

    setIsCreatingMenuItem(true);
    try {
      let photoUrl: string | undefined;
      if (newMenuItem.photoFile) {
        photoUrl = await uploadImage(newMenuItem.photoFile, 'menu', store.id);
      }

      await createMenuItemMutation.mutateAsync({
        storeId: store.id,
        nameJa: newMenuItem.nameJa.trim(),
        descJa: newMenuItem.descJa.trim() || undefined,
        price: parsePrice(newMenuItem.price),
        categoryId: newMenuItem.categoryId ? Number(newMenuItem.categoryId) : undefined,
        photoLargeUrl: photoUrl,
        photoSmallUrl: photoUrl,
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
      if (draft.photoFile) {
        photoUrl = await uploadImage(draft.photoFile, 'menu', store.id);
      }

      await updateMenuItemMutation.mutateAsync({
        storeId: store.id,
        itemId: item.id,
        nameJa: draft.nameJa.trim(),
        descJa: draft.descJa.trim() || undefined,
        price: parsePrice(draft.price),
        categoryId: draft.categoryId ? Number(draft.categoryId) : null,
        photoLargeUrl: photoUrl,
        photoSmallUrl: photoUrl,
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
      const photoUrl = await uploadImage(newFeedPost.photoFile, 'feed', store.id);
      await createFeedPostMutation.mutateAsync({
        storeId: store.id,
        photoLargeUrl: photoUrl,
        photoSmallUrl: photoUrl,
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
        photoUrl = await uploadImage(draft.photoFile, 'feed', store.id);
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
    { id: 'qrcode', label: t('settings.qrcode'), icon: QrCode },
    { id: 'security', label: t('settings.security'), icon: Shield },
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
                      <SmsBalanceCard storeId={store?.id} />
                      
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
                                    src={item.photoLargeUrl}
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
                                    src={post.photoLargeUrl}
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
              <VapidSettings t={t} />
            </div>
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

export default function Settings() {
  return (
    <LocaleProvider defaultLocale="ja" supportedLocales={SUPPORTED_LOCALES}>
      <SettingsContent />
    </LocaleProvider>
  );
}


