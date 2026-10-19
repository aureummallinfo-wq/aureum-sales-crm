const crypto = require('node:crypto');
const { canViewOwnedRecord } = require('../security-utils');
const { createFollowUpPipeline } = require('./followup-pipeline');
const { notePlan, displayStatus, uniqueFollowUps, activitySummary } = require('../followup-workflow');
const { customerCreationPlan } = require('../customer-creation');
const { insertLeadCustomer } = require('./customer-creation');

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function valueObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function valueArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed; } catch {}
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[|;,]/);
  return [...new Set(source.map(item => String(item || '').trim()).filter(Boolean))].slice(0, 10);
}

function localDateParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '', time: '' };
  return { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date), time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date) };
}

function timestampValue(value) {
  if (!value) return null;
  const input = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? `${value}+05:00` : value;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const PRESENCE_ONLINE_WINDOW_MS = 2 * 60 * 1000;
const PRESENCE_AWAY_WINDOW_MS = 15 * 60 * 1000;

function userPresenceStatus(user, now = Date.now()) {
  if (!user || user.status !== 'active') return 'Offline';
  if (!user.last_login_at) return 'Offline';
  const manual = String(user.presence_status || '').trim().toLowerCase();
  if (['online', 'away', 'offline'].includes(manual)) return `${manual.slice(0, 1).toUpperCase()}${manual.slice(1)}`;
  const lastActivity = Date.parse(user.last_activity_at || user.last_login_at || '');
  if (!Number.isFinite(lastActivity)) return 'Offline';
  const age = Math.max(0, now - lastActivity);
  if (age <= PRESENCE_ONLINE_WINDOW_MS) return 'Online';
  if (age <= PRESENCE_AWAY_WINDOW_MS) return 'Away';
  return 'Offline';
}

function createNeonRepository(sql) {
  if (!sql) throw new Error('A Neon SQL client is required.');
  const pipeline = createFollowUpPipeline(sql, resolveUserId, resolveTeamId);

  async function workspaceId(legacyId = 'workspace_default') {
    const rows = await sql.query('SELECT id FROM crm.workspaces WHERE legacy_id = $1 AND is_active = true LIMIT 1', [legacyId]);
    return rows[0]?.id || null;
  }

  async function findWorkspace(legacyId = 'workspace_default') {
    const rows = await sql.query('SELECT id, legacy_id, name, timezone, currency FROM crm.workspaces WHERE legacy_id = $1 AND is_active = true LIMIT 1', [legacyId]);
    return rows[0] || null;
  }

  async function findUserByIdentifier(workspace, identifier) {
    const rows = await sql.query(`SELECT u.id, u.legacy_id, u.workspace_id, u.email, u.full_name, u.phone, u.password_hash,
      u.role_key AS role, t.legacy_id AS team_id, u.status, u.must_change_password, u.last_login_at, u.last_activity_at,
      presence.preference_value->>'status' AS presence_status, presence.preference_value->>'mode' AS presence_mode,
      u.created_at, u.updated_at, invite.status AS invite_status, invite.expires_at AS temporary_password_expires_at,
      invite.created_at AS access_email_sent_at FROM crm.users u LEFT JOIN crm.teams t ON t.id = u.team_id
      LEFT JOIN LATERAL (SELECT status, expires_at, created_at FROM crm.user_invites WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) invite ON true
      LEFT JOIN LATERAL (SELECT preference_value FROM crm.user_preferences WHERE user_id = u.id AND preference_key = 'presence_status' LIMIT 1) presence ON true
      WHERE u.workspace_id = $1 AND u.deleted_at IS NULL
      AND (lower(u.email) = lower($2) OR u.phone = $2 OR u.legacy_id = $2) LIMIT 1`, [workspace, String(identifier || '').trim()]);
    return rows[0] ? userRecord(rows[0]) : null;
  }

  async function findUserByEmail(workspace, email) { return findUserByIdentifier(workspace, email); }

  async function findUser(workspace, identifier) {
    const rows = await sql.query(`SELECT u.id, u.legacy_id, u.workspace_id, u.email, u.full_name, u.phone, u.password_hash,
      u.role_key AS role, t.legacy_id AS team_id, u.status, u.must_change_password, u.last_login_at, u.last_activity_at,
      presence.preference_value->>'status' AS presence_status, presence.preference_value->>'mode' AS presence_mode,
      u.created_at, u.updated_at, invite.status AS invite_status, invite.expires_at AS temporary_password_expires_at,
      invite.created_at AS access_email_sent_at FROM crm.users u LEFT JOIN crm.teams t ON t.id = u.team_id
      LEFT JOIN LATERAL (SELECT status, expires_at, created_at FROM crm.user_invites WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) invite ON true
      LEFT JOIN LATERAL (SELECT preference_value FROM crm.user_preferences WHERE user_id = u.id AND preference_key = 'presence_status' LIMIT 1) presence ON true
      WHERE u.workspace_id = $1 AND u.deleted_at IS NULL AND (u.id::text = $2 OR u.legacy_id = $2) LIMIT 1`, [workspace, String(identifier || '')]);
    return rows[0] ? userRecord(rows[0]) : null;
  }

  async function resolveUserId(workspace, identifier) {
    if (!identifier) return null;
    const rows = await sql.query('SELECT id FROM crm.users WHERE workspace_id = $1 AND (id::text = $2 OR legacy_id = $2) AND deleted_at IS NULL LIMIT 1', [workspace, String(identifier)]);
    return rows[0]?.id || null;
  }

  async function resolveTeamId(workspace, identifier) {
    if (!identifier) return null;
    const rows = await sql.query('SELECT id FROM crm.teams WHERE workspace_id = $1 AND (id::text = $2 OR legacy_id = $2) LIMIT 1', [workspace, String(identifier)]);
    return rows[0]?.id || null;
  }

  async function resolveLeadId(workspace, identifier) {
    if (!identifier) return null;
    const rows = await sql.query('SELECT id FROM crm.leads WHERE workspace_id = $1 AND (id::text = $2 OR legacy_id = $2) AND deleted_at IS NULL LIMIT 1', [workspace, String(identifier)]);
    return rows[0]?.id || null;
  }

  async function resolveCustomerId(workspace, identifier) {
    if (!identifier) return null;
    const rows = await sql.query('SELECT id FROM crm.customers WHERE workspace_id = $1 AND (id::text = $2 OR legacy_id = $2) AND deleted_at IS NULL LIMIT 1', [workspace, String(identifier)]);
    return rows[0]?.id || null;
  }

  async function resolveFollowUpId(workspace, identifier) {
    if (!identifier) return null;
    const rows = await sql.query('SELECT id FROM crm.follow_ups WHERE workspace_id = $1 AND (id::text = $2 OR legacy_id = $2) AND deleted_at IS NULL LIMIT 1', [workspace, String(identifier)]);
    return rows[0]?.id || null;
  }

  async function createSession({ userId, token, expiresAt, ipAddress, userAgent }) {
    const tokenHash = hashToken(token);
    await sql.query('INSERT INTO crm.sessions (user_id, token_hash, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)', [userId, tokenHash, expiresAt, ipAddress || null, userAgent || null]);
    return tokenHash;
  }

  async function findSession(token, workspace) {
    if (!workspace) return null;
    const rows = await sql.query(`SELECT s.id AS session_id, s.user_id, s.expires_at, u.id, u.legacy_id, u.workspace_id, u.email,
      u.full_name, u.phone, u.password_hash, u.role_key AS role, t.legacy_id AS team_id, u.status,
      u.must_change_password, u.last_login_at, u.last_activity_at, presence.preference_value->>'status' AS presence_status, presence.preference_value->>'mode' AS presence_mode, u.created_at, u.updated_at,
      invite.status AS invite_status, invite.expires_at AS temporary_password_expires_at,
      invite.created_at AS access_email_sent_at FROM crm.sessions s JOIN crm.users u ON u.id = s.user_id LEFT JOIN crm.teams t ON t.id = u.team_id
      LEFT JOIN LATERAL (SELECT status, expires_at, created_at FROM crm.user_invites WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) invite ON true
      LEFT JOIN LATERAL (SELECT preference_value FROM crm.user_preferences WHERE user_id = u.id AND preference_key = 'presence_status' LIMIT 1) presence ON true
      WHERE s.token_hash = $1 AND u.workspace_id = $2 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.deleted_at IS NULL LIMIT 1`, [hashToken(token), workspace]);
    return rows[0] ? userRecord(rows[0]) : null;
  }

  async function revokeSession(token, workspace) {
    if (!workspace) return;
    await sql.query(`UPDATE crm.sessions s SET revoked_at = now() FROM crm.users u
      WHERE u.id = s.user_id AND u.workspace_id = $2 AND s.token_hash = $1 AND s.revoked_at IS NULL`, [hashToken(token), workspace]);
  }

  async function recordLogin({ userId, email, eventType, ipAddress, userAgent, metadata = {} }) {
    await sql.query('INSERT INTO crm.login_activity (user_id, email, event_type, ip_address, user_agent, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [userId || null, email || null, eventType, ipAddress || null, userAgent || null, JSON.stringify(metadata)]);
  }

  async function loginLockStatus(userId) {
    if (!userId) return null;
    const rows = await sql.query('SELECT failed_login_attempts, locked_until FROM crm.users WHERE id = $1 LIMIT 1', [userId]);
    return rows[0] || null;
  }

  async function recordLoginFailure(userId) {
    if (!userId) return null;
    const rows = await sql.query(`WITH next_attempt AS (
      SELECT id, CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1 ELSE failed_login_attempts + 1 END AS attempts
      FROM crm.users WHERE id = $1 FOR UPDATE
    )
    UPDATE crm.users AS users
    SET failed_login_attempts = next_attempt.attempts,
        locked_until = CASE WHEN next_attempt.attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END,
        updated_at = now()
    FROM next_attempt
    WHERE users.id = next_attempt.id
    RETURNING users.failed_login_attempts, users.locked_until`, [userId]);
    return rows[0] || null;
  }

  async function clearLoginFailures(userId) {
    if (!userId) return;
    await sql.query('UPDATE crm.users SET failed_login_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = $1', [userId]);
  }

  async function updateLastLogin(userId) { await sql.query('UPDATE crm.users SET last_login_at = now(), last_activity_at = now(), updated_at = now() WHERE id = $1', [userId]); }

  async function updateLastActivity(userIdentifier) {
    const userId = await resolveUserId(workspace, userIdentifier);
    if (!userId) return null;
    await sql.query('UPDATE crm.users SET last_activity_at = now(), updated_at = now() WHERE id = $1', [userId]);
    return findUser(workspace, userIdentifier);
  }

  async function listUsers(workspace, actor) {
    const params = [workspace]; const conditions = ['u.workspace_id = $1', 'u.deleted_at IS NULL'];
    if (actor?.role === 'sales_manager') { params.push(await resolveTeamId(workspace, actor.team_id)); conditions.push(`t.id = $${params.length}`); }
    const rows = await sql.query(`SELECT u.id, u.legacy_id, u.email, u.full_name, u.phone, u.role_key AS role, u.status,
      u.must_change_password, u.last_login_at, u.last_activity_at, presence.preference_value->>'status' AS presence_status, presence.preference_value->>'mode' AS presence_mode, u.created_at, u.updated_at, t.legacy_id AS team_id, t.name AS team_name,
      invite.status AS invite_status, invite.expires_at AS temporary_password_expires_at,
      invite.created_at AS access_email_sent_at FROM crm.users u LEFT JOIN crm.teams t ON t.id = u.team_id
      LEFT JOIN LATERAL (SELECT status, expires_at, created_at FROM crm.user_invites WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) invite ON true
      LEFT JOIN LATERAL (SELECT preference_value FROM crm.user_preferences WHERE user_id = u.id AND preference_key = 'presence_status' LIMIT 1) presence ON true
      WHERE ${conditions.join(' AND ')} ORDER BY u.created_at ASC`, params);
    return rows.map(userRecord);
  }

  async function listTeams(workspace) {
    return sql.query(`SELECT t.id, t.legacy_id, t.name, t.description, u.legacy_id AS manager_id, u.full_name AS manager_name
      FROM crm.teams t LEFT JOIN crm.users u ON u.id = t.manager_user_id WHERE t.workspace_id = $1 AND t.is_active = true ORDER BY t.name`, [workspace]);
  }

  // Keep the production workspace on the single-team model. This is safe to
  // run on every startup and consolidates legacy Team B ownership in Team A.
  async function normalizeSingleTeam(workspace) {
    const rows = await sql.query(`SELECT id, legacy_id FROM crm.teams
      WHERE workspace_id = $1 AND legacy_id IN ('team_a', 'team_b')`, [workspace]);
    const primary = rows.find(row => row.legacy_id === 'team_a');
    const legacy = rows.find(row => row.legacy_id === 'team_b');
    if (!primary || !legacy || primary.id === legacy.id) return false;
    await sql.query(`DELETE FROM crm.team_memberships source_members
      USING crm.team_memberships primary_members
      WHERE source_members.team_id = $2 AND primary_members.team_id = $1
        AND source_members.user_id = primary_members.user_id`, [primary.id, legacy.id]);
    await sql.query('UPDATE crm.team_memberships SET team_id = $1 WHERE team_id = $2', [primary.id, legacy.id]);
    await sql.query('UPDATE crm.users SET team_id = $1, updated_at = now() WHERE workspace_id = $3 AND team_id = $2', [primary.id, legacy.id, workspace]);
    for (const table of ['crm.leads', 'crm.customers', 'crm.follow_ups', 'crm.tasks']) {
      await sql.query(`UPDATE ${table} SET assigned_team_id = $1, updated_at = now() WHERE workspace_id = $3 AND assigned_team_id = $2`, [primary.id, legacy.id, workspace]);
    }
    await sql.query(`UPDATE crm.webhook_connections SET default_assigned_team_id = $1, updated_at = now()
      WHERE workspace_id = $3 AND default_assigned_team_id = $2`, [primary.id, legacy.id, workspace]);
    await sql.query(`UPDATE crm.lead_assignment_history SET from_team_id = $1 WHERE from_team_id = $2
      AND lead_id IN (SELECT id FROM crm.leads WHERE workspace_id = $3)`, [primary.id, legacy.id, workspace]);
    await sql.query(`UPDATE crm.lead_assignment_history SET to_team_id = $1 WHERE to_team_id = $2
      AND lead_id IN (SELECT id FROM crm.leads WHERE workspace_id = $3)`, [primary.id, legacy.id, workspace]);
    await sql.query('UPDATE crm.teams SET is_active = false, updated_at = now() WHERE id = $1', [legacy.id]);
    return true;
  }

  async function updateUser(workspace, targetIdentifier, patch) {
    const targetId = await resolveUserId(workspace, targetIdentifier); if (!targetId) return null;
    const fields = []; const params = []; const assign = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`); };
    if (patch.full_name !== undefined) assign('full_name', patch.full_name);
    if (patch.email !== undefined) assign('email', String(patch.email).toLowerCase());
    if (patch.phone !== undefined) assign('phone', patch.phone || null);
    if (patch.role !== undefined) assign('role_key', patch.role);
    if (patch.status !== undefined) assign('status', patch.status);
    if (patch.password_hash !== undefined) { assign('password_hash', patch.password_hash); fields.push('failed_login_attempts = 0', 'locked_until = NULL'); }
    if (patch.must_change_password !== undefined) assign('must_change_password', Boolean(patch.must_change_password));
    if (patch.team_id !== undefined) assign('team_id', await resolveTeamId(workspace, patch.team_id));
    if (!fields.length) return findUser(workspace, targetIdentifier);
    params.push(targetId); await sql.query(`UPDATE crm.users SET ${fields.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
    return findUser(workspace, targetIdentifier);
  }

  async function deleteUser(workspace, targetIdentifier, actor) {
    const targetId = await resolveUserId(workspace, targetIdentifier); if (!targetId) return null;
    const target = await findUser(workspace, targetIdentifier); if (!target) return null;
    const actorId = actor?.id ? await resolveUserId(workspace, actor.id) : null;
    await sql.query('UPDATE crm.users SET status = \'inactive\', deleted_at = now(), updated_at = now() WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL', [targetId, workspace]);
    await sql.query('UPDATE crm.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [targetId]);
    await sql.query('INSERT INTO crm.user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3::jsonb)', [targetId, 'user_deleted', JSON.stringify({ actor_user_id: actorId, email: target.email, full_name: target.full_name })]);
    return { ...target, status: 'inactive', deleted_at: new Date().toISOString() };
  }

  async function createUser(workspace, actor, input) {
    const teamId = await resolveTeamId(workspace, input.team_id || input.teamId || (actor.role === 'sales_manager' ? actor.team_id : null));
    const creatorId = await resolveUserId(workspace, actor.id);
    const rows = await sql.query(`INSERT INTO crm.users (workspace_id, legacy_id, email, full_name, phone, password_hash, role_key, team_id, status, must_change_password, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, legacy_id`, [workspace, input.id || `usr_${crypto.randomUUID().slice(0, 8)}`, String(input.email).toLowerCase(), input.full_name, input.phone || null, input.password_hash, input.role || 'sales_agent', teamId, input.status || 'pending', input.must_change_password !== false, creatorId]);
    const created = await findUser(workspace, rows[0].legacy_id);
    await sql.query('INSERT INTO crm.user_invites (workspace_id,user_id,email,role_key,status,expires_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)', [workspace, await resolveUserId(workspace, created.id), created.email, created.role, 'pending', null, await resolveUserId(workspace, actor.id)]);
    return findUser(workspace, rows[0].legacy_id);
  }

  async function issueUserInvite(workspace, actor, targetIdentifier, tokenHash, expiresAt) {
    const targetId = await resolveUserId(workspace, targetIdentifier); if (!targetId) return null;
    const target = await findUser(workspace, targetIdentifier); if (!target) return null;
    await sql.query('INSERT INTO crm.user_invites (workspace_id,user_id,email,role_key,token_hash,status,expires_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [workspace, targetId, target.email, target.role, tokenHash || null, 'sent', expiresAt || null, await resolveUserId(workspace, actor.id)]);
    await sql.query('INSERT INTO crm.user_audit_logs (user_id,action,metadata) VALUES ($1,$2,$3::jsonb)', [targetId, 'access_email_sent', JSON.stringify({ actor_user_id: await resolveUserId(workspace, actor.id) })]);
    return findUser(workspace, targetIdentifier);
  }

  async function changePassword(workspace, userIdentifier, nextPasswordHash) {
    const userId = await resolveUserId(workspace, userIdentifier); if (!userId) return null;
    await sql.query('UPDATE crm.users SET password_hash = $1, must_change_password = false, status = \'active\', failed_login_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = $2', [nextPasswordHash, userId]);
    await recordLogin({ userId, eventType: 'password_changed', metadata: { source: 'account' } });
    return findUser(workspace, userIdentifier);
  }

  async function loginActivity(workspace, userIdentifier) {
    const userId = await resolveUserId(workspace, userIdentifier); if (!userId) return [];
    return sql.query('SELECT id, event_type, email, ip_address, user_agent, metadata, created_at FROM crm.login_activity WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [userId]);
  }

  async function userActivity(workspace, userIdentifier) {
    const userId = await resolveUserId(workspace, userIdentifier); if (!userId) return [];
    return sql.query(`SELECT id, action AS activity_type, action AS description, metadata, created_at FROM crm.user_audit_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [userId]);
  }

  async function accountPreferences(workspace, userIdentifier) {
    const userId = await resolveUserId(workspace, userIdentifier); if (!userId) return {};
    const rows = await sql.query('SELECT preference_key, preference_value FROM crm.user_preferences WHERE user_id = $1', [userId]);
    return Object.fromEntries(rows.map(row => [row.preference_key, valueObject(row.preference_value)]));
  }

  async function updateAccountPreferences(workspace, userIdentifier, key, value) {
    const userId = await resolveUserId(workspace, userIdentifier); if (!userId) return {};
    await sql.query(`INSERT INTO crm.user_preferences (user_id, preference_key, preference_value) VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (user_id, preference_key) DO UPDATE SET preference_value = EXCLUDED.preference_value, updated_at = now()`, [userId, key, JSON.stringify(valueObject(value))]);
    return accountPreferences(workspace, userIdentifier);
  }

  async function updatePresenceStatus(workspace, userIdentifier, status) {
    const normalized = String(status || '').trim();
    if (!['Online', 'Away', 'Offline'].includes(normalized)) return null;
    const preferences = await updateAccountPreferences(workspace, userIdentifier, 'presence_status', { status: normalized, mode: 'manual' });
    const user = await findUser(workspace, userIdentifier);
    return user ? { ...user, presence_status: preferences.presence_status?.status || normalized, presence_mode: 'manual' } : null;
  }

  async function clearPresenceStatus(workspace, userIdentifier) {
    const userId = await resolveUserId(workspace, userIdentifier); if (!userId) return {};
    await sql.query("DELETE FROM crm.user_preferences WHERE user_id = $1 AND preference_key = 'presence_status'", [userId]);
    return accountPreferences(workspace, userIdentifier);
  }

  async function workspaceSettings(workspace) {
    const rows = await sql.query('SELECT setting_key, setting_value FROM crm.workspace_settings WHERE workspace_id = $1', [workspace]);
    return Object.fromEntries(rows.map(row => [row.setting_key, valueObject(row.setting_value)]));
  }

  async function updateWorkspaceSetting(workspace, key, value) {
    await sql.query(`INSERT INTO crm.workspace_settings (workspace_id, setting_key, setting_value) VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (workspace_id, setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`, [workspace, key, JSON.stringify(valueObject(value))]);
    return workspaceSettings(workspace);
  }

  const customerStatusTablesReady = new Set();
  async function ensureCustomerStatusTable(workspace) {
    if (customerStatusTablesReady.has(String(workspace))) return;
    await sql.query(`CREATE TABLE IF NOT EXISTS crm.customer_statuses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES crm.workspaces(id) ON DELETE CASCADE, legacy_id text, name text NOT NULL, slug text NOT NULL, color text, sort_order integer NOT NULL DEFAULT 0, is_default boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true, UNIQUE (workspace_id, slug), UNIQUE (workspace_id, legacy_id))`, []);
    const defaults = [['customer-status-active','Active','active','#5d9670',10],['customer-status-hot','Hot','hot','#b36b55',20],['customer-status-cold','Cold','cold','#9e9a92',30],['customer-status-follow-up','Follow-up','follow-up','#b6904f',40],['customer-status-interested','Interested','interested','#b6904f',50],['customer-status-not-interested','Not Interested','not-interested','#9e9a92',60],['customer-status-closed-won','Closed Won','closed-won','#5d9670',70]];
    for (const item of defaults) await sql.query(`INSERT INTO crm.customer_statuses (workspace_id,legacy_id,name,slug,color,sort_order,is_default,is_active) VALUES ($1,$2,$3,$4,$5,$6,true,true) ON CONFLICT (workspace_id,legacy_id) DO NOTHING`, [workspace, ...item]);
    customerStatusTablesReady.add(String(workspace));
  }

  async function listLeadConfiguration(workspace, type) {
    if (type === 'customer-statuses') await ensureCustomerStatusTable(workspace);
    const table = type === 'lead-statuses' ? 'crm.lead_statuses' : type === 'customer-statuses' ? 'crm.customer_statuses' : type === 'lead-tags' ? 'crm.lead_tags' : 'crm.lead_sources';
    const orderBy = type === 'lead-statuses' || type === 'customer-statuses' ? 'sort_order, name' : 'name';
    return sql.query(`SELECT * FROM ${table} WHERE workspace_id = $1 ORDER BY ${orderBy}`, [workspace]);
  }

  async function createLeadConfiguration(workspace, type, input) {
    if (type === 'customer-statuses') await ensureCustomerStatusTable(workspace);
    const table = type === 'lead-statuses' ? 'crm.lead_statuses' : type === 'customer-statuses' ? 'crm.customer_statuses' : type === 'lead-tags' ? 'crm.lead_tags' : 'crm.lead_sources';
    const legacyId = input.id || `${type === 'lead-statuses' || type === 'customer-statuses' ? 'status' : type === 'lead-tags' ? 'tag' : 'source'}_${crypto.randomUUID().slice(0, 8)}`;
    const name = String(input.name || '').trim();
    const slug = String(input.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 120);
    if (!name || !slug) return null;
    const columns = type === 'lead-statuses' || type === 'customer-statuses' ? '(workspace_id,legacy_id,name,slug,color,sort_order,is_default,is_active)' : type === 'lead-tags' ? '(workspace_id,legacy_id,name,slug,tag_type,is_active)' : '(workspace_id,legacy_id,name,slug,is_default,is_active)';
    const values = type === 'lead-statuses' || type === 'customer-statuses' ? [workspace, legacyId, name, slug, input.color || '#8d7658', Number(input.sort_order || 0), Boolean(input.is_default), input.is_active !== false] : type === 'lead-tags' ? [workspace, legacyId, name, slug, input.tag_type || 'lead', input.is_active !== false] : [workspace, legacyId, name, slug, Boolean(input.is_default), input.is_active !== false];
    const placeholders = values.map((_, index) => `$${index + 1}`).join(',');
    const rows = await sql.query(`INSERT INTO ${table} ${columns} VALUES (${placeholders}) RETURNING *`, values);
    return rows[0] || null;
  }

  async function updateLeadConfiguration(workspace, type, identifier, patch) {
    if (type === 'customer-statuses') await ensureCustomerStatusTable(workspace);
    const table = type === 'lead-statuses' ? 'crm.lead_statuses' : type === 'customer-statuses' ? 'crm.customer_statuses' : type === 'lead-tags' ? 'crm.lead_tags' : 'crm.lead_sources';
    const fields = []; const params = [workspace, String(identifier)];
    const assign = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`); };
    if (patch.name !== undefined) { assign('name', String(patch.name).trim()); assign('slug', String(patch.slug || patch.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120)); }
    if (patch.color !== undefined && (type === 'lead-statuses' || type === 'customer-statuses')) assign('color', patch.color);
    if (patch.sort_order !== undefined && (type === 'lead-statuses' || type === 'customer-statuses')) assign('sort_order', Number(patch.sort_order));
    if (patch.tag_type !== undefined && type === 'lead-tags') assign('tag_type', patch.tag_type);
    if (patch.is_active !== undefined) assign('is_active', Boolean(patch.is_active));
    if (patch.is_default !== undefined && type !== 'lead-tags') assign('is_default', Boolean(patch.is_default));
    if (!fields.length) return (await listLeadConfiguration(workspace, type)).find(item => item.id === identifier || item.legacy_id === identifier) || null;
    params.push(String(identifier));
    const rows = await sql.query(`UPDATE ${table} SET ${fields.join(', ')} WHERE workspace_id = $1 AND (id::text = $2 OR legacy_id = $2) RETURNING *`, params.slice(0, -1));
    return rows[0] || null;
  }

  async function settingsActivities(workspace) {
    return sql.query(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.after_data,a.created_at,u.legacy_id AS actor_user_id,u.full_name AS actor_name
      FROM crm.audit_events a LEFT JOIN crm.users u ON u.id=a.actor_user_id
      WHERE a.workspace_id=$1 AND a.entity_type IN ('settings','webhook','lead_status','customer_status','lead_source','lead_tag')
      ORDER BY a.created_at DESC LIMIT 100`, [workspace]);
  }

  async function auditEvents(workspace) {
    return sql.query(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.before_data,a.after_data,a.created_at,u.legacy_id AS actor_user_id,u.full_name AS actor_name FROM crm.audit_events a LEFT JOIN crm.users u ON u.id=a.actor_user_id WHERE a.workspace_id=$1 ORDER BY a.created_at DESC LIMIT 100`, [workspace]);
  }

  async function listNotificationSettings(workspace, userIdentifier) {
    const userId = await resolveUserId(workspace, userIdentifier); if (!userId) return [];
    return sql.query(`SELECT s.event_key, d.event_name, s.in_app_enabled, s.email_enabled, s.whatsapp_enabled, s.sms_enabled FROM crm.notification_settings s JOIN crm.notification_definitions d ON d.event_key=s.event_key WHERE s.user_id=$1 ORDER BY s.event_key`, [userId]);
  }

  async function updateNotificationSettings(workspace, userIdentifier, updates) {
    const userId = await resolveUserId(workspace, userIdentifier); if (!userId) return [];
    for (const item of updates || []) if (item.event_key) await sql.query(`INSERT INTO crm.notification_settings (user_id,event_key,in_app_enabled,email_enabled,whatsapp_enabled,sms_enabled) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id,event_key) DO UPDATE SET in_app_enabled=EXCLUDED.in_app_enabled,email_enabled=EXCLUDED.email_enabled,whatsapp_enabled=EXCLUDED.whatsapp_enabled,sms_enabled=EXCLUDED.sms_enabled`, [userId, item.event_key, item.in_app_enabled !== false, Boolean(item.email_enabled), Boolean(item.whatsapp_enabled), Boolean(item.sms_enabled)]);
    return listNotificationSettings(workspace, userIdentifier);
  }

  async function scope(workspace, user, alias = 'l', options = {}) {
    const conditions = [`${alias}.workspace_id = $1`, `${alias}.deleted_at IS NULL`]; const params = [workspace];
    if (user?.role === 'sales_manager') {
      if (!options.allSalesManagerLeads) { params.push(await resolveTeamId(workspace, user.team_id)); conditions.push(`${alias}.assigned_team_id = $${params.length}`); }
    } else if (user?.role !== 'super_admin') { params.push(await resolveUserId(workspace, user.id)); conditions.push(`${alias}.assigned_agent_id = $${params.length}`); }
    return { conditions, params };
  }

  function leadRecord(row) {
    const metadata = valueObject(row.metadata);
    return { ...metadata, customer_id: row.linked_customer_id || null, workspace_id: row.workspace_id, id: row.legacy_id || row.id, full_name: row.full_name, email: row.email, phone: row.phone, whatsapp_number: row.whatsapp_number, city: row.city, area: row.area, interested_in: row.interested_in, property_type: row.property_type, budget: row.budget, preferred_location: row.preferred_location, purpose: row.purpose, buying_timeline: row.buying_timeline, financing_required: row.financing_required, status: row.status, lead_source: row.lead_source, priority: row.priority, assigned_agent_id: row.assigned_agent_id_legacy || metadata.assigned_agent_id || null, assigned_agent: row.assigned_agent || metadata.assigned_agent || 'Unassigned', assigned_team_id: row.assigned_team_id_legacy || metadata.assigned_team_id || null, created_by: row.created_by_legacy || metadata.created_by || null, last_activity_at: metadata.last_activity_at || row.updated_at, last_activity_description: metadata.last_activity_description || '', last_activity_by: metadata.last_activity_by || '', last_contacted_at: row.last_contacted_at || metadata.last_contacted_at || null, next_follow_up_at: row.next_follow_up_at !== undefined ? row.next_follow_up_at : metadata.next_follow_up_at, created_at: row.created_at, updated_at: row.updated_at };
  }

  function customerRecord(row) {
    const metadata = valueObject(row.metadata);
    return { ...metadata, workspace_id: row.workspace_id, id: row.legacy_id || row.id, lead_id: row.lead_id_legacy || metadata.lead_id || null, full_name: row.full_name, email: row.email, phone: row.phone, whatsapp_number: row.whatsapp_number, customer_status: row.customer_status, assigned_agent_id: row.assigned_agent_id_legacy || metadata.assigned_agent_id || null, assigned_agent: row.assigned_agent || metadata.assigned_agent || 'Unassigned', assigned_team_id: row.assigned_team_id_legacy || metadata.assigned_team_id || null, created_by: row.created_by_legacy || metadata.created_by || null, last_activity_at: metadata.last_activity_at || row.updated_at, last_activity_description: metadata.last_activity_description || '', last_activity_by: metadata.last_activity_by || '', last_contacted_at: row.last_contacted_at || metadata.last_contacted_at || null, next_follow_up_at: row.next_follow_up_at !== undefined ? row.next_follow_up_at : metadata.next_follow_up_at, created_at: row.created_at, updated_at: row.updated_at };
  }

  function followUpRecord(row) {
    const metadata = valueObject(row.metadata); const parts = localDateParts(row.due_at);
    return { ...metadata, workspace_id: row.workspace_id, id: row.legacy_id || row.id, lead_id: row.lead_id_legacy || metadata.lead_id || null, customer_id: row.customer_id_legacy || metadata.customer_id || null, customer_name: row.customer_name || row.lead_name || metadata.customer_name || metadata.lead_name || null, lead_name: row.lead_name || metadata.lead_name || null, phone: row.customer_phone || row.lead_phone || metadata.phone || metadata.customer_phone || null, customer_phone: row.customer_phone || row.lead_phone || metadata.customer_phone || null, lead_status: row.lead_status || metadata.lead_status || null, follow_up_type: row.follow_up_type, due_date: metadata.due_date || parts.date, due_time: metadata.due_time || parts.time, priority: row.priority, lifecycle_status: row.status, status: displayStatus({ ...metadata, status: row.status, due_date: metadata.due_date || parts.date, due_time: metadata.due_time || parts.time }), last_activity_at: row.relationship_activity_at || metadata.last_activity_at || row.updated_at, last_activity_description: row.relationship_activity_description || metadata.last_activity_description || row.notes || '', last_activity_by: row.relationship_activity_by || metadata.last_activity_by || '', notes: row.notes, completed_at: row.completed_at, assigned_agent_id: row.assigned_agent_id_legacy || metadata.assigned_agent_id || null, assigned_agent: row.assigned_agent || metadata.assigned_agent || 'Unassigned', assigned_team_id: row.assigned_team_id_legacy || metadata.assigned_team_id || null, created_by: row.created_by_legacy || metadata.created_by || null, created_at: row.created_at, updated_at: row.updated_at };
  }

  function taskRecord(row) {
    const metadata = valueObject(row.metadata);
    return {
      ...metadata,
      id: row.legacy_id || row.id,
      title: row.title,
      description: row.description || '',
      status: row.status,
      priority: row.priority,
      due_at: row.due_at,
      completed_at: row.completed_at,
      assigned_to: row.assigned_to_legacy || null,
      assigned_agent_id: row.assigned_to_legacy || null,
      assigned_agent: row.assigned_to_name || 'Unassigned',
      assigned_agent_email: row.assigned_to_email || null,
      assigned_team_id: row.assigned_team_legacy || null,
      created_by: row.created_by_legacy || null,
      created_by_name: row.created_by_name || null,
      lead_id: row.lead_id_legacy || null,
      lead_name: row.lead_name || null,
      customer_id: row.customer_id_legacy || null,
      customer_name: row.customer_name || null,
      follow_up_id: row.follow_up_id_legacy || null,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  const leadSelect = `SELECT l.*, ls.name AS status, src.name AS lead_source,
    (SELECT coalesce(c.legacy_id,c.id::text) FROM crm.customers c WHERE c.lead_id=l.id AND c.workspace_id=l.workspace_id AND c.deleted_at IS NULL
      AND c.assigned_agent_id IS NOT DISTINCT FROM l.assigned_agent_id AND c.assigned_team_id IS NOT DISTINCT FROM l.assigned_team_id LIMIT 1) AS linked_customer_id,
    au.legacy_id AS assigned_agent_id_legacy, au.full_name AS assigned_agent,
    t.legacy_id AS assigned_team_id_legacy, cu.legacy_id AS created_by_legacy
    FROM crm.leads l LEFT JOIN crm.lead_statuses ls ON ls.id = l.status_id
    LEFT JOIN crm.lead_sources src ON src.id = l.source_id LEFT JOIN crm.users au ON au.id = l.assigned_agent_id
    LEFT JOIN crm.teams t ON t.id = l.assigned_team_id LEFT JOIN crm.users cu ON cu.id = l.created_by`;

  async function listLeads({ workspaceId: workspace, user, status, search, source, agentId, imported, allSalesManagerLeads = false }) {
    const scoped = await scope(workspace, user, 'l', { allSalesManagerLeads }); const conditions = [...scoped.conditions]; const params = [...scoped.params];
    if (status) { params.push(status); conditions.push(`ls.name = $${params.length}`); }
    if (source) { params.push(source); conditions.push(`src.name = $${params.length}`); }
    if (agentId) { params.push(await resolveUserId(workspace, agentId)); conditions.push(`l.assigned_agent_id = $${params.length}`); }
    if (search) { params.push(`%${String(search).toLowerCase()}%`); const p = `$${params.length}`; conditions.push(`(lower(l.full_name) LIKE ${p} OR lower(coalesce(l.email, '')) LIKE ${p} OR lower(coalesce(l.phone, '')) LIKE ${p} OR lower(coalesce(l.interested_in, '')) LIKE ${p} OR lower(coalesce(au.full_name, '')) LIKE ${p})`); }
    if (imported === 'true' || imported === 'imported' || imported === 'webhook') conditions.push(`(l.metadata->>'is_imported')::boolean IS TRUE`);
    if (imported === 'unassigned') conditions.push(`(l.metadata->>'is_imported')::boolean IS TRUE AND l.assigned_agent_id IS NULL`);
    if (imported === 'webhook') conditions.push(`l.metadata->>'webhook_connection_id' IS NOT NULL`);
    const rows = await sql.query(`${leadSelect} WHERE ${conditions.join(' AND ')} ORDER BY l.created_at DESC`, params); return rows.map(leadRecord);
  }

  async function findLeadDuplicate(workspace, { phone = '', email = '' } = {}) {
    const conditions = ['l.workspace_id = $1', 'l.deleted_at IS NULL']; const params = [workspace]; const matches = [];
    if (phone) { params.push(phone); matches.push(`regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') = regexp_replace($${params.length}, '[^0-9]', '', 'g')`); }
    if (email) { params.push(String(email).toLowerCase()); matches.push(`lower(coalesce(l.email, '')) = $${params.length}`); }
    if (!matches.length) return null;
    conditions.push(`(${matches.join(' OR ')})`);
    const rows = await sql.query(`${leadSelect} WHERE ${conditions.join(' AND ')} ORDER BY l.created_at DESC LIMIT 1`, params);
    return rows[0] ? leadRecord(rows[0]) : null;
  }

  async function getLead(workspace, identifier) { const id = await resolveLeadId(workspace, identifier); if (!id) return null; const rows = await sql.query(`${leadSelect} WHERE l.id = $1 LIMIT 1`, [id]); return rows[0] ? leadRecord(rows[0]) : null; }

  async function listLeadActivities(workspace, identifier) { const id = await resolveLeadId(workspace, identifier); if (!id) return []; return sql.query(`SELECT a.id, a.activity_type, a.description, u.legacy_id AS user_id, a.created_at FROM crm.lead_activities a LEFT JOIN crm.users u ON u.id = a.actor_user_id WHERE a.lead_id = $1 ORDER BY a.created_at DESC`, [id]); }

  async function insertAudit(workspace, actor, action, entityType, entityId, afterData = {}) { await sql.query('INSERT INTO crm.audit_events (workspace_id, actor_user_id, action, entity_type, entity_id, after_data) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [workspace, await resolveUserId(workspace, actor?.id || actor), action, entityType, entityId || null, JSON.stringify(afterData)]); }
  async function enqueueOutbox(workspace, eventType, aggregateType, aggregateId, payload, idempotencyKey) { await sql.query(`INSERT INTO crm.outbox_events (workspace_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key) VALUES ($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT (idempotency_key) DO NOTHING`, [workspace,eventType,aggregateType,aggregateId,JSON.stringify(payload||{}),idempotencyKey||`${eventType}:${aggregateId}:${Date.now()}`]); }

  async function syncLeadFollowUpTag(workspace, actor, lead) {
    try {
    if (!lead?.id) return;
    const tags = normalizeTags(lead.tags).map(item => item.toLowerCase());
    const tagged = tags.includes('follow-up needed');
    const leadId = await resolveLeadId(workspace, lead.id);
    if (!leadId) return;
    const existing = await sql.query(`SELECT id, legacy_id, customer_id FROM crm.follow_ups WHERE workspace_id=$1 AND lead_id=$2 AND deleted_at IS NULL AND (status IN ('Pending','Overdue','Rescheduled','Missed') OR metadata->>'source'='follow-up-tag') ORDER BY CASE WHEN status IN ('Pending','Overdue','Rescheduled','Missed') THEN 0 ELSE 1 END, created_at ASC LIMIT 1`, [workspace, leadId]);
    if (!tagged) return;
      const customer = await convertLeadToCustomer(workspace, lead.id, actor);
      const customerId = await resolveCustomerId(workspace, customer?.id);
      if (existing[0]) {
        if (!existing[0].customer_id && customerId) await sql.query('UPDATE crm.follow_ups SET customer_id=$1, updated_at=now() WHERE id=$2', [customerId, existing[0].id]);
        return;
      }
      const assignedAgentId = await resolveUserId(workspace, lead.assigned_agent_id || actor?.id);
      if (!assignedAgentId) return;
    const scheduled = timestampValue(lead.next_follow_up_at);
    const parts = scheduled ? localDateParts(scheduled) : localDateParts(new Date(Date.now() + 86400000));
    await createFollowUp(workspace, actor, {
      id: `followup_tag_${lead.id}`,
      lead_id: lead.id,
        customer_id: customerId,
      assigned_agent_id: lead.assigned_agent_id || actor.id,
      follow_up_type: 'General Follow-up',
      due_date: parts.date,
      due_time: parts.time || '10:00',
      priority: lead.priority || 'Medium',
      notes: 'Created automatically from the Follow-up Needed tag.',
      source: 'follow-up-tag'
    });
    } catch (error) {
      console.warn('Unable to sync Follow-up Needed tag:', error.message);
    }
  }

  async function createLead({ workspaceId: workspace, actor, lead }) {
    const legacyId = lead.legacy_id || `lead_${crypto.randomUUID()}`; const actorId = await resolveUserId(workspace, actor.id); const agentId = await resolveUserId(workspace, lead.assigned_agent_id); const teamId = await resolveTeamId(workspace, lead.assigned_team_id || actor.team_id);
    const statusRows = await sql.query('SELECT id FROM crm.lead_statuses WHERE workspace_id = $1 AND (name = $2 OR is_default = true) ORDER BY (name = $2) DESC LIMIT 1', [workspace, lead.status || 'New']); const sourceRows = await sql.query('SELECT id FROM crm.lead_sources WHERE workspace_id = $1 AND (name = $2 OR is_default = true) ORDER BY (name = $2) DESC LIMIT 1', [workspace, lead.lead_source || 'Manual Entry']);
    const rows = await sql.query(`INSERT INTO crm.leads (workspace_id, legacy_id, full_name, email, phone, whatsapp_number, city, area, interested_in, property_type, budget, preferred_location, purpose, buying_timeline, financing_required, status_id, source_id, priority, assigned_agent_id, assigned_team_id, created_by, external_source, external_lead_id, idempotency_key, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb) RETURNING id`, [workspace, legacyId, lead.full_name, lead.email || null, lead.phone || null, lead.whatsapp_number || null, lead.city || null, lead.area || null, lead.interested_in || null, lead.property_type || null, lead.budget || null, lead.preferred_location || null, lead.purpose || null, lead.buying_timeline || null, Boolean(lead.financing_required), statusRows[0]?.id || null, sourceRows[0]?.id || null, lead.priority || 'Medium', agentId, teamId, actorId, lead.external_source || null, lead.external_lead_id || null, lead.idempotency_key || legacyId, JSON.stringify(lead)]);
    const leadId = rows[0].id; if (lead.next_follow_up_at) await sql.query('UPDATE crm.leads SET next_follow_up_at=$1 WHERE id=$2',[timestampValue(lead.next_follow_up_at),leadId]); await insertAudit(workspace, actor, 'lead_created', 'lead', leadId, { legacy_id: legacyId, full_name: lead.full_name }); await enqueueOutbox(workspace,'lead_created','lead',leadId,{legacy_id:legacyId},`lead_created:${legacyId}`); const created = await getLead(workspace, legacyId); await syncLeadFollowUpTag(workspace, actor, created); return created;
  }

  async function updateLead(workspace, identifier, actor, patch) {
    const id = await resolveLeadId(workspace, identifier); if (!id) return null; const current = await getLead(workspace, identifier); const fields = []; const params = []; const assign = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`); };
    for (const column of ['full_name', 'phone', 'whatsapp_number', 'email', 'city', 'area', 'interested_in', 'property_type', 'budget', 'preferred_location', 'purpose', 'buying_timeline', 'priority']) if (patch[column] !== undefined) assign(column, patch[column]);
    if (patch.financing_required !== undefined) assign('financing_required', Boolean(patch.financing_required));
    if (patch.status !== undefined) { const rows = await sql.query('SELECT id FROM crm.lead_statuses WHERE workspace_id = $1 AND name = $2 LIMIT 1', [workspace, patch.status]); assign('status_id', rows[0]?.id || null); }
    if (patch.lead_source !== undefined) { const rows = await sql.query('SELECT id FROM crm.lead_sources WHERE workspace_id = $1 AND name = $2 LIMIT 1', [workspace, patch.lead_source]); assign('source_id', rows[0]?.id || null); }
    if (patch.next_follow_up_at !== undefined) assign('next_follow_up_at', timestampValue(patch.next_follow_up_at));
    if (patch.tags !== undefined) assign('metadata', JSON.stringify({ ...valueObject(current), tags: normalizeTags(patch.tags) }));
    if (fields.length) { params.push(id); await sql.query(`UPDATE crm.leads SET ${fields.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params); }
    await pipeline.recordActivity(workspace, actor, { leadId: id, type: patch.tags !== undefined ? 'Tags updated' : 'Lead updated', description: patch.tags !== undefined ? `Tags: ${normalizeTags(patch.tags).join(', ') || 'None'}` : 'Lead details updated.' }); await insertAudit(workspace, actor, 'lead_updated', 'lead', id, patch); await enqueueOutbox(workspace,'lead_updated','lead',id,patch); const updated = await getLead(workspace, identifier); if (patch.tags !== undefined || patch.next_follow_up_at !== undefined) await syncLeadFollowUpTag(workspace, actor, updated); return updated;
  }

  async function deleteLead(workspace, identifier, actor) {
    const id = await resolveLeadId(workspace, identifier);
    if (!id) return null;
    const rows = await sql.query('UPDATE crm.leads SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id, legacy_id', [id]);
    if (!rows[0]) return null;
    await insertAudit(workspace, actor, 'lead_deleted', 'lead', id, { legacy_id: rows[0].legacy_id });
    await enqueueOutbox(workspace, 'lead_deleted', 'lead', id, { legacy_id: rows[0].legacy_id });
    return { id: rows[0].legacy_id || rows[0].id };
  }

  async function assignLead(workspace, identifier, actor, assignedAgent) {
    const lead = await getLead(workspace,identifier);
    const agent = await findUser(workspace,assignedAgent);
    if (!lead || !canViewOwnedRecord(actor,lead) || !['super_admin','sales_manager'].includes(actor.role)
      || !agent || agent.status !== 'active' || !['sales_agent','sales_manager'].includes(agent.role)
      || (actor.role === 'sales_manager' && agent.team_id !== actor.team_id)) return null;
    const id = await resolveLeadId(workspace,identifier);
    const agentId = await resolveUserId(workspace,assignedAgent);
    const teamId = await resolveTeamId(workspace,agent.team_id);
    const previousAgentId = await resolveUserId(workspace,lead.assigned_agent_id);
    const previousTeamId = await resolveTeamId(workspace,lead.assigned_team_id);
    // Move the complete customer relationship in a single PostgreSQL statement.
    await sql.query(`WITH moved_lead AS (
      UPDATE crm.leads SET assigned_agent_id=$1,assigned_team_id=$2,updated_at=now()
      WHERE id=$3 AND workspace_id=$4 RETURNING id
    ), moved_customers AS (
      UPDATE crm.customers SET assigned_agent_id=$1,assigned_team_id=$2,updated_at=now()
      WHERE workspace_id=$4 AND lead_id IN (SELECT id FROM moved_lead) RETURNING id
    ) UPDATE crm.follow_ups SET assigned_agent_id=$1,assigned_team_id=$2,updated_at=now()
      WHERE workspace_id=$4 AND assigned_agent_id=$5 AND assigned_team_id IS NOT DISTINCT FROM $6::uuid
        AND ((customer_id IN (SELECT id FROM moved_customers) AND (lead_id IS NULL OR lead_id=$3))
        OR (customer_id IS NULL AND lead_id IN (SELECT id FROM moved_lead)))`, [agentId,teamId,id,workspace,previousAgentId,previousTeamId]);
    await pipeline.recordActivity(workspace,actor,{leadId:id,type:'Lead assigned',description:`Assigned to ${agent.full_name}.`});
    await insertAudit(workspace,actor,'lead_assigned','lead',id,{assigned_agent_id:assignedAgent});
    await enqueueOutbox(workspace,'lead_assigned','lead',id,{assigned_agent_id:assignedAgent});
    const updated = await getLead(workspace,identifier);
    await syncLeadFollowUpTag(workspace,actor,updated);
    return updated;
  }

  async function changeLeadStatus(workspace, identifier, actor, status, priority) { const id = await resolveLeadId(workspace, identifier); if (!id) return null; const rows = await sql.query('SELECT id FROM crm.lead_statuses WHERE workspace_id = $1 AND name = $2 LIMIT 1', [workspace, status]); if (!rows[0]) return null; const current = await sql.query('SELECT status_id FROM crm.leads WHERE id = $1', [id]); await sql.query('UPDATE crm.leads SET status_id = $1, priority = coalesce($2, priority), updated_at = now() WHERE id = $3', [rows[0].id, priority || null, id]); await sql.query('INSERT INTO crm.lead_status_history (lead_id, from_status_id, to_status_id, changed_by) VALUES ($1,$2,$3,$4)', [id, current[0]?.status_id || null, rows[0].id, await resolveUserId(workspace, actor.id)]); await pipeline.recordActivity(workspace,actor,{leadId:id,type:'Status changed',description:`Lead status changed to ${status}.`}); await insertAudit(workspace, actor, 'lead_status_changed', 'lead', id, { status, priority }); await enqueueOutbox(workspace,'lead_status_changed','lead',id,{status,priority}); return getLead(workspace, identifier); }

  async function addLeadActivity(workspace, identifier, actor, activityType, description, metadata = {}) {
    const id = await resolveLeadId(workspace, identifier); if (!id) return null;
    if (activityType === 'Note added') {
      const plan = notePlan(metadata.note_input || {});
      if (plan.contacted && plan.schedule) await convertLeadToCustomer(workspace,identifier,actor);
      return pipeline.saveNote(workspace,actor,{leadId:id,note:description,plan});
    }
    return pipeline.recordActivity(workspace,actor,{leadId:id,type:activityType,description,metadata});
  }

  async function convertLeadToCustomer(workspace, identifier, actor) { const lead = await getLead(workspace, identifier); if (!lead) return null; const leadId = await resolveLeadId(workspace, identifier); const existing = await sql.query('SELECT id, legacy_id FROM crm.customers WHERE lead_id = $1 AND deleted_at IS NULL LIMIT 1', [leadId]); if (existing[0]) return getCustomer(workspace, existing[0].legacy_id || existing[0].id); const legacyId = `customer_${crypto.randomUUID()}`; await sql.query(`INSERT INTO crm.customers (workspace_id, legacy_id, lead_id, full_name, email, phone, whatsapp_number, customer_status, assigned_agent_id, assigned_team_id, created_by, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`, [workspace, legacyId, leadId, lead.full_name, lead.email || null, lead.phone || null, lead.whatsapp_number || null, lead.status === 'Closed Won' ? 'Closed Won' : lead.status === 'Hot' ? 'Hot' : lead.status === 'Follow-up' ? 'Follow-up' : 'Active', await resolveUserId(workspace, lead.assigned_agent_id), await resolveTeamId(workspace, lead.assigned_team_id), await resolveUserId(workspace, actor.id), JSON.stringify(lead)]); const customerId=await resolveCustomerId(workspace,legacyId); await insertAudit(workspace, actor, 'lead_converted', 'lead', leadId, { customer_legacy_id: legacyId }); await enqueueOutbox(workspace,'customer_created','customer',customerId,{legacy_id:legacyId,lead_id:identifier}); return getCustomer(workspace, legacyId); }

  const customerSelect = `SELECT c.*, l.legacy_id AS lead_id_legacy, au.legacy_id AS assigned_agent_id_legacy, au.full_name AS assigned_agent, t.legacy_id AS assigned_team_id_legacy, cu.legacy_id AS created_by_legacy FROM crm.customers c LEFT JOIN crm.leads l ON l.id = c.lead_id LEFT JOIN crm.users au ON au.id = c.assigned_agent_id LEFT JOIN crm.teams t ON t.id = c.assigned_team_id LEFT JOIN crm.users cu ON cu.id = c.created_by`;

  async function createCustomerFromLead(workspace, identifier, actor, input = {}) {
    const lead = await getLead(workspace, identifier);
    if (!lead || !canViewOwnedRecord(actor, lead)) throw new Error('Lead is outside your ownership scope.');
    const plan = customerCreationPlan(input, lead);
    const leadId = await resolveLeadId(workspace, identifier);
    const result = await insertLeadCustomer(sql, { workspace, lead, leadId, actor, plan,
      actorId: await resolveUserId(workspace, actor.id), teamId: await resolveTeamId(workspace, actor.team_id) });
    const existing = result ? null : (await sql.query('SELECT coalesce(legacy_id,id::text) AS id FROM crm.customers WHERE workspace_id=$1 AND lead_id=$2 AND deleted_at IS NULL', [workspace, leadId]))[0];
    const customer = await getCustomer(workspace, result?.customer_id || existing?.id);
    if (!customer || !canViewOwnedRecord(actor, customer)) throw new Error('The linked customer is unavailable in your scope.');
    return { customer, created: Boolean(result), follow_up_id: result?.follow_up_id || null };
  }

  async function listCustomers({ workspaceId: workspace, user, status, source, search }) { const scoped = await scope(workspace, user, 'c'); const conditions = [...scoped.conditions]; const params = [...scoped.params]; if (status) { params.push(status); conditions.push(`c.customer_status = $${params.length}`); } if (source) { params.push(source); conditions.push(`coalesce(c.metadata->>'lead_source','') = $${params.length}`); } if (search) { params.push(`%${String(search).toLowerCase()}%`); const p = `$${params.length}`; conditions.push(`(lower(c.full_name) LIKE ${p} OR lower(coalesce(c.email,'')) LIKE ${p} OR lower(coalesce(c.phone,'')) LIKE ${p} OR lower(coalesce(c.metadata->>'city','')) LIKE ${p})`); } const rows = await sql.query(`${customerSelect} WHERE ${conditions.join(' AND ')} ORDER BY c.created_at DESC`, params); return rows.map(customerRecord); }
  async function getCustomer(workspace, identifier) { const id = await resolveCustomerId(workspace, identifier); if (!id) return null; const rows = await sql.query(`${customerSelect} WHERE c.id = $1 AND c.deleted_at IS NULL LIMIT 1`, [id]); return rows[0] ? customerRecord(rows[0]) : null; }
  async function updateCustomer(workspace, identifier, actor, patch) { const id = await resolveCustomerId(workspace, identifier); if (!id) return null; const current = await getCustomer(workspace, identifier); const fields=[]; const params=[]; const assign=(column,value)=>{params.push(value);fields.push(`${column} = $${params.length}`)}; for(const column of ['full_name','phone','whatsapp_number','email']) if(patch[column]!==undefined)assign(column,patch[column]); if(patch.customer_status!==undefined)assign('customer_status',patch.customer_status); if(Object.keys(patch).some(key=>!['full_name','phone','whatsapp_number','email','customer_status'].includes(key))) { const metadata = { ...valueObject(current), ...patch }; if (patch.tags !== undefined) metadata.tags = normalizeTags(patch.tags); assign('metadata',JSON.stringify(metadata)); } if(fields.length){params.push(id);await sql.query(`UPDATE crm.customers SET ${fields.join(',')},updated_at=now() WHERE id=$${params.length}`,params)} await pipeline.recordActivity(workspace,actor,{customerId:id,type:patch.tags !== undefined ? 'Tags updated' : 'Customer updated',description:patch.tags !== undefined ? `Tags: ${normalizeTags(patch.tags).join(', ') || 'None'}` : 'Customer details updated.'}); await insertAudit(workspace,actor,'customer_updated','customer',id,patch); return getCustomer(workspace,identifier); }
  async function deleteCustomer(workspace, identifier, actor) { const id = await resolveCustomerId(workspace, identifier); if (!id) return null; const rows = await sql.query('UPDATE crm.customers SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id, legacy_id', [id]); if (!rows[0]) return null; await insertAudit(workspace, actor, 'customer_deleted', 'customer', id, { legacy_id: rows[0].legacy_id }); return { id: rows[0].legacy_id || rows[0].id }; }
  async function changeCustomerStatus(workspace, identifier, actor, status) { const id=await resolveCustomerId(workspace,identifier); if(!id)return null; const old=await sql.query('SELECT customer_status FROM crm.customers WHERE id=$1',[id]); await sql.query('UPDATE crm.customers SET customer_status=$1,updated_at=now() WHERE id=$2',[status,id]); await sql.query('INSERT INTO crm.customer_status_history (customer_id,from_status,to_status,changed_by) VALUES ($1,$2,$3,$4)',[id,old[0]?.customer_status||null,status,await resolveUserId(workspace,actor.id)]); await pipeline.recordActivity(workspace,actor,{customerId:id,type:'Status changed',description:`Customer status changed to ${status}.`}); await insertAudit(workspace,actor,'customer_status_changed','customer',id,{status}); await enqueueOutbox(workspace,'customer_status_changed','customer',id,{status}); return getCustomer(workspace,identifier); }
  async function listCustomerNotes(workspace, identifier) { const id=await resolveCustomerId(workspace,identifier); if(!id)return[]; return sql.query(`SELECT n.id,n.note,u.legacy_id AS user_id,u.full_name AS user_name,n.created_at FROM crm.customer_notes n LEFT JOIN crm.users u ON u.id=n.author_user_id WHERE n.customer_id=$1 AND n.deleted_at IS NULL ORDER BY n.created_at DESC`,[id]); }
  async function addCustomerNote(workspace, identifier, actor, note, input = {}) {
    const id = await resolveCustomerId(workspace,identifier); if (!id) return null;
    return pipeline.saveNote(workspace,actor,{customerId:id,note,plan:notePlan(input)});
  }

  async function addFollowUpNote(workspace, identifier, actor, note, input = {}) {
    const item = await getFollowUp(workspace,identifier); if (!item) return null;
    const plan = notePlan(input);
    if (plan.contacted && ['Completed','Cancelled'].includes(item.lifecycle_status)) throw new Error('This follow-up is closed. Schedule a new follow-up from the customer profile.');
    await pipeline.saveNote(workspace,actor,{leadId:await resolveLeadId(workspace,item.lead_id),customerId:await resolveCustomerId(workspace,item.customer_id),followUpId:await resolveFollowUpId(workspace,identifier),note,plan});
    return getFollowUp(workspace,identifier);
  }

  async function listCustomerActivities(workspace, identifier) { const id=await resolveCustomerId(workspace,identifier); if(!id)return[]; return sql.query(`SELECT a.id,a.activity_type,a.description,u.legacy_id AS user_id,u.full_name AS user_name,a.created_at FROM crm.customer_activities a LEFT JOIN crm.users u ON u.id=a.actor_user_id WHERE a.customer_id=$1 ORDER BY a.created_at DESC`,[id]); }

  // Reminder ownership alone is insufficient: it must still match a real,
  // active customer in the same workspace. Never use imported metadata as a
  // substitute for a missing relationship or owner.
  const followUpSelect = `SELECT f.*,
    coalesce(c.metadata->>'last_activity_at',l.metadata->>'last_activity_at') AS relationship_activity_at,
    coalesce(c.metadata->>'last_activity_description',l.metadata->>'last_activity_description') AS relationship_activity_description,
    coalesce(c.metadata->>'last_activity_by',l.metadata->>'last_activity_by') AS relationship_activity_by,
    coalesce(l.legacy_id,l.id::text) AS lead_id_legacy,l.full_name AS lead_name,l.phone AS lead_phone,ls.name AS lead_status,
    coalesce(c.legacy_id,c.id::text) AS customer_id_legacy,c.full_name AS customer_name,c.phone AS customer_phone,
    coalesce(au.legacy_id,au.id::text) AS assigned_agent_id_legacy,au.full_name AS assigned_agent,
    coalesce(t.legacy_id,t.id::text) AS assigned_team_id_legacy,cu.legacy_id AS created_by_legacy
    FROM crm.follow_ups f
    JOIN crm.customers c ON c.workspace_id=f.workspace_id AND c.deleted_at IS NULL
      AND (c.id=f.customer_id OR (f.customer_id IS NULL AND c.lead_id=f.lead_id))
      AND (f.lead_id IS NULL OR f.lead_id=c.lead_id)
      AND c.assigned_agent_id=f.assigned_agent_id
      AND c.assigned_team_id IS NOT DISTINCT FROM f.assigned_team_id
    JOIN crm.leads l ON l.id=c.lead_id AND l.workspace_id=c.workspace_id AND l.deleted_at IS NULL
      AND l.assigned_agent_id=c.assigned_agent_id AND l.assigned_team_id IS NOT DISTINCT FROM c.assigned_team_id
    LEFT JOIN crm.lead_statuses ls ON ls.id=l.status_id AND ls.workspace_id=f.workspace_id
    JOIN crm.users au ON au.id=f.assigned_agent_id AND au.workspace_id=f.workspace_id AND au.deleted_at IS NULL
    LEFT JOIN crm.teams t ON t.id=f.assigned_team_id AND t.workspace_id=f.workspace_id
    LEFT JOIN crm.users cu ON cu.id=f.created_by AND cu.workspace_id=f.workspace_id`;

  async function listFollowUps({ workspaceId: workspace, user, includeCompleted = true, customerId }) {
    if (!user || (user.workspace_id && user.workspace_id !== workspace)) return [];
    const { conditions, params } = await scope(workspace, user, 'f');
    if (customerId) {
      params.push(await resolveCustomerId(workspace, customerId));
      conditions.push(`c.id=$${params.length}`);
    }
    if (!includeCompleted) conditions.push("f.status NOT IN ('Completed','Cancelled')");
    const rows = await sql.query(`${followUpSelect} WHERE ${conditions.join(' AND ')} ORDER BY f.due_at ASC`, params);
    const records = uniqueFollowUps(rows.map(followUpRecord));
    for (const record of records) {
      if (['Completed','Cancelled'].includes(record.lifecycle_status)) continue;
      const row = rows.find(item => (item.legacy_id || item.id) === record.id);
      await createFollowUpNotification(workspace, row.id, row.assigned_agent_id, record.status === 'Overdue' ? 'follow_up_overdue' : 'follow_up_due', record);
    }
    return records;
  }

  async function getFollowUp(workspace, identifier) {
    const id = await resolveFollowUpId(workspace, identifier);
    if (!id) return null;
    const rows = await sql.query(`${followUpSelect} WHERE f.id=$1 AND f.workspace_id=$2 AND f.deleted_at IS NULL LIMIT 1`, [id, workspace]);
    return rows[0] ? followUpRecord(rows[0]) : null;
  }

  async function createFollowUpNotification(workspace, followUpId, assignedAgentId, eventKey, followUp) {
    const userId = await resolveUserId(workspace, assignedAgentId); if (!userId || !followUpId) return;
    const definition = await sql.query('SELECT event_name FROM crm.notification_definitions WHERE event_key=$1 LIMIT 1', [eventKey]); if (!definition[0]) return;
    const setting = await sql.query('SELECT in_app_enabled FROM crm.notification_settings WHERE user_id=$1 AND event_key=$2 LIMIT 1', [userId, eventKey]); if (setting[0] && setting[0].in_app_enabled === false) return;
    const personal = await sql.query("SELECT preference_value->>$2 AS enabled FROM crm.user_preferences WHERE user_id=$1 AND preference_key='notifications' LIMIT 1", [userId, eventKey]); if (personal[0]?.enabled === 'false') return;
    const customer = followUp?.customer_name || followUp?.lead_name || 'Customer';
    const type = followUp?.follow_up_type || 'Follow-up';
    const due = followUp?.due_date ? ` due ${followUp.due_date}${followUp.due_time ? ` at ${followUp.due_time}` : ''}` : '';
    const copy = eventKey === 'follow_up_overdue' ? `${customer} — ${type} is overdue.` : eventKey === 'follow_up_completed' ? `${customer} — ${type} was completed.` : `${customer} — ${type} scheduled${due}.`;
    const title = eventKey === 'follow_up_overdue' ? 'Follow-up overdue' : eventKey === 'follow_up_completed' ? 'Follow-up completed' : 'Follow-up scheduled';
    await sql.query(`INSERT INTO crm.notifications (user_id,event_key,title,message,related_entity_type,related_entity_id,dedupe_key) VALUES ($1,$2,$3,$4,'follow_up',$5,$6) ON CONFLICT (user_id,dedupe_key) DO NOTHING`, [userId, eventKey, title, copy, followUpId, `${eventKey}:${followUpId}:${followUp?.due_date}:${followUp?.due_time}`]);
  }

  async function createFollowUp(workspace, actor, input) {
    if (!actor || (actor.workspace_id && actor.workspace_id !== workspace)) return null;
    let customer = input.customer_id ? await getCustomer(workspace, input.customer_id) : null;
    const lead = input.lead_id ? await getLead(workspace, input.lead_id) : null;
    if ((input.customer_id && !customer) || (input.lead_id && !lead)) return null;
    if (customer && lead && customer.lead_id !== lead.id) return null;
    const parent = customer || lead;
    if (!canViewOwnedRecord(actor, parent) || !parent.assigned_agent_id) return null;
    if (input.assigned_agent_id && input.assigned_agent_id !== parent.assigned_agent_id) return null;
    const agent = await findUser(workspace, parent.assigned_agent_id);
    if (!agent || agent.status !== 'active' || !['sales_agent','sales_manager'].includes(agent.role)) return null;
    if (!customer) customer = await convertLeadToCustomer(workspace, lead.id, actor);
    if (!customer || customer.assigned_agent_id !== parent.assigned_agent_id) return null;
    const customerId = await resolveCustomerId(workspace, customer.id);
    const leadId = await resolveLeadId(workspace, customer.lead_id);
    const agentId = await resolveUserId(workspace, customer.assigned_agent_id);
    const teamId = await resolveTeamId(workspace, customer.assigned_team_id);
    const existing = await sql.query(`SELECT id,legacy_id FROM crm.follow_ups
      WHERE workspace_id=$1 AND deleted_at IS NULL AND (customer_id=$3 OR (customer_id IS NULL AND lead_id=$2))
      AND (lead_id IS NULL OR lead_id=$2) AND assigned_agent_id=$4 AND assigned_team_id IS NOT DISTINCT FROM $5::uuid
      AND metadata->>'consolidated_into' IS NULL
      ORDER BY CASE WHEN status IN ('Completed','Cancelled') THEN 1 ELSE 0 END,due_at,created_at LIMIT 1`, [workspace,leadId,customerId,agentId,teamId]);
    if (existing[0]) {
      await updateFollowUp(workspace,existing[0].legacy_id || existing[0].id,actor,{...input,reopen:true});
      await pipeline.consolidate(workspace,actor,existing[0].id);
      return getFollowUp(workspace,existing[0].legacy_id || existing[0].id);
    }
    // All creation routes use this key, so concurrent saves share the existing unique constraint.
    const legacyId = `followup_customer_${customerId}`;
    const dueAt = timestampValue(`${input.due_date}T${input.due_time}:00+05:00`);
    await sql.query(`INSERT INTO crm.follow_ups (workspace_id,legacy_id,lead_id,customer_id,assigned_agent_id,assigned_team_id,follow_up_type,due_at,priority,status,notes,metadata,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Pending',$10,$11::jsonb,$12)
      ON CONFLICT (workspace_id,legacy_id) DO UPDATE SET due_at=EXCLUDED.due_at,status='Rescheduled',completed_at=NULL,deleted_at=NULL,
        assigned_agent_id=EXCLUDED.assigned_agent_id,assigned_team_id=EXCLUDED.assigned_team_id,
        notes=EXCLUDED.notes,follow_up_type=EXCLUDED.follow_up_type,priority=EXCLUDED.priority,updated_at=now(),
        metadata=crm.follow_ups.metadata || EXCLUDED.metadata || jsonb_build_object('reschedule_history',
          coalesce(crm.follow_ups.metadata->'reschedule_history','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'fromDate',to_char(crm.follow_ups.due_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD'),
            'fromTime',to_char(crm.follow_ups.due_at AT TIME ZONE 'Asia/Karachi','HH24:MI'),
            'toDate',EXCLUDED.metadata->>'due_date','toTime',EXCLUDED.metadata->>'due_time','reason','Schedule updated.','createdAt',now())))`,
      [workspace,legacyId,leadId,customerId,agentId,teamId,input.follow_up_type || input.type || 'General Follow-up',dueAt,input.priority || 'Medium',input.notes || input.note || null,JSON.stringify(input),await resolveUserId(workspace,actor.id)]);
    const followUpId = await resolveFollowUpId(workspace,legacyId);
    await pipeline.consolidate(workspace,actor,followUpId);
    await insertAudit(workspace,actor,'follow_up_created','follow_up',followUpId,input);
    await enqueueOutbox(workspace,'follow_up_created','follow_up',followUpId,{legacy_id:legacyId});
    await pipeline.recordActivity(workspace,actor,{leadId,customerId,type:'Follow-up scheduled',description:input.notes || `Next contact: ${input.due_date} at ${input.due_time}.`});
    await pipeline.refreshNextAction(workspace,leadId,customerId);
    const created = await getFollowUp(workspace,legacyId);
    await createFollowUpNotification(workspace,followUpId,agentId,'follow_up_due',created);
    return created;
  }

  async function updateFollowUp(workspace, identifier, actor, patch) {
    const id=await resolveFollowUpId(workspace,identifier); if(!id)return null;
    const current=await getFollowUp(workspace,identifier); if (!current || !canViewOwnedRecord(actor,current)) return null;
    const fields=[];const params=[];const assign=(column,value)=>{params.push(value);fields.push(`${column}=$${params.length}`)};
    const metadata={ ...current };
    if(patch.follow_up_type!==undefined)assign('follow_up_type',patch.follow_up_type);
    if(patch.due_date!==undefined||patch.due_time!==undefined){
      metadata.due_date=patch.due_date||current.due_date; metadata.due_time=patch.due_time||current.due_time;
      const dueAt=new Date(`${metadata.due_date}T${metadata.due_time}:00+05:00`).toISOString();
      assign('due_at',dueAt);
      if(patch.reopen || !['Completed','Cancelled'].includes(current.lifecycle_status))assign('status','Rescheduled');
      if(patch.reopen)assign('completed_at',null);
      const history={fromDate:current.due_date,fromTime:current.due_time,toDate:metadata.due_date,toTime:metadata.due_time,reason:patch.reason||'Schedule updated.',createdAt:new Date().toISOString(),changedBy:actor.id};
      metadata.reschedule_history=[...(current.reschedule_history||[]),history];metadata.rescheduled_from_date=current.due_date;metadata.reschedule_reason=history.reason;
    }
    if(patch.priority!==undefined)assign('priority',patch.priority);
    if(patch.notes!==undefined)assign('notes',patch.notes);
    const summary=activitySummary('Follow-up updated',patch.notes||patch.reason||'Follow-up details updated.',actor);
    assign('metadata',JSON.stringify({...metadata,...summary}));
    params.push(id);await sql.query(`UPDATE crm.follow_ups SET ${fields.join(',')},updated_at=now() WHERE id=$${params.length}`,params);
    await sql.query('INSERT INTO crm.follow_up_activities (follow_up_id,actor_user_id,activity_type,description) VALUES ($1,$2,$3,$4)',[id,await resolveUserId(workspace,actor.id),'Follow-up updated',summary.last_activity_description]);
    await pipeline.recordActivity(workspace,actor,{leadId:await resolveLeadId(workspace,current.lead_id),customerId:await resolveCustomerId(workspace,current.customer_id),type:summary.last_activity_type,description:summary.last_activity_description});
    await pipeline.refreshNextAction(workspace,await resolveLeadId(workspace,current.lead_id),await resolveCustomerId(workspace,current.customer_id));
    await sql.query("UPDATE crm.notifications SET is_read=true WHERE related_entity_id=$1 AND event_key='follow_up_overdue'",[id]);
    await insertAudit(workspace,actor,'follow_up_updated','follow_up',id,patch);return getFollowUp(workspace,identifier);
  }

  async function deleteFollowUp(workspace, identifier, actor) { const id=await resolveFollowUpId(workspace, identifier); if (!id) return null; const rows = await sql.query('UPDATE crm.follow_ups SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id, legacy_id', [id]); if (!rows[0]) return null; await insertAudit(workspace, actor, 'follow_up_deleted', 'follow_up', id, { legacy_id: rows[0].legacy_id }); return { id: rows[0].legacy_id || rows[0].id }; }
  async function transitionFollowUp(workspace, identifier, actor, status, patch={}) { const id=await resolveFollowUpId(workspace,identifier);if(!id)return null;const actorId=await resolveUserId(workspace,actor.id);const old=await sql.query('SELECT status,assigned_agent_id FROM crm.follow_ups WHERE id=$1',[id]);await sql.query('UPDATE crm.follow_ups SET status=$1,completed_at=$2,notes=coalesce($3,notes),updated_at=now() WHERE id=$4',[status,status==='Completed'?new Date().toISOString():null,patch.completion_note||patch.note||null,id]);await sql.query('INSERT INTO crm.follow_up_status_history (follow_up_id,from_status,to_status,changed_by) VALUES ($1,$2,$3,$4)',[id,old[0]?.status||null,status,actorId]);await sql.query('INSERT INTO crm.follow_up_activities (follow_up_id,actor_user_id,activity_type,description,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)',[id,actorId,`Follow-up ${status.toLowerCase()}`,patch.reason||patch.note||`Follow-up marked as ${status}.`,JSON.stringify(patch)]);await enqueueOutbox(workspace,'follow_up_status_changed','follow_up',id,{status});const item = await getFollowUp(workspace,identifier); const lid=await resolveLeadId(workspace,item.lead_id); const cid=await resolveCustomerId(workspace,item.customer_id); await pipeline.recordActivity(workspace,actor,{leadId:lid,customerId:cid,type:`Follow-up ${status.toLowerCase()}`,description:patch.completion_note||patch.reason||patch.note||`Follow-up marked ${status}.`}); await pipeline.refreshNextAction(workspace,lid,cid); await sql.query("UPDATE crm.notifications SET is_read=true WHERE related_entity_id=$1 AND event_key='follow_up_overdue'",[id]); const updated = await getFollowUp(workspace,identifier);if(status==='Completed') await createFollowUpNotification(workspace,id,old[0]?.assigned_agent_id,'follow_up_completed',updated);return updated; }
  async function listFollowUpActivities(workspace, identifier) { const id=await resolveFollowUpId(workspace,identifier);if(!id)return[];return sql.query(`SELECT a.id,a.activity_type,a.description,u.legacy_id AS user_id,u.full_name AS user_name,a.created_at FROM crm.follow_up_activities a LEFT JOIN crm.users u ON u.id=a.actor_user_id WHERE a.follow_up_id=$1 ORDER BY a.created_at DESC`,[id]); }
  async function listCustomerFollowUps(workspace, identifier, user = {role:'super_admin',workspace_id:workspace}) { return listFollowUps({workspaceId:workspace,user,customerId:identifier}); }

  const taskSelect = `SELECT t.*, au.legacy_id AS assigned_to_legacy, au.full_name AS assigned_to_name, au.email AS assigned_to_email,
    at.legacy_id AS assigned_team_legacy, cu.legacy_id AS created_by_legacy, cu.full_name AS created_by_name,
    l.legacy_id AS lead_id_legacy, l.full_name AS lead_name, c.legacy_id AS customer_id_legacy, c.full_name AS customer_name,
    f.legacy_id AS follow_up_id_legacy
    FROM crm.tasks t LEFT JOIN crm.users au ON au.id=t.assigned_to LEFT JOIN crm.teams at ON at.id=t.assigned_team_id
    LEFT JOIN crm.users cu ON cu.id=t.created_by LEFT JOIN crm.leads l ON l.id=t.lead_id
    LEFT JOIN crm.customers c ON c.id=t.customer_id LEFT JOIN crm.follow_ups f ON f.id=t.follow_up_id`;

  async function taskScope(workspace, user) {
    const conditions = ['t.workspace_id = $1', 't.deleted_at IS NULL'];
    const params = [workspace];
    if (user?.role === 'sales_manager') {
      const teamId = await resolveTeamId(workspace, user.team_id);
      params.push(teamId, await resolveUserId(workspace, user.id));
      conditions.push(`(t.assigned_team_id = $${params.length - 1} OR t.created_by = $${params.length})`);
    } else if (user?.role !== 'super_admin') {
      params.push(await resolveUserId(workspace, user?.id));
      conditions.push(`t.assigned_to = $${params.length}`);
    }
    return { conditions, params };
  }

  async function listTasks(workspace, user, filters = {}) {
    const scoped = await taskScope(workspace, user);
    const conditions = [...scoped.conditions];
    const params = [...scoped.params];
    if (filters.status && filters.status !== 'all') { params.push(filters.status); conditions.push(`t.status = $${params.length}`); }
    if (filters.priority && filters.priority !== 'all') { params.push(filters.priority); conditions.push(`t.priority = $${params.length}`); }
    if (filters.assignedTo && filters.assignedTo !== 'all') { params.push(await resolveUserId(workspace, filters.assignedTo)); conditions.push(`t.assigned_to = $${params.length}`); }
    if (filters.search) { params.push(`%${String(filters.search).toLowerCase()}%`); const p = `$${params.length}`; conditions.push(`(lower(t.title) LIKE ${p} OR lower(coalesce(t.description, '')) LIKE ${p} OR lower(coalesce(l.full_name, '')) LIKE ${p} OR lower(coalesce(c.full_name, '')) LIKE ${p})`); }
    const rows = await sql.query(`${taskSelect} WHERE ${conditions.join(' AND ')} ORDER BY CASE WHEN t.status = 'Overdue' THEN 0 WHEN t.status = 'In Progress' THEN 1 WHEN t.status = 'Pending' THEN 2 ELSE 3 END, t.due_at NULLS LAST, t.created_at DESC`, params);
    return rows.map(taskRecord);
  }

  async function getTask(workspace, user, identifier) {
    const scoped = await taskScope(workspace, user);
    const params = [...scoped.params, String(identifier)];
    const rows = await sql.query(`${taskSelect} WHERE ${scoped.conditions.join(' AND ')} AND (t.id::text = $${params.length} OR t.legacy_id = $${params.length}) LIMIT 1`, params);
    return rows[0] ? taskRecord(rows[0]) : null;
  }

  async function taskAssignment(workspace, actor, identifier) {
    const target = await findUser(workspace, identifier);
    if (!target || target.status !== 'active' || !['sales_agent', 'sales_manager'].includes(target.role)) return null;
    if (actor.role === 'sales_manager' && target.team_id !== actor.team_id) return null;
    return { userId: await resolveUserId(workspace, target.id), teamId: await resolveTeamId(workspace, target.team_id), user: target };
  }

  async function createTask(workspace, actor, input) {
    const title = String(input.title || '').trim().slice(0, 160);
    if (!title) return null;
    const assignment = await taskAssignment(workspace, actor, input.assigned_to || input.assigned_agent_id || actor.id);
    if (!assignment) return null;
    const leadId = await resolveLeadId(workspace, input.lead_id);
    const customerId = await resolveCustomerId(workspace, input.customer_id);
    const followUpId = await resolveFollowUpId(workspace, input.follow_up_id);
    if (input.lead_id && !(await listLeads({ workspaceId: workspace, user: actor })).some(item => item.id === input.lead_id)) return null;
    if (input.customer_id && !(await listCustomers({ workspaceId: workspace, user: actor })).some(item => item.id === input.customer_id)) return null;
    if (input.follow_up_id && !(await listFollowUps({ workspaceId: workspace, user: actor })).some(item => item.id === input.follow_up_id)) return null;
    const actorId = await resolveUserId(workspace, actor.id);
    const legacyId = input.id || `task_${crypto.randomUUID()}`;
    const dueAt = input.due_at ? timestampValue(input.due_at) : null;
    const rows = await sql.query(`INSERT INTO crm.tasks (workspace_id, legacy_id, title, description, status, priority, assigned_to, assigned_team_id, created_by, lead_id, customer_id, follow_up_id, due_at, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb) RETURNING id`, [workspace, legacyId, title, String(input.description || '').trim().slice(0, 5000) || null, ['Pending', 'In Progress', 'Completed', 'Overdue', 'Cancelled'].includes(input.status) ? input.status : 'Pending', ['Low', 'Medium', 'High', 'Urgent'].includes(input.priority) ? input.priority : 'Medium', assignment.userId, assignment.teamId, actorId, leadId, customerId, followUpId, dueAt, JSON.stringify(input)]);
    const taskId = rows[0]?.id;
    await insertAudit(workspace, actor, 'task_created', 'task', taskId, { legacy_id: legacyId, title, assigned_to: assignment.user.id });
    await enqueueOutbox(workspace, 'task_created', 'task', taskId, { legacy_id: legacyId, assigned_to: assignment.user.id }, `task_created:${legacyId}`);
    if (assignment.userId && assignment.userId !== actorId) await sql.query(`INSERT INTO crm.notifications (user_id, title, message, related_entity_type, related_entity_id, dedupe_key) VALUES ($1,$2,$3,'task',$4,$5) ON CONFLICT (user_id, dedupe_key) DO NOTHING`, [assignment.userId, 'New task assigned', `${actor.full_name || 'A manager'} assigned you: ${title}`, taskId, `task_assigned:${legacyId}`]);
    return getTask(workspace, actor, legacyId) || getTask(workspace, { ...actor, role: 'super_admin' }, legacyId);
  }

  async function updateTask(workspace, actor, identifier, patch) {
    const current = await getTask(workspace, actor, identifier);
    if (!current) return null;
    const fields = [];
    const params = [];
    const assign = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`); };
    if (patch.title !== undefined) assign('title', String(patch.title).trim().slice(0, 160));
    if (patch.description !== undefined) assign('description', String(patch.description).trim().slice(0, 5000) || null);
    if (patch.status !== undefined && ['Pending', 'In Progress', 'Completed', 'Overdue', 'Cancelled'].includes(patch.status)) { assign('status', patch.status); assign('completed_at', patch.status === 'Completed' ? new Date().toISOString() : null); }
    if (patch.priority !== undefined && ['Low', 'Medium', 'High', 'Urgent'].includes(patch.priority)) assign('priority', patch.priority);
    if (patch.due_at !== undefined) assign('due_at', patch.due_at ? timestampValue(patch.due_at) : null);
    if (patch.lead_id !== undefined) assign('lead_id', patch.lead_id ? await resolveLeadId(workspace, patch.lead_id) : null);
    if (patch.customer_id !== undefined) assign('customer_id', patch.customer_id ? await resolveCustomerId(workspace, patch.customer_id) : null);
    if (patch.follow_up_id !== undefined) assign('follow_up_id', patch.follow_up_id ? await resolveFollowUpId(workspace, patch.follow_up_id) : null);
    if (['super_admin', 'sales_manager'].includes(actor.role) && (patch.assigned_to !== undefined || patch.assigned_agent_id !== undefined)) {
      const assignment = await taskAssignment(workspace, actor, patch.assigned_to || patch.assigned_agent_id);
      if (!assignment) return null;
      assign('assigned_to', assignment.userId); assign('assigned_team_id', assignment.teamId);
    }
    if (fields.length) { params.push(await resolveTaskDbId(workspace, identifier)); await sql.query(`UPDATE crm.tasks SET ${fields.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params); }
    await insertAudit(workspace, actor, 'task_updated', 'task', await resolveTaskDbId(workspace, identifier), patch);
    await enqueueOutbox(workspace, 'task_updated', 'task', await resolveTaskDbId(workspace, identifier), patch);
    return getTask(workspace, actor, identifier);
  }

  async function resolveTaskDbId(workspace, identifier) { const rows = await sql.query('SELECT id FROM crm.tasks WHERE workspace_id = $1 AND (id::text = $2 OR legacy_id = $2) AND deleted_at IS NULL LIMIT 1', [workspace, String(identifier)]); return rows[0]?.id || null; }

  async function deleteTask(workspace, actor, identifier) {
    const current = await getTask(workspace, actor, identifier); if (!current) return null;
    const id = await resolveTaskDbId(workspace, identifier); await sql.query('UPDATE crm.tasks SET deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
    await insertAudit(workspace, actor, 'task_deleted', 'task', id, { id: current.id }); await enqueueOutbox(workspace, 'task_deleted', 'task', id, { legacy_id: current.id }); return true;
  }

  async function listNotifications(workspace, userIdentifier) { const userId=await resolveUserId(workspace,userIdentifier);if(!userId)return[];return sql.query(`SELECT n.id,n.event_key AS event_type,n.title,n.message,n.related_entity_type,n.related_entity_id,n.dedupe_key,n.is_read,n.read_at,n.created_at FROM crm.notifications n WHERE n.user_id=$1
      AND (n.related_entity_type IS DISTINCT FROM 'follow_up' OR EXISTS (
        ${followUpSelect} WHERE f.id=n.related_entity_id AND f.workspace_id=$2 AND f.deleted_at IS NULL AND f.assigned_agent_id=$1
      )) ORDER BY n.created_at DESC`,[userId,workspace]); }
  async function markNotificationRead(workspace,userIdentifier,identifier) { const userId=await resolveUserId(workspace,userIdentifier);await sql.query('UPDATE crm.notifications SET is_read=true,read_at=now() WHERE user_id=$1 AND (id::text=$2 OR dedupe_key=$2)',[userId,String(identifier)]);return true; }
  async function markAllNotificationsRead(workspace,userIdentifier) { const userId=await resolveUserId(workspace,userIdentifier);await sql.query('UPDATE crm.notifications SET is_read=true,read_at=now() WHERE user_id=$1 AND is_read=false',[userId]);return true; }
  const webhookColumns = 'id,legacy_id,name AS connection_name,source_platform,source_type,secret_hash,status,field_mappings,default_lead_source,default_lead_status,default_tags,default_assigned_team_id,default_assigned_agent_id,auto_assign_lead,duplicate_check_rule,failed_attempts,unauthorized_attempts,last_received_at,created_by,created_at,updated_at';
  async function listWebhookConnections(workspace) { return sql.query(`SELECT ${webhookColumns} FROM crm.webhook_connections WHERE workspace_id=$1 ORDER BY created_at DESC`,[workspace]); }
  async function getWebhookConnection(workspace, identifier) { const rows=await sql.query(`SELECT ${webhookColumns} FROM crm.webhook_connections WHERE workspace_id=$1 AND (id::text=$2 OR legacy_id=$2) LIMIT 1`,[workspace,String(identifier)]);return rows[0]||null; }
  async function createWebhookConnection(workspace, actor, input) { const legacyId=input.id||`wh_${crypto.randomUUID().slice(0,12)}`;const secretHash=input.secret_hash||hashToken(input.secret||'');const rows=await sql.query(`INSERT INTO crm.webhook_connections (workspace_id,legacy_id,name,source_platform,source_type,secret_hash,status,field_mappings,default_lead_source,default_lead_status,default_tags,auto_assign_lead,duplicate_check_rule,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12,$13,$14) RETURNING ${webhookColumns}`,[workspace,legacyId,input.connection_name||input.connectionName||'Webhook connection',input.source_platform||input.sourcePlatform||'webhook',input.source_type||input.sourceType||input.source_platform||'webhook',secretHash,String(input.status||'inactive').toLowerCase(),JSON.stringify(input.field_mappings||input.fieldMappings||{}),input.default_lead_source||input.defaultLeadSource||null,input.default_lead_status||input.defaultLeadStatus||'New',JSON.stringify(input.default_tags||input.defaultTags||[]),Boolean(input.auto_assign_lead||input.autoAssignLead),input.duplicate_check_rule||input.duplicateCheckRule||'externalLeadId',await resolveUserId(workspace,actor.id)]);const agentId=await resolveUserId(workspace,input.default_assigned_agent||input.defaultAssignedAgent);const teamId=await resolveTeamId(workspace,input.default_assigned_team||input.defaultAssignedTeam);if(agentId||teamId)await sql.query('UPDATE crm.webhook_connections SET default_assigned_agent_id=$1,default_assigned_team_id=$2 WHERE id=$3',[agentId,teamId,rows[0].id]);return getWebhookConnection(workspace,legacyId); }
  async function updateWebhookConnection(workspace, identifier, patch) { const current=await getWebhookConnection(workspace,identifier);if(!current)return null;const fields=[];const params=[];const assign=(column,value)=>{params.push(value);fields.push(`${column}=$${params.length}`)};if(patch.connection_name!==undefined||patch.connectionName!==undefined)assign('name',patch.connection_name||patch.connectionName);if(patch.source_platform!==undefined||patch.sourcePlatform!==undefined)assign('source_platform',patch.source_platform||patch.sourcePlatform);if(patch.source_type!==undefined||patch.sourceType!==undefined)assign('source_type',patch.source_type||patch.sourceType);if(patch.status!==undefined)assign('status',String(patch.status).toLowerCase());if(patch.secret_hash!==undefined)assign('secret_hash',patch.secret_hash);if(patch.field_mappings!==undefined||patch.fieldMappings!==undefined)assign('field_mappings',JSON.stringify(patch.field_mappings||patch.fieldMappings||{}));if(patch.default_lead_source!==undefined||patch.defaultLeadSource!==undefined)assign('default_lead_source',patch.default_lead_source||patch.defaultLeadSource);if(patch.default_lead_status!==undefined||patch.defaultLeadStatus!==undefined)assign('default_lead_status',patch.default_lead_status||patch.defaultLeadStatus);if(patch.default_tags!==undefined||patch.defaultTags!==undefined)assign('default_tags',JSON.stringify(patch.default_tags||patch.defaultTags||[]));if(patch.default_assigned_agent_id!==undefined||patch.defaultAssignedAgent!==undefined)assign('default_assigned_agent_id',await resolveUserId(workspace,patch.default_assigned_agent_id||patch.defaultAssignedAgent));if(patch.default_assigned_team_id!==undefined||patch.defaultAssignedTeam!==undefined)assign('default_assigned_team_id',await resolveTeamId(workspace,patch.default_assigned_team_id||patch.defaultAssignedTeam));if(patch.auto_assign_lead!==undefined||patch.autoAssignLead!==undefined)assign('auto_assign_lead',Boolean(patch.auto_assign_lead??patch.autoAssignLead));if(patch.duplicate_check_rule!==undefined||patch.duplicateCheckRule!==undefined)assign('duplicate_check_rule',patch.duplicate_check_rule||patch.duplicateCheckRule);if(!fields.length)return current;params.push(current.id);const rows=await sql.query(`UPDATE crm.webhook_connections SET ${fields.join(',')},updated_at=now() WHERE id=$${params.length} RETURNING ${webhookColumns}`,params);return rows[0]||null; }
  async function listWebhookLogs(workspace,legacyConnectionId) { return sql.query(`SELECT l.* FROM crm.webhook_logs l JOIN crm.webhook_connections c ON c.id=l.connection_id WHERE c.workspace_id=$1 AND ($2='' OR c.legacy_id=$2) ORDER BY l.created_at DESC LIMIT 200`,[workspace,legacyConnectionId||'']); }
  async function listFailedWebhookLeads(workspace) { return sql.query(`SELECT f.id,f.external_lead_id,f.error_message,f.retry_count,f.next_retry_at,f.resolved_at,f.created_at,c.legacy_id AS connection_id,c.name AS connection_name FROM crm.failed_webhook_leads f JOIN crm.webhook_connections c ON c.id=f.connection_id WHERE c.workspace_id=$1 AND f.resolved_at IS NULL ORDER BY f.created_at DESC LIMIT 200`,[workspace]); }
  async function getFailedWebhookLead(workspace, identifier) { const rows=await sql.query(`SELECT f.*,c.legacy_id AS connection_id,c.name AS connection_name FROM crm.failed_webhook_leads f JOIN crm.webhook_connections c ON c.id=f.connection_id WHERE c.workspace_id=$1 AND f.id::text=$2 LIMIT 1`,[workspace,String(identifier)]);return rows[0]||null; }
  async function resolveFailedWebhookLead(workspace, identifier, actor) { const item=await getFailedWebhookLead(workspace,identifier);if(!item)return null;await sql.query('UPDATE crm.failed_webhook_leads SET resolved_at=now() WHERE id=$1',[item.id]);await insertAudit(workspace,actor,'webhook_failed_lead_resolved','webhook',item.id,{connection_id:item.connection_id});return item; }
  async function convertFailedWebhookLead(workspace, identifier, actor) { const item=await getFailedWebhookLead(workspace,identifier);if(!item)return null;const raw=item.payload&&item.payload.data&&typeof item.payload.data==='object'?{...item.payload,...item.payload.data}:item.payload||{};const fullName=String(raw.full_name||raw.name||[raw.first_name,raw.last_name].filter(Boolean).join(' ')||'').trim();const phone=String(raw.phone||raw.phone_number||raw.mobile||'').trim();if(!fullName||!phone)return null;const statusRows=await sql.query("SELECT id FROM crm.lead_statuses WHERE workspace_id=$1 AND is_active=true AND lower(name)=lower($2) LIMIT 1",[workspace,raw.status||'New']);const sourceRows=await sql.query("SELECT id FROM crm.lead_sources WHERE workspace_id=$1 AND is_active=true AND lower(name)=lower($2) LIMIT 1",[workspace,raw.lead_source||raw.source||'Webhook']);if(!statusRows[0]||!sourceRows[0])return null;const legacyId=`lead_${crypto.randomUUID().slice(0,12)}`;await sql.query(`INSERT INTO crm.leads (workspace_id,legacy_id,full_name,email,phone,whatsapp_number,interested_in,status_id,source_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,[workspace,legacyId,fullName,String(raw.email||'').toLowerCase()||null,phone,String(raw.whatsapp||raw.whatsapp_number||phone),raw.interested_in||raw.interest||'General enquiry',statusRows[0].id,sourceRows[0].id,JSON.stringify({...raw,webhook_connection_id:item.connection_id,is_imported:true})]);await sql.query('UPDATE crm.failed_webhook_leads SET resolved_at=now() WHERE id=$1',[item.id]);if(item.event_id)await sql.query("UPDATE crm.webhook_events SET status='processed',processed_at=now(),error_message=NULL WHERE id=$1",[item.event_id]);await sql.query('INSERT INTO crm.webhook_logs (event_id,connection_id,status,message,metadata) VALUES ($1,(SELECT id FROM crm.webhook_connections WHERE workspace_id=$2 AND legacy_id=$3),$4,$5,$6::jsonb)',[item.event_id,workspace,item.connection_id,'Success','Failed webhook lead converted',JSON.stringify({lead_id:legacyId})]);await insertAudit(workspace,actor,'webhook_failed_lead_converted','lead',await resolveLeadId(workspace,legacyId),{failed_webhook_id:item.id});return getLead(workspace,legacyId); }
  async function previewWebhookLead(workspace, identifier, payload) { const connection=await getWebhookConnection(workspace,identifier);if(!connection)return {status:404,error:'Webhook connection not found.'};const raw=payload&&payload.data&&typeof payload.data==='object'?{...payload,...payload.data}:payload||{};const externalId=String(raw.external_lead_id||raw.meta_lead_id||raw.lead_id||raw.id||'');const idempotency=String(raw.idempotency_key||raw.idempotencyKey||externalId||hashToken(JSON.stringify(raw)));const fullName=String(raw.full_name||raw.name||[raw.first_name,raw.last_name].filter(Boolean).join(' ')||'').trim();const phone=String(raw.phone||raw.phone_number||raw.mobile||'').trim();if(!fullName||!phone)return {status:422,error:'Full name and phone are required.'};const statusName=String(raw.status||connection.default_lead_status||'New');const sourceName=String(raw.lead_source||raw.source||connection.default_lead_source||'Webhook');const statusRows=await sql.query('SELECT name FROM crm.lead_statuses WHERE workspace_id=$1 AND is_active=true AND lower(name)=lower($2) LIMIT 1',[workspace,statusName]);const sourceRows=await sql.query('SELECT name FROM crm.lead_sources WHERE workspace_id=$1 AND is_active=true AND lower(name)=lower($2) LIMIT 1',[workspace,sourceName]);if(!statusRows[0]||!sourceRows[0])return {status:422,error:'Webhook status/source configuration is missing.'};const duplicateRows=await sql.query(`SELECT l.legacy_id FROM crm.leads l WHERE l.workspace_id=$1 AND l.deleted_at IS NULL AND (l.external_lead_id=$2 OR l.idempotency_key=$3 OR ($4<>'' AND l.phone=$4) OR ($5<>'' AND lower(l.email)=lower($5))) LIMIT 1`,[workspace,externalId||null,idempotency,phone,String(raw.email||'').toLowerCase()]);const duplicate=Boolean(duplicateRows[0]);return {ok:true,duplicate,existingLead:duplicate?await getLead(workspace,duplicateRows[0].legacy_id):null,normalizedLead:{full_name:fullName,phone,whatsapp_number:String(raw.whatsapp||raw.whatsapp_number||phone),email:String(raw.email||'').toLowerCase()||null,city:raw.city||null,area:raw.area||null,interested_in:raw.interested_in||raw.interest||'General enquiry',property_type:raw.property_type||null,budget:raw.budget||null,status:statusRows[0].name,lead_source:sourceRows[0].name,tags:valueArray(connection.default_tags),assigned_agent_id:connection.default_assigned_agent_id||null,assigned_team_id:connection.default_assigned_team_id||null,external_lead_id:externalId||null,idempotency_key:idempotency}}; }

  async function ingestWebhookLead(workspace, identifier, secret, payload) { const connection=await getWebhookConnection(workspace,identifier);if(!connection)return {status:404,error:'Webhook connection not found.'};if(connection.status!=='active')return {status:403,error:'Webhook connection is inactive.'};if(!secret||hashToken(secret)!==connection.secret_hash)return {status:401,error:'Webhook authentication failed.'};const raw=payload&&payload.data&&typeof payload.data==='object'?{...payload,...payload.data}:payload||{};const externalId=String(raw.external_lead_id||raw.meta_lead_id||raw.lead_id||raw.id||'');const idempotency=String(raw.idempotency_key||raw.idempotencyKey||externalId||hashToken(JSON.stringify(raw)));const event=await sql.query(`INSERT INTO crm.webhook_events (connection_id,idempotency_key,external_lead_id,source_platform,payload,signature_valid,status) VALUES ($1,$2,$3,$4,$5::jsonb,true,'received') ON CONFLICT (connection_id,idempotency_key) DO NOTHING RETURNING id`,[connection.id,idempotency,externalId||null,connection.source_platform,JSON.stringify(raw)]);if(!event[0])return {ok:true,duplicate:true};const fullName=String(raw.full_name||raw.name||[raw.first_name,raw.last_name].filter(Boolean).join(' ')||'').trim();const phone=String(raw.phone||raw.phone_number||raw.mobile||'').trim();if(!fullName||!phone){await sql.query('UPDATE crm.webhook_events SET status=\'failed\',error_message=$1 WHERE id=$2',['full_name and phone are required',event[0].id]);await sql.query('INSERT INTO crm.failed_webhook_leads (event_id,connection_id,external_lead_id,payload,error_message) VALUES ($1,$2,$3,$4::jsonb,$5)',[event[0].id,connection.id,externalId||null,JSON.stringify(raw),'full_name and phone are required']);return {status:422,error:'Full name and phone are required.'};}const statusRows=await sql.query("SELECT id FROM crm.lead_statuses WHERE workspace_id=$1 AND is_active=true AND lower(name)=lower($2) LIMIT 1",[workspace,raw.status||connection.default_lead_status||'New']);const sourceRows=await sql.query("SELECT id FROM crm.lead_sources WHERE workspace_id=$1 AND is_active=true AND lower(name)=lower($2) LIMIT 1",[workspace,raw.lead_source||raw.source||connection.default_lead_source||'Webhook']);if(!statusRows[0]||!sourceRows[0]){await sql.query('UPDATE crm.webhook_events SET status=\'failed\',error_message=$1 WHERE id=$2',['Webhook status/source configuration is missing',event[0].id]);return {status:422,error:'Webhook status/source configuration is missing.'};}const legacyId=`lead_${crypto.randomUUID().slice(0,12)}`;await sql.query(`INSERT INTO crm.leads (workspace_id,legacy_id,full_name,email,phone,whatsapp_number,city,area,interested_in,property_type,budget,preferred_location,purpose,buying_timeline,financing_required,status_id,source_id,assigned_agent_id,assigned_team_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb)`,[workspace,legacyId,fullName,String(raw.email||'').toLowerCase()||null,phone,String(raw.whatsapp||raw.whatsapp_number||phone),raw.city||null,raw.area||null,raw.interested_in||raw.interest||'General enquiry',raw.property_type||null,raw.budget||null,raw.preferred_location||null,raw.purpose||null,raw.buying_timeline||null,Boolean(raw.financing_required),statusRows[0].id,sourceRows[0].id,connection.default_assigned_agent_id||null,connection.default_assigned_team_id||null,JSON.stringify({...raw,webhook_connection_id:connection.legacy_id,is_imported:true,external_lead_id:externalId||null})]);const lead=await getLead(workspace,legacyId);await sql.query('UPDATE crm.webhook_events SET status=\'processed\',processed_at=now() WHERE id=$1',[event[0].id]);await sql.query('UPDATE crm.webhook_connections SET last_received_at=now(),updated_at=now() WHERE id=$1',[connection.id]);await sql.query('INSERT INTO crm.webhook_logs (event_id,connection_id,status,message,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)',[event[0].id,connection.id,'Success','Webhook lead accepted',JSON.stringify({external_lead_id:externalId||null})]);return {ok:true,lead,duplicate:false}; }
  async function listChatUsers(workspace, user) { const rows = await listUsers(workspace, user?.role === 'super_admin' ? null : user); return rows.filter(item => item.id !== user?.id && (user?.role === 'super_admin' || item.team_id === user?.team_id)).map(item => { const presenceStatus = userPresenceStatus(item); return { id: item.id, full_name: item.full_name, role: item.role, status: item.status, team_id: item.team_id, team_name: item.team_name || (item.team_id === 'team_a' || item.team_id === 'team_b' ? 'Sales Team A' : 'Leadership'), initials: String(item.full_name || '?').split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase(), online: presenceStatus === 'Online', presenceStatus }; }); }
  async function listChatChannels(workspace, user) { const rows = await sql.query(`SELECT c.legacy_id,c.name,c.description,c.visibility,c.is_archived,c.created_at,c.updated_at,coalesce(array_agg(DISTINCT u.legacy_id) FILTER (WHERE u.legacy_id IS NOT NULL),'{}') AS member_ids FROM crm.chat_channels c LEFT JOIN crm.chat_channel_members cm ON cm.channel_id=c.id LEFT JOIN crm.users u ON u.id=cm.user_id WHERE c.workspace_id=$1 AND c.is_archived=false AND ($2=true OR c.visibility <> 'management') GROUP BY c.id ORDER BY c.created_at`,[workspace,user?.role==='super_admin'||user?.role==='sales_manager']); return rows; }
  async function listChatGroups(workspace, user) { const rows=await sql.query(`SELECT g.legacy_id,g.name AS group_name,g.description,cu.legacy_id AS created_by,g.is_archived,g.created_at,g.updated_at,coalesce(array_agg(DISTINCT u.legacy_id) FILTER (WHERE u.legacy_id IS NOT NULL),'{}') AS member_ids FROM crm.chat_groups g LEFT JOIN crm.users cu ON cu.id=g.created_by LEFT JOIN crm.chat_group_members gm ON gm.group_id=g.id LEFT JOIN crm.users u ON u.id=gm.user_id WHERE g.workspace_id=$1 AND g.is_archived=false GROUP BY g.id,cu.legacy_id ORDER BY g.created_at`,[workspace]); return user?.role==='super_admin' ? rows : rows.filter(row=>row.member_ids.includes(user?.id)); }
  async function listChatMessages(workspace, kind, identifier) { const table=kind==='group'?'crm.chat_groups':'crm.chat_channels'; const rows=await sql.query(`SELECT id,legacy_id FROM ${table} WHERE workspace_id=$1 AND legacy_id=$2 LIMIT 1`,[workspace,identifier]); if(!rows[0])return[]; const field=kind==='group'?'group_id':'channel_id'; const messages=await sql.query(`SELECT m.id AS db_id,m.legacy_id AS id,m.message_type,m.message_text,m.created_at,u.legacy_id AS sender_id,u.full_name AS sender_name,coalesce(json_agg(json_build_object('file_name',a.file_name,'file_type',a.file_type,'file_size',a.file_size,'attachment_url',a.object_url)) FILTER (WHERE a.id IS NOT NULL),'[]'::json) AS attachments FROM crm.chat_messages m JOIN crm.users u ON u.id=m.sender_id LEFT JOIN crm.chat_attachments a ON a.message_id=m.id WHERE m.workspace_id=$1 AND m.${field}=$2 AND m.deleted_at IS NULL GROUP BY m.id,u.legacy_id,u.full_name ORDER BY m.created_at ASC`,[workspace,rows[0].id]); return messages.map(message=>{const attachment=message.attachments?.[0]||{};return {...message,attachment_name:attachment.file_name||'',attachment_mime:attachment.file_type||'',attachment_size:attachment.file_size||0,attachment_url:attachment.attachment_url||'',sender:{id:message.sender_id,full_name:message.sender_name,initials:String(message.sender_name||'?').split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase(),online:true}}}); }
  async function listChatAttachments(workspace, identifier) { const rows=await sql.query(`SELECT a.id,a.file_name,a.file_type,a.file_size,a.object_url AS attachment_url,a.uploaded_by,a.created_at AS uploaded_at,m.channel_id,m.group_id,c.legacy_id AS channel_legacy,g.legacy_id AS group_legacy FROM crm.chat_attachments a JOIN crm.chat_messages m ON m.id=a.message_id LEFT JOIN crm.chat_channels c ON c.id=m.channel_id LEFT JOIN crm.chat_groups g ON g.id=m.group_id WHERE m.workspace_id=$1 AND (c.legacy_id=$2 OR g.legacy_id=$2) ORDER BY a.created_at DESC`,[workspace,identifier]);return rows.map(row=>({...row,fileName:row.file_name,fileType:row.file_type,fileSize:row.file_size,uploadedBy:row.uploaded_by,uploadedAt:row.uploaded_at})); }
  async function listChatLinks(workspace, identifier) { const rows=await sql.query(`SELECT l.id,l.title,l.url,l.shared_by,l.created_at AS shared_at,m.channel_id,m.group_id,c.legacy_id AS channel_legacy,g.legacy_id AS group_legacy FROM crm.chat_links l JOIN crm.chat_messages m ON m.id=l.message_id LEFT JOIN crm.chat_channels c ON c.id=m.channel_id LEFT JOIN crm.chat_groups g ON g.id=m.group_id WHERE m.workspace_id=$1 AND (c.legacy_id=$2 OR g.legacy_id=$2) ORDER BY l.created_at DESC`,[workspace,identifier]);return rows.map(row=>({...row,sharedBy:row.shared_by,sharedAt:row.shared_at})); }
  async function createChatLink(workspace, actor, identifier, input) { const table=input.kind==='group'?'crm.chat_groups':'crm.chat_channels';const parent=await sql.query(`SELECT id FROM ${table} WHERE workspace_id=$1 AND legacy_id=$2 LIMIT 1`,[workspace,identifier]);if(!parent[0]||!input.url)return null;const senderId=await resolveUserId(workspace,actor.id);const message=await sql.query(`INSERT INTO crm.chat_messages (workspace_id,legacy_id,${input.kind==='group'?'group_id':'channel_id'},sender_id,message_type,message_text) VALUES ($1,$2,$3,$4,'link',$5) RETURNING id`,[workspace,`msg_${crypto.randomUUID().replace(/-/g,'')}`,parent[0].id,senderId,input.url]);const rows=await sql.query('INSERT INTO crm.chat_links (message_id,shared_by,title,url) VALUES ($1,$2,$3,$4) RETURNING id,title,url,shared_by,created_at AS shared_at',[message[0].id,senderId,input.title||'Shared link',input.url]);return rows[0]||null; }
  async function directConversation(workspace, userA, userB, create = true) { const a=await resolveUserId(workspace,userA),b=await resolveUserId(workspace,userB);if(!a||!b||a===b)return null;let rows=await sql.query(`SELECT dc.id FROM crm.direct_conversations dc JOIN crm.direct_conversation_members m1 ON m1.conversation_id=dc.id JOIN crm.direct_conversation_members m2 ON m2.conversation_id=dc.id WHERE dc.workspace_id=$1 AND m1.user_id=$2 AND m2.user_id=$3 LIMIT 1`,[workspace,a,b]);if(!rows[0]&&create){rows=await sql.query('INSERT INTO crm.direct_conversations (workspace_id) VALUES ($1) RETURNING id',[workspace]);for(const id of [a,b])await sql.query('INSERT INTO crm.direct_conversation_members (conversation_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[rows[0].id,id]);}return rows[0]?.id||null; }
  async function listDirectConversations(workspace, user) { const people=await listUsers(workspace,user);const current=String(user.id);const currentDbId=await resolveUserId(workspace,current);const result=[];for(const person of people.filter(item=>item.id!==current&&(user.role==='super_admin'||item.team_id===user.team_id))){const conversationId=await directConversation(workspace,current,person.id,false);let messages=[];if(conversationId)messages=await sql.query(`SELECT m.message_text,m.created_at,m.sender_id,rr.read_at FROM crm.chat_messages m LEFT JOIN crm.chat_read_receipts rr ON rr.message_id=m.id AND rr.user_id=$2 WHERE m.direct_conversation_id=$1 AND m.deleted_at IS NULL ORDER BY m.created_at ASC`,[conversationId,currentDbId]);const last=messages[messages.length-1];const presenceStatus=userPresenceStatus(person);result.push({user:{id:person.id,full_name:person.full_name,email:person.email,role:person.role,status:person.status,team_id:person.team_id,initials:String(person.full_name||'?').split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase(),online:presenceStatus==='Online',presenceStatus},lastMessage:last?.message_text||'Start a conversation',lastMessageAt:last?.created_at||'',unread:messages.filter(item=>item.sender_id!==currentDbId&&!item.read_at).length});}return result; }
  async function listDirectMessages(workspace, actor, target) { const conversationId=await directConversation(workspace,actor.id,target,false);if(!conversationId)return[];const rows=await sql.query(`SELECT m.legacy_id AS id,m.message_type,m.message_text,m.created_at,m.sender_id::text AS sender_db_id,s.legacy_id AS sender_id,s.full_name AS sender_name,rr.read_at,coalesce(a.file_name,'') AS attachment_name,coalesce(a.file_type,'') AS attachment_mime,coalesce(a.file_size,0) AS attachment_size,coalesce(a.object_url,'') AS attachment_url FROM crm.chat_messages m JOIN crm.users s ON s.id=m.sender_id LEFT JOIN crm.chat_read_receipts rr ON rr.message_id=m.id AND rr.user_id=$2 LEFT JOIN crm.chat_attachments a ON a.message_id=m.id WHERE m.direct_conversation_id=$1 AND m.deleted_at IS NULL ORDER BY m.created_at ASC`,[conversationId,await resolveUserId(workspace,actor.id)]);return rows.map(message=>({...message,sender:{id:message.sender_id,full_name:message.sender_name,initials:String(message.sender_name||'?').split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase(),online:true}})); }
  async function sendDirectMessage(workspace, actor, target, input) { const conversationId=await directConversation(workspace,actor.id,target,true);if(!conversationId)return null;const senderId=await resolveUserId(workspace,actor.id);const legacyId=`msg_${crypto.randomUUID().replace(/-/g,'')}`;const objectUrl=input.attachment_url||input.attachment_content||null;const hasAttachment=Boolean(input.attachment_name);const rows=await sql.query('INSERT INTO crm.chat_messages (workspace_id,legacy_id,direct_conversation_id,sender_id,message_type,message_text) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,legacy_id,message_type,message_text,created_at',[workspace,legacyId,conversationId,senderId,hasAttachment?'attachment':input.message_type||'text',input.message_text||null]);if(hasAttachment)await sql.query('INSERT INTO crm.chat_attachments (message_id,uploaded_by,file_name,file_type,file_size,object_url) VALUES ($1,$2,$3,$4,$5,$6)',[rows[0].id,senderId,input.attachment_name,input.attachment_mime||null,input.attachment_size||null,objectUrl||'']);await enqueueOutbox(workspace,'chat_message_created','chat_message',rows[0].id,{direct_recipient:target});return {...rows[0],id:rows[0].legacy_id,sender_id:actor.id,receiver_id:target,attachment_name:input.attachment_name||'',attachment_url:objectUrl||'',attachment_mime:input.attachment_mime||'',attachment_size:input.attachment_size||0}; }
  async function unreadCounts(workspace, user) { const userId=await resolveUserId(workspace,user.id);if(!userId)return {total:0,channels:{},groups:{},direct:{}};const leadership=user.role==='super_admin'||user.role==='sales_manager';const rows=await sql.query(`SELECT c.legacy_id AS channel_key,g.legacy_id AS group_key,du.legacy_id AS direct_key,count(*)::int AS unread FROM crm.chat_messages m LEFT JOIN crm.chat_channels c ON c.id=m.channel_id LEFT JOIN crm.chat_groups g ON g.id=m.group_id LEFT JOIN crm.chat_group_members gm ON gm.group_id=m.group_id AND gm.user_id=$2 LEFT JOIN crm.direct_conversation_members dm ON dm.conversation_id=m.direct_conversation_id AND dm.user_id<>$2 LEFT JOIN crm.users du ON du.id=dm.user_id LEFT JOIN crm.chat_read_receipts rr ON rr.message_id=m.id AND rr.user_id=$2 WHERE m.workspace_id=$1 AND m.sender_id<>$2 AND rr.message_id IS NULL AND m.deleted_at IS NULL AND (m.channel_id IS NULL OR c.visibility <> 'management' OR $3=true) AND (m.group_id IS NULL OR gm.user_id IS NOT NULL OR $3=true) GROUP BY c.legacy_id,g.legacy_id,du.legacy_id`,[workspace,userId,leadership]);const result={total:0,channels:{},groups:{},direct:{}};for(const row of rows){const key=row.channel_key||row.group_key||row.direct_key;const type=row.channel_key?'channels':row.group_key?'groups':'direct';const value=Number(row.unread||0);if(key){result[type][key]=value;result.total+=value;}}return result; }
  async function search(workspace, user, query) { const q=`%${String(query||'').toLowerCase()}%`;const [leads,customers,followUps]=await Promise.all([listLeads({workspaceId:workspace,user,search:query}),listCustomers({workspaceId:workspace,user,search:query}),listFollowUps({workspaceId:workspace,user})]);return {leads:leads.filter(item=>[item.full_name,item.email,item.phone,item.interested_in].some(value=>String(value||'').toLowerCase().includes(String(query||'').toLowerCase()))).slice(0,20),customers:customers.filter(item=>[item.full_name,item.email,item.phone].some(value=>String(value||'').toLowerCase().includes(String(query||'').toLowerCase()))).slice(0,20),followUps:followUps.filter(item=>[item.notes,item.follow_up_type,item.assigned_agent].some(value=>String(value||'').toLowerCase().includes(String(query||'').toLowerCase()))).slice(0,20)}; }
  async function createChatGroup(workspace, actor, input) { const actorId=await resolveUserId(workspace,actor.id); const legacyId=input.id||`group_${crypto.randomUUID().slice(0,8)}`; const rows=await sql.query('INSERT INTO crm.chat_groups (workspace_id,legacy_id,name,description,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id,legacy_id,name AS group_name,description,created_at,updated_at',[workspace,legacyId,input.group_name||input.groupName||'New group',input.description||null,actorId]); const group=rows[0]; const members=[...new Set([actor.id,...(input.member_ids||input.memberIds||[])])]; for(const member of members){const memberId=await resolveUserId(workspace,member);if(memberId)await sql.query('INSERT INTO crm.chat_group_members (group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[group.id,memberId]);} return (await listChatGroups(workspace,{...actor,role:'super_admin'})).find(item=>item.legacy_id===legacyId)||group; }
  async function updateChatGroup(workspace, identifier, patch) { const fields=[];const params=[];const assign=(column,value)=>{params.push(value);fields.push(`${column}=$${params.length}`)};if(patch.groupName!==undefined)assign('name',patch.groupName);if(patch.description!==undefined)assign('description',patch.description);if(patch.is_archived!==undefined)assign('is_archived',Boolean(patch.is_archived));if(fields.length){params.push(await resolveGroupId(workspace,identifier));await sql.query(`UPDATE crm.chat_groups SET ${fields.join(',')},updated_at=now() WHERE id=$${params.length}`,params)} return (await listChatGroups(workspace,{role:'super_admin'})).find(item=>item.legacy_id===identifier)||null; }
  async function resolveGroupId(workspace, identifier) { const rows=await sql.query('SELECT id FROM crm.chat_groups WHERE workspace_id=$1 AND (id::text=$2 OR legacy_id=$2) LIMIT 1',[workspace,String(identifier)]);return rows[0]?.id||null; }
  async function updateChatGroupMembers(workspace, identifier, members, removeId) { const groupId=await resolveGroupId(workspace,identifier);if(!groupId)return null;if(removeId){const userId=await resolveUserId(workspace,removeId);if(userId)await sql.query('DELETE FROM crm.chat_group_members WHERE group_id=$1 AND user_id=$2',[groupId,userId])}else for(const member of members||[]){const userId=await resolveUserId(workspace,member);if(userId)await sql.query('INSERT INTO crm.chat_group_members (group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[groupId,userId])}return (await listChatGroups(workspace,{role:'super_admin'})).find(item=>item.legacy_id===identifier)||null; }
  async function sendChatMessage(workspace, actor, kind, identifier, input) { const table=kind==='group'?'crm.chat_groups':'crm.chat_channels';const rows=await sql.query(`SELECT id FROM ${table} WHERE workspace_id=$1 AND legacy_id=$2 LIMIT 1`,[workspace,identifier]);if(!rows[0])return null;const senderId=await resolveUserId(workspace,actor.id);const legacyId=`msg_${crypto.randomUUID().replace(/-/g,'')}`;const field=kind==='group'?'group_id':'channel_id';const objectUrl=input.attachment_url||input.attachment_content||null;const hasAttachment=Boolean(input.attachment_name);const messageType=hasAttachment?'attachment':input.message_type||'text';const inserted=await sql.query(`INSERT INTO crm.chat_messages (workspace_id,legacy_id,${field},sender_id,message_type,message_text) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,legacy_id,message_type,message_text,created_at`,[workspace,legacyId,rows[0].id,senderId,messageType,input.message_text||null]);if(hasAttachment)await sql.query('INSERT INTO crm.chat_attachments (message_id,uploaded_by,file_name,file_type,file_size,object_url) VALUES ($1,$2,$3,$4,$5,$6)',[inserted[0].id,senderId,input.attachment_name,input.attachment_mime||null,input.attachment_size||null,objectUrl||'']);await enqueueOutbox(workspace,'chat_message_created','chat_message',inserted[0].id,{channel_id:kind==='channel'?identifier:null,group_id:kind==='group'?identifier:null});return {...inserted[0],id:inserted[0].legacy_id,sender_id:actor.id,group_id:kind==='group'?identifier:undefined,channel_id:kind==='channel'?identifier:undefined,attachment_name:input.attachment_name||'',attachment_url:objectUrl||'',attachment_mime:input.attachment_mime||'',attachment_size:input.attachment_size||0}; }
  async function markChatRead(workspace,user,kind,identifier) { const table=kind==='group'?'crm.chat_groups':'crm.chat_channels';const parent=await sql.query(`SELECT id FROM ${table} WHERE workspace_id=$1 AND legacy_id=$2`,[workspace,identifier]);if(!parent[0])return;const field=kind==='group'?'group_id':'channel_id';const messages=await sql.query(`SELECT id FROM crm.chat_messages WHERE workspace_id=$1 AND ${field}=$2`,[workspace,parent[0].id]);const userId=await resolveUserId(workspace,user.id);for(const item of messages)await sql.query('INSERT INTO crm.chat_read_receipts (message_id,user_id,read_at) VALUES ($1,$2,now()) ON CONFLICT (message_id,user_id) DO UPDATE SET read_at=now()',[item.id,userId]);}
  async function markMessageRead(workspace,user,identifier) { const userId=await resolveUserId(workspace,user.id);await sql.query('INSERT INTO crm.chat_read_receipts (message_id,user_id,read_at) SELECT id,$2,now() FROM crm.chat_messages WHERE workspace_id=$1 AND legacy_id=$3 ON CONFLICT (message_id,user_id) DO UPDATE SET read_at=now()',[workspace,userId,String(identifier)]);return true; }
  async function reportRows(workspace,user) { const agents=await listUsers(workspace,user);const leads=await listLeads({workspaceId:workspace,user});const customers=await listCustomers({workspaceId:workspace,user});const followUps=await listFollowUps({workspaceId:workspace,user});return agents.filter(item=>['sales_agent','sales_manager'].includes(item.role)).map(agent=>{const ls=leads.filter(item=>item.assigned_agent_id===agent.id);const cs=customers.filter(item=>item.assigned_agent_id===agent.id);const fs=followUps.filter(item=>item.assigned_agent_id===agent.id);const closed=ls.filter(item=>item.status==='Closed Won').length;const overdue=fs.filter(item=>item.status==='Overdue').length;const completed=fs.filter(item=>item.status==='Completed').length;const conversion=ls.length?Number((closed/ls.length*100).toFixed(1)):0;const performance=conversion>=20&&overdue<=1?'Excellent':conversion>=12&&overdue<=2?'Good':conversion>0?'Average':'Needs Attention';return {id:agent.id,agentId:agent.id,name:agent.full_name,agentName:agent.full_name,initials:String(agent.full_name||'?').split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase(),email:agent.email,phone:agent.phone,role:agent.role,agentRole:agent.role==='sales_manager'?'Sales Manager':'Sales Agent',team:agent.team_id||'Unassigned',teamId:agent.team_id,assignedLeads:ls.length,activeLeads:ls.filter(item=>!['Closed Won','Closed Lost','Not Interested'].includes(item.status)).length,contactedLeads:ls.filter(item=>item.status!=='New').length,hotLeads:ls.filter(item=>['Hot','Booking'].includes(item.status)).length,followUpsAssigned:fs.length,followUpsDue:fs.filter(item=>['Pending','Rescheduled'].includes(item.status)).length,followUpsCompleted:completed,overdueFollowUps:overdue,customersHandled:cs.length,closedDeals:closed,lostLeads:ls.filter(item=>['Closed Lost','Lost'].includes(item.status)).length,conversionRate:conversion,conversionRateLabel:`${conversion}%`,performance,status:agent.status,presenceStatus:agent.presence_status||null,lastActivity:agent.last_login_at||agent.last_activity_at||agent.updated_at,lastActivityAt:agent.last_activity_at||agent.updated_at};}); }

  return { workspaceId, findWorkspace, findUserByEmail, findUserByIdentifier, findUser, createSession, findSession, revokeSession, recordLogin, loginLockStatus, recordLoginFailure, clearLoginFailures, updateLastLogin, updateLastActivity, updatePresenceStatus, clearPresenceStatus, listUsers, listTeams, normalizeSingleTeam, updateUser, deleteUser, createUser, issueUserInvite, changePassword, loginActivity, userActivity, accountPreferences, updateAccountPreferences, workspaceSettings, updateWorkspaceSetting, listLeadConfiguration, createLeadConfiguration, updateLeadConfiguration, settingsActivities, auditEvents, listNotificationSettings, updateNotificationSettings, listLeads, findLeadDuplicate, getLead, listLeadActivities, createLead, updateLead, deleteLead, assignLead, changeLeadStatus, addLeadActivity, convertLeadToCustomer, createCustomerFromLead, listCustomers, getCustomer, updateCustomer, deleteCustomer, changeCustomerStatus, listCustomerNotes, addCustomerNote, listCustomerActivities, listCustomerFollowUps, listFollowUps, getFollowUp, createFollowUp, updateFollowUp, deleteFollowUp, transitionFollowUp, addFollowUpNote, listFollowUpActivities, listTasks, getTask, createTask, updateTask, deleteTask, listNotifications, markNotificationRead, markAllNotificationsRead, listWebhookConnections, getWebhookConnection, createWebhookConnection, updateWebhookConnection, updateWebhookMappings: updateWebhookConnection, listWebhookLogs, listFailedWebhookLeads, getFailedWebhookLead, resolveFailedWebhookLead, convertFailedWebhookLead, previewWebhookLead, ingestWebhookLead, listChatUsers, listChatChannels, listChatGroups, listChatMessages, listChatAttachments, listChatLinks, createChatLink, directConversation, listDirectConversations, listDirectMessages, createChatGroup, updateChatGroup, updateChatGroupMembers, sendChatMessage, sendDirectMessage, markChatRead, markMessageRead, unreadCounts, search, reportRows, resolveUserId, resolveTeamId, resolveLeadId, resolveCustomerId, resolveFollowUpId };
}

function userRecord(row) { const inviteStatus = row.invite_status ? `${String(row.invite_status).slice(0, 1).toUpperCase()}${String(row.invite_status).slice(1)}` : null; return { id: row.legacy_id || row.id, db_id: row.id, workspace_id: row.workspace_id, email: row.email, full_name: row.full_name, phone: row.phone, password_hash: row.password_hash, role: row.role, team_id: row.team_id || null, team_name: row.team_name || null, status: row.status, presence_status: row.presence_status || null, presence_mode: row.presence_mode || null, must_change_password: Boolean(row.must_change_password), invite_status: inviteStatus, has_temporary_password: Boolean(row.invite_status === 'sent'), temporary_password_expires_at: row.temporary_password_expires_at || null, access_email_sent_at: row.access_email_sent_at || null, last_login_at: row.last_login_at, last_activity_at: row.last_activity_at, created_at: row.created_at, updated_at: row.updated_at }; }

function leadRecord(row) { const metadata = valueObject(row.metadata); return { ...metadata, workspace_id: row.workspace_id, id: row.legacy_id || row.id, full_name: row.full_name, email: row.email, phone: row.phone, whatsapp_number: row.whatsapp_number, city: row.city, area: row.area, interested_in: row.interested_in, property_type: row.property_type, budget: row.budget, preferred_location: row.preferred_location, purpose: row.purpose, buying_timeline: row.buying_timeline, financing_required: row.financing_required, status: row.status, lead_source: row.lead_source, priority: row.priority, assigned_agent_id: row.assigned_agent_id_legacy || metadata.assigned_agent_id || null, assigned_agent: row.assigned_agent || metadata.assigned_agent || 'Unassigned', assigned_team_id: row.assigned_team_id_legacy || metadata.assigned_team_id || null, created_by: row.created_by_legacy || metadata.created_by || null, created_at: row.created_at, updated_at: row.updated_at }; }
function customerRecord(row) { const metadata=valueObject(row.metadata);return {...metadata,id:row.legacy_id||row.id,lead_id:row.lead_id_legacy||metadata.lead_id||null,full_name:row.full_name,email:row.email,phone:row.phone,whatsapp_number:row.whatsapp_number,customer_status:row.customer_status,assigned_agent_id:row.assigned_agent_id_legacy||metadata.assigned_agent_id||null,assigned_agent:row.assigned_agent||metadata.assigned_agent||'Unassigned',assigned_team_id:row.assigned_team_id_legacy||metadata.assigned_team_id||null,created_by:row.created_by_legacy||metadata.created_by||null,created_at:row.created_at,updated_at:row.updated_at}; }
function followUpRecord(row) { const metadata=valueObject(row.metadata);const parts=localDateParts(row.due_at);return {...metadata,id:row.legacy_id||row.id,lead_id:row.lead_id_legacy||metadata.lead_id||null,customer_id:row.customer_id_legacy||metadata.customer_id||null,follow_up_type:row.follow_up_type,due_date:metadata.due_date||parts.date,due_time:metadata.due_time||parts.time,priority:row.priority,status:row.status,notes:row.notes,completed_at:row.completed_at,assigned_agent_id:row.assigned_agent_id_legacy||metadata.assigned_agent_id||null,assigned_agent:row.assigned_agent||metadata.assigned_agent||'Unassigned',assigned_team_id:row.assigned_team_id_legacy||metadata.assigned_team_id||null,created_by:row.created_by_legacy||metadata.created_by||null,created_at:row.created_at,updated_at:row.updated_at}; }

module.exports = { createNeonRepository, hashToken };
