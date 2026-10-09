export const WEBHOOK_SOURCE_TYPES = [
  { value: 'meta_lead_ads', label: 'Meta Lead Ads' }, { value: 'facebook_form', label: 'Facebook form' }, { value: 'instagram_form', label: 'Instagram form' }, { value: 'website_form', label: 'Website form' }, { value: 'n8n', label: 'n8n' }, { value: 'zapier_placeholder', label: 'Zapier placeholder' }, { value: 'make_placeholder', label: 'Make placeholder' }, { value: 'custom_webhook', label: 'Custom webhook' }
] as const;
export const WEBHOOK_DUPLICATE_RULES = ['externalLeadId', 'idempotencyKey', 'payloadHash', 'phone', 'whatsapp', 'email'] as const;
