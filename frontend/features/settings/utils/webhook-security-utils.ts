export function isSafeWebhookSecret(secret: string) { return /^aureum_wh_[a-f0-9]{48}$/.test(secret); }
export function isSafeWebhookUrl(url: string) { return /^\/api\/webhooks\/leads\/[A-Za-z0-9_-]+$/.test(url); }
