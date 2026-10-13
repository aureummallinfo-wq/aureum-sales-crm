const fs = require('node:fs');
const path = require('node:path');
const { neon } = require('@neondatabase/serverless');

const connectionString = String(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '').trim();
if (!connectionString) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required.');

const sql = neon(connectionString);
const root = path.resolve(__dirname, '..');
const schemaPaths = [
  path.join(root, 'db', 'migrations', '001_aureum_crm_schema.sql'),
  path.join(root, 'db', 'migrations', '002_production_crm_schema.sql'),
  path.join(root, 'db', 'migrations', '003_workspace_settings.sql'),
  path.join(root, 'db', 'migrations', '004_crm_integration_metadata.sql'),
  path.join(root, 'db', 'migrations', '005_tasks.sql'),
  path.join(root, 'db', 'migrations', '006_single_sales_team.sql')
];
const DRY_RUN = process.argv.includes('--dry-run');

const tables = [
  'teams', 'users', 'user_invites', 'user_audit_logs', 'leads', 'lead_activities', 'customers',
  'customer_activities', 'customer_notes', 'customer_follow_ups', 'follow_ups', 'follow_up_activities',
  'chat_channels', 'chat_messages', 'chat_read_receipts', 'chat_groups', 'chat_group_members',
  'direct_messages', 'chat_attachments', 'chat_links', 'user_activities', 'system_settings',
  'account_preferences', 'lead_statuses', 'lead_tags', 'lead_sources', 'notification_settings',
  'notifications', 'activity_logs', 'webhook_connections', 'webhook_logs', 'failed_webhook_leads', 'tasks'
];

function json(value) { return JSON.stringify(value ?? {}); }
function mapEntries(value) { return Array.isArray(value) ? value : []; }
function rowsFromMap(value) { return mapEntries(value).flatMap(([ownerId, items]) => [{ ownerId, items }]); }
function flatMapRows(value, ownerKey) {
  return rowsFromMap(value).flatMap(({ ownerId, items }) => (Array.isArray(items) ? items : []).map(item => ({ ...item, [ownerKey]: ownerId })));
}

function splitSqlStatements(text) {
  const statements = [];
  let start = 0;
  let quote = null;
  let dollarTag = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (dollarTag) { if (text.startsWith(dollarTag, i)) { i += dollarTag.length - 1; dollarTag = null; } continue; }
    if (quote) {
      if (char === quote && text[i + 1] === quote) { i += 1; continue; }
      if (char === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '-' && next === '-') { lineComment = true; i += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === '$') {
      const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) { dollarTag = match[0]; i += dollarTag.length - 1; continue; }
    }
    if (char === ';') {
      const statement = text.slice(start, i).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }
  const finalStatement = text.slice(start).trim();
  if (finalStatement) statements.push(finalStatement);
  return statements;
}

async function runSchema() {
  if (DRY_RUN) return;
  for (const indexName of ['idx_crm_lead_activities_legacy_id', 'idx_crm_lead_notes_legacy_id', 'idx_crm_customer_activities_legacy_id', 'idx_crm_customer_notes_legacy_id', 'idx_crm_follow_up_activities_legacy_id', 'idx_crm_audit_events_legacy_id']) await sql.query(`DROP INDEX IF EXISTS crm.${indexName}`, []);
  for (const schemaPath of schemaPaths) {
    const statements = splitSqlStatements(fs.readFileSync(schemaPath, 'utf8'));
    for (const statement of statements) await sql.query(statement, []);
  }
}

