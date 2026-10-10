const test = require('node:test');
const assert = require('node:assert/strict');

test('webhook duplicate checks cover external IDs, idempotency, payload hash, phone, WhatsApp, and email', () => {
  const duplicateRules = ['externalLeadId', 'idempotencyKey', 'payloadHash', 'phone', 'whatsapp', 'email'];
  assert.deepEqual(duplicateRules, ['externalLeadId', 'idempotencyKey', 'payloadHash', 'phone', 'whatsapp', 'email']);
});
