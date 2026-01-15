import { useParams, useLocation } from 'wouter';
import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { useSSE } from '@/hooks/useSSE';
import { AlertCircle, Volume2 } from 'lucide-react';
import type { Locale } from '@/contexts/LocaleContext';


function BoardContent() {
  const params = useParams<{ storeSlug: string }>();
  const [location] = useLocation();
  const { t } = useLocale();
  const accessKey = new URLSearchParams(location.split('?')[1] ?? '').get('key') ?? undefined;
  
  const [currentNumber, setCurrentNumber] = useState<number>(0);

  const [nextNumbers, setNextNumbers] = useState<number[]>([]);
  const [lastCalledNumber, setLastCalledNumber] = useState<number>(0);

  const { data: store, isLoading: storeLoading, error: storeError } = trpc.store.getBySlugWithKey.useQuery(
    { slug: params.storeSlug || '', key: accessKey, keyType: 'board' },
    { enabled: !!params.storeSlug }
  );
  const accessDenied = storeError?.data?.code === 'FORBIDDEN';


  const { data: queueStatus, refetch: refetchQueue } = trpc.store.getQueueStatus.useQuery(
    { storeId: store?.id || 0 },
    { enabled: !!store?.id }
  );

  useEffect(() => {
    if (queueStatus) {
      setCurrentNumber(queueStatus.currentNumber);
    }
  }, [queueStatus]);

  // SSE for real-time updates
  useSSE({
    scope: 'board',
    storeId: store?.id || 0,
    storeSlug: params.storeSlug,
    enabled: !!store?.id,
    onQueueUpdate: (data) => {

      const newNumber = data.currentNumber;
      
      // Play sound when number changes
      if (newNumber !== lastCalledNumber && newNumber > 0) {
        playCallSound();
        setLastCalledNumber(newNumber);
      }
      
      setCurrentNumber(newNumber);
      if (data.nextNumbers) {
        setNextNumbers(data.nextNumbers);
      }
    },
  });

  const playCallSound = () => {
    // Create a simple beep sound
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 880; // A5 note
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
      console.log('Audio not available');
    }
  };

  if (storeLoading) {
    return (
      <div className="kiosk-mode flex items-center justify-center bg-gradient-to-b from-primary/10 to-background">
        <div className="animate-pulse text-4xl">{t('common.loading')}</div>
      </div>
    );
  }

  if (storeError || !store) {
    const message = accessDenied ? t('common.accessKeyRequired') : t('common.error');

    return (
      <div className="kiosk-mode flex flex-col items-center justify-center gap-6 p-8">
        <AlertCircle className="h-24 w-24 text-destructive" />
        <h1 className="text-4xl font-bold">{message}</h1>
      </div>
    );
  }


  const boardSettings = store.settings?.board;
  const nextCount = boardSettings?.nextCount || 3;

  return (
    <div className="kiosk-mode flex flex-col bg-gradient-to-b from-primary/5 to-background">
      {/* Header */}
      <header className="p-6 text-center border-b">
        <h1 className="text-4xl font-bold">{store.name}</h1>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-8">
        {currentNumber > 0 ? (
          <>
            {/* Current Number */}
            <div className="text-center mb-12">
              <p className="text-3xl text-muted-foreground mb-4 flex items-center justify-center gap-3">
                <Volume2 className="h-8 w-8 animate-pulse text-primary" />
                {t('board.nowCalling')}
              </p>
              <div className="board-number text-primary animate-pulse">
                {currentNumber}
              </div>
            </div>

            {/* Next Numbers */}
            {nextNumbers.length > 0 && (
              <div className="text-center">
                <p className="text-2xl text-muted-foreground mb-4">{t('board.next')}</p>
                <div className="flex gap-6 justify-center flex-wrap">
                  {nextNumbers.slice(0, nextCount).map((num, index) => (
                    <div
                      key={num}
                      className="text-5xl font-bold tabular-nums text-muted-foreground"
                      style={{ opacity: 1 - index * 0.2 }}
                    >
                      {num}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center">
            <p className="text-4xl text-muted-foreground">{t('board.noQueue')}</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-muted-foreground border-t">
        <p className="text-sm">{t('common.poweredBy')}</p>
      </footer>

    </div>
  );
}

export default function Board() {
  const params = useParams<{ storeSlug: string }>();
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const supportedLocales = (store?.supportedLocales || SUPPORTED_LOCALES) as Locale[];
  const defaultLocale = (store?.defaultLocale || 'ja') as Locale;

  return (
    <LocaleProvider defaultLocale={defaultLocale} supportedLocales={supportedLocales}>
      <BoardContent />
    </LocaleProvider>
  );
}
