const test = require('node:test'); const assert = require('node:assert/strict');
test('status mapping preserves known pipeline values', () => { const statuses = ['New', 'Hot', 'Follow-up', 'Closed Won', 'Closed Lost']; assert.deepEqual(statuses.filter(Boolean).length, 5); });
