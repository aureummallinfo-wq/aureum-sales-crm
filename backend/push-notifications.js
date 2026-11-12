const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function validExpoToken(token) {
  return /^ExponentPushToken\[.+\]$/.test(String(token || '').trim());
}

async function sendExpoPushMessages(messages) {
  const payload = messages.filter(item => validExpoToken(item.to)).map(item => ({
    to: item.to,
    title: item.title,
    body: item.body,
    sound: 'default',
    channelId: item.channelId || 'crm-alerts',
    priority: item.priority || 'high',
    data: item.data || {}
  }));
  if (!payload.length || process.env.EXPO_PUSH_ENABLED === 'false') return { skipped: true, sent: 0 };
  const response = await fetch(EXPO_PUSH_URL, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Expo push delivery failed with HTTP ${response.status}`);
  return result;
}

module.exports = { sendExpoPushMessages, validExpoToken };
