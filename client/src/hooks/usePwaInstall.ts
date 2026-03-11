import { useState, useEffect, useCallback } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

interface UsePwaInstallReturn {
  isInstallable: boolean;
  isInstalled: boolean;
  isIos: boolean;
  promptInstall: () => Promise<boolean>;
  dismissPrompt: () => void;
  showIosGuide: boolean;
  setShowIosGuide: (show: boolean) => void;
}

const DISMISS_KEY = 'pwa-install-dismissed';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export function usePwaInstall(): UsePwaInstallReturn {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  // Check if running as standalone PWA
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check iOS
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setIsIos(ios);

    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone;
    setIsInstalled(!!standalone);

    // Check if user dismissed the prompt recently
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10);
      if (Date.now() - dismissedTime < DISMISS_DURATION) {
        setIsDismissed(true);
      } else {
        localStorage.removeItem(DISMISS_KEY);
      }
    }
  }, []);

  // Listen for beforeinstallprompt event
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for app installed event
    const installedHandler = () => {
      setIsInstalled(true);
      setInstallPromptEvent(null);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    // For iOS, show the guide
    if (isIos && !isInstalled) {
      setShowIosGuide(true);
      return false;
    }

    // For other browsers with install prompt
    if (!installPromptEvent) return false;

    try {
      await installPromptEvent.prompt();
      const { outcome } = await installPromptEvent.userChoice;
      
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setInstallPromptEvent(null);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Install prompt error:', e);
      return false;
    }
  }, [installPromptEvent, isIos, isInstalled]);

  const dismissPrompt = useCallback(() => {
    setIsDismissed(true);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  }, []);

  // Installable if:
  // - Not already installed
  // - Not dismissed
  // - Either has install prompt event OR is iOS (can show guide)
  const isInstallable = !isInstalled && !isDismissed && (!!installPromptEvent || isIos);

  return {
    isInstallable,
    isInstalled,
    isIos,
    promptInstall,
    dismissPrompt,
    showIosGuide,
    setShowIosGuide,
  };
}
