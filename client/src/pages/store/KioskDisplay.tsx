import { useParams, useLocation } from 'wouter';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Minus, Plus, Printer, CheckCircle, RotateCcw, AlertCircle, Globe, QrCode, Clock } from 'lucide-react';
import { AnimatedPage } from '@/components/AnimatedPage';
import { BrandThemeProvider } from '@/components/BrandThemeProvider';
import { RATE_LIMITED_ERR_MSG } from '@shared/const';
import { checkBusinessHours, getTodayBusinessHoursText } from '../../../../shared/businessHours';
import type { Locale } from '@/contexts/LocaleContext';


type KioskState = 'language' | 'input' | 'success' | 'error';

function KioskDisplayContent() {
  const params = useParams<{ storeSlug: string }>();
  const [, navigate] = useLocation();
  const { t, locale, setLocale } = useLocale();
  
  const [state, setState] = useState<KioskState>('language');

  const [partySize, setPartySize] = useState(2);
  const [issuedTicket, setIssuedTicket] = useState<{ number: number; token: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const { data: store, isLoading: storeLoading, error: storeError } = trpc.store.getBySlugForKiosk.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const createTicketMutation = trpc.ticket.create.useMutation({

    onSuccess: (ticket) => {
      setIssuedTicket({ number: ticket.number, token: ticket.ticketToken });
      setState('success');
    },
    onError: (error) => {
      const message = error.message === RATE_LIMITED_ERR_MSG
        ? t('common.rateLimited')
        : error.message;
      setErrorMessage(message);
      setState('error');
    },

  });

  const kioskSettings = store?.settings?.kiosk;
  const autoResetSeconds = kioskSettings?.autoResetSeconds || 15;
  const maxPartySize = kioskSettings?.maxPartySize || 10;

  // Auto reset after success/error
  useEffect(() => {
    if (state === 'success' || state === 'error') {
      const timer = setTimeout(() => {
        resetKiosk();
      }, autoResetSeconds * 1000);
      return () => clearTimeout(timer);
    }
  }, [state, autoResetSeconds]);

  const resetKiosk = useCallback(() => {
    setState('language');
    setPartySize(2);
    setIssuedTicket(null);
    setErrorMessage('');
  }, []);

  const handleLanguageSelect = (selectedLocale: Locale) => {
    setLocale(selectedLocale);
    setState('input');
  };

  const handleSubmit = () => {
    if (!store) return;
    createTicketMutation.mutate({
      storeId: store.id,
      partySize,
      locale,
      source: 'kiosk',
    });
  };

  const decrementPartySize = () => {
    if (partySize > 1) setPartySize(partySize - 1);
  };

  const incrementPartySize = () => {
    if (partySize < maxPartySize) setPartySize(partySize + 1);
  };

  // Generate QR code URL for the ticket page
  const ticketQrCodeUrl = useMemo(() => {
    if (!issuedTicket || !params.storeSlug) return '';
    const origin = window.location.origin;
    const ticketUrl = `${origin}/s/${params.storeSlug}/ticket/${issuedTicket.token}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(ticketUrl)}&margin=8`;
  }, [issuedTicket, params.storeSlug]);

  if (storeLoading) {
    return (
      <div className="kiosk-mode flex items-center justify-center">
        <div className="animate-pulse text-4xl">{t('common.loading')}</div>

      </div>
    );
  }

  if (storeError || !store) {
    const message = t('common.error');

    return (
      <div className="kiosk-mode flex flex-col items-center justify-center gap-6 p-8">
        <AlertCircle className="h-24 w-24 text-destructive" />
        <h1 className="text-4xl font-bold">{message}</h1>
        <Button size="lg" onClick={() => navigate('/')}>
          {t('common.back')}
        </Button>
      </div>
    );
  }


  const isPaused = store.intakeStatus === 'paused';

  // Business hours check
  const businessHoursStatus = useMemo(() => {
    return checkBusinessHours(store.settings?.businessHours as any);
  }, [store.settings?.businessHours]);

  const todayHoursText = useMemo(() => {
    return getTodayBusinessHoursText(store.settings?.businessHours as any);
  }, [store.settings?.businessHours]);

  const isOutsideBusinessHours = !businessHoursStatus.isOpen;

  if (isPaused) {
    return (
      <div className="kiosk-mode flex flex-col items-center justify-center gap-6 p-8 bg-warning/5">
        <AlertCircle className="h-32 w-32 text-warning" />
        <h1 className="text-5xl font-bold text-center">{t('store.intakePaused')}</h1>
      </div>
    );
  }

  if (isOutsideBusinessHours) {
    return (
      <div className="kiosk-mode flex flex-col items-center justify-center gap-8 p-8">
        <AnimatedPage variant="zoom-fade" delay={50}>
          <div className="flex flex-col items-center gap-4">
            {store.settings?.branding?.logoUrl && (
              <img src={store.settings.branding.logoThumbUrl || store.settings.branding.logoUrl} alt={store.name} className="h-20 w-20 rounded-2xl object-contain" />
            )}
            <Clock className="h-32 w-32 text-destructive" />
            <h1 className="text-5xl font-bold text-center">{t('store.outsideBusinessHours')}</h1>
            <p className="text-2xl text-muted-foreground text-center max-w-lg">
              {businessHoursStatus.reason === 'closed_day'
                ? t('store.closedDayMessage')
                : t('store.closedMessage')}
            </p>
            {todayHoursText && (
              <p className="text-xl text-muted-foreground">
                {t('store.businessHoursToday')}: {todayHoursText}
              </p>
            )}
          </div>
        </AnimatedPage>
      </div>
    );
  }

  // Language Selection Screen — animated entrance
  if (state === 'language') {
    const supportedLocales = (store.supportedLocales || SUPPORTED_LOCALES) as Locale[];
    const localeLabels: Record<Locale, string> = {
      ja: '日本語',
      en: 'English',
      ko: '한국어',
      'zh-Hans': '简体中文',
      'zh-Hant': '繁體中文',
    };

    return (
      <div className="kiosk-mode flex flex-col items-center justify-center gap-8 p-8">
        <AnimatedPage variant="zoom-fade" delay={50}>
          <div className="flex flex-col items-center gap-4">
            <Globe className="h-24 w-24 text-primary" />
            <h1 className="text-4xl font-bold text-center">{t('kiosk.selectLanguage')}</h1>
          </div>
        </AnimatedPage>
        <div className="grid grid-cols-1 gap-4 w-full max-w-md">
          {supportedLocales.map((loc, i) => (
            <AnimatedPage key={loc} variant="fade-up" delay={150 + i * 80}>
              <Button
                size="lg"
                className="kiosk-button w-full active:scale-[0.97] transition-transform"
                onClick={() => handleLanguageSelect(loc)}
              >
                {localeLabels[loc]}
              </Button>
            </AnimatedPage>
          ))}
        </div>
      </div>
    );
  }

  // Party Size Input Screen — animated entrance
  if (state === 'input') {
    return (
      <div className="kiosk-mode flex flex-col items-center justify-center gap-8 p-8">
        <AnimatedPage variant="fade-up" delay={50}>
          <div className="flex flex-col items-center gap-3">
            {store.settings?.branding?.logoUrl && (
              <img src={store.settings.branding.logoThumbUrl || store.settings.branding.logoUrl} alt={store.name} className="h-20 w-20 rounded-2xl object-contain" />
            )}
            <h1 className="text-4xl font-bold text-center">{store.name}</h1>
          </div>
        </AnimatedPage>
        
        <AnimatedPage variant="zoom-fade" delay={150}>
          <Card className="w-full max-w-lg">
            <CardContent className="p-8 space-y-8">
              {/* Kiosk Custom Message */}
              {store.settings?.customMessages?.kioskMessage && (
                <div className="rounded-lg bg-muted/50 border border-border/50 p-4">
                  <p className="text-lg text-center text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {store.settings.customMessages.kioskMessage}
                  </p>
                </div>
              )}

              <div className="text-center">
                <p className="text-2xl text-muted-foreground mb-4">{t('join.partySize')}</p>
                <div className="flex items-center justify-center gap-6">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-20 w-20 rounded-full text-3xl active:scale-90 transition-transform"
                    onClick={decrementPartySize}
                    disabled={partySize <= 1}
                  >
                    <Minus className="h-10 w-10" />
                  </Button>
                  <div className="text-center min-w-[150px]">
                    <span className="text-8xl font-bold tabular-nums transition-all duration-200">{partySize}</span>
                    <span className="text-3xl text-muted-foreground ml-2">{t('common.people')}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-20 w-20 rounded-full text-3xl active:scale-90 transition-transform"
                    onClick={incrementPartySize}
                    disabled={partySize >= maxPartySize}
                  >
                    <Plus className="h-10 w-10" />
                  </Button>
                </div>
              </div>

              <Button
                size="lg"
                className="w-full h-24 text-3xl active:scale-[0.97] transition-transform"
                onClick={handleSubmit}
                disabled={createTicketMutation.isPending}
              >
                <Printer className="mr-3 h-8 w-8" />
                {t('kiosk.issueTicket')}
              </Button>

              <Button
                variant="ghost"
                size="lg"
                className="w-full"
                onClick={resetKiosk}
              >
                <RotateCcw className="mr-2 h-5 w-5" />
                {t('kiosk.changeLanguage')}
              </Button>
            </CardContent>
          </Card>
        </AnimatedPage>
      </div>
    );
  }

  // ========== P2-10: Success Screen with QR Code — animated ==========
  if (state === 'success' && issuedTicket) {
    return (
      <div className="kiosk-mode flex flex-col items-center justify-center gap-6 p-8 bg-success/5">
        <AnimatedPage variant="zoom-fade" delay={50}>
          <div className="flex flex-col items-center gap-2">
            {store.settings?.branding?.logoUrl && (
              <img src={store.settings.branding.logoThumbUrl || store.settings.branding.logoUrl} alt={store.name} className="h-14 w-14 rounded-xl object-contain" />
            )}
            <CheckCircle className="h-24 w-24 text-success mx-auto" />
          </div>
        </AnimatedPage>
        
        <AnimatedPage variant="zoom-fade" delay={150}>
          <div className="text-center">
            <p className="text-3xl text-muted-foreground mb-2">{t('kiosk.yourNumber')}</p>
            <p className="text-[10rem] font-bold tabular-nums text-success leading-none">
              {issuedTicket.number}
            </p>
          </div>
        </AnimatedPage>

        {/* QR Code for ticket status — animated entrance */}
        <AnimatedPage variant="fade-up" delay={350}>
          <div className="flex flex-col items-center gap-3">
            <div className="bg-card p-3 rounded-xl shadow-md border">
              <img 
                src={ticketQrCodeUrl} 
                alt="Ticket QR Code" 
                className="w-40 h-40"
                loading="eager"
              />
            </div>
            <p className="text-lg text-muted-foreground text-center max-w-md">
              <QrCode className="inline h-5 w-5 mr-1 -mt-0.5" />
              {t('kiosk.scanForDetails')}
            </p>
          </div>
        </AnimatedPage>

        <AnimatedPage variant="fade" delay={500}>
          <p className="text-xl text-muted-foreground text-center">
            {t('kiosk.waitMessage')}
          </p>
        </AnimatedPage>

        <AnimatedPage variant="fade" delay={600}>
          <div className="text-center text-muted-foreground">
            <p>{t('kiosk.autoReset').replace('{seconds}', autoResetSeconds.toString())}</p>
          </div>
        </AnimatedPage>

        <AnimatedPage variant="fade-up" delay={650}>
          <Button
            variant="outline"
            size="lg"
            className="mt-2 active:scale-[0.97] transition-transform"
            onClick={resetKiosk}
          >
            <RotateCcw className="mr-2 h-5 w-5" />
            {t('kiosk.newCustomer')}
          </Button>
        </AnimatedPage>
      </div>
    );
  }

  // Error Screen — animated
  if (state === 'error') {
    return (
      <div className="kiosk-mode flex flex-col items-center justify-center gap-8 p-8 bg-destructive/5">
        <AnimatedPage variant="zoom-fade" delay={50}>
          <AlertCircle className="h-32 w-32 text-destructive mx-auto" />
        </AnimatedPage>
        
        <AnimatedPage variant="fade-up" delay={150}>
          <h1 className="text-4xl font-bold text-destructive text-center">
            {t('common.error')}
          </h1>
        </AnimatedPage>

        <AnimatedPage variant="fade-up" delay={250}>
          <p className="text-2xl text-muted-foreground text-center">
            {errorMessage || t('common.error')}
          </p>
        </AnimatedPage>

        <AnimatedPage variant="fade-up" delay={350}>
          <Button
            size="lg"
            className="kiosk-button active:scale-[0.97] transition-transform"
            onClick={resetKiosk}
          >
            <RotateCcw className="mr-2 h-6 w-6" />
            {t('kiosk.tryAgain')}
          </Button>
        </AnimatedPage>
      </div>
    );
  }

  return null;
}

export default function KioskDisplay() {
  const params = useParams<{ storeSlug: string }>();
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const supportedLocales = (store?.supportedLocales || SUPPORTED_LOCALES) as Locale[];
  const defaultLocale = (store?.defaultLocale || 'ja') as Locale;

  const branding = store?.settings?.branding as { primaryColor?: string; secondaryColor?: string; accentColor?: string } | undefined;

  return (
    <LocaleProvider defaultLocale={defaultLocale} supportedLocales={supportedLocales}>
      <BrandThemeProvider branding={branding}>
        <KioskDisplayContent />
      </BrandThemeProvider>
    </LocaleProvider>
  );
}
