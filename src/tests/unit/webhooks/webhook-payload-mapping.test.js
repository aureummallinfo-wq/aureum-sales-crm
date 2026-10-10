const test = require('node:test');
const assert = require('node:assert/strict');

test('webhook payload mapping normalizes common inbound lead field aliases', () => {
  const raw = { full_name: 'Webhook Lead', phone_number: '0300-1112223', interest: 'Apartment', meta_lead_id: 'meta-1' };
  const mapped = {
    full_name: raw.full_name || raw.name,
    phone: raw.phone || raw.phone_number,
    interested_in: raw.interested_in || raw.interest,
    external_lead_id: raw.external_lead_id || raw.meta_lead_id
  };
  assert.deepEqual(mapped, {
    full_name: 'Webhook Lead',
    phone: '0300-1112223',
    interested_in: 'Apartment',
    external_lead_id: 'meta-1'
  });
});
