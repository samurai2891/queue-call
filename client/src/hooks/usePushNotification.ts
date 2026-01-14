import { useState, useCallback, useEffect } from 'react';

interface UsePushNotificationOptions {
  ticketId?: number;
  onSubscribed?: () => void;
  onError?: (error: string) => void;
  subscribeFn?: (data: { ticketId: number; endpoint: string; p256dh: string; auth: string }) => Promise<void>;
}

export function usePushNotification({ ticketId, onSubscribed, onError, subscribeFn }: UsePushNotificationOptions = {}) {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    // Check if push notifications are supported
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
      navigator.serviceWorker.ready
        .then((registration) => registration.pushManager.getSubscription())
        .then((subscription) => {
          setIsSubscribed(!!subscription);
        })
        .catch(() => {});
    }
  }, []);


  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      onError?.('Push notifications are not supported in this browser');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (e) {
      onError?.('Failed to request notification permission');
      return false;
    }
  }, [isSupported, onError]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !ticketId || !subscribeFn) {
      onError?.('Cannot subscribe: missing requirements');
      return false;
    }

    setIsLoading(true);

    try {
      // Request permission if not granted
      if (permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) {
          setIsLoading(false);
          return false;
        }
      }

      // Register service worker if not already registered
      const registration = await navigator.serviceWorker.ready;

      // Get push subscription
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Create new subscription
        // Note: In production, you'd get the VAPID public key from the server
        const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        
        if (!vapidPublicKey) {
          const message = 'VAPID public key is not configured';
          console.warn(`[Push] ${message}`);
          onError?.(message);
          setIsLoading(false);
          return false;
        }


        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      // Send subscription to server
      const subscriptionJson = subscription.toJSON();
      await subscribeFn({
        ticketId,
        endpoint: subscription.endpoint,
        p256dh: subscriptionJson.keys?.p256dh || '',
        auth: subscriptionJson.keys?.auth || '',
      });

      setIsSubscribed(true);
      onSubscribed?.();
      setIsLoading(false);
      return true;
    } catch (e) {
      console.error('Push subscription error:', e);
      onError?.('Failed to subscribe to push notifications');
      setIsLoading(false);
      return false;
    }
  }, [isSupported, ticketId, permission, requestPermission, subscribeFn, onSubscribed, onError]);

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
      }
      
      setIsSubscribed(false);
      return true;
    } catch (e) {
      console.error('Push unsubscribe error:', e);
      return false;
    }
  }, []);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
    requestPermission,
  };
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
