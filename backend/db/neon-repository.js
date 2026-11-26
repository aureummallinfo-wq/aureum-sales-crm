const statusTags = require('../../frontend/shared/crm-status-tags');
const crypto = require('node:crypto');
const { canViewOwnedRecord } = require('../security-utils');
const { createFollowUpPipeline } = require('./followup-pipeline');
const { notePlan, terminalStatusFromTags, displayStatus, uniqueFollowUps, activitySummary } = require('../followup-workflow');
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
  const value = metaField(raw, 'external_lead_id', 'meta_lead_id', 'lead_id', 'id');
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return { externalId: '', unsafeExternalId: String(value) };
  return { externalId: String(value), unsafeExternalId: '' };
}

function normalizeInboundContact(value) {
  const normalized = String(value ?? '').trim().replace(/^=/, '').replace(/^p:/i, '').replace(/\.00$/, '').trim();
  return normalized.replace(/[^0-9]/g, '').length >= 7 ? normalized : '';
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
  const normalizeKey = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const compactKey = value => normalizeKey(value).replace(/_/g, '');
  const normalizedKeys = new Set(keys.map(normalizeKey));
  const compactKeys = new Set(keys.map(compactKey));
  const matches = value => value !== undefined && value !== null && String(value).trim() !== '';
  const sources = [raw, parseNestedMetaPayload(raw?.raw_payload), parseNestedMetaPayload(raw?.data)];
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of keys) if (matches(source[key])) return source[key];
    const fieldData = Array.isArray(source.field_data) ? source.field_data : [];
    const directField = fieldData.find(item => keys.some(key => String(item?.name || '').toLowerCase() === String(key).toLowerCase()) && matches(item?.values?.[0] ?? item?.value));
    if (directField) return directField.values?.[0] ?? directField.value;
    const normalizedEntry = Object.entries(source).find(([key, value]) => (normalizedKeys.has(normalizeKey(key)) || compactKeys.has(compactKey(key))) && matches(value));
    if (normalizedEntry) return normalizedEntry[1];
    const normalizedFieldData = fieldData.find(item => (normalizedKeys.has(normalizeKey(item?.name)) || compactKeys.has(compactKey(item?.name))) && matches(item?.values?.[0] ?? item?.value));
    if (normalizedFieldData) return normalizedFieldData.values?.[0] ?? normalizedFieldData.value;
  }
  return '';
}

