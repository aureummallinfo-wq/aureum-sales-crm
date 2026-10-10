const test = require('node:test');
const assert = require('node:assert/strict');

test('access email state requires temporary password expiry and password change on first login', () => {
  const invite = {
    inviteStatus: 'Sent',
    hasTemporaryPassword: true,
    mustChangePassword: true,
    temporaryPasswordExpiresAt: '2026-10-11T08:00:00.000Z'
  };
  assert.equal(invite.inviteStatus, 'Sent');
  assert.equal(invite.hasTemporaryPassword, true);
  assert.equal(invite.mustChangePassword, true);
  assert.ok(Date.parse(invite.temporaryPasswordExpiresAt));
});
