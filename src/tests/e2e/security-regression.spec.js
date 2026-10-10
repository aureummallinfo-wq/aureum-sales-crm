const test = require('node:test');
const assert = require('node:assert/strict');
const { startApiServer } = require('../helpers/api-test-server');

test('E2E security regression blocks CSRF, static source exposure, and unsafe error leakage', async t => {
  const api = await startApiServer(t);
  const agent = await api.login('advisor@aureum.com');

  const csrf = await api.request('/api/account/me', {
    method: 'PATCH',
    headers: {
      cookie: agent,
      origin: 'https://evil.example',
      host: new URL(api.base).host,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ fullName: 'Cross Site Attempt' })
  });
  assert.equal(csrf.response.status, 403);
  assert.match(csrf.body.error, /origin/i);

  const source = await api.request('/backend/security-utils.js');
  assert.equal(source.response.status, 404);

  const invalidLogin = await api.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'missing@example.com', password: 'WrongPassword1!' })
  });
  assert.equal(invalidLogin.response.status, 401);
  assert.equal(invalidLogin.body.error, 'Invalid email/phone or password');
});
