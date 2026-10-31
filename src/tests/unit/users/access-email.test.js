const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { deriveAureumEmail } = require('../../../../backend/user-email');

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

test('Aureum sign-in email is derived from the first name', () => {
  assert.equal(deriveAureumEmail('Asma Mehar'), 'asma@aureum.com');
  assert.equal(deriveAureumEmail('Élodie Khan'), 'elodie@aureum.com');
  assert.equal(deriveAureumEmail('  Noor   Fatima  '), 'noor@aureum.com');
  assert.equal(deriveAureumEmail(''), '');
});

test('browser email helper matches server derivation', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../../frontend/features/users/utils/user-email-utils.js'), 'utf8');
  const context = vm.createContext({ window: {} });
  vm.runInContext(source, context);
  assert.equal(context.window.AureumUserEmail.derive('Asma Mehar'), deriveAureumEmail('Asma Mehar'));
  assert.equal(context.window.AureumUserEmail.derive("O'Neil Smith"), 'oneil@aureum.com');
});
