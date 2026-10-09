export const DEFAULT_CRM_TIMEZONE = "Asia/Karachi";
export function getCrmTimezone(): string { return DEFAULT_CRM_TIMEZONE; }
export function formatReportDate(value: string, timezone = DEFAULT_CRM_TIMEZONE): string { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: timezone }).format(new Date(value)); }
export function formatReportDateTime(value: string, timezone = DEFAULT_CRM_TIMEZONE): string { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value)); }
