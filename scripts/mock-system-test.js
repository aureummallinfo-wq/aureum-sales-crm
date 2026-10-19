const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { startApiServer, ROOT } = require('../src/tests/helpers/api-test-server');
const { runRelationalChecks } = require('./qa/mock-relational-checks');

// Always uses a new, disposable server. No URL, password or database override is accepted.
const results = [];
const cleanup = [];
const startedAt = new Date().toISOString();
class Blocked extends Error {}
function need(value, label) { if (!value) throw new Blocked(`${label} was not created by an earlier check.`); return value; }
async function check(role, module, name, run, layer = 'Local API') {
  const start = Date.now();
  try {
    const evidence = await run();
    results.push({ role, module, name, layer, status: 'PASS', evidence: evidence || 'All assertions passed.', milliseconds: Date.now() - start });
  } catch (error) {
    results.push({ role, module, name, layer, status: error instanceof Blocked ? 'BLOCKED' : 'FAIL', evidence: error.message, milliseconds: Date.now() - start });
  }
  const last = results.at(-1);
  console.log(`${last.status.padEnd(7)} ${role} / ${module} / ${name}${last.status === 'PASS' ? '' : `: ${last.evidence}`}`);
}
function status(result, expected) {
  assert.equal(result.response.status, expected, `Expected HTTP ${expected}, received ${result.response.status}: ${result.body.error || (result.response.ok ? 'Request unexpectedly succeeded.' : result.text.slice(0, 160))}`);
  return result.body;
}
function client(api, cookie) {
  return async (route, method = 'GET', body, expected = 200) => {
    const result = await api.request(route, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    status(result, expected);
    return result;
  };
}
const noteOnly = { customer_contacted: false, next_followup_days: 'none' };
const schedule = { schedule_followup: true, note: 'Mock test: discuss the payment plan.', next_due_date: '2099-10-24', next_due_time: '14:35', followup_tag: 'Follow-up Needed' };

async function runPortal(api, role, email, id, label) {
  let cookie;
  await check(role, 'Login', 'Sign in and restore the authenticated API session', async () => {
    cookie = await api.login(email);
    const me = status(await api.request('/api/auth/me', { headers: { cookie } }), 200);
    assert.equal(me.user.role, role === 'Sales Manager' ? 'sales_manager' : 'sales_agent');
    assert.equal(me.user.id, id);
  });
  if (!cookie) return;
  const request = client(api, cookie);
  const manager = role === 'Sales Manager';
  const own = manager ? '' : '/my';
  let lead, customer, reminder;

  await check(role, 'Login', 'Heartbeat updates presence', async () => {
    assert.equal((await request('/api/presence/heartbeat', 'POST')).body.data.presenceStatus, 'Online');
  });
  for (const widget of ['summary', 'lead-inflow', 'lead-sources', 'follow-up-performance', 'conversion-overview', 'recent-leads', 'today-follow-ups']) {
    await check(role, 'Dashboard', `Load ${widget}`, async () => {
      assert.ok((await request(`/api/dashboard/${widget}`)).body.data !== undefined);
    });
  }
  await check(role, 'Dashboard', 'Custom date range loads without losing scope', async () => {
    const body = (await request('/api/dashboard/summary?dateRange=custom&startDate=2020-01-01&endDate=2099-12-31')).body;
    assert.ok(body.data);
    assert.ok(body.scope);
  });
  await check(role, 'Leads', 'List only permitted leads', async () => {
    const rows = (await request(`/api/leads${own}`)).body.data;
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => manager ? row.assigned_team_id === 'team_a' : row.assigned_agent_id === id));
  });
  await check(role, 'Leads', 'Reject missing required fields and invalid contact details', async () => {
    await request('/api/leads', 'POST', { full_name: '' }, 400);
    await request('/api/leads', 'POST', { full_name: 'Invalid mock', phone: 'invalid', interested_in: 'Apartment' }, 422);
  });
  await check(role, 'Leads', 'Create a lead with tags and safe ownership', async () => {
    lead = (await request('/api/leads', 'POST', { full_name: `${label} Mock Client`, phone: manager ? '+923001231001' : '+923001231002', email: `${label.toLowerCase()}@example.test`, interested_in: 'Commercial', property_type: 'Apartment', city: 'Lahore', tags: ['Investor', 'VIP'], assigned_agent_id: manager ? 'usr_003' : 'usr_004' }, 201)).body.data;
    assert.equal(lead.assigned_agent_id, manager ? 'usr_003' : id);
    assert.equal(lead.customer_id, null);
    assert.deepEqual(lead.tags, ['Investor', 'VIP']);
  });
  await check(role, 'Leads', 'Search and open the newly created lead', async () => {
    need(lead, 'Lead');
    const search = (await request(`/api/leads${own}?q=${label}%20Mock%20Client`)).body.data;
    assert.ok(search.some(row => row.id === lead.id));
    assert.equal((await request(`/api/leads/${lead.id}`)).body.data.full_name, lead.full_name);
  });
  await check(role, 'Leads', 'Edit details, status and priority; retain the changes', async () => {
    need(lead, 'Lead');
    await request(`/api/leads/${lead.id}`, 'PATCH', { city: 'Islamabad', budget: '10 million' });
    await request(`/api/leads/${lead.id}/status`, 'PATCH', { status: 'Qualified', priority: 'High' });
    const saved = (await request(`/api/leads/${lead.id}`)).body.data;
    assert.equal(saved.city, 'Islamabad'); assert.equal(saved.status, 'Qualified'); assert.equal(saved.priority, 'High');
    await request(`/api/leads/${lead.id}/status`, 'PATCH', { status: 'Invented status' }, 422);
  });
  await check(role, 'Leads', 'Save an internal note and view activity', async () => {
    need(lead, 'Lead');
    await request(`/api/leads/${lead.id}/notes`, 'POST', { ...noteOnly, note: 'Mock internal lead note.' }, 201);
    assert.ok((await request(`/api/leads/${lead.id}/activity`)).body.data.some(row => JSON.stringify(row).includes('Mock internal lead note.')));
  });
  await check(role, 'Customers', 'Reject an invalid schedule without partially creating a customer', async () => {
    need(lead, 'Lead');
    await request(`/api/leads/${lead.id}/customer`, 'POST', { ...schedule, next_due_date: '2099-02-30' }, 422);
    assert.equal((await request(`/api/leads/${lead.id}`)).body.data.customer_id, null);
  });
  await check(role, 'Customers', 'Create a linked customer and one pending follow-up', async () => {
    need(lead, 'Lead');
    const created = (await request(`/api/leads/${lead.id}/customer`, 'POST', schedule, 201)).body;
    customer = created.data;
    assert.ok(created.created); assert.ok(created.follow_up_id);
    assert.equal(customer.assigned_agent_id, lead.assigned_agent_id);
    const detail = (await request(`/api/customers/${customer.id}`)).body;
    assert.ok(detail.notes.some(row => row.note === schedule.note));
    const rows = (await request(`/api/follow-ups${own}`)).body.data.filter(row => row.customer_id === customer.id);
    assert.equal(rows.length, 1); reminder = rows[0];
    assert.equal(reminder.status, 'Pending'); assert.equal(reminder.due_date, schedule.next_due_date); assert.equal(reminder.due_time, schedule.next_due_time);
  });
  await check(role, 'Customers', 'Repeated customer creation keeps the same profile and reminder', async () => {
    need(customer, 'Customer');
    const before = (await request(`/api/customers/${customer.id}`)).body;
    const again = (await request(`/api/leads/${lead.id}/customer`, 'POST', { ...schedule, full_name: 'Do not overwrite' })).body;
    assert.equal(again.created, false); assert.equal(again.data.id, customer.id); assert.equal(again.data.full_name, customer.full_name);
    assert.equal((await request(`/api/customers/${customer.id}`)).body.notes.length, before.notes.length);
  });
  await check(role, 'Customers', 'Search customer registry within the role scope', async () => {
    need(customer, 'Customer');
    const rows = (await request(`/api/customers${own}?q=${label}`)).body.data;
    assert.ok(rows.some(row => row.id === customer.id));
    assert.ok(rows.every(row => manager ? row.assigned_team_id === 'team_a' : row.assigned_agent_id === id));
  });
  await check(role, 'Customers', 'Save a custom property type and multiple tags', async () => {
    need(customer, 'Customer');
    await request(`/api/customers/${customer.id}`, 'PATCH', { property_type: 'Rooftop restaurant', tags: ['Investor', 'VIP', 'Follow-up Needed'] });
    const saved = (await request(`/api/customers/${customer.id}`)).body.data;
    assert.equal(saved.property_type, 'Rooftop restaurant'); assert.ok(saved.tags.includes('VIP')); assert.ok(saved.tags.includes('Investor'));
  });
  await check(role, 'Customers', 'Save status and note; load notes, timeline and follow-up tabs', async () => {
    need(customer, 'Customer');
    await request(`/api/customers/${customer.id}/status`, 'PATCH', { status: 'Interested' });
    await request(`/api/customers/${customer.id}/notes`, 'POST', { ...noteOnly, note: 'Mock customer profile note.' }, 201);
    assert.equal((await request(`/api/customers/${customer.id}`)).body.data.customer_status, 'Interested');
    for (const tab of ['notes', 'timeline', 'follow-ups']) assert.ok(Array.isArray((await request(`/api/customers/${customer.id}/${tab}`)).body.data));
  });
  await check(role, 'Follow-ups', 'Repeated scheduling from both routes keeps one reminder', async () => {
    need(reminder, 'Follow-up');
    const input = { customer_id: customer.id, lead_id: lead.id, due_date: '2099-10-25', due_time: '15:30', note: 'Mock repeated schedule.', notes: 'Mock repeated schedule.' };
    assert.equal((await request('/api/follow-ups', 'POST', input)).body.data.id, reminder.id);
    assert.equal((await request(`/api/customers/${customer.id}/follow-ups`, 'POST', input)).body.data.id, reminder.id);
    assert.equal((await request(`/api/follow-ups${own}`)).body.data.filter(row => row.customer_id === customer.id).length, 1);
  });
  await check(role, 'Follow-ups', 'Reschedule records contact, note, exact date, time and tag', async () => {
    need(reminder, 'Follow-up');
    const input = { note: 'Mock customer agreed to the next call.', customer_contacted: true, next_followup_days: 'custom', next_due_date: '2099-11-01', next_due_time: '16:20', followup_tag: 'Follow-up Needed' };
    const saved = (await request(`/api/follow-ups/${reminder.id}/notes`, 'POST', input, 201)).body.data;
    assert.equal(saved.id, reminder.id); assert.equal(saved.status, 'Contacted'); assert.equal(saved.due_date, input.next_due_date); assert.equal(saved.due_time, input.next_due_time); assert.equal(saved.followup_tag, input.followup_tag);
    assert.ok((await request(`/api/customers/${customer.id}`)).body.data.tags.includes(input.followup_tag));
  });
  await check(role, 'Follow-ups', 'Add note preserves status, due date/time and last contact', async () => {
    need(reminder, 'Follow-up');
    const before = (await request(`/api/follow-ups/${reminder.id}`)).body.data;
    const contact = (await request(`/api/customers/${customer.id}`)).body.data.last_contacted_at;
    await request(`/api/follow-ups/${reminder.id}/notes`, 'POST', { ...noteOnly, note: 'Mock internal follow-up note.' }, 201);
    const after = (await request(`/api/follow-ups/${reminder.id}`)).body.data;
    for (const key of ['status', 'due_date', 'due_time', 'followup_tag']) assert.equal(after[key], before[key]);
    assert.equal((await request(`/api/customers/${customer.id}`)).body.data.last_contacted_at, contact);
    assert.ok((await request(`/api/follow-ups/${reminder.id}/activity`)).body.data.length > 0);
  });
  await check(role, 'Follow-ups', 'Reject invalid dates and unsafe tags without changing the reminder', async () => {
    need(reminder, 'Follow-up');
    const before = (await request(`/api/follow-ups/${reminder.id}`)).body.data;
    for (const patch of [{ next_due_date: '2099-02-30' }, { next_due_date: '2020-01-01' }, { followup_tag: '<invalid>' }]) {
      await request(`/api/follow-ups/${reminder.id}/notes`, 'POST', { ...schedule, customer_contacted: true, next_followup_days: 'custom', ...patch }, 422);
    }
    const after = (await request(`/api/follow-ups/${reminder.id}`)).body.data;
    assert.equal(after.due_date, before.due_date); assert.equal(after.last_activity_description, before.last_activity_description);
  });
  await check(role, 'Search', 'Global search finds this client in the permitted pipeline', async () => {
    need(customer, 'Customer');
    const data = (await request(`/api/search?q=${label}%20Mock`)).body.data;
    assert.ok(data.leads.some(row => row.id === lead.id)); assert.ok(data.customers.some(row => row.id === customer.id));
    if (!manager) assert.equal(data.agents.length, 0);
  });
  await check(role, 'Notifications', 'Read notifications and clear unread state', async () => {
    const items = (await request('/api/notifications')).body.data;
    if (items.length) await request(`/api/notifications/${items[0].id}/read`, 'PATCH');
    await request('/api/notifications/read-all', 'PATCH');
    assert.equal((await request('/api/notifications')).body.unread, 0);
  });
  await check(role, 'Chat', 'List permitted channels, contacts, groups and unread counts', async () => {
    const channels = (await request('/api/chat/channels')).body.data;
    assert.ok(channels.some(row => row.id === 'channel_general'));
    if (!manager) assert.ok(!channels.some(row => row.id === 'channel_management'));
    for (const route of ['users', 'direct', 'groups']) assert.ok(Array.isArray((await request(`/api/chat/${route}`)).body.data));
    assert.ok(Number.isFinite((await request('/api/chat/unread-counts')).body.data.total));
  });
  await check(role, 'Chat', 'Post and retrieve a mock channel message', async () => {
    const text = `${label}: mock channel message.`;
    const sent = (await request('/api/chat/channels/channel_general/messages', 'POST', { message_text: text }, 201)).body.data;
    assert.ok((await request('/api/chat/channels/channel_general/messages?markRead=1')).body.data.some(row => row.id === sent.id));
    await request('/api/chat/channels/channel_general/messages', 'POST', { message_text: '' }, 400);
  });
  await check(role, 'Chat', 'Post and retrieve a mock direct message', async () => {
    const target = manager ? 'usr_003' : 'usr_002';
    const sent = (await request(`/api/chat/direct/${target}/messages`, 'POST', { message_text: `${label}: mock direct message.` }, 201)).body.data;
    assert.ok((await request(`/api/chat/direct/${target}/messages`)).body.data.some(row => row.id === sent.id));
  });
  await check(role, 'Chat', 'Store a test attachment and shared link; reject unsafe URLs', async () => {
    await request('/api/chat/channels/channel_general/messages', 'POST', { message_text: 'Mock attachment.', attachment_name: 'mock.txt', attachment_content: 'data:text/plain;base64,TW9jaw==', attachment_mime: 'text/plain', attachment_size: 4 }, 201);
    assert.ok((await request('/api/chat/channel_general/attachments')).body.data.some(row => (row.file_name || row.fileName) === 'mock.txt'));
    await request('/api/chat/channel_general/links', 'POST', { title: 'Mock link', url: 'https://example.test/mock' }, 201);
    assert.ok((await request('/api/chat/channel_general/links')).body.data.some(row => row.url === 'https://example.test/mock'));
    await request('/api/chat/channel_general/links', 'POST', { title: 'Unsafe', url: 'javascript:alert(1)' }, 400);
  });
  await check(role, 'Account', 'Read profile and login activity; reject privilege changes', async () => {
    const before = (await request('/api/account/me/profile')).body.user;
    const after = (await request('/api/account/me/profile', 'PATCH', { role: 'super_admin', teamId: 'other_team', status: 'Suspended' })).body.user;
    assert.equal(after.role, before.role); assert.equal(after.teamId, before.teamId); assert.equal(after.status, before.status);
    assert.ok(Array.isArray((await request('/api/account/login-activity')).body.data));
  });
  await check(role, 'Account', 'Invalid profile submission leaves the saved profile unchanged', async () => {
    const before = (await request('/api/account/me/profile')).body.user;
    try {
      await request('/api/account/me/profile', 'PATCH', { fullName: '  ', phone: 'invalid' }, 422);
      const after = (await request('/api/account/me/profile')).body.user;
      assert.equal(after.fullName, before.fullName, 'Rejected profile request still changed the saved full name.');
      assert.equal(after.phone, before.phone, 'Rejected profile request still changed the saved phone.');
    } finally {
      await request('/api/account/me/profile', 'PATCH', { fullName: before.fullName, phone: before.phone });
    }
  });
  await check(role, 'Account', 'Save personal notification, appearance and display preferences', async () => {
    await request('/api/account/preferences/notifications', 'PATCH', { daily_digest: false });
    assert.equal((await request('/api/account/preferences/notifications')).body.data.daily_digest, false);
    await request('/api/account/preferences/appearance', 'PATCH', { theme: 'dark', compact_mode: true });
    assert.equal((await request('/api/account/preferences/appearance')).body.data.compact_mode, true);
    await request('/api/account/preferences/display', 'PATCH', { date_format: 'YYYY-MM-DD', time_format: '24-hour' });
    assert.equal((await request('/api/account/preferences/display')).body.data.timezone, 'Asia/Karachi');
    await request('/api/account/preferences/appearance', 'PATCH', { theme: 'invented' }, 422);
  });
  await check(role, 'Account', 'Wrong current password and weak replacement are rejected', async () => {
    await request('/api/account/change-password', 'POST', { currentPassword: 'WrongPassword!', newPassword: 'Different123!', confirmPassword: 'Different123!' }, 400);
    await request('/api/account/change-password', 'POST', { currentPassword: manager ? 'Rana@123' : 'Rehman@123', newPassword: 'weak', confirmPassword: 'weak' }, 400);
  });
  await check(role, 'Permissions', 'Administration settings and webhooks are blocked', async () => {
    await request('/api/settings', 'GET', undefined, 403);
    await request('/api/settings/webhooks', 'GET', undefined, 403);
  });
  if (manager) {
    await check(role, 'Leads', 'Reassignment moves lead, customer and reminder together', async () => {
      need(customer, 'Customer');
      await request(`/api/leads/${lead.id}/assign`, 'PATCH', { assigned_agent_id: 'usr_004' });
      for (const route of [`/api/leads/${lead.id}`, `/api/customers/${customer.id}`, `/api/follow-ups/${reminder.id}`]) assert.equal((await request(route)).body.data.assigned_agent_id, 'usr_004');
      await request(`/api/leads/${lead.id}/assign`, 'PATCH', { assigned_agent_id: 'usr_003' });
    });
    await runManagement(api, request);
  } else {
    await check(role, 'Permissions', 'All Leads, company customers, reports, users and group creation are blocked', async () => {
      for (const route of ['/api/leads', '/api/customers', '/api/reports', '/api/users']) await request(route, 'GET', undefined, 403);
      await request('/api/chat/groups', 'POST', { groupName: 'Forbidden mock', memberIds: ['usr_004'] }, 403);
      await request('/api/chat/channels/channel_management/messages', 'GET', undefined, 403);
    });
    await check(role, 'Permissions', 'Another agent cannot read or edit this relationship', async () => {
      need(customer, 'Customer');
      const other = client(api, await api.login('saqib@aureum.com', 'Rao@1234'));
      for (const route of [`/api/leads/${lead.id}`, `/api/customers/${customer.id}`, `/api/follow-ups/${reminder.id}`]) {
        await other(route, 'GET', undefined, 403);
        await other(route, 'PATCH', { city: 'Forbidden change', notes: 'Forbidden change' }, 403);
      }
      await request(`/api/leads/${lead.id}/assign`, 'PATCH', { assigned_agent_id: 'usr_004' }, 403);
    });
  }
  await check(role, 'Logout', 'Logout expires the browser cookie', async () => {
    const response = await request('/api/auth/logout', 'POST');
    assert.match(response.response.headers.get('set-cookie') || '', /Max-Age=0/i);
  });
  await check(role, 'Logout', 'The logged-out session token is rejected on replay', async () => {
    await request('/api/auth/me', 'GET', undefined, 401);
  });
}

