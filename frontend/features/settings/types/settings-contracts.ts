import type { CrmRole } from '../constants/settings-canonical-enums';

export interface CompanySettings { company_name: string; crm_name: string; logo_url: string; email: string; phone: string; address: string; timezone: string; currency: string; }
export interface CrmPreferences { default_lead_status: string; default_lead_source: string; default_dashboard_range: string; default_timezone: string; default_currency: string; default_table_page_size: number; default_follow_up_reminder_minutes: number; }
export interface SecuritySettings { temporary_password_expiry_hours: number; force_password_change_first_login: boolean; minimum_password_length: number; require_uppercase: boolean; require_lowercase: boolean; require_number: boolean; require_special_character: boolean; block_inactive_suspended_login: boolean; }
export interface EmailAccessSettings { sender_name: string; sender_email: string; access_email_subject: string; access_email_template: string; password_reset_subject: string; password_reset_template: string; email_enabled: boolean; }
export interface PermissionRow { key: string; label: string; super_admin: boolean; sales_manager: boolean; sales_agent: boolean; }
export interface SettingsContract { company: CompanySettings; preferences: CrmPreferences; security: SecuritySettings; emailAccess: EmailAccessSettings; permissions: PermissionRow[]; }
export interface SettingsSection { id: string; label: string; description: string; roles: CrmRole[]; }
