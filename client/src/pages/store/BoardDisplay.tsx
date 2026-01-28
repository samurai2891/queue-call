import { useParams, useLocation } from 'wouter';
import { useState, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { useSSE } from '@/hooks/useSSE';
import { AlertCircle, Volume2, VolumeX, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/contexts/LocaleContext';


function BoardDisplayContent() {
  const params = useParams<{ storeSlug: string }>();
  const [location] = useLocation();
  const { t } = useLocale();
  
  const [currentNumber, setCurrentNumber] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [waitingNumbers, setWaitingNumbers] = useState<number[]>([]);
  const [lastCalledNumber, setLastCalledNumber] = useState<number>(0);
  const [currentPin, setCurrentPin] = useState<string | null>(null);
  const [pinExpiresAt, setPinExpiresAt] = useState<Date | null>(null);
  const [pinCountdown, setPinCountdown] = useState<string>('');

  // ボードはアクセスキー不要
  const { data: store, isLoading: storeLoading, error: storeError } = trpc.store.getBySlugForBoard.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );


  const { data: queueStatus, refetch: refetchQueue } = trpc.store.getQueueStatus.useQuery(
    { storeId: store?.id || 0 },
    { 
      enabled: !!store?.id,
      refetchInterval: 30000, // 30秒ごとに自動更新
    }
  );

  useEffect(() => {
    if (queueStatus) {
      setCurrentNumber(queueStatus.currentNumber);
      setWaitingNumbers(queueStatus.waitingNumbers || []);
      setCurrentPin(queueStatus.currentPin || null);
      setPinExpiresAt(queueStatus.pinExpiresAt ? new Date(queueStatus.pinExpiresAt) : null);
    }
  }, [queueStatus]);

  // PIN更新カウントダウン
  useEffect(() => {
    if (!pinExpiresAt) {
      setPinCountdown('');
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const diff = pinExpiresAt.getTime() - now.getTime();
      
      if (diff <= 0) {
        setPinCountdown('');
        refetchQueue(); // PIN期限切れ時に再取得
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setPinCountdown(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [pinExpiresAt, refetchQueue]);

  // SSE for real-time updates
  const { isConnected, error: sseError, usePolling } = useSSE({
    scope: 'board',
    storeId: store?.id || 0,
    storeSlug: params.storeSlug,
    enabled: !!store?.id,
    onQueueUpdate: (data) => {

      const newNumber = data.currentNumber;
      
      // Play sound when number changes
      if (newNumber !== lastCalledNumber && newNumber > 0) {
        if (!isMuted) {
          playCallSound();
        }
        setLastCalledNumber(newNumber);
      }
      
      setCurrentNumber(newNumber);
      // SSEからの更新時もrefetchしてPINと待機リストを更新
      refetchQueue();
    },
    onMessage: (event, data) => {
      // Handle polling-active event to trigger manual refetch
      if (event === 'polling-active') {
        refetchQueue();
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
    return (
      <div className="kiosk-mode flex flex-col items-center justify-center gap-6 p-8">
        <AlertCircle className="h-24 w-24 text-destructive" />
        <h1 className="text-4xl font-bold">{t('common.error')}</h1>
      </div>
    );
  }

  return (
    <div className="kiosk-mode flex flex-col bg-gradient-to-b from-primary/5 to-background">
      {/* Header */}
      <header className="p-6 border-b flex items-center justify-between">
        <div className="w-16" /> {/* Spacer for centering */}
        <h1 className="text-4xl font-bold">{store.name}</h1>
        <Button
          variant="ghost"
          size="icon"
          className="h-12 w-12"
          onClick={() => setIsMuted(!isMuted)}
          aria-label={isMuted ? t('board.unmute') : t('board.mute')}
        >
          {isMuted ? (
            <VolumeX className="h-6 w-6 text-muted-foreground" />
          ) : (
            <Volume2 className="h-6 w-6" />
          )}
        </Button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 overflow-hidden">
        {currentNumber > 0 ? (
          <>
            {/* Current Number & PIN Section */}
            <div className="text-center mb-8">
              <p className="text-2xl md:text-3xl text-muted-foreground mb-4 flex items-center justify-center gap-3">
                <Volume2 className="h-6 w-6 md:h-8 md:w-8 animate-pulse text-primary" />
                {t('board.nowCalling')}
              </p>
              <div className="board-number text-primary animate-pulse mb-6">
                {currentNumber}
              </div>
              
              {/* PIN Display */}
              {currentPin && (
                <div className="bg-card border-2 border-primary/30 rounded-2xl p-6 inline-block">
                  <p className="text-lg md:text-xl text-muted-foreground mb-2">
                    {t('board.checkinPin')}
                  </p>
                  <div className="text-5xl md:text-7xl font-bold tracking-[0.3em] text-foreground">
                    {currentPin}
                  </div>
                  {pinCountdown && (
                    <div className="flex items-center justify-center gap-2 mt-3 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{t('board.pinUpdatesIn').replace('{time}', pinCountdown)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Waiting Numbers Grid */}
            {waitingNumbers.length > 0 && (
              <div className="w-full max-w-3xl">
                <p className="text-xl md:text-2xl text-muted-foreground mb-4 text-center">
                  {t('board.waitingNumbers')}
                </p>
                <div className="grid grid-cols-5 gap-3 md:gap-4">
                  {waitingNumbers.slice(0, 10).map((num, index) => (
                    <div
                      key={num}
                      className="bg-card border rounded-xl p-3 md:p-4 text-center"
                      style={{ opacity: 1 - index * 0.05 }}
                    >
                      <span className="text-2xl md:text-4xl font-bold tabular-nums text-muted-foreground">
                        {num}
                      </span>
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
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <p className="text-sm">{t('common.poweredBy')}</p>
          {/* Connection Status Indicator */}
          {usePolling && (
            <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-500">
              <div className="h-2 w-2 rounded-full bg-yellow-600 dark:bg-yellow-500 animate-pulse" />
              {t('connection.pollingMode')}
            </div>
          )}
          {!isConnected && !usePolling && sseError && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-500">
              <div className="h-2 w-2 rounded-full bg-red-600 dark:bg-red-500" />
              {t('connection.disconnected')}
            </div>
          )}
          {isConnected && (
            <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-500">
              <div className="h-2 w-2 rounded-full bg-green-600 dark:bg-green-500" />
              {t('connection.connected')}
            </div>
          )}
        </div>
      </footer>

    </div>
  );
}

export default function BoardDisplay() {
  const params = useParams<{ storeSlug: string }>();
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const supportedLocales = (store?.supportedLocales || SUPPORTED_LOCALES) as Locale[];
  const defaultLocale = (store?.defaultLocale || 'ja') as Locale;

  return (
    <LocaleProvider defaultLocale={defaultLocale} supportedLocales={supportedLocales}>
      <BoardDisplayContent />
    </LocaleProvider>
  );
}
