import { useParams, useLocation } from 'wouter';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Minus, Plus, AlertCircle, Loader2 } from 'lucide-react';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { toast } from 'sonner';
import { RATE_LIMITED_ERR_MSG } from '@shared/const';
import type { Locale } from '@/contexts/LocaleContext';


function JoinQueueContent() {
  const params = useParams<{ storeSlug: string }>();
  const [, navigate] = useLocation();
  const { t, locale } = useLocale();
  
  const [partySize, setPartySize] = useState(2);
  const [note, setNote] = useState('');

  const { data: store, isLoading: storeLoading, error: storeError } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const createTicketMutation = trpc.ticket.create.useMutation({
    onSuccess: (ticket) => {
      navigate(`/s/${params.storeSlug}/ticket/${ticket.ticketToken}`);
    },
    onError: (error) => {
      const message = error.message === RATE_LIMITED_ERR_MSG
        ? t('common.rateLimited')
        : error.message;
      toast.error(message);
    },

  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!store) return;

    createTicketMutation.mutate({
      storeId: store.id,
      partySize,
      note: note.trim() || undefined,
      locale,
      source: 'web',
    });
  };

  const decrementPartySize = () => {
    if (partySize > 1) setPartySize(partySize - 1);
  };

  const incrementPartySize = () => {
    const maxSize = store?.settings?.kiosk?.maxPartySize || 10;
    if (partySize < maxSize) setPartySize(partySize + 1);
  };

  if (storeLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="p-4 flex justify-between items-center">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-24" />
        </header>
        <main className="flex-1 container flex flex-col items-center justify-center gap-8 py-8">
          <Skeleton className="h-96 w-full max-w-md" />
        </main>
      </div>
    );
  }

  if (storeError || !store) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold">{t('common.error')}</h1>
        <Button variant="outline" onClick={() => navigate(`/s/${params.storeSlug}`)}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const isPaused = store.intakeStatus === 'paused';

  if (isPaused) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="p-4 flex justify-between items-center">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/s/${params.storeSlug}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <LanguageSwitcher showLabel />
        </header>
        <main className="flex-1 container flex flex-col items-center justify-center gap-4 py-8">
          <AlertCircle className="h-16 w-16 text-warning" />
          <h1 className="text-2xl font-bold">{t('store.intakePaused')}</h1>
          <Button variant="outline" onClick={() => navigate(`/s/${params.storeSlug}`)}>
            {t('common.back')}
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="p-4 flex justify-between items-center">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/s/${params.storeSlug}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <LanguageSwitcher showLabel />
      </header>

      {/* Main Content */}
      <main className="flex-1 container flex flex-col items-center py-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">{t('join.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Party Size */}
              <div className="space-y-3">
                <Label className="text-base">{t('join.partySize')}</Label>
                <div className="flex items-center justify-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-14 w-14 rounded-full"
                    onClick={decrementPartySize}
                    disabled={partySize <= 1}
                  >
                    <Minus className="h-6 w-6" />
                  </Button>
                  <div className="text-center min-w-[100px]">
                    <span className="text-5xl font-bold tabular-nums">{partySize}</span>
                    <span className="text-xl text-muted-foreground ml-2">{t('common.people')}</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-14 w-14 rounded-full"
                    onClick={incrementPartySize}
                    disabled={partySize >= (store?.settings?.kiosk?.maxPartySize || 10)}
                  >
                    <Plus className="h-6 w-6" />
                  </Button>
                </div>
              </div>

              {/* Note */}
              <div className="space-y-2">
                <Label htmlFor="note">{t('join.note')}</Label>
                <Textarea
                  id="note"
                  placeholder={t('join.notePlaceholder')}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                size="lg"
                className="w-full h-14 text-lg"
                disabled={createTicketMutation.isPending}
              >
                {createTicketMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {t('join.submitting')}
                  </>
                ) : (
                  t('join.submit')
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>

      {/* PWA Install Banner */}
      <PwaInstallBanner variant="banner" />
    </div>
  );
}

export default function JoinQueue() {
  const params = useParams<{ storeSlug: string }>();
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const supportedLocales = (store?.supportedLocales || SUPPORTED_LOCALES) as Locale[];
  const defaultLocale = (store?.defaultLocale || 'ja') as Locale;

  return (
    <LocaleProvider defaultLocale={defaultLocale} supportedLocales={supportedLocales}>
      <JoinQueueContent />
    </LocaleProvider>
  );
}
