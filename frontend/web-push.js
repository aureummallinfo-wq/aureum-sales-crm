(() => {
  const apiBase = String(window.__AUREUM_API_BASE_URL__ || '').replace(/\/+$/, '');
  const api = path => `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;

  function supported() {
    return Boolean(window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
  }

  async function publicKey() {
    const response = await fetch(api('/api/web-push/public-key'), { credentials: 'include' });
    if (!response.ok) return '';
    const body = await response.json().catch(() => ({}));
    return body.publicKey || '';
  }

  function decodeKey(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));
  }

  async function sync() {
    if (!supported() || Notification.permission !== 'granted') return false;
    const key = await publicKey();
    if (!key) return false;
    const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(key) });
    await fetch(api('/api/web-push/subscription'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
    return true;
  }

  async function requestAndSync() {
    if (!supported()) throw new Error('Browser notifications are not supported here.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Browser notification permission was not granted.');
    const synced = await sync();
    if (!synced) throw new Error('Browser notifications are not configured for this CRM yet.');
    return true;
  }

  window.AureumWebPush = { supported, sync, requestAndSync, canPrompt: () => supported() && Notification.permission !== 'granted' };
})();
