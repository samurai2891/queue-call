/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// Auto-update behavior
self.skipWaiting();
clientsClaim();

// Clean up old caches from previous versions
cleanupOutdatedCaches();

// Precache and route assets injected by VitePWA
precacheAndRoute(self.__WB_MANIFEST);

// ==================== Push Notification ====================

// Push notification event — fires even when app is closed
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    // Server sends: { title, body, tag, data: { type, ticketId, ticketNumber, url, ticketToken } }
    // Extract url/ticketToken from nested data object or top-level for backward compatibility
    const nestedData = data.data || {};
    const options = {
      body: data.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'queue-call',
      renotify: true,
      requireInteraction: true,
      data: {
        url: nestedData.url || data.url || '/',
        ticketToken: nestedData.ticketToken || data.ticketToken,
        type: nestedData.type,
        ticketId: nestedData.ticketId,
      },
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Queue Call', options)
    );
  } catch (e) {
    console.error('[SW] Push notification error:', e);
  }
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
