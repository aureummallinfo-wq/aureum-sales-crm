const test = require('node:test'); const assert = require('node:assert/strict');
test('follow-up completion rate remains bounded', () => { const rate = (done, total) => total ? Math.round((done / total) * 1000) / 10 : 0; assert.equal(rate(3, 4), 75); assert.equal(rate(0, 0), 0); assert.ok(rate(4, 4) <= 100); });
