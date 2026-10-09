const test = require('node:test'); const assert = require('node:assert/strict'); const { canViewOwnedRecord, users, records } = require('../../helpers/security-fixtures');
test('customer ownership rules are role scoped', () => { assert.equal(canViewOwnedRecord(users.superAdmin, records.teamB), true); assert.equal(canViewOwnedRecord(users.agentA, records.teamB), false); });
