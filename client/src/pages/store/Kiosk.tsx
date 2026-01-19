import { useParams, useLocation } from 'wouter';
import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Minus, Plus, Printer, CheckCircle, RotateCcw, AlertCircle, Globe } from 'lucide-react';
import { RATE_LIMITED_ERR_MSG } from '@shared/const';
import type { Locale } from '@/contexts/LocaleContext';


type KioskState = 'language' | 'input' | 'success' | 'error';

function KioskContent() {
  const params = useParams<{ storeSlug: string }>();
  const [location, navigate] = useLocation();
  const { t, locale, setLocale } = useLocale();
  const kioskToken = new URLSearchParams(location.split('?')[1] ?? '').get('token') ?? undefined;
  
  const [state, setState] = useState<KioskState>('language');

  const [partySize, setPartySize] = useState(2);
  const [issuedTicket, setIssuedTicket] = useState<{ number: number; token: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const { data: store, isLoading: storeLoading, error: storeError } = trpc.store.getBySlugWithKioskToken.useQuery(
    { slug: params.storeSlug || '', token: kioskToken || '' },
    { enabled: !!params.storeSlug && !!kioskToken }
  );
  
  // Show error if no token provided
  const noToken = !kioskToken && !!params.storeSlug;
  const accessDenied = storeError?.data?.code === 'FORBIDDEN';

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

  if (storeLoading) {
    return (
      <div className="kiosk-mode flex items-center justify-center">
        <div className="animate-pulse text-4xl">{t('common.loading')}</div>

      </div>
    );
  }

  if (noToken || storeError || !store) {
    const message = (noToken || accessDenied) ? t('common.accessKeyRequired') : t('common.error');

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

  if (isPaused) {
    return (
      <div className="kiosk-mode flex flex-col items-center justify-center gap-6 p-8 bg-warning/5">
        <AlertCircle className="h-32 w-32 text-warning" />
        <h1 className="text-5xl font-bold text-center">{t('store.intakePaused')}</h1>
      </div>
    );
  }

  // Language Selection Screen
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
        <Globe className="h-24 w-24 text-primary" />
        <h1 className="text-4xl font-bold text-center">{t('kiosk.selectLanguage')}</h1>
        <div className="grid grid-cols-1 gap-4 w-full max-w-md">
          {supportedLocales.map((loc) => (
            <Button
              key={loc}
              size="lg"
              className="kiosk-button"
              onClick={() => handleLanguageSelect(loc)}
            >
              {localeLabels[loc]}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // Party Size Input Screen
  if (state === 'input') {
    return (
      <div className="kiosk-mode flex flex-col items-center justify-center gap-8 p-8">
        <h1 className="text-4xl font-bold text-center">{store.name}</h1>
        
        <Card className="w-full max-w-lg">
          <CardContent className="p-8 space-y-8">
            <div className="text-center">
              <p className="text-2xl text-muted-foreground mb-4">{t('join.partySize')}</p>
              <div className="flex items-center justify-center gap-6">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-20 w-20 rounded-full text-3xl"
                  onClick={decrementPartySize}
                  disabled={partySize <= 1}
                >
                  <Minus className="h-10 w-10" />
                </Button>
                <div className="text-center min-w-[150px]">
                  <span className="text-8xl font-bold tabular-nums">{partySize}</span>
                  <span className="text-3xl text-muted-foreground ml-2">{t('common.people')}</span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-20 w-20 rounded-full text-3xl"
                  onClick={incrementPartySize}
                  disabled={partySize >= maxPartySize}
                >
                  <Plus className="h-10 w-10" />
                </Button>
              </div>
            </div>

            <Button
              size="lg"
              className="w-full h-24 text-3xl"
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
      </div>
    );
  }

  // Success Screen
  if (state === 'success' && issuedTicket) {
    return (
      <div className="kiosk-mode flex flex-col items-center justify-center gap-8 p-8 bg-success/5">
        <CheckCircle className="h-32 w-32 text-success" />
        
        <div className="text-center">
          <p className="text-3xl text-muted-foreground mb-4">{t('kiosk.yourNumber')}</p>
          <p className="text-[12rem] font-bold tabular-nums text-success leading-none">
            {issuedTicket.number}
          </p>
        </div>

        <p className="text-2xl text-muted-foreground text-center">
          {t('kiosk.waitMessage')}
        </p>

        <div className="text-center text-muted-foreground">
          <p>{t('kiosk.autoReset').replace('{seconds}', autoResetSeconds.toString())}</p>
        </div>

        <Button
          variant="outline"
          size="lg"
          className="mt-4"
          onClick={resetKiosk}
        >
          <RotateCcw className="mr-2 h-5 w-5" />
          {t('kiosk.newCustomer')}
        </Button>
      </div>
    );
  }

  // Error Screen
  if (state === 'error') {
    return (
      <div className="kiosk-mode flex flex-col items-center justify-center gap-8 p-8 bg-destructive/5">
        <AlertCircle className="h-32 w-32 text-destructive" />
        
        <h1 className="text-4xl font-bold text-destructive text-center">
          {t('common.error')}
        </h1>

        <p className="text-2xl text-muted-foreground text-center">
          {errorMessage || t('common.error')}
        </p>

        <Button
          size="lg"
          className="kiosk-button"
          onClick={resetKiosk}
        >
          <RotateCcw className="mr-2 h-6 w-6" />
          {t('kiosk.tryAgain')}
        </Button>
      </div>
    );
  }

  return null;
}

export default function Kiosk() {
  const params = useParams<{ storeSlug: string }>();
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const supportedLocales = (store?.supportedLocales || SUPPORTED_LOCALES) as Locale[];
  const defaultLocale = (store?.defaultLocale || 'ja') as Locale;

  return (
    <LocaleProvider defaultLocale={defaultLocale} supportedLocales={supportedLocales}>
      <KioskContent />
    </LocaleProvider>
  );
}
