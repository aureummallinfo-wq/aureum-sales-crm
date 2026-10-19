const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../../../frontend/runtime-config.js'), 'utf8');

test('each deployment sends API requests to its own origin by default', () => {
  for (const hostname of ['localhost', '127.0.0.1', 'aureum-sales-crm.vercel.app', 'aureum-sales-preview-team.vercel.app', 'crm.example.test']) {
    const window = { location: { hostname } };
    vm.runInNewContext(source, { window });
    const endpoint = new URL(`${window.__AUREUM_API_BASE_URL__}/api/auth/me`, `https://${hostname}`);
    assert.equal(endpoint.hostname, hostname);
    assert.equal(endpoint.pathname, '/api/auth/me');
  }
});

test('a separate frontend retains its explicitly configured API destination', () => {
  const window = { location: { hostname: 'frontend.example.test' }, __AUREUM_API_BASE_URL__: 'https://api.example.test' };
  vm.runInNewContext(source, { window });
  assert.equal(window.__AUREUM_API_BASE_URL__, 'https://api.example.test');
});
