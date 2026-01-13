import { useParams, useLocation } from 'wouter';
import { useState, useEffect } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
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
  CreditCard,
  MessageSquare,
  Wallet
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
  
  const balance = balanceData?.balance ?? 0;
  const messagesRemaining = Math.floor(balance / SMS_COST_PER_MESSAGE);
  const isLowBalance = balance < 1000;
  
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
            <p className="text-sm text-destructive mt-1">
              残高が少なくなっています。チャージしてください。
            </p>
          )}
        </div>
      </div>
      
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

export default function Settings() {
  const params = useParams<{ section?: string }>();
  const [, navigate] = useLocation();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  
  const [activeTab, setActiveTab] = useState(params.section || 'general');
  const [isSaving, setIsSaving] = useState(false);
  
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

  // Get user's store
  const { data: store, isLoading: storeLoading, refetch: refetchStore } = trpc.store.getByOwner.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

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
                      onCheckedChange={(checked) => updateField('enableReorder', checked)}
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

                {store && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <h3 className="font-medium">アクセスURL</h3>
                      <div className="space-y-2 text-sm">
                        <p><strong>店舗トップ:</strong> /s/{store.slug}</p>
                        <p><strong>キオスク:</strong> /s/{store.slug}/kiosk</p>
                        <p><strong>呼び出しボード:</strong> /s/{store.slug}/board</p>
                        <p><strong>スタッフ画面:</strong> /s/{store.slug}/staff</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
