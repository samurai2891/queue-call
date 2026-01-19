import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';

/**
 * L-005: オフライン状態の表示改善
 * ネットワーク接続が切断された際にユーザーに通知するコンポーネント
 */
export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const { t } = useLocale();

  useEffect(() => {
    // 初期状態を設定
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <div 
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-auto z-50 animate-in slide-in-from-bottom-2"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-lg">
        <WifiOff className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-medium">{t('connection.offline')}</span>
      </div>
    </div>
  );
}
