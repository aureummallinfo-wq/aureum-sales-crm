import type { WebhookConnection } from '../types/webhook.types';
export function validateWebhookConnection(input: Partial<WebhookConnection>) { return Boolean(input.connectionName && input.sourceType && input.sourcePlatform); }
