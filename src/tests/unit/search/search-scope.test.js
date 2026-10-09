const test = require('node:test'); const assert = require('node:assert/strict'); const { canViewOwnedRecord, users, records } = require('../../helpers/security-fixtures');
test('search scope follows the same ownership rules as detail routes', () => { assert.equal(canViewOwnedRecord(users.agentA, records.teamB), false); });
