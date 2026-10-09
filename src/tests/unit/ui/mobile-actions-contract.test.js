const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('mobile record drawers expose edit and note actions', () => {
  const leads = read('frontend/features/leads/leads-module.js');
  const customers = read('frontend/features/customers/customers-module.js');
  const followups = read('frontend/features/follow-ups/followups-module.js');

  assert.match(leads, /id="lead-module-edit-form"/);
  assert.match(leads, /data-leads-action="edit"/);
  assert.match(leads, /id="lead-module-note-form"/);
  assert.match(customers, /data-customer-module-action="edit"/);
  assert.match(customers, /id="customer-module-note-form"/);
  assert.match(followups, /id="followup-module-edit-form"/);
  assert.match(followups, /data-followup-module-action="edit"/);
  assert.match(followups, /id="followup-module-note-form"/);
});

test('notification center is wired after the final module binding layer', () => {
  const runtime = read('frontend/module9-settings-account-runtime.js');
  assert.match(runtime, /typeof bindNotifications9 === 'function'/);
  assert.match(runtime, /data-notification-toggle/);
  assert.match(runtime, /data-notification-read-all/);
});
