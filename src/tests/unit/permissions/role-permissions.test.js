const test = require('node:test'); const assert = require('node:assert/strict'); const { canAccessRoute } = require('../../helpers/security-fixtures');
test('unknown roles receive no permissions', () => { for (const role of ['admin', 'staff', 'owner', 'developer', '', undefined]) assert.equal(canAccessRoute(role, 'dashboard'), false); });