async function runManagement(api, request) {
  const role = 'Sales Manager';
  await check(role, 'Chat', 'Create, rename, message, change members and archive a group', async () => {
    const group = (await request('/api/chat/groups', 'POST', { groupName: 'Mock QA group', description: 'Disposable QA', memberIds: ['usr_003'] }, 201)).body.data;
    await request(`/api/chat/groups/${group.id}`, 'PATCH', { groupName: 'Mock renamed group' });
    await request(`/api/chat/groups/${group.id}/members`, 'POST', { memberIds: ['usr_004'] });
    const sent = (await request(`/api/chat/groups/${group.id}/messages`, 'POST', { message_text: 'Mock group message.' }, 201)).body.data;
    assert.ok((await request(`/api/chat/groups/${group.id}/messages`)).body.data.some(row => row.id === sent.id));
    await request(`/api/chat/groups/${group.id}/members/usr_004`, 'DELETE');
    await request(`/api/chat/groups/${group.id}/archive`, 'PATCH');
    assert.ok(!(await request('/api/chat/groups')).body.data.some(row => row.id === group.id));
  });
  for (const report of ['summary', 'agents', 'leads', 'customers', 'follow-ups', 'conversion-overview']) {
    await check(role, 'Reports', `Load ${report} report and scoped agent detail`, async () => {
      assert.ok((await request(`/api/reports/${report}`)).body.data !== undefined);
      if (report === 'agents') assert.ok((await request('/api/reports/agents/usr_003')).body.data.agent);
    });
  }
  await check(role, 'Reports', 'Export all five report types as CSV', async () => {
    for (const reportType of ['agent_report', 'lead_report', 'customer_report', 'followup_report', 'conversion_report']) {
      const exported = await request('/api/reports/export', 'POST', { reportType });
      assert.match(exported.response.headers.get('content-type'), /text\/csv/); assert.ok(exported.text.length > 20);
    }
  });
  let newUser;
  await check(role, 'Users', 'List team advisors and prevent creation of an administrator', async () => {
    assert.ok((await request('/api/users')).body.data.every(row => row.role === 'sales_agent' && row.teamId === 'team_a'));
    assert.ok(Array.isArray((await request('/api/users/teams')).body.data));
    await request('/api/users', 'POST', { fullName: 'Forbidden admin', email: 'forbidden@example.test', phone: '+923001231009', role: 'super_admin', teamId: 'team_a', sendAccessEmail: false }, 403);
  });
  await check(role, 'Users', 'Create an advisor without sending external email', async () => {
    newUser = (await request('/api/users', 'POST', { fullName: 'Mock onboarding advisor', email: 'onboarding@example.test', phone: '+923001231010', role: 'sales_agent', teamId: 'team_a', status: 'Active', temporaryPassword: 'MockTemporary123!', sendAccessEmail: false, requirePasswordChangeOnFirstLogin: true }, 201)).body.user;
    assert.equal(newUser.mustChangePassword, true); assert.equal(newUser.role, 'sales_agent');
  });
  await check(role, 'Users', 'Require first password change before allowing workspace access', async () => {
    need(newUser, 'Mock advisor');
    const advisor = client(api, await api.login('onboarding@example.test', 'MockTemporary123!'));
    assert.equal((await advisor('/api/dashboard/summary', 'GET', undefined, 403)).body.code, 'PASSWORD_CHANGE_REQUIRED');
    await advisor('/api/account/change-password', 'POST', { currentPassword: 'MockTemporary123!', newPassword: 'MockPermanent123!', confirmPassword: 'MockPermanent123!' });
    await advisor('/api/dashboard/summary');
  });
  await check(role, 'Users', 'Edit and suspend the mock advisor; suspended login is denied', async () => {
    need(newUser, 'Mock advisor'); const userId = need(newUser.userId || newUser.id, 'User identifier');
    await request(`/api/users/${userId}`, 'PATCH', { fullName: 'Mock updated advisor' });
    await request(`/api/users/${userId}/status`, 'PATCH', { status: 'Suspended' });
    status(await api.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'onboarding@example.test', password: 'MockPermanent123!' }) }), 401);
    assert.ok((await request(`/api/users/${userId}/audit-log`)).body.data.length > 0);
    await request(`/api/users/${userId}/status`, 'PATCH', { status: 'Active' });
  });
}

