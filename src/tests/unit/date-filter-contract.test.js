const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('every operational registry renders and stores a date filter', () => {
  const leads = read('frontend/features/leads/leads-module.js');
  const customers = read('frontend/features/customers/customers-module.js');
  const tasks = read('frontend/features/tasks/tasks-module.js');
  const agents = read('frontend/team-chat-reports-agents.js');
  const followups = read('frontend/features/follow-ups/followups-module.js');
  assert.match(leads, /AureumDateFilter\?\.render\('leads'/);
  assert.match(customers, /AureumDateFilter\?\.render\('customers'/);
  assert.match(tasks, /AureumDateFilter\?\.render\('tasks'/);
  assert.match(agents, /AureumDateFilter\?\.render\('agents'/);
  assert.match(followups, /data-followup-module-date/);
  assert.match(followups, /data-followup-module-custom-start/);
  assert.match(followups, /data-followup-module-custom-end/);
});

test('date filters propagate to both relational and fallback data paths', () => {
  const appShell = read('frontend/app-shell.js');
  const tasks = read('frontend/features/tasks/tasks-module.js');
  const relational = read('backend/db/relational-api.js');
  const repository = read('backend/db/neon-repository.js');
  const fallback = read('backend/crm-api-server.js');
  const agents = read('frontend/team-chat-reports-agents.js');
  assert.match(appShell, /query\.set\('dateFrom'/);
  assert.match(appShell, /query\.set\('dateTo'/);
  assert.match(tasks, /query\.set\('dateFrom'/);
  assert.match(agents, /query\.set\('dateFrom'/);
  assert.match(agents, /query\.set\('dateTo'/);
  assert.match(relational, /dateFrom: url\.searchParams\.get\('dateFrom'/);
  assert.match(relational, /dateTo: url\.searchParams\.get\('dateTo'/);
  assert.match(repository, /COALESCE\(l\.received_at, l\.created_at\) AT TIME ZONE 'Asia\/Karachi'/);
  assert.match(repository, /c\.created_at AT TIME ZONE 'Asia\/Karachi'/);
  assert.match(repository, /t\.due_at AT TIME ZONE 'Asia\/Karachi'/);
  assert.match(fallback, /filterDateInRange\(lead\.received_at \|\| lead\.created_time \|\| lead\.submitted_at \|\| lead\.created_at/);
  assert.match(fallback, /filterDateInRange\(customer\.created_at/);
  assert.match(fallback, /filterDateInRange\(target\.created_at/);
  assert.match(relational, /dateInRange\(item\.created_at,dateFrom,dateTo\)/);
});
