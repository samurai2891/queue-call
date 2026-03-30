import { useParams, useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Bell, BellOff, Download, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { usePushNotification } from '@/hooks/usePushNotification';
import type { Locale } from '@/contexts/LocaleContext';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function NotificationsContent() {
  const params = useParams<{ storeSlug: string; token: string }>();
  const [, navigate] = useLocation();
  const { t } = useLocale();

  const [iosGuideOpen, setIosGuideOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  const { data: store, isLoading: storeLoading } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const { data: ticket, isLoading: ticketLoading, error } = trpc.ticket.getByToken.useQuery(
    { token: params.token || '' },
    { enabled: !!params.token }
  );

  const subscribePushMutation = trpc.notification.subscribePush.useMutation();
  const trpcUtils = trpc.useUtils();

  const { isSupported, isSubscribed, isLoading: isPushLoading, permission, subscribe } = usePushNotification({
    ticketId: ticket?.id,
    subscribeFn: async (data) => {
      await subscribePushMutation.mutateAsync(data);
    },
    checkServerSubscription: async (ticketId: number, endpoint: string) => {
      try {
        const result = await trpcUtils.notification.checkPushSubscription.fetch({ ticketId, endpoint });
        return result.exists;
      } catch {
        return true; // If check fails, assume subscribed to avoid false negatives
      }
    },
    getVapidPublicKey: async () => {
      // VAPID public key is embedded at build time via VITE_VAPID_PUBLIC_KEY env var
      return (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || null;
    },
    onSubscribed: () => {
      toast.success(t('notification.pushEnabled'));
    },
    onError: (message) => {
      toast.error(message);
    },
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setIsIos(ios);
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone;
    setIsStandalone(!!standalone);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleEnablePush = async () => {
    if (isIos && !isStandalone) {
      setIosGuideOpen(true);
      return;
    }

    const subscribed = await subscribe();
    if (!subscribed && Notification.permission === 'denied') {
      toast.error(t('notification.pushDenied'));
    }
  };

  const handleInstall = async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    setInstallPromptEvent(null);
  };

  if (storeLoading || ticketLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="p-4 flex justify-between items-center">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-24" />
        </header>
        <main className="flex-1 container flex flex-col items-center justify-center gap-8 py-8">
          <Skeleton className="h-80 w-full max-w-md" />
        </main>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold">{t('common.error')}</h1>
        <p className="text-muted-foreground">{t('checkin.notFound')}</p>
        <Button variant="outline" onClick={() => navigate(`/s/${params.storeSlug}`)}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const showInstallButton = !isStandalone && !!installPromptEvent;
  const canOfferPush = isSupported || (isIos && !isStandalone);
  const showUnsupported = !isSupported && !(isIos && !isStandalone);
  const showPermissionDenied = isSupported && permission === 'denied';

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/30">
      <header className="p-4 flex justify-between items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/s/${params.storeSlug}/ticket/${params.token}`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <LanguageSwitcher showLabel />
      </header>

      <main className="flex-1 container flex flex-col items-center py-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t('notification.title')}</CardTitle>
            <CardDescription>{t('notification.pushDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {showUnsupported && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <BellOff className="h-4 w-4" />
                <span>{t('notification.pushUnsupported')}</span>
              </div>
            )}

            {showPermissionDenied && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <BellOff className="h-4 w-4" />
                <span>{t('notification.pushDenied')}</span>
              </div>
            )}

            {canOfferPush && !showPermissionDenied && (
              <Button
                className="w-full"
                onClick={handleEnablePush}
                disabled={isPushLoading || subscribePushMutation.isPending || isSubscribed}
              >
                {isPushLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Bell className="mr-2 h-4 w-4" />
                )}
                {isSubscribed ? t('notification.pushEnabled') : t('notification.enablePush')}
              </Button>
            )}

            {/* L-004: PWAインストールプロンプトの改善 */}
            {showInstallButton && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2">
                    <Download className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{t('notification.installTitle')}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{t('notification.installDesc')}</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full mt-3" onClick={handleInstall}>
                  <Download className="mr-2 h-4 w-4" />
                  {t('notification.installButton')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={iosGuideOpen} onOpenChange={setIosGuideOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('notification.installTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('notification.installBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setIosGuideOpen(false)}>
              {t('common.close')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Notifications() {
  const params = useParams<{ storeSlug: string }>();
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const supportedLocales = (store?.supportedLocales || SUPPORTED_LOCALES) as Locale[];
  const defaultLocale = (store?.defaultLocale || 'ja') as Locale;

  return (
    <LocaleProvider defaultLocale={defaultLocale} supportedLocales={supportedLocales}>
      <NotificationsContent />
    </LocaleProvider>
  );
}
