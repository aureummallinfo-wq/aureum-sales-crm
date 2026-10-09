export function formatAccountDate(value: string | undefined): string { return value ? new Date(value).toLocaleString() : 'Not available'; }
