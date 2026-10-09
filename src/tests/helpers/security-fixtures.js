const { canAccessRoute, canViewOwnedRecord, validatePasswordPolicy, validateEmail, validatePhone, validateIsoDate, safeText } = require('../../../backend/security-utils');

const users = {
  superAdmin: { id: 'usr_001', role: 'super_admin', team_id: null },
  managerA: { id: 'usr_002', role: 'sales_manager', team_id: 'team_a' },
  agentA: { id: 'usr_003', role: 'sales_agent', team_id: 'team_a' },
  agentB: { id: 'usr_006', role: 'sales_agent', team_id: 'team_b' }
};
const records = { teamA: { assigned_agent_id: 'usr_004', assigned_team_id: 'team_a' }, teamB: { assigned_agent_id: 'usr_006', assigned_team_id: 'team_b' }, own: { assigned_agent_id: 'usr_003', assigned_team_id: 'team_a' } };

module.exports = { canAccessRoute, canViewOwnedRecord, validatePasswordPolicy, validateEmail, validatePhone, validateIsoDate, safeText, users, records };
