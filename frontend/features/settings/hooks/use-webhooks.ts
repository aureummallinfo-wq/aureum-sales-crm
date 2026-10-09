import type { WebhookConnection, WebhookLog } from '../types/webhook.types';
export async function fetchWebhookConnections(apiFetch: (path: string) => Promise<any>) { return (await apiFetch('/api/settings/webhooks')).data as WebhookConnection[]; }
export async function fetchWebhookLogs(apiFetch: (path: string) => Promise<any>, connectionId: string) { return (await apiFetch(`/api/settings/webhooks/${connectionId}/logs`)).data as WebhookLog[]; }
