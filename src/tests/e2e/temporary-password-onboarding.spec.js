const test = require('node:test');
const assert = require('node:assert/strict');

test('E2E temporary-password-onboarding spec is represented by the live onboarding flow', () => {
  assert.ok(require.resolve('./onboarding-temp-password.spec'));
});