async function runLocalTasks(api) {
  const manager = client(api, await api.login('dua@aureum.com'));
  const agent = client(api, await api.login('adan@aureum.com'));
  const colleague = client(api, await api.login('saqib@aureum.com', 'Rao@1234'));
  let task;
  await check('Sales Manager', 'Tasks', 'Local task assignment validates fields and creates a dated assignment', async () => {
    await manager('/api/tasks', 'POST', { title: '' }, 422);
    await manager('/api/tasks', 'POST', { title: 'Bad date', due_at: 'invalid' }, 422);
    task = (await manager('/api/tasks', 'POST', { title: 'Local mock assignment', assigned_to: 'usr_003', due_at: '2099-10-24T14:35', priority: 'High' }, 201)).body.data;
    assert.equal(task.assignedTo, 'usr_003'); assert.equal(task.dueAt, '2099-10-24T09:35:00.000Z');
  });
  await check('Sales Agent', 'Tasks', 'Local assignee can complete and reopen; colleagues and restricted actions are denied', async () => {
    need(task, 'Local task');
    assert.ok((await agent('/api/tasks')).body.data.some(row => row.id === task.id));
    await colleague(`/api/tasks/${task.id}`, 'GET', undefined, 404);
    await agent('/api/tasks', 'POST', { title: 'Forbidden' }, 403);
    await agent(`/api/tasks/${task.id}`, 'PATCH', { assigned_to: 'usr_004' }, 422);
    const done = (await agent(`/api/tasks/${task.id}`, 'PATCH', { status: 'Completed' })).body.data;
    assert.equal(done.status, 'Completed'); assert.ok(done.completedAt);
    assert.equal((await agent(`/api/tasks/${task.id}`, 'PATCH', { status: 'Pending' })).body.data.completedAt, null);
  });
  await check('Sales Manager', 'Tasks', 'Local task can be reassigned, filtered and deleted with ownership updated', async () => {
    need(task, 'Local task');
    await manager(`/api/tasks/${task.id}`, 'PATCH', { assigned_to: 'usr_004' });
    await agent(`/api/tasks/${task.id}`, 'GET', undefined, 404);
    assert.equal((await manager('/api/tasks?assignedTo=usr_004&q=Local%20mock')).body.data.length, 1);
    await manager(`/api/tasks/${task.id}`, 'DELETE');
    await colleague(`/api/tasks/${task.id}`, 'GET', undefined, 404);
  });
}

