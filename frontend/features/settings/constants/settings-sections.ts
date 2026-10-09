import type { SettingsSection } from '../types/settings-contracts';
import { CRM_ROLES } from './settings-canonical-enums';

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: 'company', label: 'Company profile', description: 'Identity and contact details', roles: [...CRM_ROLES] },
  { id: 'crm', label: 'CRM preferences', description: 'Workspace defaults', roles: [...CRM_ROLES] },
  { id: 'permissions', label: 'Roles & permissions', description: 'Fixed access policy', roles: [...CRM_ROLES] },
  { id: 'statuses', label: 'Statuses & tags', description: 'Pipeline language', roles: [...CRM_ROLES] },
  { id: 'sources', label: 'Lead sources', description: 'Acquisition channels', roles: [...CRM_ROLES] },
  { id: 'notifications', label: 'Notifications', description: 'Event channels', roles: [...CRM_ROLES] },
  { id: 'security', label: 'Security policy', description: 'Password and access rules', roles: [...CRM_ROLES] },
  { id: 'email', label: 'Email & access', description: 'Templates and sender', roles: [...CRM_ROLES] },
  { id: 'audit', label: 'Activity audit', description: 'Configuration history', roles: [...CRM_ROLES] }
] as const;
