export const CRM_USER_TIMEZONE = "Asia/Karachi";
export function formatUserTimestamp(value?: string): string { return value ? new Intl.DateTimeFormat("en-GB", { timeZone: CRM_USER_TIMEZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not available"; }
