const webpush = require('web-push');

const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim();
const subject = String(process.env.WEB_PUSH_VAPID_SUBJECT || 'mailto:admin@aureummall.info').trim();
const configured = Boolean(publicKey && privateKey);
if (configured) webpush.setVapidDetails(subject, publicKey, privateKey);

function validSubscription(subscription) {
  return Boolean(subscription && typeof subscription.endpoint === 'string' && subscription.endpoint.startsWith('https://') && subscription.keys && typeof subscription.keys.p256dh === 'string' && typeof subscription.keys.auth === 'string');
}

async function sendWebPushMessages(subscriptions, payload) {
  if (!configured || !Array.isArray(subscriptions) || !subscriptions.length) return { configured, sent: 0, failed: 0 };
  const results = await Promise.allSettled(subscriptions.filter(validSubscription).map(subscription => webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 3600, urgency: payload.priority === 'high' ? 'high' : 'normal' })));
  return { configured, sent: results.filter(item => item.status === 'fulfilled').length, failed: results.filter(item => item.status === 'rejected').length };
}

module.exports = { configured, publicKey, validSubscription, sendWebPushMessages };
