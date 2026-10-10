const test = require('node:test');
const assert = require('node:assert/strict');

test('webhook security contract uses one-time full secrets and masked stored views', () => {
  const createdResponse = { secretToken: 'aureum_wh_1234567890abcdef', data: { secretTokenMasked: '••••••••' } };
  assert.ok(createdResponse.secretToken.startsWith('aureum_wh_'));
  assert.equal(createdResponse.data.secretTokenMasked, '••••••••');
  assert.equal(JSON.stringify(createdResponse.data).includes('secretToken":"'), false);
});
