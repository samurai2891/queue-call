import { useState, useCallback, useEffect } from 'react';

interface UsePushNotificationOptions {
  ticketId?: number;
  onSubscribed?: () => void;
  onError?: (error: string) => void;
  subscribeFn?: (data: { ticketId: number; endpoint: string; p256dh: string; auth: string }) => Promise<void>;
  /** Optional function to check server-side subscription status */
  checkServerSubscription?: (ticketId: number, endpoint: string) => Promise<boolean>;
}

export function usePushNotification({ ticketId, onSubscribed, onError, subscribeFn, checkServerSubscription }: UsePushNotificationOptions = {}) {
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

      // Check both browser subscription AND server-side subscription
      navigator.serviceWorker.ready
        .then(async (registration) => {
          const subscription = await registration.pushManager.getSubscription();
          if (!subscription) {
            setIsSubscribed(false);
            return;
          }

          // If we have a server check function and ticketId, verify server-side too
          if (checkServerSubscription && ticketId) {
            try {
              const serverHasSubscription = await checkServerSubscription(ticketId, subscription.endpoint);
              setIsSubscribed(serverHasSubscription);
              if (!serverHasSubscription) {
                console.log('[Push] Browser has subscription but server does not - needs re-subscribe');
              }
            } catch {
              // If server check fails, fall back to browser-only check
              setIsSubscribed(true);
            }
          } else {
            // No server check available, use browser-only
            setIsSubscribed(!!subscription);
          }
        })
        .catch(() => {
          setIsSubscribed(false);
        });
    }
  }, [ticketId, checkServerSubscription]);


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

      // Send subscription to server - only mark as subscribed if server registration succeeds
      const subscriptionJson = subscription.toJSON();
      try {
        await subscribeFn({
          ticketId,
          endpoint: subscription.endpoint,
          p256dh: subscriptionJson.keys?.p256dh || '',
          auth: subscriptionJson.keys?.auth || '',
        });

        // Server registration succeeded - now we can mark as subscribed
        setIsSubscribed(true);
        onSubscribed?.();
      } catch (serverError) {
        // Server registration failed - browser subscription exists but server doesn't know about it
        console.error('Push subscription server registration failed:', serverError);
        onError?.('Failed to register push subscription with server');
        setIsLoading(false);
        return false;
      }

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
