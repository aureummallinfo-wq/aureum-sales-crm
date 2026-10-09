const test = require('node:test'); const assert = require('node:assert/strict'); const { canViewOwnedRecord, users, records } = require('../../helpers/security-fixtures');
test('lead ownership rules prevent agent IDOR', () => { assert.equal(canViewOwnedRecord(users.agentA, records.teamB), false); assert.equal(canViewOwnedRecord(users.managerA, records.teamA), true); });
