-- Aureum operates one sales team. Consolidate legacy Team B ownership into Team A.
DELETE FROM crm.team_memberships source_members
USING crm.team_memberships primary_members, crm.teams source_team, crm.teams primary_team
WHERE source_members.team_id = source_team.id
  AND primary_members.team_id = primary_team.id
  AND source_team.legacy_id = 'team_b'
  AND primary_team.legacy_id = 'team_a'
  AND source_team.workspace_id = primary_team.workspace_id
  AND source_members.user_id = primary_members.user_id;

UPDATE crm.team_memberships source_members
SET team_id = primary_team.id
FROM crm.teams source_team, crm.teams primary_team
WHERE source_members.team_id = source_team.id
  AND source_team.legacy_id = 'team_b'
  AND primary_team.legacy_id = 'team_a'
  AND source_team.workspace_id = primary_team.workspace_id;

UPDATE crm.users user_row
SET team_id = primary_team.id, updated_at = now()
FROM crm.teams source_team, crm.teams primary_team
WHERE user_row.team_id = source_team.id
  AND source_team.legacy_id = 'team_b'
  AND primary_team.legacy_id = 'team_a'
  AND source_team.workspace_id = primary_team.workspace_id;

UPDATE crm.leads record_row
SET assigned_team_id = primary_team.id, updated_at = now()
FROM crm.teams source_team, crm.teams primary_team
WHERE record_row.assigned_team_id = source_team.id
  AND source_team.legacy_id = 'team_b'
  AND primary_team.legacy_id = 'team_a'
  AND source_team.workspace_id = primary_team.workspace_id;

UPDATE crm.customers record_row
SET assigned_team_id = primary_team.id, updated_at = now()
FROM crm.teams source_team, crm.teams primary_team
WHERE record_row.assigned_team_id = source_team.id
  AND source_team.legacy_id = 'team_b'
  AND primary_team.legacy_id = 'team_a'
  AND source_team.workspace_id = primary_team.workspace_id;

UPDATE crm.follow_ups record_row
SET assigned_team_id = primary_team.id, updated_at = now()
FROM crm.teams source_team, crm.teams primary_team
WHERE record_row.assigned_team_id = source_team.id
  AND source_team.legacy_id = 'team_b'
  AND primary_team.legacy_id = 'team_a'
  AND source_team.workspace_id = primary_team.workspace_id;

UPDATE crm.tasks record_row
SET assigned_team_id = primary_team.id, updated_at = now()
FROM crm.teams source_team, crm.teams primary_team
WHERE record_row.assigned_team_id = source_team.id
  AND source_team.legacy_id = 'team_b'
  AND primary_team.legacy_id = 'team_a'
  AND source_team.workspace_id = primary_team.workspace_id;

UPDATE crm.webhook_connections connection_row
SET default_assigned_team_id = primary_team.id, updated_at = now()
FROM crm.teams source_team, crm.teams primary_team
WHERE connection_row.default_assigned_team_id = source_team.id
  AND source_team.legacy_id = 'team_b'
  AND primary_team.legacy_id = 'team_a'
  AND source_team.workspace_id = primary_team.workspace_id;

UPDATE crm.teams source_team
SET is_active = false, updated_at = now()
FROM crm.teams primary_team
WHERE source_team.legacy_id = 'team_b'
  AND primary_team.legacy_id = 'team_a'
  AND source_team.workspace_id = primary_team.workspace_id;
