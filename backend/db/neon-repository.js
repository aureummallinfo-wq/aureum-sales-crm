const statusTags = require('../../frontend/shared/crm-status-tags');
const crypto = require('node:crypto');
const { canViewOwnedRecord } = require('../security-utils');
const { createFollowUpPipeline } = require('./followup-pipeline');
const { notePlan, displayStatus, uniqueFollowUps, activitySummary } = require('../followup-workflow');
const { customerCreationPlan } = require('../customer-creation');
const { insertLeadCustomer } = require('./customer-creation');
const { deriveAureumEmail } = require('../user-email');
const { paginationMeta } = require('../pagination');
const { sendExpoPushMessages } = require('../push-notifications');
const { sendWebPushMessages } = require('../web-push-notifications');

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// Meta lead IDs can exceed Number.MAX_SAFE_INTEGER. One sent as a JSON number
// has already lost digits, so it must not be stored as the matching key.
function externalLeadIdentifier(raw) {
  const value = raw.external_lead_id || raw.meta_lead_id || raw.lead_id || raw.id || '';
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return { externalId: '', unsafeExternalId: String(value) };
  return { externalId: String(value), unsafeExternalId: '' };
}

function normalizeInboundContact(value) {
  return String(value ?? '').trim().replace(/^=/, '').replace(/^p:/i, '').replace(/\.00$/, '').trim();
}

function canonicalWebhookSource(raw, connection) {
  const channel = String(raw.source_channel || raw.channel || '').trim().toLowerCase();
  const platform = String(raw.platform || connection?.source_platform || '').trim().toLowerCase();
  const requested = String(raw.lead_source || raw.source || connection?.default_lead_source || 'Webhook').trim();
  if (channel.includes('instagram') || ['ig', 'instagram'].includes(platform)) return 'Instagram';
  if (channel.includes('facebook') || ['fb', 'facebook', 'meta'].includes(platform) || requested.toLowerCase() === 'meta lead ads') return 'Facebook';
  return requested || 'Webhook';
}

function webhookFormName(raw) {
  return String(raw.source_form || raw.source_form_name || raw.form_name || raw.formName || '').trim();
}

function metaField(raw, ...keys) {
  for (const key of keys) {
    if (raw && raw[key] !== undefined && raw[key] !== null && String(raw[key]).trim() !== '') return raw[key];
  }
  const fieldData = Array.isArray(raw?.field_data) ? raw.field_data : [];
  for (const key of keys) {
    const entry = fieldData.find(item => String(item?.name || '').toLowerCase() === String(key).toLowerCase());
    const value = entry?.values?.[0] ?? entry?.value;
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  const normalizeKey = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const normalizedKeys = new Set(keys.map(normalizeKey));
  const normalizedEntry = Object.entries(raw || {}).find(([key, value]) => normalizedKeys.has(normalizeKey(key)) && value !== undefined && value !== null && String(value).trim() !== '');
  if (normalizedEntry) return normalizedEntry[1];
  const normalizedFieldData = fieldData.find(item => normalizedKeys.has(normalizeKey(item?.name)) && (item?.values?.[0] ?? item?.value) !== undefined && String(item?.values?.[0] ?? item?.value).trim() !== '');
  if (normalizedFieldData) return normalizedFieldData.values?.[0] ?? normalizedFieldData.value;
  return '';
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
  return [...new Set(source.map(item => String(item || '').trim()).filter(Boolean))].slice(0, 20);
}

function localDateParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '', time: '' };
  return { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date), time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date) };
}

function timestampValue(value) {
  if (!value) return null;
  const plainLocalTimestamp = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value);
  const input = plainLocalTimestamp ? `${String(value).replace(' ', 'T')}+05:00` : value;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// Meta lead timestamps describe the customer submission, which can be earlier
// than the later sheet/n8n job that creates the CRM row.
function leadReceivedAt(lead = {}) {
  const values = [lead.received_at, lead.receivedAt, lead.created_time, lead.createdTime, lead.submitted_at, lead.submittedAt];
  for (const value of values) {
    const parsed = timestampValue(value);
    if (parsed) return parsed;
  }
  return null;
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
  if (!sql) throw new Error('A database SQL client is required.');
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
    const rows = await sql.query('UPDATE crm.users SET last_activity_at = now(), updated_at = now() WHERE id = $1 RETURNING id, legacy_id, status, last_login_at, last_activity_at', [userId]);
    const row = rows[0];
    return row ? { id: row.legacy_id || row.id, db_id: row.id, status: row.status, last_login_at: row.last_login_at, last_activity_at: row.last_activity_at } : null;
  }

  async function listUsers(workspace, actor) {
    const params = [workspace]; const conditions = ['u.workspace_id = $1', 'u.deleted_at IS NULL'];
    if (actor?.role === 'sales_manager') { params.push(await resolveTeamId(workspace, actor.team_id)); conditions.push(`t.id = $${params.length}`); }
    const rows = await sql.query(`SELECT u.id, u.legacy_id, u.email, u.full_name, u.phone, u.role_key AS role, u.status,
      u.must_change_password, u.last_login_at, u.last_activity_at, presence.preference_value->>'status' AS presence_status, presence.preference_value->>'mode' AS presence_mode, u.created_at, u.updated_at, t.legacy_id AS team_id, t.name AS team_name,
      invite.status AS invite_status, invite.expires_at AS temporary_password_expires_at,
      invite.created_at AS access_email_sent_at FROM crm.users u LEFT JOIN crm.teams t ON t.id = u.team_id
      LEFT JOIN LATERAL (SELECT status, expires_at, creat