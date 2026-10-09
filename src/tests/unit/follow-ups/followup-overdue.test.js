const test = require('node:test'); const assert = require('node:assert/strict'); const { validateIsoDate } = require('../../helpers/security-fixtures');
test('follow-up date validation rejects malformed dates', () => { assert.equal(validateIsoDate('2026-10-09'), true); assert.equal(validateIsoDate('09/10/2026'), false); assert.equal(validateIsoDate('2026-99-99'), false); });
