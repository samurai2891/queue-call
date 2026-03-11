import { useParams, useLocation } from 'wouter';
import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { useAuth } from '@/_core/hooks/useAuth';
import { StoreLayout } from '@/components/StoreLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { 
  Tablet, 
  Copy, 
  ExternalLink, 
  QrCode, 
  CheckCircle,
  AlertCircle,
  Eye,
  Settings
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { Locale } from '@/contexts/LocaleContext';

function KioskAdminContent() {
  const params = useParams<{ storeSlug: string }>();
  const [, navigate] = useLocation();
  const { t } = useLocale();
  const { user, loading: authLoading } = useAuth();
  
  const [copied, setCopied] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);

  const { data: storePublic, isLoading: storeLoading, error: storeError } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  // シンプルなURL（トークン不要）
  const kioskUrl = useMemo(() => {
    if (!storePublic) return '';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/s/${params.storeSlug}/kiosk/display`;
  }, [storePublic, params.storeSlug]);

  const qrCodeUrl = useMemo(() => {
    if (!kioskUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(kioskUrl)}`;
  }, [kioskUrl]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(kioskUrl);
      setCopied(true);
      toast.success(t('admin.urlCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleOpenPreview = () => {
    window.open(kioskUrl, '_blank');
  };

  const handleGoToSettings = () => {
    navigate('/admin/settings/kiosk');
  };

  // Loading state
  if (storeLoading || authLoading) {
    return (
      <StoreLayout storeSlug={params.storeSlug || ''}>
        <div className="container py-8 max-w-4xl">
          <Skeleton className="h-10 w-64 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </StoreLayout>
    );
  }

  // Error state
  if (storeError || !storePublic) {
    return (
      <StoreLayout storeSlug={params.storeSlug || ''}>
        <div className="container py-8 flex flex-col items-center justify-center gap-4">
          <AlertCircle className="h-16 w-16 text-destructive" />
          <h1 className="text-2xl font-bold">{t('common.error')}</h1>
          <p className="text-muted-foreground">{t('store.notFound')}</p>
        </div>
      </StoreLayout>
    );
  }

  // Auth check
  if (!user) {
    return (
      <StoreLayout storeSlug={params.storeSlug || ''} storeName={storePublic.name}>
        <div className="container py-8 flex flex-col items-center justify-center gap-4">
          <AlertCircle className="h-16 w-16 text-warning" />
          <h1 className="text-2xl font-bold">{t('settings.loginRequiredTitle')}</h1>
          <Button onClick={() => navigate('/')}>
            {t('common.back')}
          </Button>
        </div>
      </StoreLayout>
    );
  }

  const isPaused = storePublic.intakeStatus === 'paused';

  return (
    <StoreLayout storeSlug={params.storeSlug || ''} storeName={storePublic.name}>
      <div className="container py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Tablet className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">{t('admin.kioskManagement')}</h1>
              <p className="text-muted-foreground">{storePublic.name}</p>
            </div>
          </div>
          <Badge variant={isPaused ? 'secondary' : 'default'}>
            {isPaused ? t('store.intakePaused') : t('staff.intakeOpen')}
          </Badge>
        </div>

        {/* Main Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              {t('admin.kioskDisplayUrl')}
            </CardTitle>
            <CardDescription>
              {t('admin.kioskDisplayDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* URL Display */}
            <div className="space-y-2">
              <Label htmlFor="kiosk-url">{t('admin.displayUrl')}</Label>
              <div className="flex gap-2">
                <Input
                  id="kiosk-url"
                  value={kioskUrl}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyUrl}
                  aria-label={t('admin.copyUrl')}
                >
                  {copied ? (
                    <CheckCircle className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 pt-4 border-t">
              <Button onClick={handleOpenPreview}>
                <Eye className="mr-2 h-4 w-4" />
                {t('admin.preview')}
              </Button>

              <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <QrCode className="mr-2 h-4 w-4" />
                    {t('admin.showQrCode')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>{t('admin.kioskQrCode')}</DialogTitle>
                    <DialogDescription>
                      {t('admin.kioskQrCodeDesc')}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col items-center gap-4 py-4">
                    <img 
                      src={qrCodeUrl} 
                      alt="Kiosk QR Code" 
                      className="w-64 h-64 border rounded-lg"
                    />
                    <p className="text-sm text-muted-foreground text-center">
                      {t('admin.scanToAccess')}
                    </p>
                  </div>
                </DialogContent>
              </Dialog>

              <Button variant="outline" onClick={handleGoToSettings}>
                <Settings className="mr-2 h-4 w-4" />
                {t('admin.kioskSettings')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tips Card */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">{t('admin.tips')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 text-success shrink-0" />
                {t('admin.kioskTip1')}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 text-success shrink-0" />
                {t('admin.kioskTip2')}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 text-success shrink-0" />
                {t('admin.kioskTip3')}
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </StoreLayout>
  );
}

export default function KioskAdmin() {
  const params = useParams<{ storeSlug: string }>();
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const supportedLocales = (store?.supportedLocales || SUPPORTED_LOCALES) as Locale[];
  const defaultLocale = (store?.defaultLocale || 'ja') as Locale;

  return (
    <LocaleProvider defaultLocale={defaultLocale} supportedLocales={supportedLocales}>
      <KioskAdminContent />
    </LocaleProvider>
  );
}
