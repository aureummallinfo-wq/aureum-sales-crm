const test = require('node:test'); const assert = require('node:assert/strict'); const { canAccessRoute } = require('../../helpers/security-fixtures');
test('only the three canonical roles receive permissions', () => { for (const role of ['admin', 'staff', 'owner', 'developer', '', undefined]) assert.equal(canAccessRoute(role, 'dashboard'), false); });
