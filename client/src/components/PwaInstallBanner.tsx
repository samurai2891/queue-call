import { usePwaInstall } from '@/hooks/usePwaInstall';
import { useLocale } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Download, X, Share, Plus } from 'lucide-react';

interface PwaInstallBannerProps {
  variant?: 'banner' | 'card' | 'minimal';
  className?: string;
}

export function PwaInstallBanner({ variant = 'banner', className = '' }: PwaInstallBannerProps) {
  const { isInstallable, isIos, promptInstall, dismissPrompt, showIosGuide, setShowIosGuide } = usePwaInstall();
  const { t } = useLocale();

  if (!isInstallable) {
    return null;
  }

  const handleInstall = async () => {
    await promptInstall();
  };

  // Minimal variant - just a button
  if (variant === 'minimal') {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={handleInstall}
          className={className}
        >
          <Download className="h-4 w-4 mr-2" />
          {t('pwa.installButton')}
        </Button>
        <IosGuideDialog open={showIosGuide} onOpenChange={setShowIosGuide} t={t} />
      </>
    );
  }

  // Card variant - for embedding in pages
  if (variant === 'card') {
    return (
      <>
        <div className={`border rounded-lg p-4 bg-gradient-to-r from-primary/5 to-primary/10 ${className}`}>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2 shrink-0">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm">{t('pwa.installTitle')}</h4>
              <p className="text-xs text-muted-foreground mt-1">{t('pwa.installDesc')}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 -mt-1 -mr-1"
              onClick={dismissPrompt}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="default" size="sm" className="w-full mt-3" onClick={handleInstall}>
            <Download className="mr-2 h-4 w-4" />
            {t('pwa.installButton')}
          </Button>
        </div>
        <IosGuideDialog open={showIosGuide} onOpenChange={setShowIosGuide} t={t} />
      </>
    );
  }

  // Banner variant - fixed at bottom
  return (
    <>
      <div className={`fixed bottom-0 left-0 right-0 z-40 p-4 bg-background border-t shadow-lg animate-in slide-in-from-bottom duration-300 ${className}`}>
        <div className="container max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2 shrink-0">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate">{t('pwa.installTitle')}</h4>
              <p className="text-xs text-muted-foreground truncate">{t('pwa.installDescShort')}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={dismissPrompt}>
                {t('common.close')}
              </Button>
              <Button size="sm" onClick={handleInstall}>
                {t('pwa.install')}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <IosGuideDialog open={showIosGuide} onOpenChange={setShowIosGuide} t={t} />
    </>
  );
}

// iOS installation guide dialog
function IosGuideDialog({ 
  open, 
  onOpenChange, 
  t 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  t: (key: any) => string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('pwa.iosGuideTitle')}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>{t('pwa.iosGuideIntro')}</p>
              <ol className="list-decimal list-inside space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">1.</span>
                  <span className="flex items-center gap-1">
                    {t('pwa.iosStep1')}
                    <Share className="h-4 w-4 inline text-primary" />
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">2.</span>
                  <span className="flex items-center gap-1">
                    {t('pwa.iosStep2')}
                    <Plus className="h-4 w-4 inline text-primary" />
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">3.</span>
                  <span>{t('pwa.iosStep3')}</span>
                </li>
              </ol>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