const limits = [
  'Disposable in-memory HTTP fixtures and a separate PGlite database; no production customer records are changed.',
  'PGlite checks execute the actual relational API and SQL repository for tasks and lead imports. They do not verify hosted Neon connectivity or deployment configuration.',
  'Local task flows use the same HTTP validation and permissions as the relational API. Lead import browser flows still require a database-backed development server; their relational API/SQL checks run separately.',
  'Email delivery, real telephone/WhatsApp calls, external integrations, load, accessibility and a full mobile/browser matrix are not certified by this run.',
  'Browser journeys are recorded separately in the dated browser QA report. API success does not prove that the corresponding button works.'
];
function escape(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
async function report() {
  const summary = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(state => [state.toLowerCase(), results.filter(row => row.status === state).length]));
  const data = { startedAt, finishedAt: new Date().toISOString(), environment: 'Isolated mock fixtures + PGlite', summary, limits, results };
  const folder = path.join(ROOT, 'output'); await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'mock-system-test-results.json'), JSON.stringify(data, null, 2));
  const lines = ['# Sales Manager and Sales Agent mock system test', '', `Run: ${startedAt}`, '', `**${summary.pass} passed · ${summary.fail} failed · ${summary.blocked} blocked**`, '', '## Scope and limits', '', ...limits.map(line => `- ${line}`), '', '## Results', '', '| Result | Portal | Module | Check | Evidence |', '|---|---|---|---|---|', ...results.map(row => `| ${row.status} | ${row.role} | ${row.module} | ${row.name} | ${row.evidence.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')} |`)];
  await fs.writeFile(path.join(folder, 'mock-system-test-report.md'), lines.join('\n'));
  const rows = results.map(row => `<tr data-role="${escape(row.role)}" data-status="${row.status}"><td><strong class="${row.status}">${row.status}</strong></td><td>${escape(row.role)}</td><td>${escape(row.module)}<small>${escape(row.layer)}</small></td><td>${escape(row.name)}</td><td><pre>${escape(row.evidence)}</pre></td></tr>`).join('');
  await fs.writeFile(path.join(folder, 'mock-system-test-report.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aureum mock system test</title><style>body{font:16px system-ui;margin:0;background:#10151b;color:#edf1f5}main{max-width:1250px;margin:auto;padding:32px}h1{font-size:30px}.summary{font-size:22px;color:#e8c66f}small{display:block;color:#9daeba;margin-top:5px}select,input{padding:10px;background:#1e2935;color:white;border:1px solid #526174;border-radius:6px;margin:4px}input{min-width:240px}table{border-collapse:collapse;width:100%;margin-top:20px;text-align:left}th,td{border-bottom:1px solid #344150;padding:13px;vertical-align:top}th{background:#1e2935}pre{white-space:pre-wrap;font:13px system-ui;margin:0;max-width:400px}.PASS{color:#80deb4}.FAIL{color:#ff9797}.BLOCKED{color:#ffd47d}details{margin:20px 0}li{margin:8px 0}[hidden]{display:none}@media(max-width:700px){main{padding:14px}.table{overflow:auto}td,th{min-width:120px}}</style><main><h1>Aureum CRM · Mock system test</h1><p class="summary">${summary.pass} passed · ${summary.fail} failed · ${summary.blocked} blocked</p><p>Sales Manager and Sales Agent · ${escape(startedAt)}<br><small>Local test data. A passing mock test is not a production certification.</small></p><details><summary>What this test covers and its limits</summary><ul>${limits.map(line => `<li>${escape(line)}</li>`).join('')}</ul></details><label>Portal <select id="role"><option value="">All portals</option><option>Sales Manager</option><option>Sales Agent</option><option>Shared</option></select></label><label>Result <select id="status"><option value="">All results</option><option>FAIL</option><option>PASS</option><option>BLOCKED</option></select></label><label>Search <input id="query" placeholder="Search modules or checks"></label><p id="count"></p><div class="table"><table><thead><tr><th>Result</th><th>Portal</th><th>Module</th><th>Check</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div></main><script>const role=document.querySelector('#role'),status=document.querySelector('#status'),query=document.querySelector('#query');function filter(){let count=0;for(const row of document.querySelectorAll('tbody tr')){row.hidden=!!((role.value&&row.dataset.role!==role.value)||(status.value&&row.dataset.status!==status.value)||!row.textContent.toLowerCase().includes(query.value.toLowerCase()));if(!row.hidden)count++;}document.querySelector('#count').textContent=count+' checks shown';}for(const field of [role,status,query])field.addEventListener('input',filter);filter();</script></html>`);
  console.log(`\n${summary.pass} passed, ${summary.fail} failed, ${summary.blocked} blocked.\nReport: ${path.join(folder, 'mock-system-test-report.html')}`);
  if (summary.fail || summary.blocked) process.exitCode = 1;
}

async function main() {
  const api = await startApiServer({ after: callback => cleanup.push(callback) });
  await check('Shared', 'Security', 'Unauthenticated requests and cross-origin writes are rejected', async () => {
    status(await api.request('/api/leads/my'), 401);
    status(await api.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://untrusted.example.test' }, body: JSON.stringify({ identifier: 'adan@aureum.com', password: 'Rehman@123' }) }), 403);
    status(await api.request('/backend/crm-api-server.js'), 404);
  });
  await runPortal(api, 'Sales Manager', 'dua@aureum.com', 'usr_002', 'Manager');
  await runPortal(api, 'Sales Agent', 'adan@aureum.com', 'usr_003', 'Agent');
  await runLocalTasks(api);
  await runRelationalChecks({ check, need });
}
main().catch(error => { results.push({ role: 'Shared', module: 'Harness', name: 'Complete the mock run', layer: 'Test setup', status: 'FAIL', evidence: error.message }); process.exitCode = 1; }).finally(async () => {
  for (const dispose of cleanup.reverse()) await dispose();
  await report();
});
