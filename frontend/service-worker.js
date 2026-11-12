self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text?.() || '' }; }
  const title = payload.title || 'Aureum CRM';
  const options = {
    body: payload.body || 'You have a new CRM notification.',
    icon: '/assets/aureum-logo.png',
    badge: '/assets/aureum-logo.png',
    tag: payload.data?.notificationId || 'aureum-crm-notification',
    renotify: true,
    data: payload.data || {}
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const route = typeof event.notification.data?.route === 'string' ? event.notification.data.route : '/dashboard';
  const target = new URL(route, self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find(client => client.url.startsWith(self.location.origin));
    if (existing) { await existing.focus(); return existing.navigate(target); }
    return self.clients.openWindow(target);
  })());
});
