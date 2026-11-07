'use strict';

const { createPostgresSql } = require('../backend/db/sql-client');

const FULL_NAME = 'Ali Akbar';
const ROLE = 'sales_manager';
const STATUS = 'active';
const TEAM_LEGACY_ID = 'team_a';
const LEGACY_ID = 'usr_ali_akbar';
const PASSWORD_HASH = '542bdf4c53ab504a10b19f524f9e9bdfda86928542f528febf3076c83aaee38d0b82e49c22c8fc44ba29a7f99f71bc9be76c162685b8e8aea8b30a75b2c77f97';
const EMAIL_CANDIDATES = ['ali@aureum.com', 'ali.akbar@aureum.com'];

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const sql = createPostgresSql(databaseUrl);
  try {
    const workspaceLegacyId = String(process.env.AUREUM_WORKSPACE_ID || 'workspace_default').trim();
    let workspaces = await sql.query(
      'SELECT id, legacy_id, name FROM crm.workspaces WHERE legacy_id = $1 AND is_active = true LIMIT 1',
      [workspaceLegacyId]
    );
    if (!workspaces.length) {
      workspaces = await sql.query(
        'SELECT id, legacy_id, name FROM crm.workspaces WHERE is_active = true ORDER BY created_at ASC LIMIT 2'
      );
      if (workspaces.length !== 1) throw new Error('Unable to resolve exactly one active CRM workspace.');
    }
    const workspace = workspaces[0];

    const teams = await sql.query(
      'SELECT id, legacy_id, name FROM crm.teams WHERE workspace_id = $1 AND legacy_id = $2 AND is_active = true LIMIT 1',
      [workspace.id, TEAM_LEGACY_ID]
    );
    if (!teams.length) throw new Error('Sales Team A was not found in the active workspace.');
    const team = teams[0];

    const admins = await sql.query(
      "SELECT id, legacy_id, full_name FROM crm.users WHERE workspace_id = $1 AND role_key = 'super_admin' AND status = 'active' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1",
      [workspace.id]
    );
    if (!admins.length) throw new Error('No active Super Admin is available to own the provisioning audit trail.');
    const actor = admins[0];

    const existing = await sql.query(
      'SELECT id, legacy_id, email, full_name, role_key, status FROM crm.users WHERE workspace_id = $1 AND deleted_at IS NULL AND (lower(full_name) = lower($2) OR lower(email) = ANY($3::text[])) ORDER BY created_at ASC LIMIT 1',
      [workspace.id, FULL_NAME, EMAIL_CANDIDATES]
    );

    let userId;
    let email;
    let created = false;

    if (existing.length) {
      const user = existing[0];
      if (String(user.full_name || '').trim().toLowerCase() !== FULL_NAME.toLowerCase()) {
        throw new Error('An email candidate is already assigned to a different user; refusing to overwrite it.');
      }
      email = user.email;
      userId = user.id;
      await sql.query(
        "UPDATE crm.users SET full_name = $2, password_hash = $3, role_key = $4, team_id = $5, status = $6, must_change_password = true, failed_login_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = $1",
        [userId, FULL_NAME, PASSWORD_HASH, ROLE, team.id, STATUS]
      );
      await sql.query('UPDATE crm.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
      await sql.query("UPDATE crm.user_invites SET status = 'revoked' WHERE user_id = $1 AND status IN ('pending','sent')", [userId]);
    } else {
      for (const candidate of EMAIL_CANDIDATES) {
        const taken = await sql.query(
          'SELECT 1 FROM crm.users WHERE workspace_id = $1 AND lower(email) = lower($2) AND deleted_at IS NULL LIMIT 1',
          [workspace.id, candidate]
        );
        if (!taken.length) { email = candidate; break; }
      }
      if (!email) throw new Error('No approved Ali Akbar email candidate is available.');

      const rows = await sql.query(
        'INSERT INTO crm.users (workspace_id, legacy_id, email, full_name, password_hash, role_key, team_id, status, must_change_password, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) RETURNING id',
        [workspace.id, LEGACY_ID, email, FULL_NAME, PASSWORD_HASH, ROLE, team.id, STATUS, actor.id]
      );
      userId = rows[0].id;
      created = true;
    }

    await sql.query(
      'INSERT INTO crm.team_memberships (team_id, user_id, is_primary) VALUES ($1,$2,true) ON CONFLICT (team_id,user_id) DO UPDATE SET is_primary = true, left_at = NULL',
      [team.id, userId]
    );
    await sql.query(
      "INSERT INTO crm.user_invites (workspace_id,user_id,email,role_key,status,created_by) VALUES ($1,$2,$3,$4,'pending',$5)",
      [workspace.id, userId, email, ROLE, actor.id]
    );
    await sql.query(
      'INSERT INTO crm.user_audit_logs (user_id, action, metadata) VALUES ($1,$2,$3::jsonb)',
      [userId, created ? 'user_created' : 'user_reprovisioned', JSON.stringify({ actor_user_id: actor.id, source: 'one_time_provisioning', role: ROLE, team: TEAM_LEGACY_ID })]
    );

    const verified = await sql.query(
      'SELECT u.legacy_id, u.email, u.full_name, u.role_key, u.status, u.must_change_password, t.legacy_id AS team_legacy_id, t.name AS team_name FROM crm.users u LEFT JOIN crm.teams t ON t.id = u.team_id WHERE u.id = $1',
      [userId]
    );
    const result = verified[0];
    process.stdout.write(JSON.stringify({
      ok: true,
      created,
      user: {
        id: result.legacy_id,
        email: result.email,
        fullName: result.full_name,
        role: result.role_key,
        status: result.status,
        team: result.team_name || result.team_legacy_id,
        mustChangePassword: result.must_change_password
      }
    }) + '\n');
  } finally {
    await sql.end();
  }
}

main().catch(error => {
  console.error('provision-ali-akbar:', error.message);
  process.exit(1);
});
