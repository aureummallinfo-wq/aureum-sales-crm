'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../../../');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('CRM shell loads shared pagination assets before feature modules', () => {
  const html = read('frontend/index.html');
  assert.match(html, /shared\/pagination\.css/);
  assert.match(html, /shared\/pagination\.js/);
  assert.ok(html.indexOf('/shared/pagination.js') < html.indexOf('/features/leads/leads-module.js'));
  assert.ok(html.indexOf('/shared/pagination.js') < html.indexOf('/features/customers/customers-module.js'));
  assert.ok(html.indexOf('/shared/pagination.js') < html.indexOf('/features/follow-ups/followups-module.js'));
  assert.ok(html.indexOf('/shared/pagination.js') < html.indexOf('/features/tasks/tasks-module.js'));
});

test('priority CRM loaders request database-backed page and pageSize', () => {
  const shell = read('frontend/app-shell.js');
  assert.match(shell, /new URLSearchParams\(\{ page: String\(paging\.page\), pageSize: String\(paging\.pageSize\) \}\)/);
  assert.match(shell, /\/api\/leads\/my/);
  assert.match(shell, /\/api\/customers\/my/);
  assert.match(shell, /\/api\/follow-ups\/my/);

  const tasks = read('frontend/features/tasks/tasks-module.js');
  assert.match(tasks, /query\.set\('page', String\(tasks\.pagination\.page\)\)/);
  assert.match(tasks, /query\.set\('pageSize', String\(tasks\.pagination\.pageSize\)\)/);
});

test('All Leads, My Leads, Customers, Follow-ups, and Tasks render shared pagers', () => {
  const leads = read('frontend/features/leads/leads-module.js');
  const customers = read('frontend/features/customers/customers-module.js');
  const followups = read('frontend/features/follow-ups/followups-module.js');
  const tasks = read('frontend/features/tasks/tasks-module.js');

  assert.match(leads, /AureumPagination\?\.render[\s\S]*'leads'/);
  assert.match(leads, /AureumPagination\.attach\(document, 'leads'/);
  assert.match(customers, /AureumPagination\?\.render[\s\S]*'customers'/);
  assert.match(customers, /AureumPagination\.attach\(document, 'customers'/);
  assert.match(followups, /AureumPagination\?\.render[\s\S]*'followups'/);
  assert.match(followups, /AureumPagination\.attach\(document, 'followups'/);
  assert.match(tasks, /AureumPagination\?\.render[\s\S]*'tasks'/);
  assert.match(tasks, /AureumPagination\.attach\(document, 'tasks'/);
});

test('list APIs keep legacy callers compatible and page only explicit pagination requests', () => {
  const api = read('backend/db/relational-api.js');
  const repository = read('backend/db/neon-repository.js');

  assert.match(api, /parsePagination/);
  assert.match(api, /paginationRequest\(url, res\)/);
  assert.match(repository, /pagination = null/);
  assert.match(repository, /ORDER BY l\.created_at DESC, l\.id DESC/);
  assert.match(repository, /ORDER BY c\.created_at DESC, c\.id DESC/);
  assert.match(repository, /t\.created_at DESC, t\.id DESC/);
  assert.match(repository, /ON CONFLICT \(user_id,dedupe_key\) DO NOTHING/);
});

test('production deployment remains disabled while pagination is reviewed', () => {
  const workflow = read('.github/workflows/deploy-production.yml');
  assert.match(workflow, /if: \$\{\{ false \}\}/);
});
