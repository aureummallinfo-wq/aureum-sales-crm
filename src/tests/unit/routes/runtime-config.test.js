const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../../../frontend/runtime-config.js'), 'utf8');

test('Vercel production hosts use the VPS API while previews stay same-origin', () => {
  const expectedHosts = new Map([
    ['localhost', 'localhost'],
    ['127.0.0.1', '127.0.0.1'],
    ['aureum-sales-crm.vercel.app', 'crm.aureummall.info'],
    ['aureum-sales-crm-frontend.vercel.app', 'crm.aureummall.info'],
    ['aureum-sales-preview-team.vercel.app', 'aureum-sales-preview-team.vercel.app'],
    ['crm.example.test', 'crm.example.test']
  ]);
  for (const [hostname, expectedHost] of expectedHosts) {
    const window = { location: { hostname } };
    vm.runInNewContext(source, { window });
    const endpoint = new URL(`${window.__AUREUM_API_BASE_URL__}/api/auth/me`, `https://${hostname}`);
    assert.equal(endpoint.hostname, expectedHost);
    assert.equal(endpoint.pathname, '/api/auth/me');
  }
});

test('a separate frontend retains its explicitly configured API destination', () => {
  const window = { location: { hostname: 'frontend.example.test' }, __AUREUM_API_BASE_URL__: 'https://api.example.test' };
  vm.runInNewContext(source, { window });
  assert.equal(window.__AUREUM_API_BASE_URL__, 'https://api.example.test');
});
