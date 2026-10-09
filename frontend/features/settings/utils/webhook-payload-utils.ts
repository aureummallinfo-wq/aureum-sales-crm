import type { WebhookLeadPayload } from '../types/webhook-lead.types';
export function payloadPreview(payload: WebhookLeadPayload) { return { name: payload.full_name || payload.name || '', phone: payload.phone || payload.phone_number || '', email: payload.email || '', externalId: payload.external_lead_id || payload.meta_lead_id || '' }; }
