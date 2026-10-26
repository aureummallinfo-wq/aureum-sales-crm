const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createNeonRepository } = require('../../../backend/db/neon-repository');
const { createRelationalApi } = require('../../../backend/db/relational-api');
const security = require('../../../backend/security-utils');

test('follow-ups belong to the visible customer relationship, not an imported owner label', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync(path.join(__dirname, '../../../db/migrations/002_production_crm_schema.sql'), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
  await db.exec(fs.readFileSync(path.join(__dirname,'../../../db/migrations/012_opportunity_closure.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname, '../../../db/migrations/003_workspace_settings.sql'), 'utf8'));
  const sql = { query: async (query, params) => (await db.query(query, params)).rows };
  const repository = createNeonRepository(sql);
  async function insert(table, fields) {
    const values = Object.values(fields);
    return (await sql.query(`INSERT INTO crm.${table} (${Object.keys(fields).join(',')}) VALUES (${values.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, values))[0];
  }
  await insert('notification_definitions', { event_key: 'follow_up_due', event_name: 'Follow-up due' });
  await insert('notification_definitions', { event_key: 'follow_up_overdue', event_name: 'Follow-up overdue' });
  const workspace = await insert('workspaces', { name: 'Lahore', legacy_id: 'lahore' });
  const otherWorkspace = await insert('workspaces', { name: 'Other city', legacy_id: 'other' });
  const team = await insert('teams', { workspace_id: workspace.id, legacy_id: 'team', name: 'Lahore sales' });
  const otherTeam = await insert('teams', { workspace_id: workspace.id, legacy_id: 'other-team', name: 'Other sales team' });
  const user = await insert('users', { workspace_id: workspace.id, legacy_id: 'agent', full_name: 'Adan', email: 'adan@example.test', password_hash: 'test', role_key: 'sales_agent', team_id: team.id });
  const colleague = await insert('users', { workspace_id: workspace.id, legacy_id: 'colleague', full_name: 'Colleague', email: 'colleague@example.test', password_hash: 'test', role_key: 'sales_agent', team_id: team.id });
  const remoteUser = await insert('users', { workspace_id: otherWorkspace.id, legacy_id: 'agent', full_name: 'Other portal agent', email: 'remote@example.test', password_hash: 'test', role_key: 'sales_agent' });
  const actor = { id: 'agent', role: 'sales_agent', team_id: 'team', workspace_id: workspace.id, full_name: 'Adan' };
  const manager = { ...actor, id: 'manager', role: 'sales_manager' };
  const admin = { ...actor, role: 'super_admin' };
  const followUp = (id, customer, patch = {}) => insert('follow_ups', {
    workspace_id: workspace.id, legacy_id: id, customer_id: customer?.id || null,
    lead_id: customer?.lead_id || null, assigned_agent_id: user.id, assigned_team_id: team.id,
    follow_up_type: 'Call', due_at: '2099-01-01T10:00:00+05:00', ...patch
  });
  const customers = [];
  for (const [index, name] of ['Rana Naseem', 'Adnan', 'Mohammed Ashraf'].entries()) {
    const lead = await insert('leads', { workspace_id: workspace.id, legacy_id: `lead-${index}`, full_name: name, assigned_agent_id: user.id, assigned_team_id: team.id });
    const customer = await insert('customers', { workspace_id: workspace.id, legacy_id: `customer-${index}`, lead_id: lead.id, full_name: name, assigned_agent_id: user.id, assigned_team_id: team.id });
    customers.push(customer);
    await followUp(`valid-${index}`, customer);
  }
  await followUp('duplicate', customers[0]);
  const foreignLead = await insert('leads', { workspace_id: workspace.id, legacy_id: 'foreign-lead', full_name: 'Fulham Music', assigned_agent_id: colleague.id, assigned_team_id: team.id });
  const foreignCustomer = await insert('customers', { workspace_id: workspace.id, legacy_id: 'foreign-customer', lead_id: foreignLead.id, full_name: 'Fulham Music', assigned_agent_id: colleague.id, assigned_team_id: team.id });
  await followUp('wrong-owner', foreignCustomer);
  await followUp('foreign-owned', foreignCustomer, { assigned_agent_id: colleague.id });
  await followUp('wrong-lead', customers[0], { lead_id: foreignLead.id });
  await followUp('wrong-team', customers[0], { assigned_team_id: otherTeam.id });
  const unconvertedLead = await insert('leads', { workspace_id: workspace.id, legacy_id: 'unconverted-lead', full_name: 'Imported stranger', assigned_agent_id: user.id, assigned_team_id: team.id });
  await followUp('orphan', null, { lead_id: unconvertedLead.id, metadata: { customer_name: 'Imported stranger', customer_id: 'customer-0', assigned_agent_id: 'agent' } });
  const remoteLead = await insert('leads', { workspace_id: otherWorkspace.id, legacy_id: 'lead-0', full_name: 'Other city lead', assigned_agent_id: remoteUser.id });
  const remoteCustomer = await insert('customers', { workspace_id: otherWorkspace.id, legacy_id: 'customer-0', lead_id: remoteLead.id, full_name: 'Other city customer', assigned_agent_id: remoteUser.id });
  await followUp('cross-workspace', remoteCustomer);
  const deletedLead = await insert('leads', { workspace_id: workspace.id, legacy_id: 'deleted-lead', full_name: 'Deleted customer', assigned_agent_id: user.id, assigned_team_id: team.id });
  const deletedCustomer = await insert('customers', { workspace_id: workspace.id, legacy_id: 'deleted-customer', lead_id: deletedLead.id, full_name: 'Deleted customer', assigned_agent_id: user.id, assigned_team_id: team.id, deleted_at: new Date() });
  await followUp('deleted', deletedCustomer);

  await t.test('three customer records produce three current follow-up rows', async () => {
    const registry = await repository.listCustomers({ workspaceId: workspace.id, user: actor });
    const reminders = await repository.listFollowUps({ workspaceId: workspace.id, user: actor });
    assert.equal(registry.length, 3);
    assert.equal(reminders.length, 3);
    assert.deepEqual(new Set(reminders.map(row => row.customer_id)), new Set(registry.map(row => row.id)));
    assert.equal((await repository.search(workspace.id, actor, 'Fulham')).followUps.length, 0);
    assert.equal((await repository.listCustomerFollowUps(workspace.id, 'foreign-customer', actor)).length, 0);
  });
  await t.test('invalid relationships cannot be opened or acted on directly', async () => {
    for (const id of ['wrong-owner', 'wrong-lead', 'wrong-team', 'orphan', 'cross-workspace', 'deleted']) {
      assert.equal(await repository.getFollowUp(workspace.id, id), null, id);
    }
    assert.equal(await repository.updateFollowUp(workspace.id, 'wrong-owner', actor, { notes: 'Forbidden' }), null);
    assert.equal((await repository.listFollowUps({ workspaceId: workspace.id, user: { ...actor, workspace_id: otherWorkspace.id } })).length, 0);
  });
  await t.test('a valid session token is accepted only by its own portal', async () => {
    await repository.createSession({ userId: user.id, token: 'session-for-lahore', expiresAt: new Date(Date.now() + 60000) });
    assert.equal((await repository.findSession('session-for-lahore', workspace.id)).id, 'agent');
    assert.equal(await repository.findSession('session-for-lahore', otherWorkspace.id), null);
    assert.equal(await repository.findSession('session-for-lahore'), null);
  });
  await t.test('managers still get their team scope with invalid owner labels removed', async () => {
    const reminders = await repository.listFollowUps({ workspaceId: workspace.id, user: manager });
    assert.equal(reminders.length, 4);
    assert.ok(reminders.some(row => row.id === 'foreign-owned'));
    assert.ok(reminders.every(row => row.id !== 'wrong-owner'));
  });
  await t.test('notification feeds do not leak orphaned or mismatched customers', async () => {
    const [definition] = await sql.query("SELECT event_key FROM crm.notification_definitions WHERE event_key='follow_up_due'");
    assert.ok(definition);
    const [invalid] = await sql.query("SELECT id FROM crm.follow_ups WHERE legacy_id='wrong-owner'");
    await insert('notifications', { user_id: user.id, event_key: 'follow_up_due', title: 'Unrelated follow-up', message: 'Fulham Music', related_entity_type: 'follow_up', related_entity_id: invalid.id });
    const notifications = await repository.listNotifications(workspace.id, actor.id);
    assert.ok(notifications.every(row => row.message !== 'Fulham Music'));
  });
  await t.test('creation rejects mixed customers, leads and assignees without adding rows', async () => {
    const before = (await sql.query('SELECT count(*)::integer AS count FROM crm.follow_ups'))[0].count;
    const input = { customer_id: 'customer-0', lead_id: 'foreign-lead', due_date: '2099-02-01', due_time: '10:00' };
    assert.equal(await repository.createFollowUp(workspace.id, admin, input), null);
    assert.equal(await repository.createFollowUp(workspace.id, admin, { ...input, lead_id: 'lead-0', assigned_agent_id: 'colleague' }), null);
    assert.equal((await sql.query('SELECT count(*)::integer AS count FROM crm.follow_ups'))[0].count, before);
  });
  await t.test('API lists, details, notes and mutations enforce the same boundaries', async () => {
    const response = {};
    const api = createRelationalApi({ repository, workspaceId: workspace.id, json: (_, status, body) => { response.status = status; response.body = body; return true; }, readBody: async req => req.body, leadView: row => row, customerView: row => row, followUpView: row => row, ...security });
    const request = (route, method = 'GET', body = {}, user = actor) => api.handle({ method, body }, {}, new URL(route, 'http://crm.test'), user);
    await request('/api/follow-ups/my');
    assert.equal(response.status, 200); assert.equal(response.body.data.length, 3);
    for (const [route, method] of [['/api/follow-ups/wrong-owner', 'GET'], ['/api/follow-ups/wrong-owner/notes', 'POST'], ['/api/follow-ups/wrong-owner/complete', 'PATCH']]) {
      await request(route, method, { note: 'Forbidden' }); assert.equal(response.status, 404);
    }
    await request('/api/follow-ups/foreign-owned'); assert.equal(response.status, 403);
    await request('/api/follow-ups/my', 'GET', {}, { ...actor, workspace_id: otherWorkspace.id }); assert.equal(response.status, 403);
    await request('/api/follow-ups', 'POST', { customer_id: 'customer-0', lead_id: 'foreign-lead', due_date: '2099-01-01', due_time: '10:00' }); assert.equal(response.status, 422);
  });
  await t.test('assignment moves the lead, customer and reminders together', async () => {
    await db.exec(`CREATE FUNCTION reject_test_assignment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test assignment failure'; END $$;
      CREATE TRIGGER reject_test_assignment BEFORE UPDATE ON crm.follow_ups FOR EACH ROW EXECUTE FUNCTION reject_test_assignment();`);
    await assert.rejects(repository.assignLead(workspace.id, 'lead-0', admin, 'colleague'), /Test assignment failure/);
    assert.equal((await repository.getLead(workspace.id, 'lead-0')).assigned_agent_id, 'agent');
    assert.equal((await repository.getCustomer(workspace.id, 'customer-0')).assigned_agent_id, 'agent');
    await db.exec('DROP TRIGGER reject_test_assignment ON crm.follow_ups; DROP FUNCTION reject_test_assignment();');
    assert.ok(await repository.assignLead(workspace.id, 'lead-0', admin, 'colleague'));
    assert.equal((await repository.getCustomer(workspace.id, 'customer-0')).assigned_agent_id, 'colleague');
    const oldScope = await repository.listFollowUps({ workspaceId: workspace.id, user: actor });
    assert.equal(oldScope.length, 2);
    const newScope = await repository.listFollowUps({ workspaceId: workspace.id, user: { ...actor, id: 'colleague' } });
    assert.ok(newScope.some(row => row.customer_id === 'customer-0'));
    const [owners] = await sql.query("SELECT count(DISTINCT assigned_agent_id)::integer AS count FROM crm.follow_ups WHERE customer_id=$1 AND legacy_id IN ('valid-0','duplicate')", [customers[0].id]);
    assert.equal(owners.count, 1);
    const [invalid] = await sql.query("SELECT assigned_agent_id FROM crm.follow_ups WHERE legacy_id='wrong-lead'");
    assert.equal(invalid.assigned_agent_id, user.id);
    assert.equal(await repository.getFollowUp(workspace.id, 'wrong-lead'), null);
  });
});
