const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabaseFetch, databaseContext, isDatabaseUnavailable, createMemoryRateStore, clientAddress, ratePolicy } = require('../../../../backend/request-protection');

test('database calls abort at their own deadline without replaying writes', async () => {
  let calls = 0;
  const fetch = createDatabaseFetch((url, options) => {
    calls++;
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  }, 15);
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(fetch('https://database.invalid', { method: 'POST' }), error => error.code === 'DATABASE_TIMEOUT');
    assert.equal(calls, 1);
  } finally { clearTimeout(keepAlive); }
});

test('concurrent requests have independent deadlines and an aborted caller stays aborted', async () => {
  const aborted = new AbortController();
  aborted.abort();
  const fetch = createDatabaseFetch(async (url, options) => { options.signal.throwIfAborted(); return { ok: true }; }, 1000);
  const [failed, healthy] = await Promise.allSettled([
    databaseContext.run({ signal: aborted.signal }, () => fetch('https://database.invalid')),
    databaseContext.run({ signal: new AbortController().signal }, () => fetch('https://database.invalid'))
  ]);
  assert.equal(failed.status, 'rejected');
  assert.equal(failed.reason.code, 'DATABASE_TIMEOUT');
  assert.equal(healthy.status, 'fulfilled');
  assert.equal(isDatabaseUnavailable({ sourceError: failed.reason }), true, 'recognize Neon-wrapped transport failures');
  assert.equal(isDatabaseUnavailable({ code: '23505' }), false, 'constraint failures are not transient connectivity failures');
});

test('bounded local budgets expire and cannot grow without limit', async () => {
  let now = 0;
  const store = createMemoryRateStore({ now: () => now, maximumKeys: 2 });
  assert.equal((await store.consume('a', 1)).allowed, true);
  assert.equal((await store.consume('a', 1)).allowed, false);
  assert.equal((await store.consume('b', 1)).allowed, true);
  assert.equal((await store.consume('c', 1)).allowed, false);
  now = 61000;
  assert.equal((await store.consume('c', 1)).allowed, true);
});

test('IP identity ignores untrusted forwarding headers and policies separate expensive work', () => {
  const request = { method: 'POST', socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } };
  assert.equal(clientAddress(request), '127.0.0.1');
  assert.equal(clientAddress(request, true), '203.0.113.7');
  assert.equal(ratePolicy(request, '/api/auth/login', null).name, 'login');
  assert.equal(ratePolicy(request, '/api/leads/import', { id: 'user' }).name, 'bulk');
  assert.equal(ratePolicy({ method: 'GET' }, '/api/reports/export', { id: 'user' }).name, 'bulk');
  assert.equal(ratePolicy(request, '/api/leads', { id: 'user' }).name, 'write');
});

test('the installed Neon driver preserves deadline errors and its lazy query interface', async t => {
  const { neon, neonConfig } = require('@neondatabase/serverless');
  const original = neonConfig.fetchFunction;
  t.after(() => { neonConfig.fetchFunction = original; });
  let calls = 0;
  neonConfig.fetchFunction = createDatabaseFetch((url, options) => {
    calls++;
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  }, 15);
  const sql = neon('postgresql://test:test@ep-protection-test.neon.tech/test');
  const query = sql.query('SELECT 1');
  assert.equal(calls, 0, 'creating a query must not eagerly send it');
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(query, error => isDatabaseUnavailable(error));
    assert.equal(calls, 1, 'a timed-out query must not be replayed');
  } finally { clearTimeout(keepAlive); }
});
