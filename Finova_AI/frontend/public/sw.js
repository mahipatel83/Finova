/* Finova service worker - receives push reminders even when the app is closed. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Finova', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || '🔔 Bill reminder';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If the app is open and visible, its own popup + chime already covers it.
      const visible = clients.some((c) => c.visibilityState === 'visible');
      if (visible && data.tag !== 'finova-test') return;
      return self.registration.showNotification(title, {
        body: data.body || '',
        icon: '/static/icon-192.png',
        badge: '/static/icon-192.png',
        tag: data.tag || 'finova',
        renotify: true,
        requireInteraction: true,
        vibrate: [250, 100, 250, 100, 400],
        data: { url: data.url || '/' },
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
