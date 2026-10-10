const test = require('node:test');
const assert = require('node:assert/strict');
const { canViewOwnedRecord, users } = require('../../helpers/security-fixtures');

test('object ownership checks deny cross-agent and cross-team IDOR attempts', () => {
  const ownLead = { assigned_agent_id: 'usr_003', assigned_team_id: 'team_a' };
  const teamLead = { assigned_agent_id: 'usr_004', assigned_team_id: 'team_a' };
  const otherTeamLead = { assigned_agent_id: 'usr_006', assigned_team_id: 'team_b' };

  assert.equal(canViewOwnedRecord(users.agentA, ownLead), true);
  assert.equal(canViewOwnedRecord(users.agentA, teamLead), false);
  assert.equal(canViewOwnedRecord(users.managerA, teamLead), true);
  assert.equal(canViewOwnedRecord(users.managerA, otherTeamLead), false);
  assert.equal(canViewOwnedRecord(users.superAdmin, otherTeamLead), true);
});
