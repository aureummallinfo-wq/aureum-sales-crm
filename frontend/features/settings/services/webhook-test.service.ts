import type { WebhookLeadPayload } from '../types/webhook-lead.types';
export function testWebhookPayload(apiFetch: (path: string, init?: RequestInit) => Promise<any>, connectionId: string, payload: WebhookLeadPayload) { return apiFetch(`/api/settings/webhooks/${connectionId}/test-payload`, { method: 'POST', body: JSON.stringify({ payload }) }); }
