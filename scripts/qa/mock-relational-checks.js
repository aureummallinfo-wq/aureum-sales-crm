const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const XLSX = require('xlsx');
const { createNeonRepository } = require('../../backend/db/neon-repository');
const { createRelationalApi } = require('../../backend/db/relational-api');
const { spreadsheetToCsv } = require('../../backend/spreadsheet-parser');
const security = require('../../backend/security-utils');

async function runRelationalChecks({ check, need }) {
  const db = new PGlite();
  try {
    for (const migration of ['002_production_crm_schema.sql', '003_workspace_settings.sql', '004_crm_integration_metadata.sql', '005_tasks.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../../db/migrations', migration), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
    }
    const sql = { query: async (text, params) => (await db.query(text, params)).rows };
    const insert = async (table, fields) => (await sql.query(`INSERT INTO crm.${table} (${Object.keys(fields).join(',')}) VALUES (${Object.values(fields).map((_, index) => `$${index + 1}`).join(',')}) RETURNING *`, Object.values(fields)))[0];
    const workspace = await insert('workspaces', { legacy_id: 'mock', name: 'Disposable mock workspace' });
    const team = await insert('teams', { workspace_id: workspace.id, legacy_id: 'team', name: 'Mock team' });
    const foreignTeam = await insert('teams', { workspace_id: workspace.id, legacy_id: 'foreign-team', name: 'Foreign mock team' });
    for (const [id, role, teamId] of [['manager', 'sales_manager', team.id], ['agent', 'sales_agent', team.id], ['colleague', 'sales_agent', team.id], ['foreign', 'sales_agent', foreignTeam.id]]) {
      await insert('users', { workspace_id: workspace.id, legacy_id: id, full_name: `Mock ${id}`, email: `${id}@example.test`, password_hash: 'disposable-test-only', role_key: role, team_id: teamId });
    }
    const manager = { id: 'manager', role: 'sales_manager', team_id: 'team', workspace_id: workspace.id, full_name: 'Mock manager' };
    const agent = { ...manager, id: 'agent', role: 'sales_agent', full_name: 'Mock agent' };
    const colleague = { ...agent, id: 'colleague' };
    let response;
    const repository = createNeonRepository(sql);
    const api = createRelationalApi({ repository, workspaceId: workspace.id, json: (_, status, body) => { response = { status, body }; return true; }, readBody: async req => req.body, readBodyLimited: async req => req.body, leadView: row => row, customerView: row => row, followUpView: row => row, userManagementView: (_, row) => row, spreadsheetToCsv, crmTimezone: 'Asia/Karachi', ...security });
    async function request(user, route, method = 'GET', body = {}, expected = 200) {
      response = null;
      assert.equal(await api.handle({ method, body }, {}, new URL(route, 'http://mock.test'), user), true, 'Relational API route was not handled.');
      assert.ok(response); assert.equal(response.status, expected, `Expected HTTP ${expected}, received ${response.status}: ${response.body.error || ''}`);
      return response.body;
    }
    const test = (role, module, name, run) => check(role, module, name, run, 'Relational API + PGlite SQL');
    let task;
    await test('Sales Manager', 'Tasks', 'Assign a dated, high-priority task to a team agent', async () => {
      task = (await request(manager, '/api/tasks', 'POST', { title: 'Mock call assignment', description: 'Discuss the mock payment plan.', assigned_to: 'agent', priority: 'High', due_at: '2099-10-24T14:35' }, 201)).data;
      assert.equal(task.assignedTo, 'agent'); assert.equal(task.priority, 'High'); assert.equal(task.status, 'Pending');
      assert.equal(new Date(task.dueAt).toISOString(), '2099-10-24T09:35:00.000Z');
      assert.equal((await request(manager, '/api/tasks')).data.length, 1);
    });
    await test('Sales Manager', 'Tasks', 'Reject missing title, invalid date and an advisor outside the team', async () => {
      await request(manager, '/api/tasks', 'POST', { title: '' }, 422);
      await request(manager, '/api/tasks', 'POST', { title: 'Bad date', due_at: 'invalid' }, 422);
      await request(manager, '/api/tasks', 'POST', { title: 'Foreign assignment', assigned_to: 'foreign' }, 422);
    });
    await test('Sales Agent', 'Tasks', 'Only the assignee can list and open the task', async () => {
      need(task, 'Task');
      assert.equal((await request(agent, '/api/tasks')).data[0].id, task.id);
      assert.equal((await request(colleague, '/api/tasks')).data.length, 0);
      await request(colleague, `/api/tasks/${task.id}`, 'GET', {}, 404);
    });
    await test('Sales Agent', 'Tasks', 'Complete and reopen the assigned task with completion timestamps', async () => {
      need(task, 'Task');
      const done = (await request(agent, `/api/tasks/${task.id}`, 'PATCH', { status: 'Completed' })).data;
      assert.equal(done.status, 'Completed'); assert.ok(done.completedAt);
      const reopened = (await request(agent, `/api/tasks/${task.id}`, 'PATCH', { status: 'Pending', description: 'Mock reopened context.' })).data;
      assert.equal(reopened.status, 'Pending'); assert.equal(reopened.completedAt, null); assert.equal(reopened.description, 'Mock reopened context.');
    });
    await test('Sales Agent', 'Tasks', 'Cannot create, delete or reassign tasks', async () => {
      need(task, 'Task');
      await request(agent, '/api/tasks', 'POST', { title: 'Forbidden task' }, 403);
      await request(agent, `/api/tasks/${task.id}`, 'DELETE', {}, 403);
      await request(agent, `/api/tasks/${task.id}`, 'PATCH', { assigned_to: 'colleague', title: 'Forbidden title' }, 422);
      assert.equal((await request(manager, `/api/tasks/${task.id}`)).data.assignedTo, 'agent');
    });
    await test('Sales Manager', 'Tasks', 'Edit, filter and reassign a task; the previous agent loses access', async () => {
      need(task, 'Task');
      await request(manager, `/api/tasks/${task.id}`, 'PATCH', { title: 'Mock revised call', assigned_to: 'colleague', priority: 'Urgent' });
      assert.equal((await request(manager, '/api/tasks?q=revised&priority=Urgent&assignedTo=colleague')).data.length, 1);
      assert.equal((await request(agent, '/api/tasks')).data.length, 0);
      await request(agent, `/api/tasks/${task.id}`, 'GET', {}, 404);
      assert.equal((await request(colleague, `/api/tasks/${task.id}`)).data.title, 'Mock revised call');
    });
    await test('Sales Manager', 'Tasks', 'Delete the disposable task and hide it from all active lists', async () => {
      need(task, 'Task'); await request(manager, `/api/tasks/${task.id}`, 'DELETE');
      await request(colleague, `/api/tasks/${task.id}`, 'GET', {}, 404);
      assert.equal((await request(manager, '/api/tasks')).data.length, 0);
    });
    for (const [role, actor, phone] of [['Sales Manager', manager, '+923001232001'], ['Sales Agent', agent, '+923001232002']]) {
      await test(role, 'Account', 'Database profile validation preserves stored values on rejected edits', async () => {
        const before = await repository.findUser(workspace.id, actor.id);
        await request(actor, '/api/account/me/profile', 'PATCH', { fullName: '', phone: 'invalid' }, 422);
        const after = await repository.findUser(workspace.id, actor.id);
        assert.equal(after.full_name, before.full_name); assert.equal(after.phone, before.phone);
      });
      await test(role, 'Logout', 'Database session revocation rejects the revoked token', async () => {
        const userId = await repository.resolveUserId(workspace.id, actor.id);
        const token = `disposable-mock-token-${actor.id}`;
        await repository.createSession({ userId, token, expiresAt: '2099-12-31T00:00:00Z' });
        assert.equal((await repository.findSession(token, workspace.id)).id, actor.id);
        await repository.revokeSession(token, workspace.id);
        assert.equal(await repository.findSession(token, workspace.id), null);
      });
      await test(role, 'Lead import', 'Import valid rows, skip duplicates, reject bad contacts and preserve ownership', async () => {
        const row = { full_name: `${role} imported client`, phone, interested_in: 'Apartment', tags: 'Investor|VIP' };
        const imported = (await request(actor, '/api/leads/import', 'POST', { rows: [row, row, { ...row, phone: 'invalid' }] })).data;
        assert.equal(imported.imported, 1); assert.equal(imported.skippedCount, 1); assert.equal(imported.failedCount, 1);
        const lead = await repository.getLead(workspace.id, imported.created[0].id);
        assert.equal(lead.assigned_agent_id, actor.id); assert.equal(lead.assigned_team_id, 'team'); assert.deepEqual(lead.tags, ['Investor', 'VIP']);
        assert.equal((await request(actor, '/api/leads/import', 'POST', { rows: [row] })).data.skippedCount, 1);
        await request(actor, '/api/leads/import', 'POST', { rows: [] }, 400);
      });
      await test(role, 'Lead import', 'Parse a real Excel workbook for the import preview', async () => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ full_name: 'Excel mock client', phone, interested_in: 'Apartment' }]), 'Leads');
        const file = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const parsed = await request(actor, '/api/leads/import/parse', 'POST', { file_name: 'mock.xlsx', file_base64: file.toString('base64') });
        assert.match(parsed.data.csv, /Excel mock client/);
        await request(actor, '/api/leads/import/parse', 'POST', { file_name: 'invalid.exe', file_base64: 'abc' }, 422);
      });
    }
  } finally {
    await db.close();
  }
}

module.exports = { runRelationalChecks };
