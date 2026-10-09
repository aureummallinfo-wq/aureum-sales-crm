const test = require('node:test'); const assert = require('node:assert/strict'); const { validateIsoDate } = require('../../helpers/security-fixtures');
test('report date boundaries use ISO dates only', () => { assert.equal(validateIsoDate('2026-01-01'), true); assert.equal(validateIsoDate('2026/01/01'), false); });
