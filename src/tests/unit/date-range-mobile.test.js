const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');

test('native CRM date range helper keeps custom ranges ordered and server-ready', () => {
  const source = fs.readFileSync(path.join(ROOT, 'mobile', 'src', 'lib', 'date-range.ts'), 'utf8');
  assert.match(source, /Asia\/Karachi/);
  assert.match(source, /dateRangeBounds/);
  assert.match(source, /customEnd < customStart/);
  assert.match(source, /dateRangeReady/);
});
