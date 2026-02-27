import { useParams, useLocation } from 'wouter';
import { useState, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { useSSE } from '@/hooks/useSSE';
import { AlertCircle, Volume2, VolumeX, Clock, Users, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/contexts/LocaleContext';

type CrowdLevel = 'empty' | 'low' | 'moderate' | 'busy' | 'crowded';

const crowdLevelConfig: Record<CrowdLevel, { color: string; bgColor: string; icon: string }> = {
  empty: { color: 'text-green-600', bgColor: 'bg-green-100', icon: '○' },
  low: { color: 'text-green-500', bgColor: 'bg-green-50', icon: '◎' },
  moderate: { color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: '△' },
  busy: { color: 'text-orange-600', bgColor: 'bg-orange-100', icon: '▲' },
  crowded: { color: 'text-red-600', bgColor: 'bg-red-100', icon: '×' },
};

function CrowdLevelBadgeBoard({ level }: { level: CrowdLevel }) {
  const { t } = useLocale();
  const config = crowdLevelConfig[level];
  const labelKey = `store.crowdLevel.${level}` as const;
  
  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${config.bgColor}`}>
      <Users className={`h-5 w-5 ${config.color}`} />
      <span className={`text-lg ${config.icon === '×' ? 'text-2xl' : 'text-xl'} ${config.color}`}>
        {config.icon}
      </span>
      <span className={`font-semibold text-lg ${config.color}`}>
        {t(labelKey)}
      </span>
    </div>
  );
}

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
  const [showCrowdLevel, setShowCrowdLevel] = useState<boolean>(false);
  const [crowdLevel, setCrowdLevel] = useState<string>('empty');
  const [numberChanged, setNumberChanged] = useState(false);

  const { data: store, isLoading: storeLoading, error: storeError } = trpc.store.getBySlugForBoard.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const { data: queueStatus, refetch: refetchQueue } = trpc.store.getQueueStatus.useQuery(
    { storeId: store?.id || 0 },
    { 
      enabled: !!store?.id,
      refetchInterval: 30000,
    }
  );

  useEffect(() => {
    if (queueStatus) {
      setCurrentNumber(queueStatus.currentNumber);
      setWaitingNumbers(queueStatus.waitingNumbers || []);
      setCurrentPin(queueStatus.currentPin || null);
      setPinExpiresAt(queueStatus.pinExpiresAt ? new Date(queueStatus.pinExpiresAt) : null);
      setShowCrowdLevel(queueStatus.showCrowdLevel || false);
      setCrowdLevel(queueStatus.crowdLevel || 'empty');
    }
  }, [queueStatus]);

  // PIN countdown
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
        refetchQueue();
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
      
      if (newNumber !== lastCalledNumber && newNumber > 0) {
        if (!isMuted) {
          playCallSound();
        }
        setLastCalledNumber(newNumber);
        // Trigger number change animation
        setNumberChanged(true);
        setTimeout(() => setNumberChanged(false), 1500);
      }
      
      setCurrentNumber(newNumber);
      refetchQueue();
    },
    onMessage: (event, data) => {
      if (event === 'polling-active') {
        refetchQueue();
      }
    },
  });

  const playCallSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 880;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
      console.log('Audio not available');
    }
  };

  // Generate QR code URL for the store join page
  const storeJoinUrl = useMemo(() => {
    if (!params.storeSlug) return '';
    const origin = window.location.origin;
    return `${origin}/s/${params.storeSlug}`;
  }, [params.storeSlug]);

  const qrCodeUrl = useMemo(() => {
    if (!storeJoinUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(storeJoinUrl)}&margin=8`;
  }, [storeJoinUrl]);

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
      <header className="p-4 md:p-6 border-b flex items-center justify-between">
        <div className="w-12 md:w-16" />
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-3xl md:text-4xl font-bold">{store.name}</h1>
          {showCrowdLevel && (
            <CrowdLevelBadgeBoard level={crowdLevel as CrowdLevel} />
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 md:h-12 md:w-12"
          onClick={() => setIsMuted(!isMuted)}
          aria-label={isMuted ? t('board.unmute') : t('board.mute')}
        >
          {isMuted ? (
            <VolumeX className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground" />
          ) : (
            <Volume2 className="h-5 w-5 md:h-6 md:w-6" />
          )}
        </Button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden">
        {currentNumber > 0 ? (
          /* ========== P0-3: 呼び出し中 — 番号を巨大化 ========== */
          <div className="w-full flex flex-col items-center">
            {/* Now Calling Section — 画面の主役 */}
            <div className="text-center mb-6 md:mb-8">
              <p className="text-xl md:text-2xl lg:text-3xl text-muted-foreground mb-2 md:mb-4 flex items-center justify-center gap-3">
                <Volume2 className="h-5 w-5 md:h-7 md:w-7 animate-pulse text-primary" />
                {t('board.nowCalling')}
              </p>
              
              {/* 番号 — 超巨大表示 */}
              <div className={`board-number-hero ${numberChanged ? 'board-number-flash' : ''}`}>
                {currentNumber}
              </div>
            </div>

            {/* PIN Display — 番号の下にコンパクトに */}
            {currentPin && (
              <div className="bg-card border-2 border-primary/30 rounded-2xl px-6 md:px-10 py-4 md:py-6 mb-6 md:mb-8">
                <p className="text-base md:text-lg text-muted-foreground mb-1 text-center">
                  {t('board.checkinPin')}
                </p>
                <div className="text-4xl md:text-6xl font-bold tracking-[0.3em] text-foreground text-center">
                  {currentPin}
                </div>
                {pinCountdown && (
                  <div className="flex items-center justify-center gap-2 mt-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{t('board.pinUpdatesIn').replace('{time}', pinCountdown)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Waiting Numbers Grid */}
            {waitingNumbers.length > 0 && (
              <div className="w-full max-w-3xl">
                <p className="text-lg md:text-xl text-muted-foreground mb-3 text-center">
                  {t('board.waitingNumbers')}
                </p>
                <div className="grid grid-cols-5 gap-2 md:gap-3">
                  {waitingNumbers.slice(0, 10).map((num, index) => (
                    <div
                      key={num}
                      className="bg-card border rounded-xl p-2 md:p-3 text-center"
                      style={{ opacity: 1 - index * 0.05 }}
                    >
                      <span className="text-xl md:text-3xl font-bold tabular-nums text-muted-foreground">
                        {num}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ========== P0-2: 空状態 — QRコード + 受付案内 ========== */
          <div className="text-center flex flex-col items-center gap-6 md:gap-8">
            {/* QRコード */}
            {qrCodeUrl && (
              <div className="bg-white p-4 md:p-6 rounded-2xl shadow-lg">
                <img 
                  src={qrCodeUrl} 
                  alt="QR Code" 
                  className="w-48 h-48 md:w-64 md:h-64"
                  loading="eager"
                />
              </div>
            )}

            {/* 案内テキスト */}
            <div className="space-y-2">
              <p className="text-2xl md:text-4xl font-bold text-foreground">
                {t('board.scanInstruction')}
              </p>
              <p className="text-lg md:text-2xl text-muted-foreground">
                {t('board.scanToJoin')}
              </p>
            </div>

            {/* 補足メッセージ */}
            <p className="text-base md:text-lg text-muted-foreground/70">
              {t('board.readyToServe')}
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="p-3 md:p-4 text-center text-muted-foreground border-t">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <p className="text-xs md:text-sm">{t('common.poweredBy')}</p>
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
