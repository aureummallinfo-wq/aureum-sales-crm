export const USER_TIMEZONE = "Asia/Karachi";
export function formatUserDate(value?: string, fallback = "Not available"): string { if (!value) return fallback; const date = new Date(value); return Number.isNaN(date.getTime()) ? fallback : new Intl.DateTimeFormat("en-GB", { timeZone: USER_TIMEZONE, dateStyle: "medium", timeStyle: "short" }).format(date); }
export function addHours(value: Date, hours: number): string { return new Date(value.getTime() + hours * 60 * 60 * 1000).toISOString(); }
