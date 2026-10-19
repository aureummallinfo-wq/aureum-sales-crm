const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const policy = require('../../../../frontend/shared/crm-status-tags');
const { notePlan } = require('../../../../backend/followup-workflow');
const root = path.resolve(__dirname, '../../../..');
const expected = ['New', 'Contacted', 'Qualified', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Visit Scheduled', 'Visit Completed', 'Meeting Scheduled', 'Negotiation', 'Booking', 'Closed Won', 'Closed Lost', 'No Response', 'Not Interested', 'Invalid'];

test('lead, customer, report and follow-up forms expose exactly the approved status tags', () => {
  const window = {};
  const context = vm.createContext({ window, document: { addEventListener() {} } });
  for (const file of ['shared/crm-status-tags.js', 'features/leads/constants/lead-statuses.js', 'features/leads/constants/lead-sources.js', 'features/customers/constants/customer-options.js', 'features/reports/constants/report-canonical-enums.js', 'features/follow-ups/utils/followup-note-ui.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'frontend', file), 'utf8'), context);
  }
  for (const values of [policy.values, window.AureumLeadConstants.statuses, window.AureumLeadConstants.tags, window.AureumCustomerConstants.statuses, window.AureumCustomerConstants.tags, window.AureumReportEnums.leadStatuses, window.AureumReportEnums.customerStatuses]) assert.deepEqual(Array.from(values), expected);
  const form = window.AureumFollowUpNoteUI.scheduleFields({ tag: 'VIP' });
  assert.match(form, /Status tags<select[^>]*multiple/);
  assert.deepEqual([...form.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]), expected);
  assert.match(form, /value="Follow-up" selected/);
  const multiple = window.AureumFollowUpNoteUI.scheduleFields({ selectedTags: ['Hot', 'Follow-up', 'Visit Scheduled'] });
  for (const tag of ['Hot', 'Follow-up', 'Visit Scheduled']) assert.ok(multiple.includes(`value="${tag}" selected`));
});

test('workflow validates status tags and replaces a previous status without erasing historical labels', () => {
  for (const tag of expected) assert.equal(notePlan({ followup_tag: tag, next_followup_days: 'none' }).tag, tag);
  for (const tag of ['VIP', 'Active', 'Interested', 'Follow-up Needed', '<invalid>']) assert.throws(() => notePlan({ followup_tag: tag }), /valid CRM status tag/);
  assert.deepEqual(policy.withStatus(['Imported Lead', 'Hot', 'VIP'], 'Negotiation'), ['Imported Lead', 'VIP', 'Negotiation']);
  assert.deepEqual(policy.withStatus(['Imported Lead', 'New'], ['Hot', 'Follow-up', 'Visit Scheduled']), ['Imported Lead', 'Hot', 'Follow-up', 'Visit Scheduled']);
  assert.deepEqual(notePlan({ followup_tag: ['Hot', 'Follow-up'], next_followup_days: 'none' }).tags, ['Hot', 'Follow-up']);
  assert.equal(policy.normalize('Closed Lost'), 'Closed Lost');
  assert.equal(policy.normalize('Booking'), 'Booking');
  assert.equal(policy.normalize('Active'), 'New');
});
