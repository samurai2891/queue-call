import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Key, RefreshCw, Copy, Check, AlertTriangle, CheckCircle2, Info, Bell, Send, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface VapidSettingsProps {
  t: (key: any) => string;
}

export function VapidSettings({ t }: VapidSettingsProps) {
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<{
    publicKey: string;
    privateKey: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [pushSubscription, setPushSubscription] = useState<PushSubscription | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const { data: vapidStatus, isLoading, refetch } = trpc.system.getVapidStatus.useQuery();
  const { data: vapidPublicKey } = trpc.system.getVapidPublicKey.useQuery();
  
  const generateKeysMutation = trpc.system.generateVapidKeys.useMutation({
    onSuccess: (data) => {
      setGeneratedKeys(data.keys);
      setShowGenerateDialog(true);
    },
    onError: (error) => {
      toast.error(`${t('settings.vapid.generateError')}: ${error.message}`);
    },
  });

  const sendTestMutation = trpc.system.sendTestPushNotification.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(t('settings.vapid.testSent'));
      } else {
        toast.error(`${t('settings.vapid.testFailed')}: ${result.error}`);
      }
      setIsSendingTest(false);
    },
    onError: (error) => {
      toast.error(`${t('settings.vapid.testFailed')}: ${error.message}`);
      setIsSendingTest(false);
    },
  });

  // Check for existing push subscription
  useEffect(() => {
    const checkSubscription = async () => {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          setPushSubscription(subscription);
        } catch (error) {
          console.error('Failed to check push subscription:', error);
        }
      }
    };
    checkSubscription();
  }, []);

  const handleGenerateKeys = () => {
    generateKeysMutation.mutate();
  };

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(t('settings.vapid.copied'));
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error(t('settings.vapid.copyError'));
    }
  };

  const handleCloseDialog = () => {
    setShowGenerateDialog(false);
    setGeneratedKeys(null);
    refetch();
  };

  // Subscribe to push notifications for testing
  const handleSubscribeForTest = async () => {
    if (!vapidPublicKey?.publicKey) {
      toast.error(t('settings.vapid.notConfigured'));
      return;
    }

    setIsSubscribing(true);
    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error(t('settings.vapid.permissionDenied'));
        setIsSubscribing(false);
        return;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey.publicKey),
      });

      setPushSubscription(subscription);
      toast.success(t('settings.vapid.subscribed'));
    } catch (error) {
      console.error('Failed to subscribe:', error);
      toast.error(t('settings.vapid.subscribeFailed'));
    } finally {
      setIsSubscribing(false);
    }
  };

  // Send test notification
  const handleSendTestNotification = async () => {
    if (!pushSubscription) {
      toast.error(t('settings.vapid.noSubscription'));
      return;
    }

    setIsSendingTest(true);
    const subscriptionJson = pushSubscription.toJSON();
    
    sendTestMutation.mutate({
      endpoint: pushSubscription.endpoint,
      p256dh: subscriptionJson.keys?.p256dh || '',
      auth: subscriptionJson.keys?.auth || '',
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {t('settings.vapid.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-10 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {t('settings.vapid.title')}
          </CardTitle>
          <CardDescription>
            {t('settings.vapid.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{t('settings.vapid.status')}:</span>
            {vapidStatus?.configured ? (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {t('settings.vapid.configured')}
              </Badge>
            ) : (
              <Badge variant="destructive">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {t('settings.vapid.notConfigured')}
              </Badge>
            )}
          </div>

          {/* Current Public Key (if configured) */}
          {vapidStatus?.configured && vapidStatus.publicKey && (
            <div className="space-y-2">
              <Label>{t('settings.vapid.currentPublicKey')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={vapidStatus.publicKey}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(vapidStatus.publicKey!, 'currentPublic')}
                >
                  {copiedField === 'currentPublic' ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Info Alert */}
          {!vapidStatus?.configured && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>{t('settings.vapid.setupRequired')}</AlertTitle>
              <AlertDescription>
                {t('settings.vapid.setupDescription')}
              </AlertDescription>
            </Alert>
          )}

          {/* Generate Button */}
          <Button
            onClick={handleGenerateKeys}
            disabled={generateKeysMutation.isPending}
            className="w-full sm:w-auto"
          >
            {generateKeysMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Key className="h-4 w-4 mr-2" />
            )}
            {vapidStatus?.configured
              ? t('settings.vapid.regenerate')
              : t('settings.vapid.generate')}
          </Button>

          {vapidStatus?.configured && (
            <p className="text-xs text-muted-foreground">
              {t('settings.vapid.regenerateWarning')}
            </p>
          )}

          {/* Test Notification Section */}
          {vapidStatus?.configured && (
            <>
              <Separator className="my-4" />
              
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  <h4 className="font-medium">{t('settings.vapid.testNotification')}</h4>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  {t('settings.vapid.testDescription')}
                </p>

                {/* Subscription Status */}
                <div className="flex items-center gap-3">
                  <span className="text-sm">{t('settings.vapid.subscriptionStatus')}:</span>
                  {pushSubscription ? (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {t('settings.vapid.subscriptionActive')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      {t('settings.vapid.subscriptionInactive')}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {!pushSubscription && (
                    <Button
                      variant="outline"
                      onClick={handleSubscribeForTest}
                      disabled={isSubscribing}
                    >
                      {isSubscribing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Bell className="h-4 w-4 mr-2" />
                      )}
                      {t('settings.vapid.enableNotifications')}
                    </Button>
                  )}
                  
                  <Button
                    onClick={handleSendTestNotification}
                    disabled={!pushSubscription || isSendingTest}
                  >
                    {isSendingTest ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    {t('settings.vapid.sendTest')}
                  </Button>
                </div>

                {!pushSubscription && (
                  <p className="text-xs text-muted-foreground">
                    {t('settings.vapid.enableFirst')}
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Generated Keys Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              {t('settings.vapid.keysGenerated')}
            </DialogTitle>
            <DialogDescription>
              {t('settings.vapid.keysGeneratedDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t('settings.vapid.important')}</AlertTitle>
              <AlertDescription>
                {t('settings.vapid.saveKeysWarning')}
              </AlertDescription>
            </Alert>

            {generatedKeys && (
              <div className="space-y-4">
                {/* Public Key */}
                <div className="space-y-2">
                  <Label className="font-semibold">VAPID_PUBLIC_KEY / VITE_VAPID_PUBLIC_KEY</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={generatedKeys.publicKey}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCopy(generatedKeys.publicKey, 'public')}
                    >
                      {copiedField === 'public' ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Private Key */}
                <div className="space-y-2">
                  <Label className="font-semibold">VAPID_PRIVATE_KEY</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={generatedKeys.privateKey}
                      readOnly
                      className="font-mono text-xs"
                      type="password"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCopy(generatedKeys.privateKey, 'private')}
                    >
                      {copiedField === 'private' ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Instructions */}
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <p className="text-sm font-medium">{t('settings.vapid.instructions')}</p>
                  <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                    <li>{t('settings.vapid.instruction1')}</li>
                    <li>{t('settings.vapid.instruction2')}</li>
                    <li>{t('settings.vapid.instruction3')}</li>
                  </ol>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={handleCloseDialog}>
              {t('settings.vapid.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Helper function to convert VAPID public key
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