async function upsert(table, columns, values, conflictColumns) {
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const updates = columns.filter(column => !conflictColumns.includes(column)).map(column => `${column} = EXCLUDED.${column}`).join(', ');
  const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updates || conflictColumns[0] + ' = EXCLUDED.' + conflictColumns[0]}`;
  await sql.query(query, values);
}

async function upsertGenerated(table, columns, values, conflictColumns) {
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const updates = columns.filter(column => !conflictColumns.includes(column)).map(column => `${column} = EXCLUDED.${column}`).join(', ');
  const query = `INSERT INTO ${table} (id, ${columns.join(', ')}) VALUES (gen_random_uuid(), ${placeholders}) ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updates || conflictColumns[0] + ' = EXCLUDED.' + conflictColumns[0]}`;
  await sql.query(query, values);
}

function timestampOrNull(value) {
  if (!value || ['Today', 'Yesterday', 'Not contacted', 'Not scheduled'].includes(String(value))) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dueTimestamp(date, time) {
  const value = date && time ? new Date(`${date}T${time}:00+05:00`) : new Date(date || '');
  return Number.isNaN(value.getTime()) ? new Date().toISOString() : value.toISOString();
}

async function importState() {
  const stateRows = await sql`SELECT state FROM aureum_crm_state WHERE id = 'default'`;
  const state = stateRows[0]?.state;
  if (!state) return { imported: false, reason: 'No aureum_crm_state row found.' };
  if (DRY_RUN) return { imported: false, dryRun: true, users: (state.users || []).length, leads: (state.leads || []).length, customers: (state.customers || []).length, followUps: (state.followUps || []).length };

  const userRows = Array.isArray(state.users) ? state.users : [];
  for (const item of userRows) await upsert('users', ['id', 'email', 'full_name', 'phone', 'role', 'team_id', 'status', 'data', 'created_at', 'updated_at'], [item.id, item.email, item.full_name || 'Unnamed user', item.phone || null, item.role || 'sales_agent', item.team_id || null, item.status || 'active', json(item), item.created_at || null, item.updated_at || null], ['id']);
  for (const item of state.teams || []) await upsert('teams', ['id', 'manager_id', 'name', 'description', 'data'], [item.id, item.manager_id || null, item.name || item.id, item.description || null, json(item)], ['id']);
  for (const item of state.leads || []) await upsert('leads', ['id', 'assigned_agent_id', 'assigned_team_id', 'created_by', 'lead_source', 'status', 'priority', 'data', 'created_at', 'updated_at'], [item.id, item.assigned_agent_id || null, item.assigned_team_id || null, item.created_by || null, item.lead_source || null, item.status || null, item.priority || null, json(item), item.created_at || null, item.updated_at || null], ['id']);
  for (const item of state.customers || []) await upsert('customers', ['id', 'lead_id', 'assigned_agent_id', 'assigned_team_id', 'created_by', 'customer_status', 'data', 'created_at', 'updated_at'], [item.id, item.lead_id || null, item.assigned_agent_id || null, item.assigned_team_id || null, item.created_by || null, item.customer_status || null, json(item), item.created_at || null, item.updated_at || null], ['id']);
  for (const item of state.followUps || []) await upsert('follow_ups', ['id', 'customer_id', 'lead_id', 'assigned_agent_id', 'assigned_team_id', 'status', 'due_date', 'due_time', 'data', 'created_at', 'updated_at'], [item.id, item.customer_id || null, item.lead_id || null, item.assigned_agent_id || null, item.assigned_team_id || null, item.status || null, item.due_date || null, item.due_time || null, json(item), item.created_at || null, item.updated_at || null], ['id']);

  for (const [userId, data] of mapEntries(state.userInvites)) await upsert('user_invites', ['user_id', 'data'], [userId, json(data)], ['user_id']);
  for (const [userId, data] of mapEntries(state.userAuditLogs)) await upsert('user_audit_logs', ['user_id', 'data'], [userId, json(data)], ['user_id']);
  for (const [leadId, items] of mapEntries(state.leadActivities)) for (const item of items || []) await upsert('lead_activities', ['id', 'lead_id', 'user_id', 'activity_type', 'data', 'created_at'], [item.id, leadId, item.user_id || null, item.activity_type || null, json(item), item.created_at || null], ['id']);
  for (const [customerId, items] of mapEntries(state.customerActivities)) for (const item of items || []) await upsert('customer_activities', ['id', 'customer_id', 'user_id', 'activity_type', 'data', 'created_at'], [item.id, customerId, item.user_id || null, item.activity_type || null, json(item), item.created_at || null], ['id']);
  for (const [customerId, items] of mapEntries(state.customerNotes)) for (const item of items || []) await upsert('customer_notes', ['id', 'customer_id', 'user_id', 'data', 'created_at'], [item.id, customerId, item.user_id || null, json(item), item.created_at || null], ['id']);
  for (const [customerId, items] of mapEntries(state.customerFollowUps)) await upsert('customer_follow_ups', ['customer_id', 'data'], [customerId, json(items)], ['customer_id']);
  for (const [followUpId, items] of mapEntries(state.followUpActivities)) for (const item of items || []) await upsert('follow_up_activities', ['id', 'follow_up_id', 'user_id', 'activity_type', 'data', 'created_at'], [item.id, followUpId, item.user_id || null, item.activity_type || null, json(item), item.created_at || null], ['id']);

  const channels = Array.isArray(state.chatChannels) ? state.chatChannels : [];
  for (const item of channels) await upsert('chat_channels', ['id', 'name', 'visibility', 'data'], [item.id, item.name || item.id, item.visibility || null, json(item)], ['id']);
  for (const [channelId, items] of mapEntries(state.chatMessages)) for (const item of items || []) await upsert('chat_messages', ['id', 'channel_id', 'group_id', 'sender_id', 'message_type', 'data', 'created_at'], [item.id, item.channel_id || channelId, item.group_id || null, item.sender_id || null, item.message_type || 'text', json(item), item.created_at || null], ['id']);
  for (const [key, data] of mapEntries(state.chatReadReceipts)) { const [userId, chatId] = String(key).split(':'); await upsert('chat_read_receipts', ['user_id', 'chat_id', 'read_at', 'data'], [userId, chatId, typeof data === 'string' ? data : data?.read_at || null, json(data)], ['user_id', 'chat_id']); }
  for (const item of state.groupChats || []) { await upsert('chat_groups', ['id', 'created_by', 'is_archived', 'data', 'created_at', 'updated_at'], [item.id, item.created_by || null, Boolean(item.is_archived), json(item), item.created_at || null, item.updated_at || null], ['id']); for (const memberId of item.member_ids || []) await upsert('chat_group_members', ['group_id', 'user_id'], [item.id, memberId], ['group_id', 'user_id']); }
  for (const [groupId, items] of mapEntries(state.groupMessages)) for (const item of items || []) await upsert('chat_messages', ['id', 'channel_id', 'group_id', 'sender_id', 'message_type', 'data', 'created_at'], [item.id, null, groupId, item.sender_id || null, item.message_type || 'text', json(item), item.created_at || null], ['id']);
  for (const [key, items] of mapEntries(state.directMessages)) for (const item of items || []) await upsert('direct_messages', ['id', 'sender_id', 'receiver_id', 'read_at', 'data', 'created_at'], [item.id, item.sender_id || null, item.receiver_id || null, item.read_at || null, json(item), item.created_at || null], ['id']);
  for (const [chatId, items] of mapEntries(state.chatAttachments)) for (const item of items || []) await upsert('chat_attachments', ['id', 'chat_id', 'message_id', 'uploaded_by', 'data', 'uploaded_at'], [item.id, chatId, item.message_id || null, item.uploaded_by || null, json(item), item.uploaded_at || null], ['id']);
  for (const [chatId, items] of mapEntries(state.chatLinks)) for (const item of items || []) await upsert('chat_links', ['id', 'chat_id', 'shared_by', 'data', 'shared_at'], [item.id, chatId, item.shared_by || null, json(item), item.shared_at || null], ['id']);
  for (const [userId, items] of mapEntries(state.userActivities)) for (const item of items || []) await upsert('user_activities', ['id', 'user_id', 'activity_type', 'data', 'created_at'], [item.id, userId, item.activity_type || null, json(item), item.created_at || null], ['id']);

  if (state.systemSettings) await upsert('system_settings', ['id', 'data'], ['default', json(state.systemSettings)], ['id']);
  for (const [userId, data] of mapEntries(state.accountPreferences)) await upsert('account_preferences', ['user_id', 'data'], [userId, json(data)], ['user_id']);
  for (const item of state.leadStatuses || []) await upsert('lead_statuses', ['id', 'name', 'slug', 'is_active', 'sort_order', 'data'], [item.id, item.name, item.slug || null, item.is_active !== false, item.sort_order || null, json(item)], ['id']);
  for (const item of state.leadTags || []) await upsert('lead_tags', ['id', 'name', 'slug', 'tag_type', 'is_active', 'data'], [item.id, item.name, item.slug || null, item.tag_type || null, item.is_active !== false, json(item)], ['id']);
  for (const item of state.leadSources || []) await upsert('lead_sources', ['id', 'name', 'slug', 'is_active', 'is_default', 'data'], [item.id, item.name, item.slug || null, item.is_active !== false, Boolean(item.is_default), json(item)], ['id']);
  for (const [userId, items] of mapEntries(state.notificationSettings)) for (const item of items || []) await upsert('notification_settings', ['user_id', 'event_key', 'data'], [userId, item.event_key, json(item)], ['user_id', 'event_key']);
  for (const [userId, items] of mapEntries(state.notifications)) for (const item of items || []) await upsert('notifications', ['id', 'user_id', 'event_type', 'related_entity_type', 'related_entity_id', 'is_read', 'data', 'created_at'], [item.id, userId, item.event_type || null, item.related_entity_type || null, item.related_entity_id || null, Boolean(item.is_read), json(item), item.created_at || null], ['id']);
  for (const item of state.activityLogs || []) await upsert('activity_logs', ['id', 'actor_user_id', 'entity_type', 'entity_id', 'action_type', 'data', 'created_at'], [item.id, item.actor_user_id || null, item.entity_type || null, item.entity_id || null, item.action_type || null, json(item), item.created_at || null], ['id']);
  for (const item of state.webhookConnections || []) await upsert('webhook_connections', ['id', 'source_platform', 'status', 'created_by', 'data', 'created_at', 'updated_at'], [item.id, item.source_platform || null, item.status || null, item.created_by || null, json(item), item.created_at || null, item.updated_at || null], ['id']);
  for (const item of state.webhookLogs || []) await upsert('webhook_logs', ['id', 'connection_id', 'status', 'data', 'created_at'], [item.id, item.connection_id || null, item.status || null, json(item), item.created_at || null], ['id']);
  for (const item of state.failedWebhookLeads || []) await upsert('failed_webhook_leads', ['id', 'connection_id', 'data', 'created_at'], [item.id, item.connection_id || null, json(item), item.created_at || null], ['id']);

  return { imported: true, users: userRows.length, leads: (state.leads || []).length, customers: (state.customers || []).length, followUps: (state.followUps || []).length };
}

async function importProductionState() {
  const stateRows = await sql`SELECT state FROM aureum_crm_state WHERE id = 'default'`;
  const state = stateRows[0]?.state;
  if (!state) return { imported: false, reason: 'No aureum_crm_state row found.' };
  if (DRY_RUN) return { imported: false, dryRun: true };

  await upsertGenerated('crm.workspaces', ['legacy_id', 'name', 'timezone', 'currency'], ['workspace_default', 'Aureum Mall & Residences', 'Asia/Karachi', 'PKR'], ['legacy_id']);
  const workspaceRows = await sql`SELECT id FROM crm.workspaces WHERE legacy_id = 'workspace_default'`;
  const workspaceId = workspaceRows[0]?.id;
  if (!workspaceId) throw new Error('Could not resolve the production CRM workspace.');

  const roles = [['super_admin', 'Super Admin'], ['sales_manager', 'Sales Manager'], ['sales_agent', 'Sales Agent']];
  for (const [key, name] of roles) await upsertGenerated('crm.roles', ['workspace_id', 'key', 'name'], [workspaceId, key, name], ['workspace_id', 'key']);
  const permissionKeys = ['dashboard', 'leads', 'my-leads', 'customers', 'follow-ups', 'tasks', 'team-chat', 'reports', 'agents', 'users', 'my-account', 'change-password', 'settings'];
  for (const key of permissionKeys) await upsert('crm.permissions', ['key', 'name'], [key, key.replace(/-/g, ' ')], ['key']);
  const roleRows = await sql`SELECT id, key FROM crm.roles WHERE workspace_id = ${workspaceId}`;
  const permissionRows = await sql`SELECT id, key FROM crm.permissions`;
  const roleMap = new Map(roleRows.map(row => [row.key, row.id]));
  const permissionMap = new Map(permissionRows.map(row => [row.key, row.id]));
  const permissionsByRole = {
    super_admin: permissionKeys,
    sales_manager: permissionKeys.filter(key => key !== 'settings'),
    sales_agent: ['dashboard', 'my-leads', 'customers', 'follow-ups', 'tasks', 'team-chat', 'my-account', 'change-password']
  };
  for (const [role, keys] of Object.entries(permissionsByRole)) for (const key of keys) await sql.query('INSERT INTO crm.role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [roleMap.get(role), permissionMap.get(key)]);

  const teamRows = state.teams || [];
  for (const item of teamRows) await upsertGenerated('crm.teams', ['workspace_id', 'legacy_id', 'name', 'description'], [workspaceId, item.id, item.name || item.id, item.description || null], ['workspace_id', 'legacy_id']);
  const storedTeams = await sql`SELECT id, legacy_id FROM crm.teams WHERE workspace_id = ${workspaceId}`;
  const teamMap = new Map(storedTeams.map(row => [row.legacy_id, row.id]));

  for (const item of state.users || []) await upsertGenerated('crm.users', ['workspace_id', 'legacy_id', 'email', 'full_name', 'phone', 'password_hash', 'role_key', 'team_id', 'status', 'must_change_password', 'last_login_at', 'last_activity_at'], [workspaceId, item.id, item.email, item.full_name || 'Unnamed user', item.phone || null, item.password_hash || '', item.role || 'sales_agent', teamMap.get(item.team_id) || null, item.status || 'active', Boolean(item.must_change_password), timestampOrNull(item.last_login_at), timestampOrNull(item.last_activity_at)], ['workspace_id', 'legacy_id']);
  const storedUsers = await sql`SELECT id, legacy_id FROM crm.users WHERE workspace_id = ${workspaceId}`;
  const userMap = new Map(storedUsers.map(row => [row.legacy_id, row.id]));
  for (const item of state.users || []) if (item.team_id && teamMap.get(item.team_id) && userMap.get(item.id)) await sql.query('INSERT INTO crm.team_memberships (team_id, user_id, is_primary) VALUES ($1, $2, true) ON CONFLICT (team_id, user_id) DO UPDATE SET is_primary = EXCLUDED.is_primary', [teamMap.get(item.team_id), userMap.get(item.id)]);
  for (const item of teamRows) if (item.manager_id && teamMap.get(item.id) && userMap.get(item.manager_id)) await sql.query('UPDATE crm.teams SET manager_user_id = $1 WHERE id = $2', [userMap.get(item.manager_id), teamMap.get(item.id)]);

  const statusMap = new Map();
  for (const item of state.leadStatuses || []) {
    await upsertGenerated('crm.lead_statuses', ['workspace_id', 'legacy_id', 'name', 'slug', 'color', 'sort_order', 'is_default', 'is_active'], [workspaceId, item.id, item.name, item.slug || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), item.color || null, item.sort_order || 0, Boolean(item.is_default), item.is_active !== false], ['workspace_id', 'legacy_id']);
  }
  for (const row of await sql`SELECT id, legacy_id, name FROM crm.lead_statuses WHERE workspace_id = ${workspaceId}`) { statusMap.set(row.legacy_id, row.id); statusMap.set(row.name, row.id); }
  const sourceMap = new Map();
  for (const item of state.leadSources || []) await upsertGenerated('crm.lead_sources', ['workspace_id', 'legacy_id', 'name', 'slug', 'is_default', 'is_active'], [workspaceId, item.id, item.name, item.slug || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), Boolean(item.is_default), item.is_active !== false], ['workspace_id', 'legacy_id']);
  for (const row of await sql`SELECT id, legacy_id, name FROM crm.lead_sources WHERE workspace_id = ${workspaceId}`) { sourceMap.set(row.legacy_id, row.id); sourceMap.set(row.name, row.id); }
  const tagMap = new Map();
  for (const item of state.leadTags || []) await upsertGenerated('crm.lead_tags', ['workspace_id', 'legacy_id', 'name', 'slug', 'tag_type', 'is_active'], [workspaceId, item.id, item.name, item.slug || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), item.tag_type || 'lead', item.is_active !== false], ['workspace_id', 'legacy_id']);
  for (const row of await sql`SELECT id, legacy_id, name FROM crm.lead_tags WHERE workspace_id = ${workspaceId}`) { tagMap.set(row.legacy_id, row.id); tagMap.set(row.name, row.id); }

  for (const item of state.leads || []) await upsertGenerated('crm.leads', ['workspace_id', 'legacy_id', 'full_name', 'email', 'phone', 'whatsapp_number', 'city', 'area', 'interested_in', 'property_type', 'budget', 'preferred_location', 'purpose', 'buying_timeline', 'financing_required', 'status_id', 'source_id', 'priority', 'assigned_agent_id', 'assigned_team_id', 'created_by', 'external_source', 'external_lead_id', 'metadata', 'created_at', 'updated_at'], [workspaceId, item.id, item.full_name, item.email || null, item.phone || null, item.whatsapp_number || null, item.city || null, item.area || null, item.interested_in || null, item.property_type || null, item.budget || null, item.preferred_location || null, item.purpose || null, item.buying_timeline || null, Boolean(item.financing_required), statusMap.get(item.status) || null, sourceMap.get(item.lead_source) || null, item.priority || 'Medium', userMap.get(item.assigned_agent_id) || null, teamMap.get(item.assigned_team_id) || null, userMap.get(item.created_by) || null, item.external_source || null, item.external_lead_id || null, json(item), timestampOrNull(item.created_at), timestampOrNull(item.updated_at)], ['workspace_id', 'legacy_id']);
  const storedLeads = await sql`SELECT id, legacy_id FROM crm.leads WHERE workspace_id = ${workspaceId}`;
  const leadMap = new Map(storedLeads.map(row => [row.legacy_id, row.id]));
  for (const item of state.leads || []) for (const tagId of item.tags || []) {
    const tag = tagMap.get(tagId);
    if (tag && leadMap.get(item.id)) await sql.query('INSERT INTO crm.lead_tag_assignments (lead_id, tag_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [leadMap.get(item.id), tag, userMap.get(item.created_by) || null]);
  }
  for (const [leadId, items] of mapEntries(state.leadActivities)) for (const item of items || []) if (leadMap.get(leadId)) await sql.query('INSERT INTO crm.lead_activities (legacy_id, lead_id, actor_user_id, activity_type, description, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb) ON CONFLICT (legacy_id) DO UPDATE SET description = EXCLUDED.description, metadata = EXCLUDED.metadata', [item.id, leadMap.get(leadId), userMap.get(item.user_id) || null, item.activity_type || 'activity', item.description || null, json(item)]);

  for (const item of state.customers || []) if (leadMap.get(item.lead_id)) await upsertGenerated('crm.customers', ['workspace_id', 'legacy_id', 'lead_id', 'full_name', 'email', 'phone', 'whatsapp_number', 'customer_status', 'assigned_agent_id', 'assigned_team_id', 'created_by', 'metadata', 'created_at', 'updated_at'], [workspaceId, item.id, leadMap.get(item.lead_id), item.full_name, item.email || null, item.phone || null, item.whatsapp_number || null, item.customer_status || 'Active', userMap.get(item.assigned_agent_id) || null, teamMap.get(item.assigned_team_id) || null, userMap.get(item.created_by) || null, json(item), timestampOrNull(item.created_at), timestampOrNull(item.updated_at)], ['workspace_id', 'legacy_id']);
  const storedCustomers = await sql`SELECT id, legacy_id FROM crm.customers WHERE workspace_id = ${workspaceId}`;
  const customerMap = new Map(storedCustomers.map(row => [row.legacy_id, row.id]));
  for (const [customerId, items] of mapEntries(state.customerNotes)) for (const item of items || []) if (customerMap.get(customerId)) await sql.query('INSERT INTO crm.customer_notes (legacy_id, customer_id, author_user_id, note) VALUES ($1, $2, $3, $4) ON CONFLICT (legacy_id) DO UPDATE SET note = EXCLUDED.note', [item.id, customerMap.get(customerId), userMap.get(item.user_id) || null, item.note || '']);
  for (const item of state.followUps || []) if (customerMap.get(item.customer_id) || leadMap.get(item.lead_id)) await upsertGenerated('crm.follow_ups', ['workspace_id', 'legacy_id', 'lead_id', 'customer_id', 'assigned_agent_id', 'assigned_team_id', 'follow_up_type', 'due_at', 'priority', 'status', 'notes', 'created_by', 'metadata', 'created_at', 'updated_at'], [workspaceId, item.id, leadMap.get(item.lead_id) || null, customerMap.get(item.customer_id) || null, userMap.get(item.assigned_agent_id) || userMap.get(item.created_by) || userMap.get('usr_001'), teamMap.get(item.assigned_team_id) || null, item.follow_up_type || 'General Follow-up', dueTimestamp(item.due_date, item.due_time), item.priority || 'Medium', item.status || 'Pending', item.notes || null, userMap.get(item.created_by) || null, json(item), timestampOrNull(item.created_at), timestampOrNull(item.updated_at)], ['workspace_id', 'legacy_id']);

  for (const item of state.chatChannels || []) await upsertGenerated('crm.chat_channels', ['workspace_id', 'legacy_id', 'name', 'description', 'visibility'], [workspaceId, item.id, item.name || item.id, item.description || null, item.visibility || 'public'], ['workspace_id', 'legacy_id']);
  const storedChannels = await sql`SELECT id, legacy_id FROM crm.chat_channels WHERE workspace_id = ${workspaceId}`;
  const channelMap = new Map(storedChannels.map(row => [row.legacy_id, row.id]));
  for (const item of state.chatChannels || []) for (const member of item.members || []) if (channelMap.get(item.id) && userMap.get(member)) await sql.query('INSERT INTO crm.chat_channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [channelMap.get(item.id), userMap.get(member)]);
  for (const item of state.groupChats || []) await upsertGenerated('crm.chat_groups', ['workspace_id', 'legacy_id', 'name', 'description', 'created_by', 'is_archived', 'created_at', 'updated_at'], [workspaceId, item.id, item.group_name || item.id, item.description || null, userMap.get(item.created_by) || null, Boolean(item.is_archived), timestampOrNull(item.created_at), timestampOrNull(item.updated_at)], ['workspace_id', 'legacy_id']);
  const storedGroups = await sql`SELECT id, legacy_id FROM crm.chat_groups WHERE workspace_id = ${workspaceId}`;
  const groupMap = new Map(storedGroups.map(row => [row.legacy_id, row.id]));
  for (const item of state.groupChats || []) for (const member of item.member_ids || []) if (groupMap.get(item.id) && userMap.get(member)) await sql.query('INSERT INTO crm.chat_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [groupMap.get(item.id), userMap.get(member)]);
  for (const [channelId, items] of mapEntries(state.chatMessages)) for (const item of items || []) if (channelMap.get(channelId) && userMap.get(item.sender_id)) await sql.query('INSERT INTO crm.chat_messages (workspace_id, legacy_id, channel_id, sender_id, message_type, message_text, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (legacy_id) DO UPDATE SET message_text = EXCLUDED.message_text', [workspaceId, item.id, channelMap.get(channelId), userMap.get(item.sender_id), item.message_type || 'text', item.message_text || '', timestampOrNull(item.created_at) || new Date().toISOString()]);
  for (const [groupId, items] of mapEntries(state.groupMessages)) for (const item of items || []) if (groupMap.get(groupId) && userMap.get(item.sender_id)) await sql.query('INSERT INTO crm.chat_messages (workspace_id, legacy_id, group_id, sender_id, message_type, message_text, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (legacy_id) DO UPDATE SET message_text = EXCLUDED.message_text', [workspaceId, item.id, groupMap.get(groupId), userMap.get(item.sender_id), item.message_type || 'text', item.message_text || '', timestampOrNull(item.created_at) || new Date().toISOString()]);

  for (const definition of state.notificationSettings ? [...new Set(mapEntries(state.notificationSettings).flatMap(([, items]) => (items || []).map(item => item.event_key).filter(Boolean)))] : []) await upsert('crm.notification_definitions', ['event_key', 'event_name'], [definition, definition.replace(/_/g, ' ')], ['event_key']);
  const definitions = await sql`SELECT event_key FROM crm.notification_definitions`;
  const definitionKeys = new Set(definitions.map(row => row.event_key));
  for (const [userId, items] of mapEntries(state.notificationSettings)) for (const item of items || []) if (userMap.get(userId) && definitionKeys.has(item.event_key)) await sql.query('INSERT INTO crm.notification_settings (user_id, event_key, in_app_enabled, email_enabled, whatsapp_enabled, sms_enabled) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id, event_key) DO UPDATE SET in_app_enabled = EXCLUDED.in_app_enabled, email_enabled = EXCLUDED.email_enabled, whatsapp_enabled = EXCLUDED.whatsapp_enabled, sms_enabled = EXCLUDED.sms_enabled', [userMap.get(userId), item.event_key, item.in_app_enabled !== false, Boolean(item.email_enabled), Boolean(item.whatsapp_enabled), Boolean(item.sms_enabled)]);
  for (const [userId, items] of mapEntries(state.notifications)) for (const item of items || []) if (userMap.get(userId)) await sql.query('INSERT INTO crm.notifications (user_id, event_key, title, message, related_entity_type, dedupe_key, is_read, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (user_id, dedupe_key) DO NOTHING', [userMap.get(userId), item.event_type || null, item.title || 'Notification', item.message || '', item.related_entity_type || null, item.id || null, Boolean(item.is_read), timestampOrNull(item.created_at) || new Date().toISOString()]);
  for (const item of state.activityLogs || []) await sql.query('INSERT INTO crm.audit_events (legacy_id, workspace_id, actor_user_id, action, entity_type, entity_id, after_data) VALUES ($1, $2, $3, $4, $5, NULL, $6::jsonb) ON CONFLICT (legacy_id) DO UPDATE SET after_data = EXCLUDED.after_data', [item.id, workspaceId, userMap.get(item.actor_user_id) || null, item.action_type || 'activity', item.entity_type || 'system', json(item)]);
  return { imported: true, workspaceId, users: (state.users || []).length, leads: (state.leads || []).length, customers: (state.customers || []).length, followUps: (state.followUps || []).length };
}

(async () => {
  if (DRY_RUN) {
    console.log(JSON.stringify({ dryRun: true, migrations: schemaPaths.map(file => path.relative(root, file)) }));
    return;
  }
  await runSchema();
  const legacy = await importState();
  const production = await importProductionState();
  console.log(JSON.stringify({ schema: '001_aureum_crm_schema + 002_production_crm_schema + 003_workspace_settings + 004_crm_integration_metadata', legacy, production }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
