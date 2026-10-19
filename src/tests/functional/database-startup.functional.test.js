const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { Writable } = require('node:stream');
const { EventEmitter } = require('node:events');

const filename = path.resolve(__dirname, '../../../backend/crm-api-server.js');
const requireServer = createRequire(filename);

function server({ fail = true, workspace = 'workspace-test', invalidConnection = false, missingBudgets = false, failSession = false } = {}) {
  let now = Date.now();
  let queries = 0;
  let initializations = 0;
  let failing = fail;
  const logs = [];
  class Clock extends Date { static now() { return now; } }
  const query = async statement => {
    queries++;
    if (failing) throw new Error('Simulated database outage');
    if (String(statement).includes('INSERT INTO crm.request_rate_limits')) {
      if (missingBudgets) { const error = new Error('Migration not applied'); error.code = '42P01'; throw error; }
      return [{ request_count: 1, retry_after: 60 }];
    }
    return [];
  };
  const sql = Object.assign(query, { query });
  const module = { exports: {} };
  const context = vm.createContext({
    module, __dirname: path.dirname(filename), Buffer, URLSearchParams, Date: Clock, AbortSignal, setTimeout, clearTimeout,
    process: { env: { NODE_ENV: 'test', DATABASE_URL: 'postgresql://test.invalid/crm' } },
    console: { log() {}, error: (...args) => logs.push(args) },
    require(name) {
      if (name === '@neondatabase/serverless') return { neon: () => { if (invalidConnection) throw new Error('Invalid URL postgresql://user:secret@invalid/crm'); return sql; } };
      if (name === './db/neon-repository') return { createNeonRepository: () => ({
        workspaceId: async () => { initializations++; return workspace; },
        findSession: async () => { if (failSession) { failSession = false; const error = new Error('Database timeout'); error.code = 'DATABASE_TIMEOUT'; throw error; } return null; },
        ingestWebhookLead: async () => { const error = new Error('Database timeout'); error.code = 'DATABASE_TIMEOUT'; throw error; }
      }) };
      return requireServer(name);
    }
  });
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  function request(url, method = 'GET', headers = {}) {
    return new Promise((resolve, reject) => {
      let body = '';
      const responseHeaders = {};
      const res = new Writable({ write(chunk, encoding, done) { body += chunk.toString(); done(); } });
      res.setHeader = (name, value) => { responseHeaders[name.toLowerCase()] = String(value); };
      res.writeHead = (status, values = {}) => {
        res.statusCode = status;
        res.headersSent = true;
        Object.entries(values).forEach(([name, value]) => res.setHeader(name, value));
        return res;
      };
      res.on('error', reject);
      res.on('finish', () => resolve({ status: res.statusCode, headers: responseHeaders, body }));
      const req = Object.assign(new EventEmitter(), { url, method, headers: { host: 'localhost', ...headers }, socket: {} });
      Promise.resolve(module.exports.requestHandler(req, res)).catch(reject);
      if (method === 'POST') setImmediate(() => { req.emit('data', Buffer.from('{}')); req.emit('end'); });
    });
  }
  return { request, logs, recover() { failing = false; now += 6000; }, stats: () => ({ queries, initializations }) };
}

test('database startup failure cannot replace a page or its scripts with JSON', async () => {
  const api = server();
  const page = await api.request('/follow-ups');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.body, /Aureum Sales CRM/);
  const script = await api.request('/app-shell.js');
  assert.equal(script.status, 200);
  assert.match(script.headers['content-type'], /javascript/);
  assert.match(script.body, /function apiFetch/);
  assert.equal((await api.request('/api/auth/me')).status, 503);
  assert.equal((await api.request('/api/auth/login', 'POST')).status, 503);
  assert.equal(api.stats().queries, 1, 'failed writes must not queue a legacy snapshot sync');
  assert.equal((await api.request('/login')).status, 200);
});

test('failed initialization backs off, shares concurrent attempts and recovers in the same instance', async () => {
  const api = server();
  const failed = await Promise.all([api.request('/api/auth/me'), api.request('/api/follow-ups/my')]);
  for (const response of failed) {
    assert.equal(response.status, 503);
    assert.equal(JSON.parse(response.body).code, 'DATABASE_UNAVAILABLE');
    assert.equal(response.headers['retry-after'], '5');
    assert.doesNotMatch(response.body, /Simulated|postgresql|workspace-test/);
  }
  assert.equal(api.stats().queries, 1);
  assert.equal((await api.request('/api/auth/me')).status, 503);
  assert.equal(api.stats().queries, 1, 'cooldown must not hammer the database');
  api.recover();
  const recovered = await Promise.all([api.request('/api/auth/me'), api.request('/api/auth/me')]);
  recovered.forEach(response => assert.equal(response.status, 401, 'database recovers but authentication stays required'));
  assert.ok(api.stats().queries >= 5, 'retry schema steps and check shared request budgets');
  assert.equal(api.stats().initializations, 1, 'concurrent requests share initialization');
  const queriesBeforeRead = api.stats().queries;
  assert.equal((await api.request('/api/auth/me')).status, 401);
  assert.equal(api.stats().queries, queriesBeforeRead + 1, 'reuse initialization while checking the shared request budget');
});

test('a missing production workspace fails closed while the app shell remains available', async () => {
  const api = server({ fail: false, workspace: null });
  assert.equal((await api.request('/api/auth/me')).status, 503);
  assert.equal((await api.request('/api/follow-ups/my')).status, 503);
  assert.equal((await api.request('/follow-ups')).status, 200);
});

test('invalid connection configuration keeps pages and liveness available without exposing credentials', async () => {
  const api = server({ invalidConnection: true });
  assert.equal((await api.request('/follow-ups')).status, 200);
  assert.equal((await api.request('/api/health/live')).status, 200);
  const failed = await api.request('/api/auth/me');
  assert.equal(failed.status, 503);
  assert.doesNotMatch(failed.body, /secret|postgresql/);
  assert.doesNotMatch(JSON.stringify(api.logs), /user:secret/);
});

test('a missing shared budget migration blocks API work safely while pages still load', async () => {
  const api = server({ fail: false, missingBudgets: true });
  const failed = await api.request('/api/auth/me');
  assert.equal(failed.status, 503);
  assert.equal(JSON.parse(failed.body).code, 'REQUEST_PROTECTION_UNAVAILABLE');
  assert.equal((await api.request('/follow-ups')).status, 200);
});

test('a database timeout after successful startup returns a recoverable error without poisoning the instance', async () => {
  const api = server({ fail: false, failSession: true });
  const failed = await api.request('/api/auth/me', 'GET', { cookie: 'aureum_session=test-token' });
  assert.equal(failed.status, 503);
  assert.equal(JSON.parse(failed.body).code, 'DATABASE_UNAVAILABLE');
  assert.ok(failed.headers['x-request-id']);
  assert.equal((await api.request('/api/auth/me', 'GET', { cookie: 'aureum_session=test-token' })).status, 401);
});

test('webhook database failures are retryable service errors rather than invalid-payload responses', async () => {
  const api = server({ fail: false });
  const failed = await api.request('/api/webhooks/leads/test', 'POST');
  assert.equal(failed.status, 503);
  assert.equal(JSON.parse(failed.body).code, 'SAVE_UNCONFIRMED');
  assert.doesNotMatch(failed.body, /payload is invalid/);
});
