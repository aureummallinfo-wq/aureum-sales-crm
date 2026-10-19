const test = require('node:test');
const assert = require('node:assert/strict');
const { startApiServer } = require('../helpers/api-test-server');

function client(api, cookie) {
  return async (route, method = 'GET', body, expected = 200) => {
    const result = await api.request(route, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(result.response.status, expected, result.text);
    return result.body;
  };
}

test('rejected profile edits are atomic through both account endpoints and both portals', async t => {
  const api = await startApiServer(t);
  for (const email of ['dua@aureum.com', 'adan@aureum.com']) {
    const request = client(api, await api.login(email));
    const before = (await request('/api/account/me/profile')).user;
    for (const route of ['/api/account/me/profile', '/api/account/me']) {
      for (const invalid of [{ fullName: '', phone: 'invalid' }, { fullName: 'Do not partially save', phone: 'invalid' }]) {
        await request(route, 'PATCH', invalid, 422);
        const after = (await request('/api/account/me/profile')).user;
        assert.equal(after.fullName, before.fullName); assert.equal(after.phone, before.phone);
      }
      const valid = (await request(route, 'PATCH', { fullName: 'Valid mock name', phone: '+923001239999', role: 'super_admin' })).user;
      assert.equal(valid.fullName, 'Valid mock name'); assert.equal(valid.role, before.role);
      await request(route, 'PATCH', { fullName: before.fullName, phone: before.phone });
    }
  }
});

test('logout revokes only the current local token and a new sign-in still works', async t => {
  const api = await startApiServer(t);
  for (const email of ['dua@aureum.com', 'adan@aureum.com']) {
    const first = client(api, await api.login(email));
    const second = client(api, await api.login(email));
    await first('/api/auth/logout', 'POST');
    await first('/api/auth/me', 'GET', undefined, 401);
    await first('/api/leads/my', 'GET', undefined, 401);
    await second('/api/auth/me');
    await client(api, await api.login(email))('/api/auth/me');
  }
});

test('local Tasks supports manager assignment, agent completion, reassignment and deletion', async t => {
  const api = await startApiServer(t);
  const manager = client(api, await api.login('dua@aureum.com'));
  const agent = client(api, await api.login('adan@aureum.com'));
  const other = client(api, await api.login('saqib@aureum.com', 'Rao@1234'));
  const task = (await manager('/api/tasks', 'POST', { title: 'Mock task regression', assigned_to: 'usr_003', priority: 'High', due_at: '2099-10-24T14:35' }, 201)).data;
  assert.equal(task.assignedTo, 'usr_003'); assert.equal(task.dueAt, '2099-10-24T09:35:00.000Z');
  assert.ok((await agent('/api/tasks')).data.some(row => row.id === task.id));
  assert.ok((await agent('/api/notifications')).data.some(row => row.related_entity_id === task.id));
  await other(`/api/tasks/${task.id}`, 'GET', undefined, 404);
  await agent('/api/tasks', 'POST', { title: 'Forbidden' }, 403);
  await agent(`/api/tasks/${task.id}`, 'PATCH', { assigned_to: 'usr_004' }, 422);
  const done = (await agent(`/api/tasks/${task.id}`, 'PATCH', { status: 'Completed' })).data;
  assert.equal(done.status, 'Completed'); assert.ok(done.completedAt);
  assert.equal((await agent(`/api/tasks/${task.id}`, 'PATCH', { status: 'Pending' })).data.completedAt, null);
  await manager(`/api/tasks/${task.id}`, 'PATCH', { assigned_to: 'usr_004' });
  await agent(`/api/tasks/${task.id}`, 'GET', undefined, 404);
  assert.equal((await other(`/api/tasks/${task.id}`)).data.assignedTo, 'usr_004');
  await manager(`/api/tasks/${task.id}`, 'DELETE');
  await other(`/api/tasks/${task.id}`, 'GET', undefined, 404);
  await manager('/api/tasks', 'POST', { title: '' }, 422);
  await manager('/api/tasks', 'POST', { title: 'Invalid date', due_at: 'invalid' }, 422);
  await manager('/api/tasks', 'POST', { title: 'Invalid owner', assigned_to: 'usr_001' }, 422);
  await manager('/api/tasks', 'PUT', {}, 405);
});
