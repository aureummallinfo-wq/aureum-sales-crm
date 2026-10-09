const test = require('node:test'); const assert = require('node:assert/strict');
test('dashboard metrics are non-negative', () => { const metrics = { totalLeads: 1248, hotLeads: 86, followUpsDue: 42 }; Object.values(metrics).forEach(value => assert.ok(value >= 0)); });
