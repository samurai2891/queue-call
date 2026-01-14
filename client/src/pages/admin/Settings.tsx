import { useParams, useLocation } from 'wouter';
import { useState, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
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
} from 'lucide-react';

import { toast } from 'sonner';
import { getLoginUrl } from '@/const';

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

const SMS_COST_PER_MESSAGE = 20; // 1通あたり20円

// SMS残高カードコンポーネント
function SmsBalanceCard({ storeId }: { storeId?: number }) {
  const [isCharging, setIsCharging] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [showChargePrompt, setShowChargePrompt] = useState(false);
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
      toast.error('チャージの開始に失敗しました: ' + error.message);
      setIsCharging(false);
    },
  });
  
  const balance = balanceData?.balance ?? 0;
  const messagesRemaining = Math.floor(balance / SMS_COST_PER_MESSAGE);
  const isLowBalance = balance < lowBalanceThreshold;
  const isCriticalBalance = balance < 500;
  
  // 残高が少ない場合に自動でチャージ促進モーダルを表示
  useEffect(() => {
    if (isCriticalBalance && !showChargePrompt) {
      setShowChargePrompt(true);
    }
  }, [isCriticalBalance, showChargePrompt]);
  
  const handleCharge = async (amount: number) => {
    if (!storeId) return;
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
            <span className="font-medium">SMS残高</span>
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
            約{messagesRemaining}通分の送信が可能（1通20円）
          </p>
          {isLowBalance && (
            <div className={`mt-2 p-3 rounded-lg ${isCriticalBalance ? 'bg-destructive/10 border border-destructive/30' : 'bg-yellow-50 border border-yellow-200'}`}>
              <p className={`text-sm font-medium ${isCriticalBalance ? 'text-destructive' : 'text-yellow-800'}`}>
                {isCriticalBalance 
                  ? '⚠️ SMS残高が非常に少なくなっています！' 
                  : '📢 残高が少なくなっています'}
              </p>
              <p className={`text-xs mt-1 ${isCriticalBalance ? 'text-destructive/80' : 'text-yellow-700'}`}>
                {isCriticalBalance 
                  ? 'SMS通知が送信できなくなる可能性があります。今すぐチャージしてください。'
                  : '安定したSMS通知のために、早めのチャージをおすすめします。'}
              </p>
              <Button
                size="sm"
                variant={isCriticalBalance ? 'destructive' : 'outline'}
                className="mt-2 w-full"
                onClick={() => setShowChargePrompt(true)}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                今すぐチャージ
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
                {isCriticalBalance ? 'SMS残高が不足しています' : 'SMS残高をチャージしませんか？'}
              </h3>
              <p className="text-sm text-muted-foreground mt-2">
                現在の残高: <span className="font-bold">¥{balance.toLocaleString()}</span>
                （約{messagesRemaining}通分）
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
                      <span className="text-xs opacity-70">約{option.messages}通</span>
                      {option.amount === 10000 && (
                        <span className="text-xs bg-primary/20 px-2 py-0.5 rounded mt-1">おすすめ</span>
                      )}
                    </>
                  )}
                </Button>
              ))}
            </div>
            
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setShowChargePrompt(false)}
            >
              後でチャージする
            </Button>
          </div>
        </div>
      )}
      
      <div className="p-4 space-y-4">
        <div>
          <Label className="text-sm font-medium">チャージ金額を選択</Label>
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
                    <span className="text-xs text-muted-foreground">約{option.messages}通</span>
                  </>
                )}
              </Button>
            ))}
          </div>
        </div>
        
        {transactions && transactions.length > 0 && (
          <div>
            <Label className="text-sm font-medium">最近の取引</Label>
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
                      {tx.type === 'charge' ? 'チャージ' : 'SMS送信'}
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


export default function Settings() {
  const params = useParams<{ section?: string }>();
  const [, navigate] = useLocation();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  
  const [activeTab, setActiveTab] = useState(params.section || 'general');
  const [isSaving, setIsSaving] = useState(false);
  const [reorderConfirmOpen, setReorderConfirmOpen] = useState(false);
  const [keyConfirmOpen, setKeyConfirmOpen] = useState(false);
  const [pendingKeyType, setPendingKeyType] = useState<'kiosk' | 'board' | null>(null);
  
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
    
    // Notifications
    pushEnabled: true,
    smsEnabled: false,
    recallLimitSeconds: 60,
    recallMaxCount: 3,
    smsTemplateCalled: '【{storeName}】お客様の番号が呼び出されました。カウンターまでお越しください。',
    smsTemplateRecall: '【{storeName}】再度のご案内です。お客様の番号が呼び出されています。',
    
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
      kiosk: store.kioskKey ? `${baseUrl}/s/${slug}/kiosk?key=${store.kioskKey}` : '',
      board: store.boardKey ? `${baseUrl}/s/${slug}/board?key=${store.boardKey}` : '',
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
        
        dailyResetTime: (settings.queue as any)?.dailyResetTime || '04:00',
        checkinGraceMinutes: settings.queue?.checkinGraceMinutes || 5,
        autoSkipEnabled: settings.queue?.autoSkip ?? true,
        autoSkipMinutes: settings.queue?.checkinGraceMinutes || 5,
        enableReorder: settings.queue?.enableReorder || false,
        reorderMaxMove: settings.queue?.reorderMaxMove || 3,
        reorderReasonRequired: settings.queue?.reorderReasonRequired || true,
        
        pushEnabled: settings.notifications?.pushEnabled ?? true,
        smsEnabled: settings.notifications?.smsEnabled || false,
        recallLimitSeconds: settings.notifications?.recallLimitSeconds || 60,
        recallMaxCount: settings.notifications?.recallMaxCount || 3,
        smsTemplateCalled: settings.notifications?.smsTemplateCalled || '【{storeName}】お客様の番号が呼び出されました。',
        smsTemplateRecall: settings.notifications?.smsTemplateRecall || '【{storeName}】再度のご案内です。',
        
        menuSwitchStyle: settings.menu?.switchStyle || 'toggle',
        menuDefaultView: settings.menu?.defaultView || 'feed',
        photoDefaultSize: settings.menu?.photoDefaultSize || 'large',
        allowPhotoSizeToggle: settings.menu?.allowCustomerPhotoSizeToggle ?? true,
        
        kioskAutoResetSeconds: settings.kiosk?.autoResetSeconds || 15,
        kioskMaxPartySize: settings.kiosk?.maxPartySize || 10,
        
        boardNextCount: settings.board?.nextCount || 3,
        
        staffPin: '',
        managerPin: '',
      });
    }
  }, [store]);

  const updateStoreMutation = trpc.store.update.useMutation({
    onSuccess: () => {
      toast.success('設定を保存しました');
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
      toast.success('店舗を作成しました');
      refetchStore();
      setIsSaving(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsSaving(false);
    },
  });

  const regenerateKeyMutation = trpc.store.regenerateKey.useMutation({
    onSuccess: () => {
      toast.success('キーを再生成しました');
      refetchStore();
      setKeyConfirmOpen(false);
      setPendingKeyType(null);
    },
    onError: (error) => {
      toast.error(error.message);
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
        toast.error('猶予時間は1～60分の範囲で設定してください');
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
      },
      notification: {
        pushEnabled: formData.pushEnabled,
        smsEnabled: formData.smsEnabled,
        recallLimitSeconds: formData.recallLimitSeconds,
        recallMaxCount: formData.recallMaxCount,
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

  const requestKeyRegeneration = (keyType: 'kiosk' | 'board') => {
    setPendingKeyType(keyType);
    setKeyConfirmOpen(true);
  };

  const confirmKeyRegeneration = () => {
    if (!store || !pendingKeyType) return;
    regenerateKeyMutation.mutate({ storeId: store.id, keyType: pendingKeyType });
  };

  const handleKeyDialogChange = (open: boolean) => {
    setKeyConfirmOpen(open);
    if (!open) {
      setPendingKeyType(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('URLをコピーしました');
    } catch (error) {
      toast.error('コピーに失敗しました');
    }
  };

  const parsePrice = (value: string) => {

    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const uploadImage = async (file: File, kind: 'menu' | 'feed', storeId: number) => {
    if (!file.type) {
      throw new Error('ファイル形式を判定できません');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('JPEG/PNG/WebP形式のみアップロードできます');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('ファイルサイズは5MB以下にしてください');
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
      const message = await presignResponse.text().catch(() => '画像のアップロード準備に失敗しました');
      throw new Error(message || '画像のアップロード準備に失敗しました');
    }

    const { uploadUrl, publicUrl } = await presignResponse.json();
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      credentials: 'include',
      body: file,
    });

    if (!uploadResponse.ok) {
      const message = await uploadResponse.text().catch(() => '画像のアップロードに失敗しました');
      throw new Error(message || '画像のアップロードに失敗しました');
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
      toast.error('商品名を入力してください');
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
      toast.success('メニューを追加しました');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'メニューの追加に失敗しました';
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
      toast.success('メニューを更新しました');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'メニューの更新に失敗しました';
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
      const message = error instanceof Error ? error.message : '状態の更新に失敗しました';
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
      const message = error instanceof Error ? error.message : '並び替えに失敗しました';
      toast.error(message);
    }
  };

  const handleDeleteMenuItem = async (itemId: number) => {
    if (!store) return;
    if (!window.confirm('このメニューを削除しますか？')) return;

    try {
      await deleteMenuItemMutation.mutateAsync({ storeId: store.id, itemId });
      await refetchAdminItems();
      toast.success('メニューを削除しました');
    } catch (error) {
      const message = error instanceof Error ? error.message : '削除に失敗しました';
      toast.error(message);
    }
  };

  const handleCreateFeedPost = async () => {
    if (!store) return;
    if (!newFeedPost.photoFile) {
      toast.error('フィード画像を選択してください');
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
      toast.success('フィードを追加しました');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'フィードの追加に失敗しました';
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
      toast.success('フィードを更新しました');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'フィードの更新に失敗しました';
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
      const message = error instanceof Error ? error.message : '状態の更新に失敗しました';
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
      const message = error instanceof Error ? error.message : '並び替えに失敗しました';
      toast.error(message);
    }
  };

  const handleDeleteFeedPost = async (feedPostId: number) => {
    if (!store) return;
    if (!window.confirm('このフィードを削除しますか？')) return;

    try {
      await deleteFeedPostMutation.mutateAsync({ storeId: store.id, feedPostId });
      await refetchAdminFeedPosts();
      toast.success('フィードを削除しました');
    } catch (error) {
      const message = error instanceof Error ? error.message : '削除に失敗しました';
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
        <h1 className="text-2xl font-bold">ログインが必要です</h1>
        <p className="text-muted-foreground">店舗設定にアクセスするにはログインしてください</p>
        <Button onClick={() => window.location.href = getLoginUrl()}>
          ログイン
        </Button>
      </div>
    );
  }

  const tabs = [
    { id: 'general', label: '基本設定', icon: Store },
    { id: 'queue', label: '順番待ち設定', icon: Clock },
    { id: 'notifications', label: '通知設定', icon: Bell },
    { id: 'menu', label: 'メニュー設定', icon: Menu },
    { id: 'kiosk', label: 'キオスク設定', icon: Monitor },
    { id: 'board', label: 'ボード設定', icon: Monitor },
    { id: 'security', label: 'セキュリティ', icon: Shield },
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
            <h1 className="text-xl font-bold">店舗設定</h1>
          </div>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            保存
          </Button>
        </div>
      </header>

      <main className="container py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-4 lg:grid-cols-7 gap-2 h-auto p-2">
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
                <CardTitle>基本設定</CardTitle>
                <CardDescription>店舗の基本情報を設定します</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">店舗名</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      placeholder="店舗名を入力"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">URL識別子</Label>
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
                  <h3 className="font-medium">言語設定</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="defaultLocale">デフォルト言語</Label>
                      <Select
                        value={formData.defaultLocale}
                        onValueChange={(value) => updateField('defaultLocale', value)}
                      >
                        <SelectTrigger>
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
                      <Label>対応言語</Label>
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
                <CardTitle>順番待ち設定</CardTitle>
                <CardDescription>順番待ちの動作を設定します</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="dailyResetTime">日次リセット時刻</Label>
                    <Input
                      id="dailyResetTime"
                      type="time"
                      value={formData.dailyResetTime}
                      onChange={(e) => updateField('dailyResetTime', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="checkinGraceMinutes">チェックイン猶予時間（分）</Label>
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
                      <Label>自動スキップ</Label>
                      <p className="text-sm text-muted-foreground">呼び出し後、猶予時間内に到着しない場合に自動でスキップ</p>
                    </div>
                    <Switch
                      checked={formData.autoSkipEnabled}
                      onCheckedChange={(checked) => updateField('autoSkipEnabled', checked)}
                    />
                  </div>
                  {formData.autoSkipEnabled && (
                    <div className="space-y-2 ml-4">
                      <Label htmlFor="autoSkipMinutes">猶予時間（分）</Label>
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
                      <p className="text-xs text-muted-foreground">呼び出し後、この時間内に到着しない場合は自動的にスキップされます</p>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>順番調整を許可</Label>
                      <p className="text-sm text-muted-foreground">スタッフが順番を入れ替えることを許可</p>
                    </div>
                    <Switch
                      checked={formData.enableReorder}
                      onCheckedChange={handleReorderToggle}
                    />

                  </div>
                  {formData.enableReorder && (
                    <div className="grid gap-4 md:grid-cols-2 ml-4">
                      <div className="space-y-2">
                        <Label htmlFor="reorderMaxMove">最大移動数</Label>
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
                        <Label htmlFor="reorderReasonRequired">理由入力必須</Label>
                      </div>
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
                <CardTitle>通知設定</CardTitle>
                <CardDescription>顧客への通知方法を設定します</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>プッシュ通知</Label>
                    <p className="text-sm text-muted-foreground">Web Push通知を有効にする</p>
                  </div>
                  <Switch
                    checked={formData.pushEnabled}
                    onCheckedChange={(checked) => updateField('pushEnabled', checked)}
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>SMS通知</Label>
                      <p className="text-sm text-muted-foreground">SMS通知を有効にする（プリペイド残高が必要）</p>
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
                        <Label htmlFor="smsTemplateCalled">呼び出しSMSテンプレート</Label>
                        <Textarea
                          id="smsTemplateCalled"
                          value={formData.smsTemplateCalled}
                          onChange={(e) => updateField('smsTemplateCalled', e.target.value)}
                          placeholder="使用可能な変数: {storeName}, {number}"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smsTemplateRecall">再通知SMSテンプレート</Label>
                        <Textarea
                          id="smsTemplateRecall"
                          value={formData.smsTemplateRecall}
                          onChange={(e) => updateField('smsTemplateRecall', e.target.value)}
                          placeholder="使用可能な変数: {storeName}, {number}"
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
                          SMS送信履歴を確認
                          <ExternalLink className="h-4 w-4 ml-auto" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="recallLimitSeconds">再通知制限（秒）</Label>
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
                    <Label htmlFor="recallMaxCount">再通知最大回数</Label>
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
                  <CardTitle>メニュー設定</CardTitle>
                  <CardDescription>メニュー表示の設定を行います</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="menuSwitchStyle">切替スタイル</Label>
                      <Select
                        value={formData.menuSwitchStyle}
                        onValueChange={(value) => updateField('menuSwitchStyle', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="toggle">トグル</SelectItem>
                          <SelectItem value="tabs">タブ</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="menuDefaultView">デフォルト表示</Label>
                      <Select
                        value={formData.menuDefaultView}
                        onValueChange={(value) => updateField('menuDefaultView', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="feed">フィード</SelectItem>
                          <SelectItem value="list">一覧</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="photoDefaultSize">写真デフォルトサイズ</Label>
                      <Select
                        value={formData.photoDefaultSize}
                        onValueChange={(value) => updateField('photoDefaultSize', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="large">大</SelectItem>
                          <SelectItem value="small">小</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="allowPhotoSizeToggle"
                        checked={formData.allowPhotoSizeToggle}
                        onCheckedChange={(checked) => updateField('allowPhotoSizeToggle', checked)}
                      />
                      <Label htmlFor="allowPhotoSizeToggle">写真サイズ切替を許可</Label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>メニュー一覧管理</CardTitle>
                  <CardDescription>一覧表示用のメニューを管理します</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <ImagePlus className="h-4 w-4" />
                      新規メニュー追加
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="newMenuName">商品名</Label>
                        <Input
                          id="newMenuName"
                          value={newMenuItem.nameJa}
                          onChange={(e) => setNewMenuItem(prev => ({ ...prev, nameJa: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newMenuPrice">価格</Label>
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
                      <Label htmlFor="newMenuDesc">説明</Label>
                      <Textarea
                        id="newMenuDesc"
                        value={newMenuItem.descJa}
                        onChange={(e) => setNewMenuItem(prev => ({ ...prev, descJa: e.target.value }))}
                      />
                    </div>
                    {menuCategories && menuCategories.length > 0 && (
                      <div className="space-y-2">
                        <Label htmlFor="newMenuCategory">カテゴリ</Label>
                        <Select
                          value={newMenuItem.categoryId || 'none'}
                          onValueChange={(value) =>
                            setNewMenuItem(prev => ({ ...prev, categoryId: value === 'none' ? '' : value }))
                          }
                        >
                          <SelectTrigger id="newMenuCategory">
                            <SelectValue placeholder="未選択" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">未選択</SelectItem>
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
                      <Label htmlFor="newMenuPhoto">画像</Label>
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
                      <p className="text-xs text-muted-foreground">5MBまでのJPEG/PNG/WebP</p>
                    </div>
                    <Button onClick={handleCreateMenuItem} disabled={isCreatingMenuItem || createMenuItemMutation.isPending}>
                      {isCreatingMenuItem ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      追加する
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    {adminItemsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        読み込み中...
                      </div>
                    ) : sortedMenuItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">登録されたメニューがありません</p>
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
                                    No Image
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 space-y-3">
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-1">
                                    <Label>商品名</Label>
                                    <Input
                                      value={draft.nameJa}
                                      onChange={(e) => updateMenuItemDraft(item, { nameJa: e.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>価格</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      value={draft.price}
                                      onChange={(e) => updateMenuItemDraft(item, { price: e.target.value })}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label>説明</Label>
                                  <Textarea
                                    value={draft.descJa}
                                    onChange={(e) => updateMenuItemDraft(item, { descJa: e.target.value })}
                                  />
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                  {menuCategories && menuCategories.length > 0 && (
                                    <div className="space-y-1">
                                      <Label>カテゴリ</Label>
                                      <Select
                                        value={draft.categoryId || 'none'}
                                        onValueChange={(value) =>
                                          updateMenuItemDraft(item, { categoryId: value === 'none' ? '' : value })
                                        }
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="未選択" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">未選択</SelectItem>
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
                                    <Label>画像更新</Label>
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
                                    <span className="text-sm">公開</span>
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
                                    保存
                                  </Button>
                                  <Button variant="destructive" size="sm" onClick={() => handleDeleteMenuItem(item.id)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    削除
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
                  <CardTitle>フィード投稿管理</CardTitle>
                  <CardDescription>フィード表示用の投稿を管理します</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <ImagePlus className="h-4 w-4" />
                      新規フィード投稿
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="newFeedTitle">タイトル</Label>
                        <Input
                          id="newFeedTitle"
                          value={newFeedPost.titleJa}
                          onChange={(e) => setNewFeedPost(prev => ({ ...prev, titleJa: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newFeedPrice">価格</Label>
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
                      <Label htmlFor="newFeedCaption">キャプション</Label>
                      <Textarea
                        id="newFeedCaption"
                        value={newFeedPost.captionJa}
                        onChange={(e) => setNewFeedPost(prev => ({ ...prev, captionJa: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newFeedPhoto">画像</Label>
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
                      <p className="text-xs text-muted-foreground">5MBまでのJPEG/PNG/WebP</p>
                    </div>
                    <Button onClick={handleCreateFeedPost} disabled={isCreatingFeedPost || createFeedPostMutation.isPending}>
                      {isCreatingFeedPost ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      追加する
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    {adminFeedLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        読み込み中...
                      </div>
                    ) : sortedFeedPosts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">登録されたフィードがありません</p>
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
                                    No Image
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 space-y-3">
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-1">
                                    <Label>タイトル</Label>
                                    <Input
                                      value={draft.titleJa}
                                      onChange={(e) => updateFeedPostDraft(post, { titleJa: e.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>価格</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      value={draft.price}
                                      onChange={(e) => updateFeedPostDraft(post, { price: e.target.value })}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label>キャプション</Label>
                                  <Textarea
                                    value={draft.captionJa}
                                    onChange={(e) => updateFeedPostDraft(post, { captionJa: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>画像更新</Label>
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
                                    <span className="text-sm">公開</span>
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
                                    保存
                                  </Button>
                                  <Button variant="destructive" size="sm" onClick={() => handleDeleteFeedPost(post.id)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    削除
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
                <CardTitle>キオスク設定</CardTitle>
                <CardDescription>店頭キオスクの動作を設定します</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="kioskAutoResetSeconds">自動リセット（秒）</Label>
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
                    <p className="text-xs text-muted-foreground">発券後、次の顧客用に画面をリセットするまでの時間</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="kioskMaxPartySize">最大人数</Label>
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
                    <p className="text-xs text-muted-foreground">キオスクで選択可能な最大人数</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Board Settings */}
          <TabsContent value="board">
            <Card>
              <CardHeader>
                <CardTitle>ボード設定</CardTitle>
                <CardDescription>呼び出しボードの表示を設定します</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="boardNextCount">次の番号表示件数</Label>
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
                  <p className="text-xs text-muted-foreground">現在の番号の後に表示する次の番号の件数</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>セキュリティ</CardTitle>
                <CardDescription>アクセス制御の設定を行います</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="staffPin">スタッフPIN</Label>
                    <Input
                      id="staffPin"
                      type="password"
                      value={formData.staffPin}
                      onChange={(e) => updateField('staffPin', e.target.value)}
                      placeholder="変更する場合のみ入力"
                      maxLength={8}
                    />
                    <p className="text-xs text-muted-foreground">スタッフ画面へのアクセスに使用</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="managerPin">マネージャーPIN</Label>
                    <Input
                      id="managerPin"
                      type="password"
                      value={formData.managerPin}
                      onChange={(e) => updateField('managerPin', e.target.value)}
                      placeholder="変更する場合のみ入力"
                      maxLength={8}
                    />
                    <p className="text-xs text-muted-foreground">設定変更などの管理機能に使用</p>
                  </div>
                </div>

                {store && storeUrls && (
                  <>
                    <Separator />
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <h3 className="font-medium">アクセスURL</h3>
                        <div className="space-y-2 text-sm">
                          <p><strong>店舗トップ:</strong> {storeUrls.store}</p>
                          <p><strong>スタッフ画面:</strong> {storeUrls.staff}</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h3 className="font-medium">キオスク/ボードURL</h3>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-medium">キオスクURL</span>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(storeUrls.kiosk)}
                                  disabled={!storeUrls.kiosk}
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  URLをコピー
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => requestKeyRegeneration('kiosk')}
                                >
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  キー再生成
                                </Button>
                              </div>
                            </div>
                            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs font-mono break-all">
                              {storeUrls.kiosk || 'キー未設定'}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-medium">呼び出しボードURL</span>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(storeUrls.board)}
                                  disabled={!storeUrls.board}
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  URLをコピー
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => requestKeyRegeneration('board')}
                                >
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  キー再生成
                                </Button>
                              </div>
                            </div>
                            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs font-mono break-all">
                              {storeUrls.board || 'キー未設定'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <AlertDialog open={reorderConfirmOpen} onOpenChange={setReorderConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>順番調整を有効にしますか？</AlertDialogTitle>
              <AlertDialogDescription>
                順番調整を有効にすると、スタッフが並び順を変更できます。例外運用になるため慎重にご利用ください。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction onClick={confirmEnableReorder}>有効にする</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={keyConfirmOpen} onOpenChange={handleKeyDialogChange}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingKeyType === 'board' ? '呼び出しボード' : 'キオスク'}キーを再生成しますか？
              </AlertDialogTitle>
              <AlertDialogDescription>
                キーを再生成すると、現在のURLは無効になります。新しいURLを各端末に再配布してください。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmKeyRegeneration}
                disabled={!pendingKeyType || regenerateKeyMutation.isPending}
              >
                {regenerateKeyMutation.isPending ? '再生成中...' : '再生成する'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}

