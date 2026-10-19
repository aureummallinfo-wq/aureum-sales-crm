const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { PGlite } = require('@electric-sql/pglite');
const { createNeonRateStore, hashKey } = require('../../../backend/request-protection');
const { startApiServer } = require('../helpers/api-test-server');

test('independent server instances share atomic request budgets and expire them in PostgreSQL', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE SCHEMA crm');
  await db.exec(fs.readFileSync(path.resolve(__dirname, '../../../db/migrations/010_request_rate_limits.sql'), 'utf8'));
  // Migration can be applied again without removing counters.
  const sql = { query: async (query, params) => (await db.query(query, params)).rows };
  const first = createNeonRateStore(sql);
  const second = createNeonRateStore(sql);
  const key = hashKey(['workspace-a', 'read', 'agent']);
  const decisions = await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? first : second).consume(key, 5)));
  assert.equal(decisions.filter(item => item.allowed).length, 5, 'concurrent instances must not each get a separate budget');
  decisions.filter(item => !item.allowed).forEach(item => assert.ok(item.retryAfter > 0 && item.retryAfter <= 60));
  assert.equal((await first.consume(hashKey(['workspace-b', 'read', 'agent']), 5)).allowed, true);
  assert.equal((await first.consume(hashKey(['workspace-a', 'write', 'agent']), 5)).allowed, true);
  await sql.query("UPDATE crm.request_rate_limits SET window_ends = now() - interval '1 second' WHERE key_hash = $1", [key]);
  assert.equal((await second.consume(key, 5)).allowed, true, 'expired budgets must reset');
  await db.exec(fs.readFileSync(path.resolve(__dirname, '../../../db/migrations/010_request_rate_limits.sql'), 'utf8'));
  assert.equal((await sql.query('SELECT request_count FROM crm.request_rate_limits WHERE key_hash = $1', [key]))[0].request_count, 1);
});

test('login throttling returns 429 while pages and existing sessions stay available', async t => {
  const api = await startApiServer(t, { env: { AUREUM_RATE_LOGIN_PER_MINUTE: '2' } });
  const cookie = await api.login('waqas@aureum.com');
  await api.login('adan@aureum.com');
  const blocked = await api.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'not-an-account', password: 'wrong' }) });
  assert.equal(blocked.response.status, 429);
  assert.equal(blocked.body.code, 'RATE_LIMITED');
  assert.ok(Number(blocked.response.headers.get('retry-after')) > 0);
  assert.ok(blocked.response.headers.get('x-request-id'));
  assert.equal((await api.request('/api/auth/me', { headers: { cookie } })).response.status, 200);
  assert.equal((await api.request('/follow-ups')).response.status, 200);
});

test('one user exhausting a read budget cannot block another user or writes', async t => {
  const api = await startApiServer(t, { env: { AUREUM_RATE_READ_PER_MINUTE: '2', AUREUM_RATE_WRITE_PER_MINUTE: '1' } });
  const first = await api.login('waqas@aureum.com');
  const second = await api.login('adan@aureum.com');
  const read = cookie => api.request('/api/auth/me', { headers: { cookie } });
  assert.equal((await read(first)).response.status, 200);
  assert.equal((await read(first)).response.status, 200);
  assert.equal((await read(first)).response.status, 429);
  assert.equal((await read(second)).response.status, 200);
  const write = () => api.request('/api/presence/heartbeat', { method: 'POST', headers: { cookie: first, 'content-type': 'application/json' }, body: '{}' });
  assert.equal((await write()).response.status, 200);
  assert.equal((await write()).response.status, 429);
  assert.equal((await read(second)).response.status, 200);
});

test('webhook budgets and bounded request bodies reject excess work before processing it', async t => {
  const api = await startApiServer(t, { env: { AUREUM_RATE_WEBHOOK_PER_MINUTE: '1' } });
  const webhook = () => api.request('/api/webhooks/leads/nonexistent', { method: 'POST', body: '{}' });
  assert.equal((await webhook()).response.status, 404);
  assert.equal((await webhook()).response.status, 429);
  const oversized = await api.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'x'.repeat(100001) }) });
  assert.equal(oversized.response.status, 413);
  const malformed = await api.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(malformed.response.status, 400);
  assert.equal((await api.request('/api/health/live')).response.status, 200);
});

test('saturated and slow requests release capacity while pages and liveness remain available', async t => {
  const api = await startApiServer(t, { env: { AUREUM_MAX_ACTIVE_REQUESTS: '1', AUREUM_API_DEADLINE_MS: '1000' } });
  let slow;
  const ended = new Promise((resolve, reject) => {
    slow = http.request(`${api.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '100' } }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    slow.on('error', reject);
    slow.flushHeaders();
  });
  t.after(() => slow.destroy());
  let busy;
  for (let attempt = 0; attempt < 20; attempt++) {
    busy = await api.request('/api/auth/me');
    if (busy.response.status === 503) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(busy.body.code, 'SERVER_BUSY');
  assert.equal((await api.request('/api/health/live')).response.status, 200);
  assert.equal((await api.request('/customers')).response.status, 200);
  assert.equal(await ended, 408);
  assert.equal((await api.request('/api/auth/me')).response.status, 401);
});
