import { useState, useEffect, useCallback } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';

/**
 * L-005: オフライン状態の表示改善
 * ネットワーク接続が切断された際にユーザーに通知するコンポーネント
 * オンライン復帰時にも一時的に通知を表示
 */
export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const { t } = useLocale();

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    // Show "back online" message for 3 seconds
    setShowBackOnline(true);
    setTimeout(() => setShowBackOnline(false), 3000);
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setShowBackOnline(false);
  }, []);

  useEffect(() => {
    // 初期状態を設定
    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  // Show "back online" notification
  if (isOnline && showBackOnline) {
    return (
      <div 
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-auto z-50 animate-in slide-in-from-bottom-2"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 bg-success text-success-foreground px-4 py-3 rounded-lg shadow-lg">
          <Wifi className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">{t('offline.backOnline')}</span>
        </div>
      </div>
    );
  }

  // Show offline notification
  if (!isOnline) {
    return (
      <div 
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-auto z-50 animate-in slide-in-from-bottom-2"
        role="alert"
        aria-live="assertive"
      >
        <div className="flex items-center gap-2 bg-warning text-warning-foreground px-4 py-3 rounded-lg shadow-lg">
          <WifiOff className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">{t('offline.message')}</span>
        </div>
      </div>
    );
  }

  return null;
}
