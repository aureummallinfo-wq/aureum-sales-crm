export function hasStableWebhookIdentity(payload: Record<string, unknown>) { return Boolean(payload.external_lead_id || payload.meta_lead_id || payload.idempotency_key || payload.payload_hash); }
