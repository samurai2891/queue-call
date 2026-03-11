import { useParams, useLocation } from 'wouter';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Locale } from '@/contexts/LocaleContext';

function CheckinContent() {
  const params = useParams<{ storeSlug: string }>();
  const [, navigate] = useLocation();
  const { t } = useLocale();
  
  const [ticketNumber, setTicketNumber] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const checkinMutation = trpc.ticket.checkin.useMutation({
    onSuccess: () => {
      setIsSuccess(true);
      toast.success(t('checkin.success'));
    },
    onError: (error) => {
      toast.error(error.message || t('checkin.notFound'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!store || !ticketNumber) return;

    checkinMutation.mutate({
      storeId: store.id,
      number: parseInt(ticketNumber, 10),
    });
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex flex-col bg-success/5">
        <header className="p-4 flex justify-between items-center">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/s/${params.storeSlug}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <LanguageSwitcher showLabel />
        </header>
        <main className="flex-1 container flex flex-col items-center justify-center gap-6 py-8">
          <div className="text-center">
            <CheckCircle className="h-24 w-24 text-success mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-success">{t('checkin.success')}</h1>
          </div>
          <Button
            size="lg"
            variant="outline"
            onClick={() => navigate(`/s/${params.storeSlug}`)}
          >
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
      <main className="flex-1 container flex flex-col items-center justify-center py-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">{t('checkin.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Ticket Number Input */}
              <div className="space-y-2">
                <Label htmlFor="ticketNumber">{t('checkin.enterNumber')}</Label>
                <Input
                  id="ticketNumber"
                  type="number"
                  inputMode="numeric"
                  placeholder={t('checkin.numberPlaceholder')}
                  value={ticketNumber}
                  onChange={(e) => setTicketNumber(e.target.value)}
                  className="text-center text-3xl h-16 font-bold"
                  min="1"
                  required
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                size="lg"
                className="w-full h-14 text-lg"
                disabled={checkinMutation.isPending || !ticketNumber}
              >
                {checkinMutation.isPending ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-5 w-5" />
                )}
                {t('checkin.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function Checkin() {
  const params = useParams<{ storeSlug: string }>();
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const supportedLocales = (store?.supportedLocales || SUPPORTED_LOCALES) as Locale[];
  const defaultLocale = (store?.defaultLocale || 'ja') as Locale;

  return (
    <LocaleProvider defaultLocale={defaultLocale} supportedLocales={supportedLocales}>
      <CheckinContent />
    </LocaleProvider>
  );
}
