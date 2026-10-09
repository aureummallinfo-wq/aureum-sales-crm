const test = require('node:test'); const assert = require('node:assert/strict');
test('conversion rate calculation is deterministic', () => { const conversion = (won, total) => total ? Number(((won / total) * 100).toFixed(1)) : 0; assert.equal(conversion(12, 48), 25); assert.equal(conversion(0, 0), 0); });