function parseNestedMetaPayload(value) {
  let parsed = value;
  for (let index = 0; index < 3 && typeof parsed === 'string'; index += 1) {
    try { parsed = JSON.parse(parsed); } catch { break; }
  }
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function metaContactField(raw, ...keys) {
  const sources = [raw, parseNestedMetaPayload(raw?.raw_payload), parseNestedMetaPayload(raw?.data)];
  for (const source of sources) {
    const value = normalizeInboundContact(metaField(source, ...keys));
    if (value) return value;
  }
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
  const seen = new Set();
  return source.map(item => String(item || '').trim()).filter(Boolean).filter(item => { const key = item.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 20);
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

  // Deactivation must be an ownership transition, not just a status toggle.
  // Production uses the PostgreSQL pool, so keep the lead/customer/follow-up
  // changes in one transaction. The fallback keeps this repository usable by
  // the lightweight test doubles and Neon development client.
  async function repositoryTransaction(work) {
    if (!sql.pool?.connect) return work(sql);
    const client = await sql.pool.connect();
    const tx = { query: async (text, values = []) => (await client.query(text, values)).rows };
    try {
      await client.query('BEGIN');
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async function deactivateUser(workspace, targetIdentifier, actor, { deleteAfter = false } = {}) {
    const targetId = await resolveUserId(workspace, targetIdentifier);
    if (!targetId) return null;
    const target = await findUser(workspace, targetIdentifier);
    if (!target) return null;
    const actorId = actor?.id ? await resolveUserId(workspace, actor.id) : null;
    if (!actorId) return null;

    const result = await repositoryTransaction(async tx => {
      const targetRows = await tx.query(`SELECT u.id, u.legacy_id, u.full_name, u.email, u.team_id,
          u.status, t.legacy_id AS team_legacy_id, tm.id AS manager_id
        FROM crm.users u
        LEFT JOIN crm.teams t ON t.id = u.team_id
        LEFT JOIN crm.users tm ON tm.id = t.manager_user_id AND tm.status = 'active' AND tm.deleted_at IS NULL
        WHERE u.id = $1 AND u.workspace_id = $2
        FOR UPDATE OF u`, [targetId, workspace]);
      const lockedTarget = targetRows[0];
      if (!lockedTarget) return null;

      // Idempotent: an already inactive account must not generate duplicate
      // assignment-history rows or repeatedly move the same follow-ups.
      if (lockedTarget.status === 'inactive' && !deleteAfter) {
        return { reassignedLeadCount: 0, reassignedFollowUpCount: 0, alreadyInactive: true };
      }

      const leadRows = await tx.query(`SELECT id, legacy_id, assigned_team_id
        FROM crm.leads
        WHERE workspace_id = $1
          AND (assigned_agent_id = $2 OR assigned_agent_id::text = $3)
          AND deleted_at IS NULL
        ORDER BY created_at ASC, id ASC
        FOR UPDATE`, [workspace, targetId, lockedTarget.legacy_id]);
      const fallbackOwnerId = lockedTarget.manager_id || actorId;
      let reassignedFollowUpCount = 0;

      for (const lead of leadRows) {
        const customerRows = await tx.query(`SELECT id FROM crm.customers
          WHERE workspace_id = $1 AND lead_id = $2 AND deleted_at IS NULL
          FOR UPDATE`, [workspace, lead.id]);
        const customerIds = customerRows.map(row => row.id);
        const followUpRows = await tx.query(`UPDATE crm.follow_ups
          SET assigned_agent_id = $1,
              assigned_team_id = $2,
              metadata = metadata || jsonb_build_object(
                'previous_assigned_agent_id', $3::text,
                'previous_assigned_agent_name', $4::text,
                'reassigned_reason', 'user_deactivated',
                'reassigned_at', now()
              ),
              updated_at = now()
          WHERE workspace_id = $5
            AND (assigned_agent_id = $3 OR assigned_agent_id::text = $8)
            AND deleted_at IS NULL
            AND status IN ('Pending','Overdue','Rescheduled','Missed')
            AND (lead_id = $6 OR customer_id = ANY($7::uuid[]))
          RETURNING id`, [fallbackOwnerId, lead.assigned_team_id, targetId, lockedTarget.full_name, workspace, lead.id, customerIds, lockedTarget.legacy_id]);
        reassignedFollowUpCount += followUpRows.length;

        await tx.query(`UPDATE crm.leads
          SET assigned_agent_id = NULL, assigned_team_id = $1, updated_at = now()
          WHERE id = $2 AND workspace_id = $3`, [lead.assigned_team_id, lead.id, workspace]);
        if (customerIds.length) {
          await tx.query(`UPDATE crm.customers
            SET assigned_agent_id = NULL,
                assigned_team_id = $1,
                metadata = metadata || jsonb_build_object(
                  'previous_assigned_agent_id', $2::text,
                  'previous_assigned_agent_name', $3::text,
                  'reassigned_reason', 'user_deactivated',
                  'reassigned_at', now()
                ),
                updated_at = now()
            WHERE workspace_id = $4 AND id = ANY($5::uuid[])`, [lead.assigned_team_id, targetId, lockedTarget.full_name, workspace, customerIds]);
        }

        await tx.query(`INSERT INTO crm.lead_assignment_history
          (lead_id, from_agent_id, to_agent_id, from_team_id, to_team_id, changed_by)
          VALUES ($1, $2, NULL, $3, $3, $4)`, [lead.id, targetId, lead.assigned_team_id, actorId]);
        await tx.query(`INSERT INTO crm.lead_activities
          (lead_id, actor_user_id, activity_type, description, metadata)
          VALUES ($1, $2, 'Lead unassigned', $3, $4::jsonb)`, [
          lead.id,
          actorId,
          `Moved to Unassigned because ${lockedTarget.full_name} was deactivated.`,
          JSON.stringify({ previous_agent_id: target.legacy_id || targetId, previous_agent_name: lockedTarget.full_name, reassigned_reason: 'user_deactivated' })
        ]);
        await tx.query(`INSERT INTO crm.audit_events
          (workspace_id, actor_user_id, action, entity_type, entity_id, after_data)
          VALUES ($1, $2, 'lead_unassigned_user_deactivated', 'lead', $3, $4::jsonb)`, [
          workspace, actorId, lead.id, JSON.stringify({ previous_agent_id: target.legacy_id || targetId, previous_agent_name: lockedTarget.full_name, assigned_team_id: lead.assigned_team_id })
        ]);
        await tx.query(`INSERT INTO crm.outbox_events
          (workspace_id, event_type, aggregate_type, aggregate_id, payload, idempotency_key)
          VALUES ($1, 'lead_unassigned', 'lead', $2, $3::jsonb, $4)
          ON CONFLICT (idempotency_key) DO NOTHING`, [
          workspace,
          lead.id,
          JSON.stringify({ previous_agent_id: target.legacy_id || targetId, assigned_agent_id: null, assigned_team_id: lead.assigned_team_id, reason: 'user_deactivated' }),
          `lead_unassigned:user_deactivated:${targetId}:${lead.id}`
        ]);
      }

      await tx.query(`UPDATE crm.users
        SET status = 'inactive', deleted_at = CASE WHEN $3 THEN now() ELSE deleted_at END, updated_at = now()
        WHERE id = $1 AND workspace_id = $2`, [targetId, workspace, deleteAfter]);
      await tx.query('UPDATE crm.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [targetId]);
      await tx.query(`INSERT INTO crm.user_audit_logs (user_id, action, metadata)
        VALUES ($1, $2, $3::jsonb)`, [targetId, deleteAfter ? 'user_deleted' : 'user_deactivated', JSON.stringify({
        actor_user_id: actorId,
        email: lockedTarget.email,
        full_name: lockedTarget.full_name,
        reassigned_lead_count: leadRows.length,
        reassigned_follow_up_count: reassignedFollowUpCount,
        destination: 'unassigned'
      })]);
      return { reassignedLeadCount: leadRows.length, reassignedFollowUpCount, alreadyInactive: false };
    });
    if (!result) return null;
    return { ...target, status: 'inactive', deleted_at: deleteAfter ? new Date().toISOString() : null, ...result };
  }

  async function updateUser(workspace, targetIdentifier, patch, actor = null) {
    const targetId = await resolveUserId(workspace, targetIdentifier); if (!targetId) return null;
    const current = await findUser(workspace, targetIdentifier); if (!current) return null;
    const shouldDeactivate = patch.status === 'inactive' && current.status !== 'inactive';
    const fields = []; const params = []; const assign = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`); };
    if (patch.full_name !== undefined) assign('full_name', patch.full_name);
    if (patch.email !== undefined) assign('email', String(patch.email).toLowerCase());
    if (patch.phone !== undefined) assign('phone', patch.phone || null);
    if (patch.role !== undefined) assign('role_key', patch.role);
    if (patch.status !== undefined && !shouldDeactivate) assign('status', patch.status);
    if (patch.password_hash !== undefined) { assign('password_hash', patch.password_hash); fields.push('failed_login_attempts = 0', 'locked_until = NULL'); }
    if (patch.must_change_password !== undefined) assign('must_change_password', Boolean(patch.must_change_password));
    if (patch.team_id !== undefined) assign('team_id', await resolveTeamId(workspace, patch.team_id));
    if (fields.length) { params.push(targetId); await sql.query(`UPDATE crm.users SET ${fields.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params); }
    if (shouldDeactivate) return deactivateUser(workspace, targetIdentifier, actor || current);
    return findUser(workspace, targetIdentifier);
  }

  async function deleteUser(workspace, targetIdentifier, actor) {
    return deactivateUser(workspace, targetIdentifier, actor, { deleteAfter: true });
  }

  async function createUser(workspace, actor, input) {
    const teamId = await resolveTeamId(workspace, input.team_id || input.teamId || (actor.role === 'sales_manager' ? actor.team_id : null));
    const creatorId = await resolveUserId(workspace, actor.id);
    const rows = await sql.query(`INSERT INTO crm.users (workspace_id, legacy_id, email, full_name, phone, password_hash, role_key, team_id, status, must_change_password, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, legacy_id`, [workspace, input.id || `usr_${crypto.randomUUID().slice(0, 8)}`, String(input.email || deriveAureumEmail(input.full_name)).toLowerCase(), input.full_name, input.phone || null, input.password_hash, input.role || 'sales_agent', teamId, input.status || 'pending', input.must_change_password !== false, creatorId]);
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

  async function resetTemporaryPassword(workspace, actor, targetIdentifier, nextPasswordHash, tokenHash, expiresAt) {
    const targetId = await resolveUserId(workspace, targetIdentifier); if (!targetId) return null;
    const actorId = await resolveUserId(workspace, actor.id);
    const rows = await sql.query(`WITH changed AS (
      UPDATE crm.users SET password_hash = $3, must_change_password = true,
        failed_login_attempts = 0, locked_until = NULL, updated_at = now()
      WHERE id = $1 AND workspace_id = $2 AND status = 'active' AND deleted_at IS NULL
      RETURNING id, email, role_key
    ), previous_invites AS (
      UPDATE crm.user_invites SET status = 'revoked' WHERE user_id IN (SELECT id FROM changed) AND status IN ('pending', 'sent')
    ), new_invite AS (
      INSERT INTO crm.user_invites (workspace_id, user_id, email, role_key, token_hash, status, expires_at, created_by)
      SELECT $2, id, email, role_key, $4, 'pending', $5, $6 FROM changed
    ), revoked_sessions AS (
      UPDATE crm.sessions SET revoked_at = now() WHERE user_id IN (SELECT id FROM changed) AND revoked_at IS NULL
    ), audit AS (
      INSERT INTO crm.user_audit_logs (user_id, action, metadata)
      SELECT id, 'password_reset', jsonb_build_object('actor_user_id', $6::text, 'delivery', 'manual') FROM changed
    ) SELECT id FROM changed`, [targetId, workspace, nextPasswordHash, tokenHash, expiresAt, actorId]);
    return rows.length ? findUser(workspace, targetIdentifier) : null;
  }

  async function changePassword(workspace, userIdentifier, nextPasswordHash) {
    const userId = await resolveUserId(workspace, userIdentifier); if (!userId) return null;
    await sql.query('UPDATE crm.users SET password_hash = $1, must_change_password = false, status = \'active\', failed_login_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = $2', [nextPasswordHash, userId]);
    await sql.query("UPDATE crm.user_invites SET status = 'accepted', accepted_at = now() WHERE user_id = $1 AND status IN ('pending', 'sent')", [userId]);
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
    const defaults = statusTags.values.map((name, index) => ['customer-status-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), statusTags.colors[name], index + 1]);
    for (const item of defaults) await sql.query(`INSERT INTO crm.customer_statuses (workspace_id,legacy_id,name,slug,color,sort_order,is_default,is_active) VALUES ($1,$2,$3,$4,$5,$6,true,true) ON CONFLICT (workspace_id,legacy_id) DO NOTHING`, [workspace, ...item]);
    customerStatusTablesReady.add(String(workspace));
  }

  async function listLeadConfiguration(workspace, type) {
    if (type === 'customer-statuses') await ensureCustomerStatusTable(workspace);
    const table = type === 'lead-statuses' ? 'crm.lead_statuses' : type === 'customer-statuses' ? 'crm.customer_statuses' : type === 'lead-tags' ? 'crm.lead_tags' : 'crm.lead_sources';
    if (type !== 'lead-sources') {
      const statuses = type !== 'lead-tags';
      await sql.query(`INSERT INTO ${table} (workspace_id,legacy_id,name,slug${statuses ? ',color,sort_order,is_default' : ',tag_type'},is_active)
        SELECT $1,'crm-status-' || lower(regexp_replace(name,'[^a-zA-Z0-9]+','-','g')),name,
          lower(regexp_replace(name,'[^a-zA-Z0-9]+','-','g'))${statuses ? ",coalesce(($3::jsonb)->>name,'#8d7658'),position,name='New'" : ",'status'"},true
        FROM unnest($2::text[]) WITH ORDINALITY AS defaults(name,position)
        ON CONFLICT (workspace_id,slug) DO UPDATE SET name=EXCLUDED.name,is_active=true${statuses ? ',sort_order=EXCLUDED.sort_order,is_default=EXCLUDED.is_default' : ''}`,
      statuses ? [workspace, statusTags.values, JSON.stringify(statusTags.colors)] : [workspace, statusTags.tagValues]);
      return sql.query(`SELECT * FROM ${table} WHERE workspace_id=$1 AND name=ANY($2::text[]) ORDER BY array_position($2::text[],name)`, [workspace, statuses ? statusTags.values : statusTags.tagValues]);
    }
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

  function appReleaseView(row) {
    if (!row) return null;
    return { id: row.id, platform: row.platform, versionName: row.version_name, versionCode: row.version_code, minimumVersionCode: row.minimum_version_code, fileName: row.file_name, fileSize: Number(row.file_size), sha256: row.sha256, releaseNotes: row.release_notes || '', isPublished: row.is_published, publishedAt: row.published_at, downloadCount: Number(row.download_count || 0), createdAt: row.created_at, storageKey: row.storage_key };
  }

  async function createAppRelease(workspace, actor, input) {
    const userId = await resolveUserId(workspace, actor?.id);
    if (!userId) return null;
    const rows = await sql.query(`INSERT INTO crm.app_releases (workspace_id,platform,version_name,version_code,minimum_version_code,file_name,storage_key,file_size,sha256,release_notes,uploaded_by) VALUES ($1,'android',$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [workspace, String(input.versionName || '').trim().slice(0, 40), Number(input.versionCode), Number(input.minimumVersionCode || 1), String(input.fileName || 'aureum-crm.apk').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160), String(input.storageKey), Number(input.fileSize), String(input.sha256), String(input.releaseNotes || '').slice(0, 5000), userId]);
    return appReleaseView(rows[0]);
  }

  async function listAppReleases(workspace) {
    return (await sql.query("SELECT * FROM crm.app_releases WHERE workspace_id=$1 AND platform='android' ORDER BY version_code DESC, created_at DESC", [workspace])).map(appReleaseView);
  }

  async function getAppRelease(workspace, identifier) {
    const rows = await sql.query("SELECT * FROM crm.app_releases WHERE workspace_id=$1 AND platform='android' AND (id::text=$2 OR version_code::text=$2) LIMIT 1", [workspace, String(identifier)]);
    return appReleaseView(rows[0]);
  }

  async function getLatestAppRelease(workspace) {
    const rows = await sql.query("SELECT * FROM crm.app_releases WHERE workspace_id=$1 AND platform='android' AND is_published=true ORDER BY version_code DESC LIMIT 1", [workspace]);
    return appReleaseView(rows[0]);
  }

  async function publishAppRelease(workspace, identifier) {
    const rows = await sql.query(`WITH target AS MATERIALIZED (SELECT id FROM crm.app_releases WHERE workspace_id=$1 AND platform='android' AND (id::text=$2 OR version_code::text=$2) LIMIT 1), cleared AS (UPDATE crm.app_releases SET is_published=false,published_at=NULL WHERE workspace_id=$1 AND platform='android' AND EXISTS (SELECT 1 FROM target)), published AS (UPDATE crm.app_releases SET is_published=true,published_at=now() WHERE id IN (SELECT id FROM target) RETURNING *) SELECT * FROM published`, [workspace, String(identifier)]);
    return appReleaseView(rows[0]);
  }

  async function unpublishAppRelease(workspace, identifier) {
    const rows = await sql.query("UPDATE crm.app_releases SET is_published=false,published_at=NULL WHERE workspace_id=$1 AND platform='android' AND (id::text=$2 OR version_code::text=$2) RETURNING *", [workspace, String(identifier)]);
    return appReleaseView(rows[0]);
  }

  async function recordAppReleaseDownload(workspace, identifier) {
    await sql.query('UPDATE crm.app_releases SET download_count=download_count+1 WHERE workspace_id=$1 AND id=$2', [workspace, identifier]);
  }

  async function registerMobilePushToken(workspace, userIdentifier, input = {}) {
    const userId = await resolveUserId(workspace, userIdentifier);
    const token = String(input.token || '').trim();
    const platform = String(input.platform || '').toLowerCase();
    if (!userId || !token || !['android', 'ios'].includes(platform)) return null;
    const tokenHash = hashToken(token);
    let rows;
    try { rows = await sql.query(`
      INSERT INTO crm.mobile_push_tokens (workspace_id,user_id,token,token_hash,platform,device_name,app_version,enabled,last_seen_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,now(),now())
      ON CONFLICT (workspace_id,token_hash) DO UPDATE SET user_id=EXCLUDED.user_id,token=EXCLUDED.token,platform=EXCLUDED.platform,device_name=EXCLUDED.device_name,app_version=EXCLUDED.app_version,enabled=true,last_seen_at=now(),updated_at=now()
      RETURNING id,platform,device_name,app_version,enabled,last_seen_at`,
    [workspace, userId, token.slice(0, 512), tokenHash, platform, String(input.device_name || '').slice(0, 160) || null, String(input.app_version || '').slice(0, 40) || null]); } catch (error) { if (error?.code === '42P01' && String(error.message || '').includes('mobile_push_tokens')) return null; throw error; }
    return rows[0] || null;
  }

  async function removeMobilePushToken(workspace, userIdentifier, token) {
    const userId = await resolveUserId(workspace, userIdentifier);
    const value = String(token || '').trim();
    if (!userId || !value) return false;
    let result;
    try { result = await sql.query('DELETE FROM crm.mobile_push_tokens WHERE workspace_id=$1 AND user_id=$2 AND token_hash=$3', [workspace, userId, hashToken(value)]); } catch (error) { if (error?.code === '42P01' && String(error.message || '').includes('mobile_push_tokens')) return false; throw error; }
    return Number(result.rowCount || 0) > 0;
  }

  async function listMobilePushTokens(workspace, userIdentifier) {
    const userId = await resolveUserId(workspace, userIdentifier);
    if (!userId) return [];
    try { return await sql.query('SELECT token,platform,device_name,app_version FROM crm.mobile_push_tokens WHERE workspace_id=$1 AND user_id=$2 AND enabled=true', [workspace, userId]); } catch (error) { if (error?.code === '42P01' && String(error.message || '').includes('mobile_push_tokens')) return []; throw error; }
  }

  async function registerWebPushSubscription(workspace, userIdentifier, input = {}) {
    const userId = await resolveUserId(workspace, userIdentifier);
    const subscription = input.subscription || input;
    const endpoint = String(subscription.endpoint || '').trim();
    const p256dh = String(subscription.keys?.p256dh || '').trim();
    const auth = String(subscription.keys?.auth || '').trim();
    if (!userId || !endpoint || !p256dh || !auth) return null;
    let rows;
    try { rows = await sql.query(`
      INSERT INTO crm.web_push_subscriptions (workspace_id,user_id,endpoint,p256dh_key,auth_key,user_agent,enabled,last_seen_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,true,now(),now())
      ON CONFLICT (workspace_id,endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh_key=EXCLUDED.p256dh_key,auth_key=EXCLUDED.auth_key,user_agent=EXCLUDED.user_agent,enabled=true,last_seen_at=now(),updated_at=now()
      RETURNING id,endpoint,enabled,last_seen_at`,
    [workspace, userId, endpoint.slice(0, 2048), p256dh.slice(0, 512), auth.slice(0, 512), String(input.user_agent || '').slice(0, 500) || null]); } catch (error) { if (error?.code === '42P01' && String(error.message || '').includes('web_push_subscriptions')) return null; throw error; }
    return rows[0] || null;
  }

  async function removeWebPushSubscription(workspace, userIdentifier, endpoint) {
    const userId = await resolveUserId(workspace, userIdentifier);
    const value = String(endpoint || '').trim();
    if (!userId || !value) return false;
    let result;
    try { result = await sql.query('DELETE FROM crm.web_push_subscriptions WHERE workspace_id=$1 AND user_id=$2 AND endpoint=$3', [workspace, userId, value]); } catch (error) { if (error?.code === '42P01' && String(error.message || '').includes('web_push_subscriptions')) return false; throw error; }
    return Number(result.rowCount || 0) > 0;
  }

  async function listWebPushSubscriptions(workspace, userIdentifier) {
    const userId = await resolveUserId(workspace, userIdentifier);
    if (!userId) return [];
    let rows;
    try { rows = await sql.query('SELECT endpoint,p256dh_key,auth_key FROM crm.web_push_subscriptions WHERE workspace_id=$1 AND user_id=$2 AND enabled=true', [workspace, userId]); } catch (error) { if (error?.code === '42P01' && String(error.message || '').includes('web_push_subscriptions')) return []; throw error; }
    return rows.map(row => ({ endpoint: row.endpoint, keys: { p256dh: row.p256dh_key, auth: row.auth_key } }));
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
    const hasRelationalAssignment = Object.prototype.hasOwnProperty.call(row, 'assigned_agent_id_legacy');
    const assignedAgentId = hasRelationalAssignment ? (row.assigned_agent_id_legacy || null) : (metadata.assigned_agent_id || null);
    const assignedAgent = hasRelationalAssignment ? (row.assigned_agent || 'Unassigned') : (row.assigned_agent || metadata.assigned_agent || 'Unassigned');
    return { ...metadata, lifecycle_version: row.lifecycle_version, customer_id: row.linked_customer_id || null, workspace_id: row.workspace_id, id: row.legacy_id || row.id, full_name: row.full_name, email: row.email, phone: row.phone, whatsapp_number: row.whatsapp_number, city: row.city, area: row.area, interested_in: row.interested_in, property_type: row.property_type, budget: row.budget, preferred_location: row.preferred_location, purpose: row.purpose, buying_timeline: row.buying_timeline, financing_required: row.financing_required, status: statusTags.normalize(row.status), lead_source: row.lead_source, priority: row.priority, assigned_agent_id: assignedAgentId, assigned_agent: assignedAgent, assigned_team_id: row.assigned_team_id_legacy || metadata.assigned_team_id || null, assigned_team_name: row.assigned_team_name || metadata.assigned_team_name || '', created_by: row.created_by_legacy || metadata.created_by || null, external_source: row.external_source || metadata.external_source || null, external_lead_id: row.external_lead_id || metadata.external_lead_id || null, idempotency_key: row.idempotency_key || metadata.idempotency_key || null, received_at: row.received_at || null, last_activity_at: metadata.last_activity_at || row.updated_at, last_activity_description: metadata.last_activity_description || '', last_activity_by: metadata.last_activity_by || '', last_contacted_at: row.last_contacted_at || metadata.last_contacted_at || null, next_follow_up_at: row.next_follow_up_at !== undefined ? row.next_follow_up_at : metadata.next_follow_up_at, created_at: row.created_at, updated_at: row.updated_at };
  }

  function customerRecord(row) {
    const metadata = valueObject(row.metadata);
    const hasRelationalAssignment = Object.prototype.hasOwnProperty.call(row, 'assigned_agent_id_legacy');
    const assignedAgentId = hasRelationalAssignment ? (row.assigned_agent_id_legacy || null) : (metadata.assigned_agent_id || null);
    const assignedAgent = hasRelationalAssignment ? (row.assigned_agent || 'Unassigned') : (row.assigned_agent || metadata.assigned_agent || 'Unassigned');
    return { ...metadata, lifecycle_version: row.lifecycle_version, workspace_id: row.workspace_id, id: row.legacy_id || row.id, lead_id: row.lead_id_legacy || metadata.lead_id || null, full_name: row.full_name, email: row.email, phone: row.phone, whatsapp_number: row.whatsapp_number, customer_status: statusTags.normalize(row.customer_status), assigned_agent_id: assignedAgentId, assigned_agent: assignedAgent, assigned_team_id: row.assigned_team_id_legacy || metadata.assigned_team_id || null, created_by: row.created_by_legacy || metadata.created_by || null, last_activity_at: metadata.last_activity_at || row.updated_at, last_activity_description: metadata.last_activity_description || '', last_activity_by: metadata.last_activity_by || '', last_contacted_at: row.last_contacted_at || metadata.last_contacted_at || null, next_follow_up_at: row.next_follow_up_at !== undefined ? row.next_follow_up_at : metadata.next_follow_up_at, lead_received_at: row.lead_received_at || null, lead_created_at: row.lead_created_at || null, created_at: row.created_at, updated_at: row.updated_at };
  }

  function followUpRecord(row) {
    const metadata = valueObject(row.metadata); const parts = localDateParts(row.due_at);
    return { ...metadata, lifecycle_version: row.lifecycle_version, followup_tags: Array.isArray(row.relationship_tags) ? row.relationship_tags.filter(statusTags.isValidTag) : metadata.followup_tags || (metadata.followup_tag ? [metadata.followup_tag] : []), workspace_id: row.workspace_id, cancelled_by_closure: row.cancelled_by_closure, id: row.legacy_id || row.id, lead_id: row.lead_id_legacy || metadata.lead_id || null, customer_id: row.customer_id_legacy || metadata.customer_id || null, customer_name: row.customer_name || row.lead_name || metadata.customer_name || metadata.lead_name || null, lead_name: row.lead_name || metadata.lead_name || null, phone: row.customer_phone || row.lead_phone || metadata.phone || metadata.customer_phone || null, customer_phone: row.customer_phone || row.lead_phone || metadata.customer_phone || null, lead_status: statusTags.normalize(row.lead_status || metadata.lead_status), follow_up_type: row.follow_up_type, due_date: metadata.due_date || parts.date, due_time: metadata.due_time || parts.time, priority: row.priority, lifecycle_status: row.status, status: displayStatus({ ...metadata, status: row.status, due_date: metadata.due_date || parts.date, due_time: metadata.due_time || parts.time }), last_activity_at: row.relationship_activity_at || metadata.last_activity_at || row.updated_at, last_activity_description: row.relationship_activity_description || metadata.last_activity_description || row.notes || '', last_activity_by: row.relationship_activity_by || metadata.last_activity_by || '', notes: row.notes, completed_at: row.completed_at, assigned_agent_id: row.assigned_agent_id_legacy || metadata.assigned_agent_id || null, assigned_agent: row.assigned_agent || metadata.assigned_agent || 'Unassigned', assigned_team_id: row.assigned_team_id_legacy || metadata.assigned_team_id || null, created_by: row.created_by_legacy || metadata.created_by || null, created_at: row.created_at, updated_at: row.updated_at };
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
    t.legacy_id AS assigned_team_id_legacy, t.name AS assigned_team_name, cu.legacy_id AS created_by_legacy
    FROM crm.leads l LEFT JOIN crm.lead_statuses ls ON ls.id = l.status_id
    LEFT JOIN crm.lead_sources src ON src.id = l.source_id LEFT JOIN crm.users au ON au.id = l.assigned_agent_id
    LEFT JOIN crm.teams t ON t.id = l.assigned_team_id LEFT JOIN crm.users cu ON cu.id = l.created_by`;

  function addDateBounds(conditions, params, expression, dateFrom, dateTo) {
    const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
    let start = valid(dateFrom) ? String(dateFrom) : '';
    let end = valid(dateTo) ? String(dateTo) : '';
    if (start && end && end < start) [start, end] = [end, start];
    if (start) { params.push(start); conditions.push(`(${expression}) >= $${params.length}::date`); }
    if (end) { params.push(end); conditions.push(`(${expression}) <= $${params.length}::date`); }
  }

  async function listLeads({ workspaceId: workspace, user, status, search, source, interest, priority, assignment, agentId, imported, dateFrom = '', dateTo = '', allSalesManagerLeads = false, pagination = null }) {
    const scoped = await scope(workspace, user, 'l', { allSalesManagerLeads }); const conditions = [...scoped.conditions]; const params = [...scoped.params];
    if (status) { params.push(status); conditions.push('ls.name = $' + params.length); }
    if (source) { params.push(source); conditions.push('src.name = $' + params.length); }
    if (interest) { params.push(interest); conditions.push('l.interested_in = $' + params.length); }
    if (priority) { params.push(priority); conditions.push('l.priority = $' + params.length); }
    if (assignment === 'assigned') conditions.push('l.assigned_agent_id IS NOT NULL');
    if (assignment === 'unassigned') conditions.push('l.assigned_agent_id IS NULL');
    if (agentId) { params.push(await resolveUserId(workspace, agentId)); conditions.push('l.assigned_agent_id = $' + params.length); }
    addDateBounds(conditions, params, "COALESCE(l.received_at AT TIME ZONE 'Asia/Karachi', l.created_at AT TIME ZONE 'Asia/Karachi')::date", dateFrom, dateTo);
    if (search) {
      const normalizedSearch = String(search).normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
      const searchTokens = normalizedSearch.split(' ').filter(Boolean);
      const searchableFields = [
        "lower(regexp_replace(coalesce(l.full_name, ''), '\\s+', ' ', 'g'))",
        "lower(regexp_replace(coalesce(l.email, ''), '\\s+', ' ', 'g'))",
        "lower(regexp_replace(coalesce(l.phone, ''), '\\s+', ' ', 'g'))",
        "lower(regexp_replace(coalesce(l.whatsapp_number, ''), '\\s+', ' ', 'g'))",
        "lower(regexp_replace(coalesce(l.interested_in, ''), '\\s+', ' ', 'g'))",
        "lower(regexp_replace(coalesce(l.external_lead_id, ''), '\\s+', ' ', 'g'))",
        "lower(regexp_replace(coalesce(l.idempotency_key, ''), '\\s+', ' ', 'g'))",
        "lower(regexp_replace(coalesce(l.metadata::text, ''), '\\s+', ' ', 'g'))",
        "lower(regexp_replace(coalesce(au.full_name, ''), '\\s+', ' ', 'g'))"
      ];
      const tokenConditions = searchTokens.map(token => {
        params.push(`%${token}%`);
        const p = '$' + params.length;
        return `(${searchableFields.map(field => `${field} LIKE ${p}`).join(' OR ')} OR EXISTS (SELECT 1 FROM crm.lead_notes n WHERE n.lead_id=l.id AND n.deleted_at IS NULL AND lower(regexp_replace(n.note, '\\s+', ' ', 'g')) LIKE ${p}) OR EXISTS (SELECT 1 FROM crm.lead_activities a WHERE a.lead_id=l.id AND lower(regexp_replace(a.description, '\\s+', ' ', 'g')) LIKE ${p}) OR EXISTS (SELECT 1 FROM crm.audit_events a WHERE a.entity_id=l.id AND a.workspace_id=l.workspace_id AND lower(regexp_replace(a.after_data::text, '\\s+', ' ', 'g')) LIKE ${p}))`;
      });
      if (tokenConditions.length) conditions.push(tokenConditions.join(' AND '));
    }
    if (imported === 'true' || imported === 'imported' || imported === 'webhook') conditions.push(`(l.metadata->>'is_imported')::boolean IS TRUE`);
    if (imported === 'unassigned') conditions.push(`(l.metadata->>'is_imported')::boolean IS TRUE AND l.assigned_agent_id IS NULL`);
    if (imported === 'webhook') conditions.push(`l.metadata->>'webhook_connection_id' IS NOT NULL`);
    const where = conditions.join(' AND ');
    // Legacy callers keep the deterministic created_at/id fallback while Meta
    // rows use received_at so the list reflects actual form submission time.
    const leadOrder = 'COALESCE(l.received_at, l.created_at) DESC, l.id DESC'; // Legacy shape: ORDER BY l.created_at DESC, l.id DESC
    if (pagination) {
      const totalRows = await sql.query(`SELECT COUNT(*)::bigint AS total FROM (${leadSelect} WHERE ${where}) scoped_leads`, params);
      const meta = paginationMeta(pagination, Number(totalRows[0]?.total || 0));
      const limit = params.length + 1; const offset = params.length + 2;
      const limitParam = '$' + limit; const offsetParam = '$' + offset;
      const rows = await sql.query(`${leadSelect} WHERE ${where} ORDER BY ${leadOrder} LIMIT ${limitParam} OFFSET ${offsetParam}`, [...params, pagination.pageSize, pagination.offset]);
      return { rows: rows.map(leadRecord), meta };
    }
    const rows = await sql.query(`${leadSelect} WHERE ${where} ORDER BY ${leadOrder}`, params); return rows.map(leadRecord);
  }

  async function findLeadDuplicate(workspace, { phone = '', email = '', externalLeadId = '' } = {}) {
    const conditions = ['l.workspace_id = $1', 'l.deleted_at IS NULL']; const params = [workspace]; const matches = [];
    if (phone) { params.push(phone); matches.push(`regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') = regexp_replace($${params.length}, '[^0-9]', '', 'g')`); }
    if (email) { params.push(String(email).toLowerCase()); matches.push(`lower(coalesce(l.email, '')) = $${params.length}`); }
    if (externalLeadId) { params.push(String(externalLeadId)); matches.push(`l.external_lead_id = $${params.length}`); }
    if (!matches.length) return null;
    conditions.push(`(${matches.join(' OR ')})`);
    const rows = await sql.query(`${leadSelect} WHERE ${conditions.join(' AND ')} ORDER BY l.created_at DESC LIMIT 1`, params);
    return rows[0] ? leadRecord(rows[0]) : null;
  }

  async function findExistingContact(workspace, { fullName = '', phone = '', whatsapp = '', email = '', externalLeadId = '', formId = '' } = {}) {
    const customerConditions = ['c.workspace_id = $1', 'c.deleted_at IS NULL'];
    const customerParams = [workspace];
    const customerMatches = [];
    const hasStrongIdentity = Boolean(String(phone || '').trim() || String(whatsapp || '').trim() || String(email || '').trim() || String(externalLeadId || '').trim() || String(formId || '').trim());
    const addCustomerPhone = value => { if (value) { customerParams.push(value); const p = `$${customerParams.length}`; customerMatches.push(`regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = regexp_replace(${p}, '[^0-9]', '', 'g') OR regexp_replace(coalesce(c.whatsapp_number, ''), '[^0-9]', '', 'g') = regexp_replace(${p}, '[^0-9]', '', 'g')`); } };
    addCustomerPhone(phone); addCustomerPhone(whatsapp);
    if (email) { customerParams.push(String(email).toLowerCase()); customerMatches.push(`lower(coalesce(c.email, '')) = $${customerParams.length}`); }
    if (fullName && !hasStrongIdentity) { customerParams.push(String(fullName).trim().toLowerCase()); customerMatches.push(`lower(trim(coalesce(c.full_name, ''))) = $${customerParams.length}`); }
    if (externalLeadId) { customerParams.push(String(externalLeadId)); customerMatches.push(`coalesce(l.external_lead_id, c.metadata->>'external_lead_id', c.metadata->>'meta_lead_id') = $${customerParams.length}`); }
    if (formId) { customerParams.push(String(formId)); customerMatches.push(`coalesce(l.metadata->>'form_id', c.metadata->>'form_id') = $${customerParams.length}`); }
    if (customerMatches.length) {
      const customerRows = await sql.query(`SELECT c.legacy_id AS customer_id, l.legacy_id AS lead_id FROM crm.customers c LEFT JOIN crm.leads l ON l.id = c.lead_id WHERE ${customerConditions.join(' AND ')} AND (${customerMatches.join(' OR ')}) ORDER BY c.created_at DESC LIMIT 1`, customerParams);
      if (customerRows[0]) return { type: 'customer', customer: await getCustomer(workspace, customerRows[0].customer_id), lead: customerRows[0].lead_id ? await getLead(workspace, customerRows[0].lead_id) : null };
    }

    const leadConditions = ['l.workspace_id = $1', 'l.deleted_at IS NULL'];
    const leadParams = [workspace];
    const leadMatches = [];
    const addLeadPhone = value => { if (value) { leadParams.push(value); const p = `$${leadParams.length}`; leadMatches.push(`regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') = regexp_replace(${p}, '[^0-9]', '', 'g') OR regexp_replace(coalesce(l.whatsapp_number, ''), '[^0-9]', '', 'g') = regexp_replace(${p}, '[^0-9]', '', 'g')`); } };
    addLeadPhone(phone); addLeadPhone(whatsapp);
    if (email) { leadParams.push(String(email).toLowerCase()); leadMatches.push(`lower(coalesce(l.email, '')) = $${leadParams.length}`); }
    if (fullName && !hasStrongIdentity) { leadParams.push(String(fullName).trim().toLowerCase()); leadMatches.push(`lower(trim(coalesce(l.full_name, ''))) = $${leadParams.length}`); }
    if (externalLeadId) { leadParams.push(String(externalLeadId)); leadMatches.push(`coalesce(l.external_lead_id, l.metadata->>'external_lead_id', l.metadata->>'meta_lead_id') = $${leadParams.length}`); }
    if (formId) { leadParams.push(String(formId)); leadMatches.push(`l.metadata->>'form_id' = $${leadParams.length}`); }
    if (!leadMatches.length) return null;
    const leadRows = await sql.query(`${leadSelect} WHERE ${leadConditions.join(' AND ')} AND (${leadMatches.join(' OR ')}) ORDER BY l.created_at DESC LIMIT 1`, leadParams);
    return leadRows[0] ? { type: 'lead', customer: leadRows[0].linked_customer_id ? await getCustomer(workspace, leadRows[0].linked_customer_id) : null, lead: leadRecord(leadRows[0]) } : null;
  }

  async function getLead(workspace, identifier) { const id = await resolveLeadId(workspace, identifier); if (!id) return null; const rows = await sql.query(`${leadSelect} WHERE l.id = $1 LIMIT 1`, [id]); return rows[0] ? leadRecord(rows[0]) : null; }

  async function listLeadActivities(workspace, identifier) { const id = await resolveLeadId(workspace, identifier); if (!id) return []; return sql.query(`SELECT a.id, a.activity_type, a.description, a.metadata, u.full_name AS user_name, u.legacy_id AS user_id, a.created_at FROM crm.lead_activities a LEFT JOIN crm.users u ON u.id = a.actor_user_id WHERE a.lead_id = $1 ORDER BY a.created_at DESC`, [id]); }

  async function insertAudit(workspace, actor, action, entityType, entityId, afterData = {}) { await sql.query('INSERT INTO crm.audit_events (workspace_id, actor_user_id, action, entity_type, entity_id, after_data) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [workspace, await resolveUserId(workspace, actor?.id || actor), action, entityType, entityId || null, JSON.stringify(afterData)]); }
  async function enqueueOutbox(workspace, eventType, aggregateType, aggregateId, payload, idempotencyKey) { await sql.query(`INSERT INTO crm.outbox_events (workspace_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key) VALUES ($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT (idempotency_key) DO NOTHING`, [workspace,eventType,aggregateType,aggregateId,JSON.stringify(payload||{}),idempotencyKey||`${eventType}:${aggregateId}:${Date.now()}`]); }

  async function syncLeadFollowUpTag(workspace, actor, lead) {
    try {
    if (!lead?.id || statusTags.isTerminal(lead.status, lead.tags)) return;
    const tags = normalizeTags(lead.tags).map(item => item.toLowerCase());
    const tagged = (tags.includes('follow-up') || tags.includes('follow-up needed'));
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
      notes: 'Created automatically from the Follow-up status tag.',
      source: 'follow-up-tag'
    });
    } catch (error) {
      console.warn('Unable to sync Follow-up Needed tag:', error.message);
    }
  }

  async function createLead({ workspaceId: workspace, actor, lead }) {
    if (!statusTags.isValid(lead.status || 'New')) throw new Error('Invalid lead status.');
    await listLeadConfiguration(workspace, 'lead-statuses');
    const legacyId = lead.legacy_id || `lead_${crypto.randomUUID()}`; const actorId = await resolveUserId(workspace, actor.id); const agentId = await resolveUserId(workspace, lead.assigned_agent_id); const teamId = await resolveTeamId(workspace, lead.assigned_team_id || actor.team_id); const receivedAt = leadReceivedAt(lead);
    const configuration = await ensureWebhookLeadConfiguration(workspace, lead.status || 'New', lead.lead_source || 'Manual Entry');
    const statusRows = configuration.statusRows; const sourceRows = configuration.sourceRows;
    const rows = await sql.query(`INSERT INTO crm.leads (workspace_id, legacy_id, full_name, email, phone, whatsapp_number, city, area, interested_in, property_type, budget, preferred_location, purpose, buying_timeline, financing_required, status_id, source_id, priority, assigned_agent_id, assigned_team_id, created_by, external_source, external_lead_id, idempotency_key, received_at, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::timestamptz,$26::jsonb) RETURNING id`, [workspace, legacyId, lead.full_name, lead.email || null, lead.phone || null, lead.whatsapp_number || null, lead.city || null, lead.area || null, lead.interested_in || null, lead.property_type || null, lead.budget || null, lead.preferred_location || null, lead.purpose || null, lead.buying_timeline || null, Boolean(lead.financing_required), statusRows[0]?.id || null, sourceRows[0]?.id || null, lead.priority || 'Medium', agentId, teamId, actorId, lead.external_source || null, lead.external_lead_id || null, lead.idempotency_key || legacyId, receivedAt, JSON.stringify(lead)]);
     const leadId = rows[0].id; if (lead.next_follow_up_at) await sql.query('UPDATE crm.leads SET next_follow_up_at=$1 WHERE id=$2',[timestampValue(lead.next_follow_up_at),leadId]); await insertAudit(workspace, actor, 'lead_created', 'lead', leadId, { legacy_id: legacyId, full_name: lead.full_name }); await enqueueOutbox(workspace,'lead_created','lead',leadId,{legacy_id:legacyId},`lead_created:${legacyId}`); const created = await getLead(workspace, legacyId);
     // New leads become customer profiles immediately unless the intake status/tag
     // explicitly closes the opportunity. Keep this server-side so imports and
     // non-browser clients follow the same rule as the lead form.
     if (Array.isArray(created.tags) && created.tags.some(tag => statusTags.tagValues.some(valid => valid.toLowerCase() === String(tag || '').trim().toLowerCase())) && !statusTags.isTerminal(created.status, created.tags) && created.assigned_agent_id) await convertLeadToCustomer(workspace, legacyId, actor);
     await syncLeadFollowUpTag(workspace, actor, await getLead(workspace, legacyId)); return getLead(workspace, legacyId);
  }

  function closureRequested(patch, current) {
    const selected=patch.status || patch.customer_status;
    if(current?.lifecycle_version>0 && selected && !statusTags.isTerminal(selected)) return false;
    return statusTags.isTerminal(patch.status || patch.customer_status, patch.tags);
  }
  async function transitionOpportunity(workspace, identifier, actor, status, reason, details = {}, origin = 'lead') {
    const current = await getLead(workspace,identifier);
    if (!current || !canViewOwnedRecord(actor,current)) throw new Error('Opportunity is outside your ownership scope.');
    await sql.query('SELECT crm.transition_opportunity($1,$2,$3,$4,$5,$6::jsonb,$7)',[workspace,await resolveLeadId(workspace,identifier),await resolveUserId(workspace,actor.id),status,reason || 'Not Interested',JSON.stringify(details),origin]);
    return getLead(workspace,identifier);
  }

  async function updateLead(workspace, identifier, actor, patch) {
    const before = await getLead(workspace,identifier);
    if (closureRequested(patch,before) || patch.status !== undefined) {
      // Persist form edits and the lifecycle command together.
      const result=await transitionOpportunity(workspace,identifier,actor,closureRequested(patch,before) ? 'Closed Lost' : patch.status,patch.closure_reason,patch);
      if (!before.lifecycle_version && !['Closed Lost','Not Interested'].includes(result.status) && (patch.tags !== undefined || patch.next_follow_up_at !== undefined)) await syncLeadFollowUpTag(workspace,actor,result);
      if (patch.tags !== undefined) await ensureTaggedLeadCustomer(workspace, identifier, actor, patch, result);
      return result;
    }
    const id = await resolveLeadId(workspace, identifier); if (!id) return null; const current = await getLead(workspace, identifier); const fields = []; const params = []; const assign = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`); };
    for (const column of ['full_name', 'phone', 'whatsapp_number', 'email', 'city', 'area', 'interested_in', 'property_type', 'budget', 'preferred_location', 'purpose', 'buying_timeline', 'priority']) if (patch[column] !== undefined) assign(column, patch[column]);
    if (patch.financing_required !== undefined) assign('financing_required', Boolean(patch.financing_required));
    if (patch.status !== undefined) { const rows = await sql.query('SELECT id FROM crm.lead_statuses WHERE workspace_id = $1 AND name = $2 LIMIT 1', [workspace, patch.status]); assign('status_id', rows[0]?.id || null); }
    if (patch.lead_source !== undefined) { const configuration = await ensureWebhookLeadConfiguration(workspace, current.status || 'New', patch.lead_source); assign('source_id', configuration.sourceRows[0]?.id || null); }
    if (patch.next_follow_up_at !== undefined) assign('next_follow_up_at', timestampValue(patch.next_follow_up_at));
    if (patch.tags !== undefined) { params.push(JSON.stringify(normalizeTags(patch.tags))); fields.push(`metadata=jsonb_set(metadata,'{tags}',$${params.length}::jsonb,true)`); }
    if (fields.length) { params.push(id); await sql.query(`UPDATE crm.leads SET ${fields.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params); }
    await pipeline.recordActivity(workspace, actor, { leadId: id, type: patch.tags !== undefined ? 'Tags updated' : 'Lead updated', description: patch.tags !== undefined ? `Tags: ${normalizeTags(patch.tags).join(', ') || 'None'}` : 'Lead details updated.' }); await insertAudit(workspace, actor, 'lead_updated', 'lead', id, patch); await enqueueOutbox(workspace,'lead_updated','lead',id,patch); if (patch.status !== undefined) await sql.query('UPDATE crm.customers SET customer_status=$1,updated_at=now() WHERE workspace_id=$2 AND lead_id=$3 AND deleted_at IS NULL',[patch.status,workspace,id]);
    if (patch.tags !== undefined) await sql.query("UPDATE crm.customers SET metadata=jsonb_set(metadata,'{tags}',$3::jsonb,true),updated_at=now() WHERE workspace_id=$1 AND lead_id=$2 AND deleted_at IS NULL",[workspace,id,JSON.stringify(normalizeTags(patch.tags))]);
    const updated = await getLead(workspace, identifier); if (patch.tags !== undefined) await ensureTaggedLeadCustomer(workspace, identifier, actor, patch, updated); if (patch.tags !== undefined || patch.next_follow_up_at !== undefined) await syncLeadFollowUpTag(workspace, actor, await getLead(workspace, identifier)); return getLead(workspace, identifier);
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
    await sql.query(`INSERT INTO crm.lead_assignment_history
      (lead_id, from_agent_id, to_agent_id, from_team_id, to_team_id, changed_by)
      VALUES ($1,$2,$3,$4,$5,$6)`, [id, previousAgentId, agentId, previousTeamId, teamId, await resolveUserId(workspace, actor.id)]);
    await pipeline.recordActivity(workspace,actor,{leadId:id,type:'Lead assigned',description:`Assigned to ${agent.full_name}.`});
    await insertAudit(workspace,actor,'lead_assigned','lead',id,{assigned_agent_id:assignedAgent});
    await enqueueOutbox(workspace,'lead_assigned','lead',id,{assigned_agent_id:assignedAgent});
    const updated = await getLead(workspace,identifier);
    await syncLeadFollowUpTag(workspace,actor,updated);
    return updated;
  }

  async function bulkAssignLeads(workspace, identifiers, actor, { assignedAgent, assignedTeam, clearAgent = false } = {}) {
    const requested = [...new Set((Array.isArray(identifiers) ? identifiers : []).map(value => String(value || '').trim()).filter(Boolean))];
    if (!requested.length || requested.length > 250) return null;
    if (!['super_admin', 'sales_manager'].includes(actor?.role)) return null;

    const targetAgent = assignedAgent ? await findUser(workspace, assignedAgent) : null;
    if (assignedAgent && (!targetAgent || targetAgent.status !== 'active' || !['sales_agent', 'sales_manager'].includes(targetAgent.role))) return null;
    if (actor.role === 'sales_manager' && targetAgent && targetAgent.team_id !== actor.team_id) return null;

    const targetTeamIdentifier = targetAgent?.team_id || assignedTeam || (actor.role === 'sales_manager' ? actor.team_id : null);
    const targetTeam = targetTeamIdentifier ? await resolveTeamId(workspace, targetTeamIdentifier) : null;
    if (targetTeamIdentifier && !targetTeam) return null;
    if (actor.role === 'sales_manager' && targetTeamIdentifier !== actor.team_id) return null;
    if (!targetAgent && !targetTeam && !clearAgent) return null;

    const leads = [];
    for (const identifier of requested) {
      const lead = await getLead(workspace, identifier);
      if (!lead || !canViewOwnedRecord(actor, lead)) return null;
      leads.push({ lead, id: await resolveLeadId(workspace, identifier) });
    }

    const assignedAgentId = targetAgent ? await resolveUserId(workspace, targetAgent.id) : null;
    const followUpAgentId = assignedAgentId || await resolveUserId(workspace, actor.id);
    for (const { lead, id } of leads) {
      const previousAgentId = await resolveUserId(workspace, lead.assigned_agent_id);
      const previousTeamId = await resolveTeamId(workspace, lead.assigned_team_id);
      await sql.query(`WITH moved_lead AS (
        UPDATE crm.leads SET assigned_agent_id=$1,assigned_team_id=$3,updated_at=now()
        WHERE id=$4 AND workspace_id=$5 RETURNING id
      ), moved_customers AS (
        UPDATE crm.customers SET assigned_agent_id=$1,assigned_team_id=$3,updated_at=now()
        WHERE workspace_id=$5 AND lead_id IN (SELECT id FROM moved_lead) RETURNING id
      ) UPDATE crm.follow_ups SET assigned_agent_id=$2,assigned_team_id=$3,updated_at=now()
        WHERE workspace_id=$5 AND assigned_agent_id=$6 AND assigned_team_id IS NOT DISTINCT FROM $7::uuid
          AND ((customer_id IN (SELECT id FROM moved_customers) AND (lead_id IS NULL OR lead_id=$4))
          OR (customer_id IS NULL AND lead_id IN (SELECT id FROM moved_lead)))`, [assignedAgentId, followUpAgentId, targetTeam, id, workspace, previousAgentId, previousTeamId]);
      await sql.query(`INSERT INTO crm.lead_assignment_history
        (lead_id, from_agent_id, to_agent_id, from_team_id, to_team_id, changed_by)
        VALUES ($1,$2,$3,$4,$5,$6)`, [id, previousAgentId, assignedAgentId, previousTeamId, targetTeam, await resolveUserId(workspace, actor.id)]);
      await pipeline.recordActivity(workspace, actor, { leadId: id, type: 'Lead assigned', description: targetAgent ? `Assigned to ${targetAgent.full_name}.` : targetTeamIdentifier ? 'Assigned to a team queue.' : 'Agent assignment cleared.' });
      await insertAudit(workspace, actor, 'lead_bulk_assigned', 'lead', id, { assigned_agent_id: assignedAgent || null, assigned_team_id: targetTeamIdentifier || null, bulk_count: requested.length });
      await enqueueOutbox(workspace, 'lead_assigned', 'lead', id, { assigned_agent_id: assignedAgent || null, assigned_team_id: targetTeamIdentifier || null }, `lead_assigned:${id}:${assignedAgent || 'team'}:${targetTeamIdentifier || 'none'}`);
    }
    return Promise.all(leads.map(({ lead }) => getLead(workspace, lead.id)));
  }

  async function changeLeadStatus(workspace, identifier, actor, status, priority, reason) {
    if(!statusTags.isValid(status)) return null;
    return transitionOpportunity(workspace,identifier,actor,status,reason,{...(priority ? {priority} : {})});
  }

  async function addLeadActivity(workspace, identifier, actor, activityType, description, metadata = {}) {
    const id = await resolveLeadId(workspace, identifier); if (!id) return null;
    if (activityType === 'Note added') {
      const current=await getLead(workspace,identifier);
      const input=metadata.note_input || {};
      const closed=statusTags.isTerminal(current.status,current.tags);
      const requestedTerminal = terminalStatusFromTags(input.followup_tags ?? input.followup_tag);
      if(closed && !requestedTerminal && input.next_followup_days && input.next_followup_days !== 'none') throw new Error('Reactivate this opportunity before scheduling a follow-up.');
      const plan = notePlan(closed && !requestedTerminal ? {...input,next_followup_days:'none'} : input);
      if (plan.terminal_status) {
        await transitionOpportunity(workspace,identifier,actor,plan.terminal_status,input.closure_reason || input.reason || 'Terminal outcome selected',{tags: plan.tags},'lead');
        return pipeline.saveNote(workspace,actor,{leadId:id,note:description,plan:{...plan,tag:undefined,tags:[],schedule:null}});
      }
      if (!closed && plan.contacted && plan.schedule) await convertLeadToCustomer(workspace,identifier,actor);
      return pipeline.saveNote(workspace,actor,{leadId:id,note:description,plan});
    }
    return pipeline.recordActivity(workspace,actor,{leadId:id,type:activityType,description,metadata});
  }

  async function convertLeadToCustomer(workspace, identifier, actor) {
    const lead = await getLead(workspace, identifier);
    if (!lead) return null;
    if (statusTags.isTerminal(lead.status, lead.tags)) throw new Error('Closed opportunities do not create customer profiles.');
    if (!lead.assigned_agent_id) throw new Error('Assign a sales agent before creating a customer profile.');
    const leadId = await resolveLeadId(workspace, identifier);
    const existing = await sql.query('SELECT id, legacy_id FROM crm.customers WHERE lead_id = $1 AND deleted_at IS NULL LIMIT 1', [leadId]);
    if (existing[0]) return getCustomer(workspace, existing[0].legacy_id || existing[0].id);
    const legacyId = `customer_${crypto.randomUUID()}`;
    await sql.query(`INSERT INTO crm.customers (workspace_id, legacy_id, lead_id, full_name, email, phone, whatsapp_number, customer_status, assigned_agent_id, assigned_team_id, created_by, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`, [workspace, legacyId, leadId, lead.full_name, lead.email || null, lead.phone || null, lead.whatsapp_number || null, lead.status === 'Closed Won' ? 'Closed Won' : lead.status === 'Hot' ? 'Hot' : lead.status === 'Follow-up' ? 'Follow-up' : 'Active', await resolveUserId(workspace, lead.assigned_agent_id), await resolveTeamId(workspace, lead.assigned_team_id), await resolveUserId(workspace, actor.id), JSON.stringify(lead)]);
    const customerId = await resolveCustomerId(workspace, legacyId);
    await insertAudit(workspace, actor, 'lead_converted', 'lead', leadId, { customer_legacy_id: legacyId });
    await enqueueOutbox(workspace, 'customer_created', 'customer', customerId, { legacy_id: legacyId, lead_id: identifier });
    return getCustomer(workspace, legacyId);
  }

  async function ensureTaggedLeadCustomer(workspace, identifier, actor, patch, lead) {
    if (patch?.tags === undefined || !Array.isArray(patch.tags) || !patch.tags.length) return;
    if (statusTags.isTerminal(lead?.status, lead?.tags)) return;
    if (!patch.tags.some(tag => statusTags.tagValues.some(valid => valid.toLowerCase() === String(tag || '').trim().toLowerCase()))) return;
    await convertLeadToCustomer(workspace, identifier, actor);
  }

  async function reconcileTaggedLeadCustomers(workspace, actor) {
    const configuredTags = await listLeadConfiguration(workspace, 'lead-tags');
    const validTags = new Set([...statusTags.tagValues, ...configuredTags.map(item => String(item.name || '').trim()).filter(Boolean)].map(tag => String(tag).toLowerCase()));
    const rows = await sql.query(`${leadSelect} WHERE l.workspace_id=$1 AND l.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM crm.customers c WHERE c.workspace_id=l.workspace_id AND c.lead_id=l.id AND c.deleted_at IS NULL)
      AND jsonb_array_length(CASE WHEN jsonb_typeof(coalesce(l.metadata->'tags','[]'::jsonb))='array' THEN coalesce(l.metadata->'tags','[]'::jsonb) ELSE '[]'::jsonb END)>0
      ORDER BY l.created_at ASC`, [workspace]);
    const result = { checked: 0, created: [], skipped: [], failed: [] };
    for (const row of rows) {
      const lead = leadRecord(row); result.checked += 1;
      const tags = Array.isArray(lead.tags) ? lead.tags : [];
      if (!tags.some(tag => validTags.has(String(tag).trim().toLowerCase())) || statusTags.isTerminal(lead.status, tags)) {
        result.skipped.push({ leadId: lead.id, reason: statusTags.isTerminal(lead.status, tags) ? 'Terminal lead' : 'No valid CRM tag' });
        continue;
      }
      if (!lead.assigned_agent_id) { result.skipped.push({ leadId: lead.id, reason: 'No assigned sales agent' }); continue; }
      try {
        const customer = await convertLeadToCustomer(workspace, lead.id, actor);
        if (customer?.id) result.created.push({ leadId: lead.id, customerId: customer.id, assignedAgent: customer.assigned_agent || 'Unassigned' });
        else result.skipped.push({ leadId: lead.id, reason: 'Customer already existed or could not be created' });
      } catch (error) {
        result.failed.push({ leadId: lead.id, reason: error.message || 'Customer conversion failed' });
      }
    }
    return { ...result, createdCount: result.created.length, skippedCount: result.skipped.length, failedCount: result.failed.length };
  }

  const customerSelect = `SELECT c.*, l.legacy_id AS lead_id_legacy, l.received_at AS lead_received_at, l.created_at AS lead_created_at, au.legacy_id AS assigned_agent_id_legacy, au.full_name AS assigned_agent, t.legacy_id AS assigned_team_id_legacy, cu.legacy_id AS created_by_legacy FROM crm.customers c LEFT JOIN crm.leads l ON l.id = c.lead_id LEFT JOIN crm.users au ON au.id = c.assigned_agent_id LEFT JOIN crm.teams t ON t.id = c.assigned_team_id LEFT JOIN crm.users cu ON cu.id = c.created_by`;

  async function createCustomerFromLead(workspace, identifier, actor, input = {}) {
    const lead = await getLead(workspace, identifier);
    if (!lead || !canViewOwnedRecord(actor, lead)) throw new Error('Lead is outside your ownership scope.');
    if (statusTags.isTerminal(lead.status, lead.tags)) {
      const existingRows = await sql.query('SELECT coalesce(legacy_id,id::text) AS id FROM crm.customers WHERE workspace_id=$1 AND lead_id=$2 AND deleted_at IS NULL LIMIT 1', [workspace, await resolveLeadId(workspace, identifier)]);
      if (!existingRows[0]) throw new Error('Closed opportunities do not create customer profiles.');
      const customer = await getCustomer(workspace, existingRows[0].id);
      if (!customer || !canViewOwnedRecord(actor, customer)) throw new Error('The linked customer is unavailable in your scope.');
      return { customer, created: false, follow_up_id: null };
    }
    const plan = customerCreationPlan(input, lead);
    const leadId = await resolveLeadId(workspace, identifier);
    const existingRow = (await sql.query('SELECT coalesce(legacy_id,id::text) AS id FROM crm.customers WHERE workspace_id=$1 AND lead_id=$2 AND deleted_at IS NULL LIMIT 1', [workspace, leadId]))[0];
    if (existingRow) {
      const customer = await getCustomer(workspace, existingRow.id);
      if (!customer || !canViewOwnedRecord(actor, customer)) throw new Error('The linked customer is unavailable in your scope.');
      if (!plan.schedule) return { customer, created: false, follow_up_id: null };

      // Non-terminal leads are auto-linked to customers. Reusing the lead-to-
      // customer action must still schedule the requested first reminder.
      const reminder = await createFollowUp(workspace, actor, {
        customer_id: customer.id,
        lead_id: lead.id,
        due_date: plan.schedule.due_date,
        due_time: plan.schedule.due_time,
        notes: plan.note,
        note: plan.note,
        follow_up_type: 'General Follow-up',
        priority: lead.priority || 'Medium',
        followup_tag: plan.tag,
        followup_tags: plan.tags
      });
      if (!reminder) throw new Error('The follow-up could not be scheduled for this customer.');
      const actorId = await resolveUserId(workspace, actor.id);
      const customerId = await resolveCustomerId(workspace, customer.id);
      const existingNote = await sql.query('SELECT id FROM crm.customer_notes WHERE customer_id=$1 AND author_user_id=$2 AND note=$3 AND deleted_at IS NULL LIMIT 1', [customerId, actorId, plan.note]);
      if (!existingNote[0]) await sql.query('INSERT INTO crm.customer_notes (customer_id,author_user_id,note) VALUES ($1,$2,$3)', [customerId, actorId, plan.note]);
      const tagJson = JSON.stringify(plan.tags || []);
      await sql.query(`UPDATE crm.leads SET metadata=metadata || jsonb_build_object('tags',$2::jsonb,'followup_tag',$3::text,'followup_tags',$2::jsonb),updated_at=now() WHERE id=$1`, [leadId, tagJson, plan.tag || null]);
      await sql.query(`UPDATE crm.customers SET metadata=metadata || jsonb_build_object('tags',$2::jsonb,'followup_tag',$3::text,'followup_tags',$2::jsonb),updated_at=now() WHERE id=$1`, [customerId, tagJson, plan.tag || null]);
      return { customer: await getCustomer(workspace, customer.id), created: false, follow_up_id: reminder.id };
    }
    const result = await insertLeadCustomer(sql, { workspace, lead, leadId, actor, plan,
      actorId: await resolveUserId(workspace, actor.id), teamId: await resolveTeamId(workspace, actor.team_id) });
    const existing = result ? null : (await sql.query('SELECT coalesce(legacy_id,id::text) AS id FROM crm.customers WHERE workspace_id=$1 AND lead_id=$2 AND deleted_at IS NULL', [workspace, leadId]))[0];
    const customer = await getCustomer(workspace, result?.customer_id || existing?.id);
    if (!customer || !canViewOwnedRecord(actor, customer)) throw new Error('The linked customer is unavailable in your scope.');
    return { customer, created: Boolean(result), follow_up_id: result?.follow_up_id || null };
  }

  async function listCustomers({ workspaceId: workspace, user, status, source, search, city, interest, priority, agentId, dateFrom = '', dateTo = '', pagination = null }) {
    const scoped = await scope(workspace, user, 'c'); const conditions = [...scoped.conditions]; const params = [...scoped.params];
    if (status) { params.push(status); conditions.push('c.customer_status = $' + params.length); }
    if (source) { params.push(source); conditions.push("coalesce(c.metadata->>'lead_source','') = $" + params.length); }
    if (city) { params.push(city); conditions.push("coalesce(c.metadata->>'city','') = $" + params.length); }
    if (interest) { params.push(interest); conditions.push("coalesce(c.metadata->>'interested_in','') = $" + params.length); }
    if (priority) { params.push(priority); conditions.push("coalesce(c.metadata->>'priority','') = $" + params.length); }
    if (agentId) {
      if (agentId === '__unassigned__') conditions.push('c.assigned_agent_id IS NULL');
      else { params.push(await resolveUserId(workspace, agentId)); conditions.push('c.assigned_agent_id = $' + params.length); }
    }
    addDateBounds(conditions, params, "COALESCE(l.received_at AT TIME ZONE 'Asia/Karachi', l.created_at AT TIME ZONE 'Asia/Karachi', c.created_at AT TIME ZONE 'Asia/Karachi')::date", dateFrom, dateTo);
    if (search) { params.push(`%${String(search).toLowerCase()}%`); const p = '$' + params.length; conditions.push(`(lower(c.full_name) LIKE ${p} OR lower(coalesce(c.email,'')) LIKE ${p} OR lower(coalesce(c.phone,'')) LIKE ${p} OR lower(coalesce(c.whatsapp_number,'')) LIKE ${p} OR lower(coalesce(c.metadata->>'city','')) LIKE ${p} OR lower(coalesce(c.metadata->>'interested_in','')) LIKE ${p} OR lower(coalesce(au.full_name,'')) LIKE ${p} OR EXISTS (SELECT 1 FROM crm.customer_notes n WHERE n.customer_id=c.id AND n.deleted_at IS NULL AND lower(n.note) LIKE ${p}) OR EXISTS (SELECT 1 FROM crm.customer_activities a WHERE a.customer_id=c.id AND lower(a.description) LIKE ${p}))`); }
    const where = conditions.join(' AND ');
    if (pagination) {
      const totalRows = await sql.query(`SELECT COUNT(*)::bigint AS total FROM (${customerSelect} WHERE ${where}) scoped_customers`, params);
      const meta = paginationMeta(pagination, Number(totalRows[0]?.total || 0));
      const limit = params.length + 1; const offset = params.length + 2;
      const limitParam = '$' + limit; const offsetParam = '$' + offset;
      const rows = await sql.query(`${customerSelect} WHERE ${where} ORDER BY c.created_at DESC, c.id DESC LIMIT ${limitParam} OFFSET ${offsetParam}`, [...params, pagination.pageSize, pagination.offset]);
      return { rows: rows.map(customerRecord), meta };
    }
    const rows = await sql.query(`${customerSelect} WHERE ${where} ORDER BY c.created_at DESC, c.id DESC`, params); return rows.map(customerRecord);
  }
  async function getCustomer(workspace, identifier) { const id = await resolveCustomerId(workspace, identifier); if (!id) return null; const rows = await sql.query(`${customerSelect} WHERE c.id = $1 AND c.deleted_at IS NULL LIMIT 1`, [id]); return rows[0] ? customerRecord(rows[0]) : null; }
  async function updateCustomer(workspace, identifier, actor, patch) {
    const before=await getCustomer(workspace,identifier);
    if (closureRequested(patch,before) || patch.customer_status !== undefined) {
      await transitionOpportunity(workspace,before.lead_id,actor,closureRequested(patch,before) ? 'Closed Lost' : patch.customer_status,patch.closure_reason,patch,'customer');
      return getCustomer(workspace,identifier);
    } const id = await resolveCustomerId(workspace, identifier); if (!id) return null; const current = await getCustomer(workspace, identifier); const fields=[]; const params=[]; const assign=(column,value)=>{params.push(value);fields.push(`${column} = $${params.length}`)}; for(const column of ['full_name','phone','whatsapp_number','email']) if(patch[column]!==undefined)assign(column,patch[column]); if(patch.customer_status!==undefined)assign('customer_status',patch.customer_status); if(Object.keys(patch).some(key=>!['full_name','phone','whatsapp_number','email','customer_status'].includes(key))) { const metadata = Object.fromEntries(Object.entries(patch).filter(([key])=>['city','area','preferred_contact_method','interested_in','property_type','budget','preferred_location','purpose','buying_timeline','financing_required','lead_source','priority','tags'].includes(key))); if (patch.tags !== undefined) metadata.tags = normalizeTags(patch.tags); params.push(JSON.stringify(metadata));fields.push(`metadata=metadata || $${params.length}::jsonb`); } if(fields.length){params.push(id);await sql.query(`UPDATE crm.customers SET ${fields.join(',')},updated_at=now() WHERE id=$${params.length}`,params)} if (patch.customer_status !== undefined) await sql.query('UPDATE crm.leads SET status_id=(SELECT id FROM crm.lead_statuses WHERE workspace_id=$1 AND name=$2 LIMIT 1),updated_at=now() WHERE workspace_id=$1 AND id=(SELECT lead_id FROM crm.customers WHERE id=$3) AND deleted_at IS NULL',[workspace,patch.customer_status,id]); if (patch.tags !== undefined) await sql.query("UPDATE crm.leads SET metadata=jsonb_set(metadata,'{tags}',$3::jsonb,true),updated_at=now() WHERE workspace_id=$1 AND id=(SELECT lead_id FROM crm.customers WHERE id=$2) AND deleted_at IS NULL",[workspace,id,JSON.stringify(normalizeTags(patch.tags))]); await pipeline.recordActivity(workspace,actor,{customerId:id,type:patch.tags !== undefined ? 'Tags updated' : 'Customer updated',description:patch.tags !== undefined ? `Tags: ${normalizeTags(patch.tags).join(', ') || 'None'}` : 'Customer details updated.'}); await insertAudit(workspace,actor,'customer_updated','customer',id,patch); return getCustomer(workspace,identifier); }
  async function deleteCustomer(workspace, identifier, actor) { const id = await resolveCustomerId(workspace, identifier); if (!id) return null; const rows = await sql.query('UPDATE crm.customers SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id, legacy_id', [id]); if (!rows[0]) return null; await insertAudit(workspace, actor, 'customer_deleted', 'customer', id, { legacy_id: rows[0].legacy_id }); return { id: rows[0].legacy_id || rows[0].id }; }
  async function changeCustomerStatus(workspace, identifier, actor, status, reason) {
    if(!statusTags.isValid(status)) return null;
    const current=await getCustomer(workspace,identifier);
    if(!current || !canViewOwnedRecord(actor,current)) return null;
    await transitionOpportunity(workspace,current.lead_id,actor,status,reason);
    return getCustomer(workspace,identifier);
  }
  async function listSavedNotes(workspace, kind, identifier, actor) {
    const parent = kind === 'lead' ? await getLead(workspace,identifier) : await getCustomer(workspace,identifier);
    if (!parent || (actor && !canViewOwnedRecord(actor,parent))) return [];
    const id = kind === 'lead' ? await resolveLeadId(workspace,identifier) : await resolveCustomerId(workspace,identifier);
    const rows = await sql.query(`SELECT n.*,coalesce(u.legacy_id,u.id::text) AS user_id,u.full_name AS user_name,e.full_name AS edited_by_name FROM crm.${kind}_notes n LEFT JOIN crm.users u ON u.id=n.author_user_id LEFT JOIN crm.users e ON e.id=n.edited_by WHERE n.${kind}_id=$1 AND n.deleted_at IS NULL ORDER BY n.created_at DESC`,[id]);
    return rows.map(n=>({...n,can_edit:Boolean(actor && (n.user_id===actor.id || n.author_user_id===actor.id || (actor.role==='sales_manager' && actor.team_id && actor.team_id===parent.assigned_team_id)))}));
  }
  async function listCustomerNotes(workspace, identifier, actor) { return listSavedNotes(workspace,'customer',identifier,actor); }
  async function editSavedNote(workspace,kind,identifier,noteId,actor,input) {
    const parent=kind==='lead'?await resolveLeadId(workspace,identifier):await resolveCustomerId(workspace,identifier);
    if(!parent)return {status:404,error:'Record not found'};
    const rows=await sql.query('SELECT crm.edit_saved_note($1,$2,$3,$4,$5,$6,$7) AS result',[workspace,kind,parent,noteId,await resolveUserId(workspace,actor.id),input.version,input.note]);
    return rows[0].result;
  }
  async function noteHistory(workspace,kind,identifier,noteId,actor) {
    const notes=await listSavedNotes(workspace,kind,identifier,actor);
    const note=notes.find(n=>n.id===noteId);
    if(!note || !(note.can_edit || actor.role==='super_admin'))return null;
    return sql.query('SELECT r.*,u.full_name AS edited_by_name FROM crm.note_revisions r JOIN crm.users u ON u.id=r.edited_by WHERE r.workspace_id=$1 AND r.note_kind=$2 AND r.note_id=$3 ORDER BY r.version DESC',[workspace,kind,noteId]);
  }
  async function addCustomerNote(workspace, identifier, actor, note, input = {}) {
    const id = await resolveCustomerId(workspace,identifier); if (!id) return null;
    const current=await getCustomer(workspace,identifier);
    const closed=['Closed Lost','Not Interested'].includes(current.customer_status);
    const requestedTerminal = terminalStatusFromTags(input.followup_tags ?? input.followup_tag);
    if (closed && !requestedTerminal && input.next_followup_days && input.next_followup_days !== 'none') throw new Error('Reactivate this opportunity before scheduling a follow-up.');
    const plan = notePlan(closed && !requestedTerminal ? {...input,next_followup_days:'none'} : input);
    const terminalStatus = plan.terminal_status || terminalStatusFromTags(plan.tags);
    if (!terminalStatus) return pipeline.saveNote(workspace,actor,{customerId:id,note,plan});
    await transitionOpportunity(workspace,current.lead_id,actor,terminalStatus,input.closure_reason || input.reason || 'Terminal outcome selected',{tags: plan.tags},'customer');
    return pipeline.saveNote(workspace,actor,{customerId:id,note,plan:{...plan,tag:undefined,tags:[],schedule:null}});
  }

  async function addFollowUpNote(workspace, identifier, actor, note, input = {}) {
    const item = await getFollowUp(workspace,identifier); if (!item) return null;
    const plan = notePlan(input);
    if (plan.contacted && ['Completed','Cancelled'].includes(item.lifecycle_status)) throw new Error('This follow-up is closed. Schedule a new follow-up from the customer profile.');
    const terminalStatus = plan.terminal_status || terminalStatusFromTags(plan.tags);
    const leadId = await resolveLeadId(workspace,item.lead_id);
    const customerId = await resolveCustomerId(workspace,item.customer_id);
    if (terminalStatus) {
      await transitionOpportunity(workspace,item.lead_id,actor,terminalStatus,input.closure_reason || input.reason || 'Terminal outcome selected',{tags: plan.tags},'lead');
      await pipeline.saveNote(workspace,actor,{leadId,customerId,followUpId:await resolveFollowUpId(workspace,identifier),note,plan:{...plan,tag:undefined,tags:[],schedule:null}});
      return getFollowUp(workspace,identifier);
    }
    await pipeline.saveNote(workspace,actor,{leadId,customerId,followUpId:await resolveFollowUpId(workspace,identifier),note,plan});
    return getFollowUp(workspace,identifier);
  }

  async function listCustomerActivities(workspace, identifier) { const id=await resolveCustomerId(workspace,identifier); if(!id)return[]; return sql.query(`SELECT a.id,a.activity_type,a.description,a.metadata,u.legacy_id AS user_id,u.full_name AS user_name,a.created_at FROM crm.customer_activities a LEFT JOIN crm.users u ON u.id=a.actor_user_id WHERE a.customer_id=$1 ORDER BY a.created_at DESC`,[id]); }

  // Reminder ownership alone is insufficient: it must still match a real,
  // active customer in the same workspace. Never use imported metadata as a
  // substitute for a missing relationship or owner.
  const followUpSelect = `SELECT f.*,
    coalesce(c.metadata->'tags',l.metadata->'tags') AS relationship_tags,
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

  async function listFollowUps({ workspaceId: workspace, user, includeCompleted = true, customerId, includeHistory = false, notify = true, search = '', status = '', dateFilter = '', customStart = '', customEnd = '', selectedDate = '', agentId = '', type = '', leadStatus = '', priority = '', pagination = null }) {
    if (customStart && customEnd && customEnd < customStart) [customStart, customEnd] = [customEnd, customStart];
    if (!user || (user.workspace_id && user.workspace_id !== workspace)) return pagination ? { rows: [], meta: paginationMeta(pagination, 0) } : [];
    const { conditions, params } = await scope(workspace, user, 'f');
    if (customerId) { params.push(await resolveCustomerId(workspace, customerId)); conditions.push(`c.id=$${params.length}`); }
    if (!includeHistory) {
      conditions.push("f.cancelled_by_closure=false AND coalesce(c.customer_status,'') NOT IN ('Closed Won','Closed Lost','Not Interested') AND coalesce(ls.name,'') NOT IN ('Closed Won','Closed Lost','Not Interested')");
      // Legacy rows may have a terminal outcome stored only as a tag. They
      // must not remain visible as active reminders while the repair
      // migration catches up with their canonical lifecycle state.
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(c.metadata->'tags')='array' THEN c.metadata->'tags' ELSE '[]'::jsonb END
        ) tag
        WHERE replace(lower(trim(tag #>> '{}')),'_',' ') IN ('closed won','closed lost','not interested')
      ) AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(l.metadata->'tags')='array' THEN l.metadata->'tags' ELSE '[]'::jsonb END
        ) tag
        WHERE replace(lower(trim(tag #>> '{}')),'_',' ') IN ('closed won','closed lost','not interested')
      )`);
      conditions.push("coalesce(f.metadata->>'consolidated_into','') = ''");
    }
    if (!includeCompleted) conditions.push("f.status NOT IN ('Completed','Cancelled')");
    if (agentId) { params.push(await resolveUserId(workspace, agentId)); conditions.push(`f.assigned_agent_id=$${params.length}`); }
    if (type) { params.push(type); conditions.push(`f.follow_up_type=$${params.length}`); }
    if (leadStatus) { params.push(leadStatus); conditions.push(`ls.name=$${params.length}`); }
    if (priority) { params.push(priority); conditions.push(`f.priority=$${params.length}`); }
    if (search) { params.push(`%${String(search).toLowerCase()}%`); const p=`$${params.length}`; conditions.push(`(lower(c.full_name) LIKE ${p} OR lower(coalesce(c.phone,'')) LIKE ${p} OR lower(coalesce(c.whatsapp_number,'')) LIKE ${p} OR lower(coalesce(f.follow_up_type,'')) LIKE ${p} OR lower(coalesce(f.notes,'')) LIKE ${p} OR lower(coalesce(au.full_name,'')) LIKE ${p})`); }
    const localDate = "(f.due_at AT TIME ZONE 'Asia/Karachi')::date"; const today = "(now() AT TIME ZONE 'Asia/Karachi')::date";
    if (selectedDate) { params.push(selectedDate); conditions.push(`${localDate}=$${params.length}::date`); }
    else if (dateFilter === 'today') conditions.push(`${localDate}=${today}`);
    else if (dateFilter === 'tomorrow') conditions.push(`${localDate}=${today}+1`);
    else if (dateFilter === 'week') conditions.push(`${localDate}>=${today} AND ${localDate}<${today}+7`);
    else if (dateFilter === 'month') conditions.push(`date_trunc('month', ${localDate})=date_trunc('month', ${today})`);
    else if (dateFilter === 'overdue') conditions.push(`f.status NOT IN ('Completed','Cancelled') AND f.completed_at IS NULL AND f.due_at < now()`);
    else if (dateFilter === 'custom') {
      if (customStart) { params.push(customStart); conditions.push(`${localDate}>=$${params.length}::date`); }
      if (customEnd) { params.push(customEnd); conditions.push(`${localDate}<=$${params.length}::date`); }
    }
    if (status) {
      if (status === 'Overdue') conditions.push(`f.status NOT IN ('Completed','Cancelled') AND f.completed_at IS NULL AND f.due_at < now()`);
      else { params.push(status); conditions.push(`f.status=$${params.length}`); }
    }
    const where = conditions.join(' AND ');
    const baseSelect = followUpSelect.replace('SELECT f.*,', 'SELECT f.*, c.id AS customer_db_id,');
    const open = "(status NOT IN ('Completed','Cancelled') AND completed_at IS NULL)";
    const uniqueSql = `SELECT DISTINCT ON (customer_db_id) * FROM (${baseSelect} WHERE ${where}) scoped_followups
      ORDER BY customer_db_id, CASE WHEN ${open} THEN 0 ELSE 1 END,
      CASE WHEN ${open} THEN due_at END ASC NULLS LAST,
      CASE WHEN NOT ${open} THEN updated_at END DESC NULLS LAST, id DESC`;
    if (pagination) {
      const totalRows = await sql.query(`SELECT COUNT(*)::bigint AS total FROM (${uniqueSql}) unique_followups`, params);
      const meta = paginationMeta(pagination, Number(totalRows[0]?.total || 0));
      const limit=params.length+1; const offset=params.length+2;
      const limitParam = '$' + limit; const offsetParam = '$' + offset;
      const rows = await sql.query(`SELECT * FROM (${uniqueSql}) unique_followups ORDER BY due_at ASC, id DESC LIMIT ${limitParam} OFFSET ${offsetParam}`, [...params,pagination.pageSize,pagination.offset]);
      const records = rows.map(followUpRecord);
      for (let index = 0; index < (notify ? records.length : 0); index += 1) {
        const record = records[index];
        if (['Completed','Cancelled'].includes(record.lifecycle_status)) continue;
        const row = rows[index];
        await createFollowUpNotification(workspace, row.id, row.assigned_agent_id, record.status === 'Overdue' ? 'follow_up_overdue' : 'follow_up_due', record);
      }
      return { rows: records, meta };
    }
    const rows = await sql.query(`${followUpSelect} WHERE ${where} ORDER BY f.due_at ASC`, params);
    const records = rows.map(followUpRecord);
    const visibleRecords = includeHistory ? records : uniqueFollowUps(records);
    for (const record of notify ? visibleRecords : []) {
      if (['Completed','Cancelled'].includes(record.lifecycle_status)) continue;
      const row = rows.find(item => (item.legacy_id || item.id) === record.id);
      await createFollowUpNotification(workspace, row.id, row.assigned_agent_id, record.status === 'Overdue' ? 'follow_up_overdue' : 'follow_up_due', record);
    }
    return visibleRecords;
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
    let personal = [];
    try { personal = await sql.query("SELECT preference_value->>$2 AS enabled FROM crm.user_preferences WHERE user_id=$1 AND preference_key='notifications' LIMIT 1", [userId, eventKey]); } catch (error) { if (!(error?.code === '42P01' && String(error.message || '').includes('user_preferences'))) throw error; }
    if (personal[0]?.enabled === 'false') return;
    const customer = followUp?.customer_name || followUp?.lead_name || 'Customer';
    const type = followUp?.follow_up_type || 'Follow-up';
    const due = followUp?.due_date ? ` due ${followUp.due_date}${followUp.due_time ? ` at ${followUp.due_time}` : ''}` : '';
    const copy = eventKey === 'follow_up_overdue' ? `${customer} — ${type} is overdue.` : eventKey === 'follow_up_completed' ? `${customer} — ${type} was completed.` : `${customer} — ${type} scheduled${due}.`;
    const title = eventKey === 'follow_up_overdue' ? 'Follow-up overdue' : eventKey === 'follow_up_completed' ? 'Follow-up completed' : 'Follow-up scheduled';
    const notification = await sql.query(`INSERT INTO crm.notifications (user_id,event_key,title,message,related_entity_type,related_entity_id,dedupe_key) VALUES ($1,$2,$3,$4,'follow_up',$5,$6) ON CONFLICT (user_id,dedupe_key) DO NOTHING RETURNING id`, [userId, eventKey, title, copy, followUpId, `${eventKey}:${followUpId}:${followUp?.due_date}:${followUp?.due_time}`]);
    if (notification[0]) {
      const devices = await listMobilePushTokens(workspace, userId);
      sendExpoPushMessages(devices.map(device => ({ to: device.token, title, body: copy, data: { route: '/(tabs)/follow-ups', notificationId: notification[0].id, entityId: followUpId } }))).catch(error => console.error('Mobile push delivery failed:', error.message));
      const subscriptions = await listWebPushSubscriptions(workspace, assignedAgentId);
      sendWebPushMessages(subscriptions, { title, body: copy, priority: 'high', data: { route: '/follow-ups', notificationId: notification[0].id, entityId: followUpId } }).catch(error => console.error('Browser push delivery failed:', error.message));
    }
  }

  async function createFollowUp(workspace, actor, input) {
    if (!actor || (actor.workspace_id && actor.workspace_id !== workspace)) return null;
    let customer = input.customer_id ? await getCustomer(workspace, input.customer_id) : null;
    const lead = input.lead_id ? await getLead(workspace, input.lead_id) : null;
    if ((input.customer_id && !customer) || (input.lead_id && !lead)) return null;
    if (customer && lead && customer.lead_id !== lead.id) return null;
    const parent = customer || lead;
    if (statusTags.isTerminal(parent?.customer_status || parent?.status, parent?.tags)) throw new Error('Closed opportunity cannot have active follow-ups');
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
      AND metadata->>'consolidated_into' IS NULL AND NOT cancelled_by_closure
      AND ($6::boolean=false OR status NOT IN ('Completed','Cancelled'))
      ORDER BY CASE WHEN status IN ('Completed','Cancelled') THEN 1 ELSE 0 END,due_at,created_at LIMIT 1`, [workspace,leadId,customerId,agentId,teamId,customer.lifecycle_version>0]);
    if (existing[0]) {
      await updateFollowUp(workspace,existing[0].legacy_id || existing[0].id,actor,{...input,reopen:true});
      await pipeline.consolidate(workspace,actor,existing[0].id);
      return getFollowUp(workspace,existing[0].legacy_id || existing[0].id);
    }
    // All creation routes use this key, so concurrent saves share the existing unique constraint.
    const tombstones = await sql.query('SELECT id FROM crm.follow_ups WHERE workspace_id=$1 AND customer_id=$2 AND cancelled_by_closure LIMIT 1',[workspace,customerId]);
    const legacyId = tombstones.length ? `followup_customer_${customerId}_v${customer.lifecycle_version}` : `followup_customer_${customerId}`;
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
  async function listCustomerFollowUpHistory(workspace, identifier, user = {role:'super_admin',workspace_id:workspace}) { return listFollowUps({workspaceId:workspace,user,customerId:identifier,includeHistory:true,notify:false}); }

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
    if (filters.status && filters.status !== 'all') { params.push(filters.status); conditions.push('t.status = $' + params.length); }
    if (filters.priority && filters.priority !== 'all') { params.push(filters.priority); conditions.push('t.priority = $' + params.length); }
    if (filters.assignedTo && filters.assignedTo !== 'all') { params.push(await resolveUserId(workspace, filters.assignedTo)); conditions.push('t.assigned_to = $' + params.length); }
    if (filters.search) { params.push(`%${String(filters.search).toLowerCase()}%`); const p = '$' + params.length; conditions.push(`(lower(t.title) LIKE ${p} OR lower(coalesce(t.description, '')) LIKE ${p} OR lower(coalesce(l.full_name, '')) LIKE ${p} OR lower(coalesce(c.full_name, '')) LIKE ${p})`); }
    addDateBounds(conditions, params, "t.due_at AT TIME ZONE 'Asia/Karachi'", filters.dateFrom, filters.dateTo);
    const where = conditions.join(' AND ');
    const orderBy = "CASE WHEN t.status = 'Overdue' THEN 0 WHEN t.status = 'In Progress' THEN 1 WHEN t.status = 'Pending' THEN 2 ELSE 3 END, t.due_at NULLS LAST, t.created_at DESC, t.id DESC";
    if (filters.pagination) {
      const totalRows = await sql.query(`SELECT COUNT(*)::bigint AS total FROM (${taskSelect} WHERE ${where}) scoped_tasks`, params);
      const meta = paginationMeta(filters.pagination, Number(totalRows[0]?.total || 0));
      const limit = params.length + 1; const offset = params.length + 2;
      const limitParam = '$' + limit; const offsetParam = '$' + offset;
      const rows = await sql.query(`${taskSelect} WHERE ${where} ORDER BY ${orderBy} LIMIT ${limitParam} OFFSET ${offsetParam}`, [...params, filters.pagination.pageSize, filters.pagination.offset]);
      return { rows: rows.map(taskRecord), meta };
    }
    const rows = await sql.query(`${taskSelect} WHERE ${where} ORDER BY ${orderBy}`, params);
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
    if (assignment.userId && assignment.userId !== actorId) {
      // Notification definitions are migration-backed. A missing optional definition
      // must not roll back the task itself while a workspace finishes its migration.
      const definition = await sql.query('SELECT event_key FROM crm.notification_definitions WHERE event_key=$1 LIMIT 1', ['task_assigned']);
      if (definition[0]) {
        const setting = await sql.query('SELECT in_app_enabled FROM crm.notification_settings WHERE user_id=$1 AND event_key=$2 LIMIT 1', [assignment.userId, 'task_assigned']);
        if (!setting[0] || setting[0].in_app_enabled !== false) {
        const notification = await sql.query(`INSERT INTO crm.notifications (user_id,event_key,title,message,related_entity_type,related_entity_id,dedupe_key) VALUES ($1,'task_assigned',$2,$3,'task',$4,$5) ON CONFLICT (user_id, dedupe_key) DO NOTHING RETURNING id`, [assignment.userId, 'New task assigned', `${actor.full_name || 'A manager'} assigned you: ${title}`, taskId, `task_assigned:${legacyId}`]);
        if (notification[0]) {
          const devices = await listMobilePushTokens(workspace, assignment.userId);
          sendExpoPushMessages(devices.map(device => ({ to: device.token, title: 'New task assigned', body: `${actor.full_name || 'A manager'} assigned you: ${title}`, data: { route: '/(tabs)/tasks', notificationId: notification[0].id, entityId: taskId } }))).catch(error => console.error('Mobile push delivery failed:', error.message));
          const subscriptions = await listWebPushSubscriptions(workspace, assignment.userId);
          sendWebPushMessages(subscriptions, { title: 'New task assigned', body: `${actor.full_name || 'A manager'} assigned you: ${title}`, priority: 'high', data: { route: '/tasks', notificationId: notification[0].id, entityId: taskId } }).catch(error => console.error('Browser push delivery failed:', error.message));
        }
        }
      }
    }
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
        ${followUpSelect} WHERE f.id=n.related_entity_id AND f.workspace_id=$2 AND f.deleted_at IS NULL AND f.assigned_agent_id=$1 AND (n.event_key NOT IN ('follow_up_due','follow_up_overdue') OR (f.cancelled_by_closure=false AND f.status NOT IN ('Completed','Cancelled')))
      )) ORDER BY n.created_at DESC`,[userId,workspace]); }
  async function markNotificationRead(workspace,userIdentifier,identifier) { const userId=await resolveUserId(workspace,userIdentifier);await sql.query('UPDATE crm.notifications SET is_read=true,read_at=now() WHERE user_id=$1 AND (id::text=$2 OR dedupe_key=$2)',[userId,String(identifier)]);return true; }
  async function markAllNotificationsRead(workspace,userIdentifier) { const userId=await resolveUserId(workspace,userIdentifier);await sql.query('UPDATE crm.notifications SET is_read=true,read_at=now() WHERE user_id=$1 AND is_read=false',[userId]);return true; }
  const webhookColumns = 'id,legacy_id,name AS connection_name,source_platform,source_type,secret_hash,status,intake_mode,field_mappings,default_lead_source,default_lead_status,default_tags,default_assigned_team_id,default_assigned_agent_id,auto_assign_lead,duplicate_check_rule,failed_attempts,unauthorized_attempts,last_received_at,created_by,created_at,updated_at';
  async function listWebhookConnections(workspace) { return sql.query(`SELECT ${webhookColumns} FROM crm.webhook_connections WHERE workspace_id=$1 ORDER BY created_at DESC`,[workspace]); }
  async function getWebhookConnection(workspace, identifier) { const rows=await sql.query(`SELECT ${webhookColumns} FROM crm.webhook_connections WHERE workspace_id=$1 AND (id::text=$2 OR legacy_id=$2) LIMIT 1`,[workspace,String(identifier)]);return rows[0]||null; }
  const metaStagingColumns = 'm.id,m.external_lead_id,m.idempotency_key,m.form_id,m.form_name,m.platform,m.source_channel,m.source_medium,m.source_label,m.ingested_via,m.campaign_id,m.campaign_name,m.adset_id,m.adset_name,m.ad_id,m.ad_name,m.page_id,m.full_name,m.phone,m.whatsapp_number,m.email,m.city,m.country,m.area,m.interested_in,m.interest_category,m.property_type,m.residential_property_type,m.commercial_property_type,m.budget,m.residential_budget,m.commercial_budget,m.purpose,m.residential_investment_purpose,m.commercial_investment_purpose,m.payment_preference,m.preferred_contact_method,m.buying_timeline,m.purchase_timeline,m.site_visit_interest,m.investment_type,m.down_payment,m.active_contact,m.consent_status,m.consent_at,m.submitted_at,m.review_status,m.feedback_status,m.review_notes,m.outcome,m.crm_lead_id,m.raw_payload,m.feedback_payload,m.error_message,m.reviewed_by,m.reviewed_at,m.crm_sent_at,m.feedback_sent_at,m.created_at,m.updated_at,u.full_name AS reviewer_name';
  const metaStagingListColumns = metaStagingColumns.replace(',m.raw_payload,m.feedback_payload', '');
  function metaStagingRecord(row) { return row ? { ...row, raw_payload: row.raw_payload || {}, feedback_payload: row.feedback_payload || {} } : null; }
  function metaStagingFilter(filters = {}) {
    const clauses = ['m.workspace_id=$1']; const params = [filters.workspace || null];
    const add = (value, sqlPart) => { if (value) { params.push(value); clauses.push(sqlPart.replace('?', `$${params.length}`)); } };
    add(filters.status, 'm.review_status=?'); add(filters.formId, 'm.form_id=?'); add(filters.dateFrom, 'm.submitted_at >= ?::date');
    if (filters.source) { params.push(filters.source); clauses.push(`lower(coalesce(m.source_channel,''))=lower($${params.length})`); }
    if (filters.interest) { params.push(`%${String(filters.interest).toLowerCase()}%`); clauses.push(`(lower(coalesce(m.interested_in,'')) LIKE $${params.length} OR lower(coalesce(m.property_type,'')) LIKE $${params.length} OR lower(coalesce(m.interest_category,'')) LIKE $${params.length})`); }
    if (filters.dateTo) { params.push(filters.dateTo); clauses.push(`m.submitted_at < ($${params.length}::date + interval '1 day')`); }
    if (filters.search) { params.push(`%${String(filters.search).toLowerCase()}%`); clauses.push(`(lower(coalesce(m.full_name,'')) LIKE $${params.length} OR lower(coalesce(m.phone,'')) LIKE $${params.length} OR lower(coalesce(m.whatsapp_number,'')) LIKE $${params.length} OR lower(coalesce(m.email,'')) LIKE $${params.length} OR lower(coalesce(m.external_lead_id,'')) LIKE $${params.length} OR lower(coalesce(m.form_name,'')) LIKE $${params.length} OR lower(coalesce(m.form_id,'')) LIKE $${params.length} OR lower(coalesce(m.campaign_name,'')) LIKE $${params.length} OR lower(coalesce(m.campaign_id,'')) LIKE $${params.length} OR lower(coalesce(m.adset_name,'')) LIKE $${params.length} OR lower(coalesce(m.adset_id,'')) LIKE $${params.length})`); }
    return { clauses, params };
  }
  function metaStagingPage(filters = {}) {
    const requestedPage = Number.parseInt(filters.page, 10); const requestedSize = Number.parseInt(filters.pageSize, 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = Number.isFinite(requestedSize) ? Math.min(100, Math.max(10, requestedSize)) : 25;
    return { page, pageSize, offset: (page - 1) * pageSize };
  }
  async function listMetaLeadStaging(workspace, filters = {}) {
    const { clauses, params } = metaStagingFilter({ ...filters, workspace }); const { pageSize, offset } = metaStagingPage(filters);
    params.push(pageSize, offset);
    const rows = await sql.query(`SELECT ${metaStagingListColumns} FROM crm.meta_lead_staging m LEFT JOIN crm.users u ON u.id=m.reviewed_by WHERE ${clauses.join(' AND ')} ORDER BY m.submitted_at DESC NULLS LAST, m.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return rows.map(metaStagingRecord);
  }
  async function getMetaLeadStagingSummary(workspace, filters = {}) {
    const { clauses, params } = metaStagingFilter({ ...filters, workspace });
    const rows = await sql.query(`SELECT count(*)::int AS total, max(m.updated_at) AS latest_updated_at, count(*) FILTER (WHERE m.review_status='Pending review')::int AS pending_review, count(*) FILTER (WHERE m.review_status='Sent to CRM' OR m.crm_lead_id IS NOT NULL)::int AS sent_to_crm, count(*) FILTER (WHERE m.feedback_status IN ('Ready for Meta','Queued'))::int AS ready_for_meta FROM crm.meta_lead_staging m WHERE ${clauses.join(' AND ')}`, params);
    const summary = rows[0] || {};
    const total = Number(summary.total || 0); const updatedAt = summary.latest_updated_at ? new Date(summary.latest_updated_at).toISOString() : '';
    return { total, pendingReview: Number(summary.pending_review || 0), sentToCrm: Number(summary.sent_to_crm || 0), readyForMeta: Number(summary.ready_for_meta || 0), updatedAt, version: `${total}:${updatedAt}` };
  }
  async function getMetaLeadStagingVersion(workspace, filters = {}) {
    const { clauses, params } = metaStagingFilter({ ...filters, workspace });
    const rows = await sql.query(`SELECT count(*)::int AS total, max(m.updated_at) AS latest_updated_at FROM crm.meta_lead_staging m WHERE ${clauses.join(' AND ')}`, params);
    const row = rows[0] || {}; const total = Number(row.total || 0); const updatedAt = row.latest_updated_at ? new Date(row.latest_updated_at).toISOString() : '';
    return { total, updatedAt, version: `${total}:${updatedAt}` };
  }
  async function getMetaLeadStaging(workspace, identifier) { const rows = await sql.query(`SELECT ${metaStagingColumns} FROM crm.meta_lead_staging m LEFT JOIN crm.users u ON u.id=m.reviewed_by WHERE m.workspace_id=$1 AND m.id::text=$2 LIMIT 1`, [workspace, String(identifier)]); return metaStagingRecord(rows[0]); }
  async function createMetaLeadStaging(workspace, rawPayload = {}) {
    const raw = rawPayload && rawPayload.data && typeof rawPayload.data === 'object' ? { ...rawPayload, ...rawPayload.data } : rawPayload || {};
    const { externalId } = externalLeadIdentifier(raw); const idempotencyKey = String(raw.idempotency_key || raw.idempotencyKey || externalId || hashToken(JSON.stringify(raw)));
    const fullName = String(metaField(raw, 'full_name', 'name') || [raw.first_name, raw.last_name].filter(Boolean).join(' ') || '').trim();
    const formId = metaField(raw, 'form_id', 'formId');
    const formName = webhookFormName(raw) || metaField(raw, 'form_name', 'formName');
    const platform = String(raw.platform || 'meta').toLowerCase();
    const requestedChannel = String(metaField(raw, 'source_channel', 'channel', 'source_type') || '').toLowerCase().trim();
    const sourceChannel = ({ fb: 'meta_lead_ads', facebook: 'meta_lead_ads', meta: 'meta_lead_ads', 'meta lead ads': 'meta_lead_ads', lead_ads: 'meta_lead_ads', ig: 'meta_instagram', instagram: 'meta_instagram', messenger: 'meta_messenger' }[requestedChannel] || ({ fb: 'meta_lead_ads', facebook: 'meta_lead_ads', meta: 'meta_lead_ads', ig: 'meta_instagram', instagram: 'meta_instagram' }[platform] || requestedChannel || platform)).toLowerCase();
    const sourceLabel = metaField(raw, 'source_label', 'lead_source', 'source') || ({ meta_lead_ads: 'Meta - Lead Ads', meta_messenger: 'Meta - Messenger', meta_instagram: 'Meta - Instagram', website_form: 'Website - Form', website_chat: 'Website - Chat', whatsapp: 'WhatsApp - Organic' }[sourceChannel] || sourceChannel);
    const interestedIn = metaField(raw, 'interested_in', 'interest', 'what_are_you_interested_in?', 'what_are_you_interested_in?_');
    const propertyType = metaField(raw, 'property_type', 'which_property_type_do_you_want_to_go_for?', 'which_property_type?');
    const commercialPropertyType = metaField(raw, 'commercial_property_type', 'which_commercial_property_type?');
    const residentialBudget = metaField(raw, 'residential_budget', 'budget_residential', 'what_is_your_booking_budget_for_residential?');
    const commercialBudget = metaField(raw, 'commercial_budget', 'budget_commercial', 'what_is_your_booking_budget_for_commercial?');
    const residentialPurpose = metaField(raw, 'residential_investment_purpose', 'purpose_of_investment', 'what_is_the_purpose_of_your_investment?', 'select_your_purpose_of_investment');
    const commercialPurpose = metaField(raw, 'commercial_investment_purpose', 'purpose_commercial', 'what_is_the_purpose_of_your_commercial_investment?');
    const purchaseTimeline = metaField(raw, 'purchase_timeline', 'buying_timeline', 'when_are_you_planning_to_buy?', 'when_do_you_want_to_buy?', 'when_are_you_planning_to_buy_a_property_at_aureum_mall_&_residences?_please_share_your_requirements.');
    const investmentType = metaField(raw, 'investment_type', 'select_your_investment_');
    const downPayment = metaField(raw, 'down_payment', 'how_much_down_payment_you_can_pay', 'how_much_down_payment_you_can_manage?');
    const activeContact = metaField(raw, 'active_contact', 'any_active_contact');
    const preferredContactMethod = metaField(raw, 'preferred_contact_method', 'best_contact_method');
    const submittedAt = leadReceivedAt(raw);
    const values = [workspace, externalId || null, idempotencyKey, formId || null, formName || null, String(raw.platform || 'meta'), fullName || null, metaContactField(raw, 'phone', 'phone_number', 'mobile') || null, metaContactField(raw, 'whatsapp', 'whatsapp_number', 'whats_app_number', 'what_is_your_whatsapp_number?', 'what_is_your_whatsapp_number') || null, String(metaField(raw, 'email', 'email_address') || '').trim().toLowerCase() || null, metaField(raw, 'city') || null, metaField(raw, 'area') || null, interestedIn || null, propertyType || null, metaField(raw, 'budget') || residentialBudget || commercialBudget || null, metaField(raw, 'purpose') || residentialPurpose || commercialPurpose || null, purchaseTimeline || null, metaField(raw, 'campaign_name') || null, metaField(raw, 'ad_name') || null, metaField(raw, 'adset_name', 'ad_set_name', 'adsetName', 'adSetName') || null, submittedAt, JSON.stringify(raw)];
    const rows = await sql.query(`INSERT INTO crm.meta_lead_staging (workspace_id,external_lead_id,idempotency_key,form_id,form_name,platform,full_name,phone,whatsapp_number,email,city,area,interested_in,property_type,budget,purpose,buying_timeline,campaign_name,ad_name,adset_name,submitted_at,raw_payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::timestamptz,$22::jsonb) ON CONFLICT (workspace_id,idempotency_key) DO UPDATE SET raw_payload=EXCLUDED.raw_payload,updated_at=now() RETURNING id`, values);
    const stagingId = rows[0]?.id;
    await sql.query(`UPDATE crm.meta_lead_staging SET source_channel=$1,source_medium=$2,source_label=$3,ingested_via=$4,campaign_id=$5,adset_id=$6,ad_id=$7,page_id=$8,country=$9,interest_category=$10,payment_preference=$11,preferred_contact_method=$12,residential_property_type=$13,residential_budget=$14,residential_investment_purpose=$15,commercial_property_type=$16,commercial_budget=$17,commercial_investment_purpose=$18,purchase_timeline=$19,site_visit_interest=$20,investment_type=$21,down_payment=$22,active_contact=$23,consent_status=$24,consent_at=$25,updated_at=now() WHERE id=$26`, [sourceChannel, metaField(raw, 'source_medium', 'medium') || null, sourceLabel, metaField(raw, 'ingested_via', 'ingest_source') || 'zapier', metaField(raw, 'campaign_id', 'campaignId') || null, metaField(raw, 'adset_id', 'ad_set_id', 'adsetId', 'adSetId') || null, metaField(raw, 'ad_id', 'adId') || null, metaField(raw, 'page_id', 'pageId') || null, metaField(raw, 'country') || null, metaField(raw, 'interest_category') || interestedIn || null, metaField(raw, 'payment_preference', 'payment_method') || null, preferredContactMethod || null, metaField(raw, 'residential_property_type') || (propertyType || null), residentialBudget || null, residentialPurpose || null, commercialPropertyType || (propertyType || null), commercialBudget || null, commercialPurpose || null, purchaseTimeline || null, metaField(raw, 'site_visit_interest') || null, investmentType || null, downPayment || null, activeContact !== undefined && activeContact !== null ? activeContact : null, metaField(raw, 'consent_status') !== '' ? metaField(raw, 'consent_status') : null, timestampValue(metaField(raw, 'consent_at')) || null, stagingId]);
    return getMetaLeadStaging(workspace, stagingId);
  }
  async function updateMetaLeadStaging(workspace, identifier, actor, patch = {}) {
    const current = await getMetaLeadStaging(workspace, identifier); if (!current) return null;
    const fields = []; const params = [workspace]; const assign = (column, value) => { params.push(value); fields.push(`${column}=$${params.length}`); };
    for (const column of ['full_name','phone','whatsapp_number','email','city','country','area','interested_in','interest_category','property_type','residential_property_type','commercial_property_type','budget','residential_budget','commercial_budget','purpose','residential_investment_purpose','commercial_investment_purpose','payment_preference','preferred_contact_method','buying_timeline','purchase_timeline','site_visit_interest','investment_type','down_payment','active_contact','consent_status','source_medium','platform','page_id','campaign_name','campaign_id','ad_name','ad_id','adset_name','adset_id','form_name','form_id']) if (patch[column] !== undefined) assign(column, patch[column] || null);
    if (patch.review_status !== undefined) assign('review_status', patch.review_status); if (patch.feedback_status !== undefined) assign('feedback_status', patch.feedback_status); if (patch.review_notes !== undefined) assign('review_notes', patch.review_notes || null); if (patch.outcome !== undefined) assign('outcome', patch.outcome || null); if (patch.feedback_payload !== undefined) assign('feedback_payload', JSON.stringify(patch.feedback_payload || {}));
    if (patch.review_status && patch.review_status !== current.review_status) { assign('reviewed_by', await resolveUserId(workspace, actor?.id || actor)); assign('reviewed_at', new Date().toISOString()); }
    if (!fields.length) return current; params.push(current.id); const rows = await sql.query(`UPDATE crm.meta_lead_staging SET ${fields.join(',')},updated_at=now() WHERE id=$${params.length} AND workspace_id=$1 RETURNING id`, params); await insertAudit(workspace, actor, 'meta_staging_updated', 'meta_lead_staging', current.id, patch); return getMetaLeadStaging(workspace, rows[0]?.id);
  }
  async function promoteMetaLeadStaging(workspace, identifier, actor) {
    const current = await getMetaLeadStaging(workspace, identifier); if (!current) return null; if (current.crm_lead_id || current.review_status === 'Sent to CRM') return current;
    const duplicate = await findLeadDuplicate(workspace, { phone: current.phone || '', email: current.email || '', externalLeadId: current.external_lead_id || '' });
    const lead = duplicate || await createLead({ workspaceId: workspace, actor, lead: { full_name: current.full_name || 'Unnamed Meta lead', phone: current.phone || '', whatsapp_number: current.whatsapp_number || '', email: current.email || '', city: current.city, area: current.area, interested_in: current.interested_in || 'General enquiry', property_type: current.property_type, budget: current.budget, purpose: current.purpose, buying_timeline: current.buying_timeline, lead_source: 'Facebook', status: current.outcome && statusTags.isValid(current.outcome) ? current.outcome : 'New', external_source: 'meta', external_lead_id: current.external_lead_id || null, idempotency_key: current.idempotency_key, received_at: current.submitted_at, metadata: { ...current.raw_payload, meta_staging_id: current.id, country: current.country || null, commercial_property_type: current.commercial_property_type || null, residential_budget: current.residential_budget || null, commercial_budget: current.commercial_budget || null, residential_investment_purpose: current.residential_investment_purpose || null, commercial_investment_purpose: current.commercial_investment_purpose || null, investment_type: current.investment_type || null, down_payment: current.down_payment || null, active_contact: current.active_contact || null, preferred_contact_method: current.preferred_contact_method || null } } });
    const leadDbId = await resolveLeadId(workspace, lead.id); await sql.query(`UPDATE crm.meta_lead_staging SET crm_lead_id=$1,review_status='Sent to CRM',crm_sent_at=coalesce(crm_sent_at,now()),updated_at=now() WHERE id=$2`, [leadDbId, current.id]); await insertAudit(workspace, actor, 'meta_staging_sent_to_crm', 'meta_lead_staging', current.id, { crm_lead_id: lead.id, duplicate: Boolean(duplicate) }); return getMetaLeadStaging(workspace, identifier);
  }
  async function bulkDeleteMetaLeadStaging(workspace, identifiers, actor) {
    const ids = [...new Set((Array.isArray(identifiers) ? identifiers : []).map(value => String(value || '').trim()).filter(value => /^[0-9a-f-]{36}$/i.test(value)))];
    if (!ids.length) return { deleted: [], skipped: [] };
    const rows = await sql.query(`DELETE FROM crm.meta_lead_staging WHERE workspace_id=$1 AND id=ANY($2::uuid[]) AND crm_lead_id IS NULL AND review_status <> 'Sent to CRM' RETURNING id`, [workspace, ids]);
    const deleted = rows.map(row => String(row.id));
    for (const id of deleted) await insertAudit(workspace, actor, 'meta_staging_deleted', 'meta_lead_staging', id, { reason: 'Bulk deleted from Meta Intake' });
    return { deleted, skipped: ids.filter(id => !deleted.includes(id)) };
  }
  async function createWebhookConnection(workspace, actor, input) { const legacyId=input.id||`wh_${crypto.randomUUID().slice(0,10)}`;const secretHash=input.secret_hash||hashToken(input.secret||'');const sourcePlatform=String(input.source_platform||input.sourcePlatform||'webhook').toLowerCase();const intakeMode=input.intake_mode||input.intakeMode||(sourcePlatform==='meta'?'staging':'crm');const rows=await sql.query(`INSERT INTO crm.webhook_connections (workspace_id,legacy_id,name,source_platform,source_type,secret_hash,status,intake_mode,field_mappings,default_lead_source,default_lead_status,default_tags,auto_assign_lead,duplicate_check_rule,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13,$14,$15) RETURNING ${webhookColumns}`,[workspace,legacyId,input.connection_name||input.connectionName||'Webhook connection',sourcePlatform,input.source_type||input.sourceType||sourcePlatform,secretHash,String(input.status||'inactive').toLowerCase(),intakeMode,JSON.stringify(input.field_mappings||input.fieldMappings||{}),input.default_lead_source||input.defaultLeadSource||null,input.default_lead_status||input.defaultLeadStatus||'New',JSON.stringify(input.default_tags||input.defaultTags||[]),Boolean(input.auto_assign_lead||input.autoAssignLead),input.duplicate_check_rule||input.duplicateCheckRule||'externalLeadId',await resolveUserId(workspace,actor.id)]);const agentId=await resolveUserId(workspace,input.default_assigned_agent||input.defaultAssignedAgent);const teamId=await resolveTeamId(workspace,input.default_assigned_team||input.defaultAssignedTeam);if(agentId||teamId)await sql.query('UPDATE crm.webhook_connections SET default_assigned_agent_id=$1,default_assigned_team_id=$2 WHERE id=$3',[agentId,teamId,rows[0].id]);return getWebhookConnection(workspace,legacyId); }
  async function updateWebhookConnection(workspace, identifier, patch) { const current=await getWebhookConnection(workspace,identifier);if(!current)return null;const fields=[];const params=[];const assign=(column,value)=>{params.push(value);fields.push(`${column}=$${params.length}`)};if(patch.connection_name!==undefined||patch.connectionName!==undefined)assign('name',patch.connection_name||patch.connectionName);if(patch.source_platform!==undefined||patch.sourcePlatform!==undefined)assign('source_platform',patch.source_platform||patch.sourcePlatform);if(patch.source_type!==undefined||patch.sourceType!==undefined)assign('source_type',patch.sourceType||patch.source_type);if(patch.status!==undefined)assign('status',String(patch.status).toLowerCase());if(patch.intake_mode!==undefined||patch.intakeMode!==undefined)assign('intake_mode',patch.intake_mode||patch.intakeMode);if(patch.secret_hash!==undefined)assign('secret_hash',patch.secret_hash);if(patch.field_mappings!==undefined||patch.fieldMappings!==undefined)assign('field_mappings',JSON.stringify(patch.field_mappings||patch.fieldMappings||{}));if(patch.default_lead_source!==undefined||patch.defaultLeadSource!==undefined)assign('default_lead_source',patch.default_lead_source||patch.defaultLeadSource);if(patch.default_lead_status!==undefined||patch.defaultLeadStatus!==undefined)assign('default_lead_status',patch.default_lead_status||patch.defaultLeadStatus);if(patch.default_tags!==undefined||patch.defaultTags!==undefined)assign('default_tags',JSON.stringify(patch.default_tags||patch.defaultTags||[]));if(patch.default_assigned_agent_id!==undefined||patch.defaultAssignedAgent!==undefined)assign('default_assigned_agent_id',await resolveUserId(workspace,patch.default_assigned_agent_id||patch.defaultAssignedAgent));if(patch.default_assigned_team_id!==undefined||patch.defaultAssignedTeam!==undefined)assign('default_assigned_team_id',await resolveTeamId(workspace,patch.default_assigned_team_id||patch.defaultAssignedTeam));if(patch.auto_assign_lead!==undefined||patch.autoAssignLead!==undefined)assign('auto_assign_lead',Boolean(patch.auto_assign_lead??patch.autoAssignLead));if(patch.duplicate_check_rule!==undefined||patch.duplicateCheckRule!==undefined)assign('duplicate_check_rule',patch.duplicate_check_rule||patch.duplicateCheckRule);if(!fields.length)return current;params.push(current.id);const rows=await sql.query(`UPDATE crm.webhook_connections SET ${fields.join(',')},updated_at=now() WHERE id=$${params.length} RETURNING ${webhookColumns}`,params);return rows[0]||null; }
  async function listWebhookLogs(workspace,legacyConnectionId) { return sql.query(`SELECT l.* FROM crm.webhook_logs l JOIN crm.webhook_connections c ON c.id=l.connection_id WHERE c.workspace_id=$1 AND ($2='' OR c.legacy_id=$2) ORDER BY l.created_at DESC LIMIT 200`,[workspace,legacyConnectionId||'']); }
  async function listFailedWebhookLeads(workspace) { return sql.query(`SELECT f.id,f.external_lead_id,f.error_message,f.retry_count,f.next_retry_at,f.resolved_at,f.created_at,c.legacy_id AS connection_id,c.name AS connection_name FROM crm.failed_webhook_leads f JOIN crm.webhook_connections c ON c.id=f.connection_id WHERE c.workspace_id=$1 AND f.resolved_at IS NULL ORDER BY f.created_at DESC LIMIT 200`,[workspace]); }
  async function getFailedWebhookLead(workspace, identifier) { const rows=await sql.query(`SELECT f.*,c.legacy_id AS connection_id,c.name AS connection_name FROM crm.failed_webhook_leads f JOIN crm.webhook_connections c ON c.id=f.connection_id WHERE c.workspace_id=$1 AND f.id::text=$2 LIMIT 1`,[workspace,String(identifier)]);return rows[0]||null; }
  async function resolveFailedWebhookLead(workspace, identifier, actor) { const item=await getFailedWebhookLead(workspace,identifier);if(!item)return null;await sql.query('UPDATE crm.failed_webhook_leads SET resolved_at=now() WHERE id=$1',[item.id]);await insertAudit(workspace,actor,'webhook_failed_lead_resolved','webhook',item.id,{connection_id:item.connection_id});return item; }
  async function ensureWebhookLeadConfiguration(workspace, statusName = 'New', sourceName = 'Webhook') {
    const requestedStatus = String(statusName || 'New').trim() || 'New';
    const requestedSource = String(sourceName || 'Webhook').trim() || 'Webhook';
    // Keep the approved status vocabulary available even when the workspace
    // was created after the original status seed migration ran.
    await listLeadConfiguration(workspace, 'lead-statuses');
    let statusRows = await sql.query('SELECT id,name FROM crm.lead_statuses WHERE workspace_id=$1 AND is_active=true AND lower(name)=lower($2) LIMIT 1',[workspace,requestedStatus]);
    if (!statusRows[0] && requestedStatus.toLowerCase() !== 'new') {
      // Older workspaces may receive a status value that is not in the
      // approved catalog. Keep the lead deliverable with the canonical
      // intake status rather than losing it at the webhook boundary.
      statusRows = await sql.query("SELECT id,name FROM crm.lead_statuses WHERE workspace_id=$1 AND is_active=true AND lower(name)=lower('New') LIMIT 1",[workspace]);
    }
    if (!statusRows[0]) return { statusRows, sourceRows: [], requestedStatus, requestedSource };
    let sourceRows = await sql.query('SELECT id,name FROM crm.lead_sources WHERE workspace_id=$1 AND is_active=true AND lower(name)=lower($2) LIMIT 1',[workspace,requestedSource]);
    if (!sourceRows[0]) {
      const slug = requestedSource.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'webhook';
      try {
        await sql.query(`INSERT INTO crm.lead_sources (workspace_id,name,slug,is_default,is_active)
          VALUES ($1,$2,$3,false,true)
          ON CONFLICT (workspace_id,slug) DO UPDATE SET name=EXCLUDED.name,is_active=true`,[workspace,requestedSource,slug]);
      } catch (error) {
        // A legacy source constraint should not make a valid Meta lead fail.
        // The fallback query below still selects a real active source row.
        if (error?.code !== '23505') throw error;
      }
      sourceRows = await sql.query('SELECT id,name FROM crm.lead_sources WHERE workspace_id=$1 AND is_active=true AND lower(name)=lower($2) LIMIT 1',[workspace,requestedSource]);
    }
    if (!sourceRows[0]) {
      // Keep delivery working for workspaces created before the source catalog
      // was seeded. Prefer the historical Meta source, then the generic
      // Webhook source; both are valid CRM source records.
      sourceRows = await sql.query(`SELECT id,name
        FROM crm.lead_sources
        WHERE workspace_id=$1 AND is_active=true
          AND lower(name)=ANY($2::text[])
        ORDER BY array_position($2::text[], lower(name))
        LIMIT 1`,[workspace,['meta lead ads','facebook','instagram','webhook']]);
    }
    return { statusRows, sourceRows, requestedStatus, requestedSource };
  }
  async function convertFailedWebhookLead(workspace, identifier, actor) { const item=await getFailedWebhookLead(workspace,identifier);if(!item)return null;const raw=item.payload&&item.payload.data&&typeof item.payload.data==='object'?{...item.payload,...item.payload.data}:item.payload||{};const fullName=String(raw.full_name||raw.name||[raw.first_name,raw.last_name].filter(Boolean).join(' ')||'').trim();const phone=String(raw.phone||raw.phone_number||raw.mobile||'').trim();if(!fullName||!phone)return null;const configuration=await ensureWebhookLeadConfiguration(workspace,raw.status||'New',raw.lead_source||raw.source||'Webhook');if(!configuration.statusRows[0]||!configuration.sourceRows[0])return null;const legacyId=`lead_${crypto.randomUUID().slice(0,10)}`;await sql.query(`INSERT INTO crm.leads (workspace_id,legacy_id,full_name,email,phone,whatsapp_number,interested_in,status_id,source_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,[workspace,legacyId,fullName,String(raw.email||'').toLowerCase()||null,phone,String(raw.whatsapp||raw.whatsapp_number||phone),raw.interested_in||raw.interest||'General enquiry',configuration.statusRows[0].id,configuration.sourceRows[0].id,JSON.stringify({...raw,webhook_connection_id:item.connection_id,is_imported:true})]);await sql.query('UPDATE crm.failed_webhook_leads SET resolved_at=now() WHERE id=$1',[item.id]);if(item.event_id)await sql.query("UPDATE crm.webhook_events SET status='processed',processed_at=now(),error_message=NULL WHERE id=$1",[item.event_id]);await sql.query('INSERT INTO crm.webhook_logs (event_id,connection_id,status,message,metadata) VALUES ($1,(SELECT id FROM crm.webhook_connections WHERE workspace_id=$2 AND legacy_id=$3),$4,$5,$6::jsonb)',[item.event_id,workspace,item.connection_id,'Success','Failed webhook lead converted',JSON.stringify({lead_id:legacyId})]);await insertAudit(workspace,actor,'webhook_failed_lead_converted','lead',await resolveLeadId(workspace,legacyId),{failed_webhook_id:item.id});return getLead(workspace,legacyId); }
  async function previewWebhookLead(workspace, identifier, payload) { const connection=await getWebhookConnection(workspace,identifier);if(!connection)return {status:404,error:'Webhook connection not found.'};const raw=payload&&payload.data&&typeof payload.data==='object'?{...payload,...payload.data}:payload||{};const externalId=String(raw.external_lead_id||raw.meta_lead_id||raw.lead_id||raw.id||'');const idempotency=String(raw.idempotency_key||raw.idempotencyKey||externalId||hashToken(JSON.stringify(raw)));const fullName=String(raw.full_name||raw.name||[raw.first_name,raw.last_name].filter(Boolean).join(' ')||'').trim();const phone=String(raw.phone||raw.phone_number||raw.mobile||'').trim();if(!fullName||!phone)return {status:422,error:'Full name and phone are required.'};const configuration=await ensureWebhookLeadConfiguration(workspace,raw.status||connection.default_lead_status||'New',raw.lead_source||raw.source||connection.default_lead_source||'Webhook');if(!configuration.statusRows[0]||!configuration.sourceRows[0])return {status:422,error:'Webhook status/source configuration is missing.'};const duplicateRows=await sql.query(`SELECT l.legacy_id FROM crm.leads l WHERE l.workspace_id=$1 AND l.deleted_at IS NULL AND (l.external_lead_id=$2 OR l.idempotency_key=$3 OR ($4<>'' AND l.phone=$4) OR ($5<>'' AND lower(l.email)=lower($5))) LIMIT 1`,[workspace,externalId||null,idempotency,phone,String(raw.email||'').toLowerCase()]);const duplicate=Boolean(duplicateRows[0]);return {ok:true,duplicate,existingLead:duplicate?await getLead(workspace,duplicateRows[0].legacy_id):null,normalizedLead:{full_name:fullName,phone,whatsapp_number:String(raw.whatsapp||raw.whatsapp_number||phone),email:String(raw.email||'').toLowerCase()||null,city:raw.city||null,area:raw.area||null,interested_in:raw.interested_in||raw.interest||'General enquiry',property_type:raw.property_type||null,budget:raw.budget||null,status:configuration.statusRows[0].name,lead_source:configuration.sourceRows[0].name,tags:valueArray(connection.default_tags),assigned_agent_id:connection.default_assigned_agent_id||null,assigned_team_id:connection.default_assigned_team_id||null,external_lead_id:externalId||null,idempotency_key:idempotency}}; }

  async function ingestWebhookLead(workspace, identifier, secret, payload) {
    const connection = await getWebhookConnection(workspace, identifier);
    if (!connection) return { status: 404, error: 'Webhook connection not found.' };
    if (connection.status !== 'active') return { status: 403, error: 'Webhook connection is inactive.' };
    if (!secret || hashToken(secret) !== connection.secret_hash) return { status: 401, error: 'Webhook authentication failed.' };

    const raw = payload && payload.data && typeof payload.data === 'object' ? { ...payload, ...payload.data } : payload || {};
    const { externalId, unsafeExternalId } = externalLeadIdentifier(raw);
    const idempotency = String(raw.idempotency_key || raw.idempotencyKey || externalId || hashToken(JSON.stringify(raw)));
    const payloadJson = JSON.stringify(raw);
    const eventInsert = await sql.query(
      `INSERT INTO crm.webhook_events (connection_id,idempotency_key,external_lead_id,source_platform,payload,signature_valid,status)
       VALUES ($1,$2,$3,$4,$5::jsonb,true,'received')
       ON CONFLICT (connection_id,idempotency_key) DO NOTHING RETURNING id`,
      [connection.id, idempotency, externalId || null, connection.source_platform, payloadJson],
    );
    let eventId = eventInsert[0]?.id;
    if (!eventId) {
      const existingEvent = await sql.query(
        `SELECT id,status FROM crm.webhook_events WHERE connection_id=$1 AND idempotency_key=$2 LIMIT 1`,
        [connection.id, idempotency],
      );
      const existingLead = await sql.query(
        `SELECT l.legacy_id FROM crm.leads l
         WHERE l.workspace_id=$1 AND l.deleted_at IS NULL
           AND (l.idempotency_key=$2 OR (l.external_source=$3 AND l.external_lead_id=$4))
         LIMIT 1`,
        [workspace, idempotency, connection.source_platform, externalId || null],
      );
      if (existingLead[0]) {
        return { ok: true, duplicate: true, lead: await getLead(workspace, existingLead[0].legacy_id) };
      }
      if (!existingEvent[0]) return { status: 409, error: 'The previous webhook event could not be found. Retry the lead.' };
      if (['processed', 'duplicate'].includes(String(existingEvent[0].status || '').toLowerCase())) {
        return { status: 409, error: 'The webhook was marked complete but its CRM lead could not be found. Review the webhook log before retrying.' };
      }
      const retriedEvent = await sql.query(
        `UPDATE crm.webhook_events
         SET external_lead_id=$1,payload=$2::jsonb,signature_valid=true,status='received',error_message=NULL,processed_at=NULL
         WHERE id=$3 RETURNING id`,
        [externalId || null, payloadJson, existingEvent[0].id],
      );
      eventId = retriedEvent[0]?.id;
    }

    if (connection.intake_mode === 'staging') {
      const staged = await createMetaLeadStaging(workspace, raw);
      // `webhook_events.status` intentionally tracks delivery lifecycle and
      // only accepts received/processed/failed/duplicate.  The staging
      // destination is represented by the webhook log and staging row, so a
      // staged intake must still complete the event as processed.
      await sql.query("UPDATE crm.webhook_events SET status='processed',processed_at=now(),error_message=NULL WHERE id=$1", [eventId]);
      await sql.query('INSERT INTO crm.webhook_logs (event_id,connection_id,status,message,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)', [eventId, connection.id, 'Staged', 'Meta lead saved to the intake review page', JSON.stringify({ staging_id: staged.id, external_lead_id: externalId || null })]);
      return { ok: true, staged: true, staging: staged };
    }

    const fullName = String(raw.full_name || raw.name || [raw.first_name, raw.last_name].filter(Boolean).join(' ') || '').trim();
    const phone = normalizeInboundContact(raw.phone || raw.phone_number || raw.mobile);
    const whatsapp = normalizeInboundContact(raw.whatsapp || raw.whatsapp_number);
    if (!fullName || !phone) {
      await sql.query('UPDATE crm.webhook_events SET status=\'failed\',error_message=$1 WHERE id=$2', ['full_name and phone are required', eventId]);
      await sql.query('INSERT INTO crm.failed_webhook_leads (event_id,connection_id,external_lead_id,payload,error_message) VALUES ($1,$2,$3,$4::jsonb,$5)', [eventId, connection.id, externalId || null, payloadJson, 'full_name and phone are required']);
      return { status: 422, error: 'Full name and phone are required.' };
    }
    const requestedSourceName = String(raw.lead_source || raw.source || connection.default_lead_source || 'Webhook').trim();
    const sourceName = canonicalWebhookSource(raw, connection);
    // Keep the historical Meta Lead Ads catalog entry for compatibility and
    // audit views, while storing the operational source as Facebook/Instagram.
    if (requestedSourceName.toLowerCase() === 'meta lead ads' && sourceName !== requestedSourceName) {
      await ensureWebhookLeadConfiguration(workspace, raw.status || connection.default_lead_status || 'New', requestedSourceName);
    }
    const configuration = await ensureWebhookLeadConfiguration(workspace, raw.status || connection.default_lead_status || 'New', sourceName);
    const statusRows = configuration.statusRows;
    const sourceRows = configuration.sourceRows;
    if (!statusRows[0] || !sourceRows[0]) {
      await sql.query('UPDATE crm.webhook_events SET status=\'failed\',error_message=$1 WHERE id=$2', ['Webhook status/source configuration is missing', eventId]);
      return { status: 422, error: 'Webhook status/source configuration is missing.' };
    }
    const legacyId = `lead_${crypto.randomUUID().slice(0, 10)}`;
    const inserted = await sql.query(
      `INSERT INTO crm.leads (workspace_id,legacy_id,full_name,email,phone,whatsapp_number,city,area,interested_in,property_type,budget,preferred_location,purpose,buying_timeline,financing_required,status_id,source_id,assigned_agent_id,assigned_team_id,external_source,external_lead_id,idempotency_key,received_at,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::timestamptz,$24::jsonb)
       ON CONFLICT DO NOTHING RETURNING id`,
      [workspace, legacyId, fullName, String(raw.email || '').toLowerCase() || null, phone, whatsapp, raw.city || null, raw.area || null, raw.interested_in || raw.interest || 'General enquiry', raw.property_type || null, raw.budget || null, raw.preferred_location || null, raw.purpose || null, raw.buying_timeline || null, Boolean(raw.financing_required), statusRows[0].id, sourceRows[0].id, connection.default_assigned_agent_id || null, connection.default_assigned_team_id || null, externalId ? connection.source_platform : null, externalId || null, idempotency, leadReceivedAt(raw), JSON.stringify({ ...raw, webhook_connection_id: connection.legacy_id, is_imported: true, lead_source: sourceName, source_form: webhookFormName(raw), source_form_name: webhookFormName(raw), source_channel: raw.source_channel || raw.channel || null, external_lead_id: externalId || null, idempotency_key: idempotency, ...(unsafeExternalId ? { external_lead_id_unsafe: unsafeExternalId } : {}) })],
    );
    if (!inserted[0]) {
      const existing = await sql.query(
        `SELECT legacy_id FROM crm.leads
         WHERE workspace_id=$1 AND (idempotency_key=$2 OR (external_source=$3 AND external_lead_id=$4)) LIMIT 1`,
        [workspace, idempotency, connection.source_platform, externalId || null],
      );
      const lead = existing[0] ? await getLead(workspace, existing[0].legacy_id) : null;
      await sql.query('UPDATE crm.webhook_events SET status=\'duplicate\',processed_at=now(),error_message=NULL WHERE id=$1', [eventId]);
      await sql.query('INSERT INTO crm.webhook_logs (event_id,connection_id,status,message,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)', [eventId, connection.id, 'Duplicate', 'Matched existing lead; no duplicate created', JSON.stringify({ external_lead_id: externalId, lead_id: lead?.id || null })]);
      return lead ? { ok: true, duplicate: true, lead } : { status: 409, error: 'The lead already exists by its external identity, but its CRM record could not be loaded.' };
    }
    await enqueueOutbox(workspace, 'lead_created', 'lead', inserted[0].id, { legacy_id: legacyId }, `lead_created:${legacyId}`);
    const lead = await getLead(workspace, legacyId);
    await sql.query('UPDATE crm.webhook_events SET status=\'processed\',processed_at=now(),error_message=NULL WHERE id=$1', [eventId]);
    await sql.query('UPDATE crm.webhook_connections SET last_received_at=now(),updated_at=now() WHERE id=$1', [connection.id]);
    await sql.query('INSERT INTO crm.webhook_logs (event_id,connection_id,status,message,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)', [eventId, connection.id, 'Success', unsafeExternalId ? 'Webhook lead accepted; external lead ID arrived as an unsafe JSON number and was not stored' : 'Webhook lead accepted', JSON.stringify({ external_lead_id: externalId || null, lead_id: lead?.id || null })]);
    return { ok: true, lead, duplicate: false };
  }
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
  async function search(workspace, user, query) {
    const needle=String(query || '').toLowerCase();
    const [leads,customers,followUps]=await Promise.all([
      listLeads({workspaceId:workspace,user,search:query}),listCustomers({workspaceId:workspace,user,search:query}),
      listFollowUps({workspaceId:workspace,user,includeHistory:true,notify:false})]);
    return {leads:leads.slice(0,20),customers:customers.slice(0,20),followUps:followUps.filter(item=>[item.notes,item.follow_up_type,item.assigned_agent,item.customer_name,item.phone].some(value=>String(value||'').toLowerCase().includes(needle))).slice(0,20)};
  }
  async function createChatGroup(workspace, actor, input) { const actorId=await resolveUserId(workspace,actor.id); const legacyId=input.id||`group_${crypto.randomUUID().slice(0,8)}`; const rows=await sql.query('INSERT INTO crm.chat_groups (workspace_id,legacy_id,name,description,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id,legacy_id,name AS group_name,description,created_at,updated_at',[workspace,legacyId,input.group_name||input.groupName||'New group',input.description||null,actorId]); const group=rows[0]; const members=[...new Set([actor.id,...(input.member_ids||input.memberIds||[])])]; for(const member of members){const memberId=await resolveUserId(workspace,member);if(memberId)await sql.query('INSERT INTO crm.chat_group_members (group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[group.id,memberId]);} return (await listChatGroups(workspace,{...actor,role:'super_admin'})).find(item=>item.legacy_id===legacyId)||group; }
  async function updateChatGroup(workspace, identifier, patch) { const fields=[];const params=[];const assign=(column,value)=>{params.push(value);fields.push(`${column}=$${params.length}`)};if(patch.groupName!==undefined)assign('name',patch.groupName);if(patch.description!==undefined)assign('description',patch.description);if(patch.is_archived!==undefined)assign('is_archived',Boolean(patch.is_archived));if(fields.length){params.push(await resolveGroupId(workspace,identifier));await sql.query(`UPDATE crm.chat_groups SET ${fields.join(',')},updated_at=now() WHERE id=$${params.length}`,params)} return (await listChatGroups(workspace,{role:'super_admin'})).find(item=>item.legacy_id===identifier)||null; }
  async function resolveGroupId(workspace, identifier) { const rows=await sql.query('SELECT id FROM crm.chat_groups WHERE workspace_id=$1 AND (id::text=$2 OR legacy_id=$2) LIMIT 1',[workspace,String(identifier)]);return rows[0]?.id||null; }
  async function updateChatGroupMembers(workspace, identifier, members, removeId) { const groupId=await resolveGroupId(workspace,identifier);if(!groupId)return null;if(removeId){const userId=await resolveUserId(workspace,removeId);if(userId)await sql.query('DELETE FROM crm.chat_group_members WHERE group_id=$1 AND user_id=$2',[groupId,userId])}else for(const member of members||[]){const userId=await resolveUserId(workspace,member);if(userId)await sql.query('INSERT INTO crm.chat_group_members (group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[groupId,userId])}return (await listChatGroups(workspace,{role:'super_admin'})).find(item=>item.legacy_id===identifier)||null; }
  async function sendChatMessage(workspace, actor, kind, identifier, input) { const table=kind==='group'?'crm.chat_groups':'crm.chat_channels';const rows=await sql.query(`SELECT id FROM ${table} WHERE workspace_id=$1 AND legacy_id=$2 LIMIT 1`,[workspace,identifier]);if(!rows[0])return null;const senderId=await resolveUserId(workspace,actor.id);const legacyId=`msg_${crypto.randomUUID().replace(/-/g,'')}`;const field=kind==='group'?'group_id':'channel_id';const objectUrl=input.attachment_url||input.attachment_content||null;const hasAttachment=Boolean(input.attachment_name);const messageType=hasAttachment?'attachment':input.message_type||'text';const inserted=await sql.query(`INSERT INTO crm.chat_messages (workspace_id,legacy_id,${field},sender_id,message_type,message_text) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,legacy_id,message_type,message_text,created_at`,[workspace,legacyId,rows[0].id,senderId,messageType,input.message_text||null]);if(hasAttachment)await sql.query('INSERT INTO crm.chat_attachments (message_id,uploaded_by,file_name,file_type,file_size,object_url) VALUES ($1,$2,$3,$4,$5,$6)',[inserted[0].id,senderId,input.attachment_name,input.attachment_mime||null,input.attachment_size||null,objectUrl||'']);await enqueueOutbox(workspace,'chat_message_created','chat_message',inserted[0].id,{channel_id:kind==='channel'?identifier:null,group_id:kind==='group'?identifier:null});return {...inserted[0],id:inserted[0].legacy_id,sender_id:actor.id,group_id:kind==='group'?identifier:undefined,channel_id:kind==='channel'?identifier:undefined,attachment_name:input.attachment_name||'',attachment_url:objectUrl||'',attachment_mime:input.attachment_mime||'',attachment_size:input.attachment_size||0}; }
  async function markChatRead(workspace,user,kind,identifier) { const table=kind==='group'?'crm.chat_groups':'crm.chat_channels';const parent=await sql.query(`SELECT id FROM ${table} WHERE workspace_id=$1 AND legacy_id=$2`,[workspace,identifier]);if(!parent[0])return;const field=kind==='group'?'group_id':'channel_id';const messages=await sql.query(`SELECT id FROM crm.chat_messages WHERE workspace_id=$1 AND ${field}=$2`,[workspace,parent[0].id]);const userId=await resolveUserId(workspace,user.id);for(const item of messages)await sql.query('INSERT INTO crm.chat_read_receipts (message_id,user_id,read_at) VALUES ($1,$2,now()) ON CONFLICT (message_id,user_id) DO UPDATE SET read_at=now()',[item.id,userId]);}
  async function markMessageRead(workspace,user,identifier) { const userId=await resolveUserId(workspace,user.id);await sql.query('INSERT INTO crm.chat_read_receipts (message_id,user_id,read_at) SELECT id,$2,now() FROM crm.chat_messages WHERE workspace_id=$1 AND legacy_id=$3 ON CONFLICT (message_id,user_id) DO UPDATE SET read_at=now()',[workspace,userId,String(identifier)]);return true; }
  async function reportRows(workspace,user) { const agents=await listUsers(workspace,user);const leads=await listLeads({workspaceId:workspace,user});const customers=await listCustomers({workspaceId:workspace,user});const followUps=await listFollowUps({workspaceId:workspace,user});return agents.filter(item=>['sales_agent','sales_manager'].includes(item.role)).map(agent=>{const ls=leads.filter(item=>item.assigned_agent_id===agent.id);const cs=customers.filter(item=>item.assigned_agent_id===agent.id);const fs=followUps.filter(item=>item.assigned_agent_id===agent.id);const closed=ls.filter(item=>item.status==='Closed Won').length;const overdue=fs.filter(item=>item.status==='Overdue').length;const completed=fs.filter(item=>item.status==='Completed').length;const conversion=ls.length?Number((closed/ls.length*100).toFixed(1)):0;const performance=conversion>=20&&overdue<=1?'Excellent':conversion>=12&&overdue<=2?'Good':conversion>0?'Average':'Needs Attention';return {id:agent.id,agentId:agent.id,name:agent.full_name,agentName:agent.full_name,initials:String(agent.full_name||'?').split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase(),email:agent.email,phone:agent.phone,role:agent.role,agentRole:agent.role==='sales_manager'?'Sales Manager':'Sales Agent',team:agent.team_id||'Unassigned',teamId:agent.team_id,assignedLeads:ls.length,activeLeads:ls.filter(item=>!['Closed Won','Closed Lost','Not Interested'].includes(item.status)).length,contactedLeads:ls.filter(item=>item.status!=='New').length,hotLeads:ls.filter(item=>['Hot','Booking'].includes(item.status)).length,followUpsAssigned:fs.length,followUpsDue:fs.filter(item=>['Pending','Rescheduled'].includes(item.status)).length,followUpsCompleted:completed,overdueFollowUps:overdue,customersHandled:cs.length,closedDeals:closed,lostLeads:ls.filter(item=>['Closed Lost','Lost'].includes(item.status)).length,conversionRate:conversion,conversionRateLabel:`${conversion}%`,performance,status:agent.status,presenceStatus:agent.presence_status||null,lastActivity:agent.last_login_at||agent.last_activity_at||agent.updated_at,lastActivityAt:agent.last_activity_at||agent.updated_at};}); }

return { listSavedNotes, editSavedNote, noteHistory, resetTemporaryPassword, workspaceId, findWorkspace, findUserByEmail, findUserByIdentifier, findUser, createSession, findSession, revokeSession, recordLogin, loginLockStatus, recordLoginFailure, clearLoginFailures, updateLastLogin, updateLastActivity, updatePresenceStatus, clearPresenceStatus, listUsers, listTeams, normalizeSingleTeam, updateUser, deleteUser, createUser, issueUserInvite, changePassword, loginActivity, userActivity, accountPreferences, updateAccountPreferences, workspaceSettings, updateWorkspaceSetting, listLeadConfiguration, createLeadConfiguration, updateLeadConfiguration, settingsActivities, auditEvents, listNotificationSettings, updateNotificationSettings, createAppRelease, listAppReleases, getAppRelease, getLatestAppRelease, publishAppRelease, unpublishAppRelease, recordAppReleaseDownload, registerMobilePushToken, removeMobilePushToken, listMobilePushTokens, registerWebPushSubscription, removeWebPushSubscription, listWebPushSubscriptions, listLeads, findLeadDuplicate, findExistingContact, getLead, listLeadActivities, createLead, updateLead, deleteLead, assignLead, bulkAssignLeads, changeLeadStatus, addLeadActivity, convertLeadToCustomer, reconcileTaggedLeadCustomers, createCustomerFromLead, listCustomers, getCustomer, updateCustomer, deleteCustomer, changeCustomerStatus, listCustomerNotes, addCustomerNote, listCustomerActivities, listCustomerFollowUps, listCustomerFollowUpHistory, listFollowUps, getFollowUp, createFollowUp, updateFollowUp, deleteFollowUp, transitionFollowUp, addFollowUpNote, listFollowUpActivities, listTasks, getTask, createTask, updateTask, deleteTask, listNotifications, markNotificationRead, markAllNotificationsRead, listWebhookConnections, getWebhookConnection, createWebhookConnection, updateWebhookConnection, updateWebhookMappings: updateWebhookConnection, listWebhookLogs, listFailedWebhookLeads, getFailedWebhookLead, resolveFailedWebhookLead, convertFailedWebhookLead, previewWebhookLead, ingestWebhookLead, verifyWebhookLead: (workspace, identifier, secret, query) => verifyNeonWebhookLead(sql, workspace, identifier, secret, query), listMetaLeadStaging, getMetaLeadStaging, getMetaLeadStagingSummary, getMetaLeadStagingVersion, createMetaLeadStaging, updateMetaLeadStaging, promoteMetaLeadStaging, bulkDeleteMetaLeadStaging, listChatUsers, listChatChannels, listChatGroups, listChatMessages, listChatAttachments, listChatLinks, createChatLink, directConversation, listDirectConversations, listDirectMessages, createChatGroup, updateChatGroup, updateChatGroupMembers, sendChatMessage, sendDirectMessage, markChatRead, markMessageRead, unreadCounts, search, reportRows, resolveUserId, resolveTeamId, resolveLeadId, resolveCustomerId, resolveFollowUpId };
}

async function verifyNeonWebhookLead(sql, workspace, identifier, secret, query = {}) {
  const connectionRows = await sql.query(
    'SELECT legacy_id, status, source_platform, secret_hash FROM crm.webhook_connections WHERE workspace_id=$1 AND (id::text=$2 OR legacy_id=$2) LIMIT 1',
    [workspace, String(identifier)],
  );
  const connection = connectionRows[0];
  if (!connection) return { status: 404, error: 'Webhook connection not found.' };
  if (String(connection.status).toLowerCase() !== 'active') return { status: 403, error: 'Webhook connection is inactive.' };
  if (!secret || hashToken(secret) !== connection.secret_hash) return { status: 401, error: 'Webhook authentication failed.' };
  const externalId = String(query.external_lead_id || query.meta_lead_id || '').trim();
  const idempotency = String(query.idempotency_key || query.idempotencyKey || '').trim();
  const crmLeadId = String(query.crm_lead_id || query.crmLeadId || query.lead_id_internal || '').trim();
  if (!externalId && !idempotency && !crmLeadId) return { status: 422, error: 'external_lead_id, idempotency_key, or crm_lead_id is required.' };
  const rows = await sql.query(
    `SELECT legacy_id, external_lead_id
       FROM crm.leads
      WHERE workspace_id=$1 AND deleted_at IS NULL
        AND ((external_lead_id=$2 AND (external_source=$3 OR external_source IS NULL))
          OR idempotency_key=$4 OR legacy_id=$5)
      LIMIT 1`,
    [workspace, externalId || null, connection.source_platform, idempotency || null, crmLeadId || null],
  );
  if (!rows[0]) return { status: 404, error: 'Lead has not been persisted in the CRM yet.' };
  return { ok: true, confirmed: true, lead: { id: rows[0].legacy_id, external_lead_id: rows[0].external_lead_id || null } };
}

function userRecord(row) { const inviteStatus = row.invite_status ? `${String(row.invite_status).slice(0, 1).toUpperCase()}${String(row.invite_status).slice(1)}` : null; return { id: row.legacy_id || row.id, db_id: row.id, workspace_id: row.workspace_id, email: row.email, full_name: row.full_name, phone: row.phone, password_hash: row.password_hash, role: row.role, team_id: row.team_id || null, team_name: row.team_name || null, status: row.status, presence_status: row.presence_status || null, presence_mode: row.presence_mode || null, must_change_password: Boolean(row.must_change_password), invite_status: inviteStatus, has_temporary_password: Boolean(row.must_change_password && ['pending', 'sent'].includes(row.invite_status) && row.temporary_password_expires_at), temporary_password_expires_at: row.must_change_password && ['pending', 'sent'].includes(row.invite_status) ? row.temporary_password_expires_at || null : null, access_email_sent_at: row.invite_status === 'pending' ? null : row.access_email_sent_at || null, last_login_at: row.last_login_at, last_activity_at: row.last_activity_at, created_at: row.created_at, updated_at: row.updated_at }; }

module.exports = { createNeonRepository, hashToken };


