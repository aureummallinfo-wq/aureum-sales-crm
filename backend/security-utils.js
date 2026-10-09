const CRM_ROLES = Object.freeze(['super_admin', 'sales_manager', 'sales_agent']);
const ROUTE_PERMISSIONS = Object.freeze({
  dashboard: CRM_ROLES,
  'all-leads': ['super_admin', 'sales_manager'],
  'my-leads': CRM_ROLES,
  'add-lead': ['sales_manager'],
  customers: CRM_ROLES,
  'follow-ups': CRM_ROLES,
  'team-chat': CRM_ROLES,
  reports: ['super_admin', 'sales_manager'],
  users: ['super_admin', 'sales_manager'],
  settings: ['super_admin'],
  'my-account': CRM_ROLES,
  'change-password': CRM_ROLES,
  'access-denied': CRM_ROLES
});

function canAccessRoute(role, route) { return Boolean(ROUTE_PERMISSIONS[route]?.includes(role)); }
function isKnownRole(role) { return CRM_ROLES.includes(role); }
function canViewOwnedRecord(user, record, ownerField = 'assigned_agent_id', teamField = 'assigned_team_id') {
  if (!user || !record || !isKnownRole(user.role)) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'sales_manager') return record[teamField] === user.team_id;
  return record[ownerField] === user.id;
}
function validatePasswordPolicy(password, minimumLength = 8) {
  const value = String(password || '');
  return value.length >= Math.max(8, Number(minimumLength) || 8) && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value);
}
function validateEmail(value) { return /^\S+@\S+\.\S+$/.test(String(value || '').trim()); }
function validatePhone(value) { return !value || /^[+0-9()\-\s]{7,24}$/.test(String(value).trim()); }
function validateIsoDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()); }
function safeText(value, maxLength = 5000) { return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength); }

module.exports = { CRM_ROLES, ROUTE_PERMISSIONS, canAccessRoute, isKnownRole, canViewOwnedRecord, validatePasswordPolicy, validateEmail, validatePhone, validateIsoDate, safeText };
