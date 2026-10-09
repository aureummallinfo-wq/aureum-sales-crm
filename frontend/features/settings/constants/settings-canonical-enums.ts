export const CRM_ROLES = ['super_admin', 'sales_manager', 'sales_agent'] as const;
export type CrmRole = (typeof CRM_ROLES)[number];
export const CRM_TIMEZONES = ['Asia/Karachi', 'UTC', 'Asia/Dubai', 'Europe/London'] as const;
export const CRM_CURRENCIES = ['PKR', 'USD', 'AED', 'GBP'] as const;
export const DEFAULT_CRM_TIMEZONE = 'Asia/Karachi' as const;
export const DEFAULT_CRM_CURRENCY = 'PKR' as const;
