/* Top Tipster PWA service worker — Web Push for LMS deadline reminders. */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Top Tipster', body: event.data ? event.data.text() : 'New reminder' };
  }

  const title = data.title || 'Top Tipster';
  const options = {
    body: data.body || 'You have a pick deadline reminder.',
    icon: data.icon || '/apple-touch-icon.png',
    badge: data.badge || '/favicon.png',
    data: {
      url: data.url || data.path || '/(lms)',
      competitionId: data.competitionId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const payload = event.notification.data || {};
  const competitionId = payload.competitionId;
  const target =
    competitionId != null && competitionId !== ''
      ? `/(lms)/${competitionId}`
      : typeof payload.url === 'string'
        ? payload.url
        : '/(lms)';

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && typeof client.navigate === 'function') {
            try {
              await client.navigate(target);
            } catch {
              /* ignore */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })()
  );
});
