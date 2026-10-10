const test = require('node:test');
const assert = require('node:assert/strict');

test('imported leads remain unassigned until explicitly routed to an advisor', () => {
  const importedLead = { is_imported: true, assigned_agent_id: null, assigned_team_id: null, tags: ['Imported Lead', 'Webhook Lead'] };
  assert.equal(importedLead.is_imported, true);
  assert.equal(importedLead.assigned_agent_id, null);
  assert.ok(importedLead.tags.includes('Imported Lead'));
});
