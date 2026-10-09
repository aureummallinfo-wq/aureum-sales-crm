export function generateTemporaryPassword(): string { return `Aureum${Math.random().toString(36).slice(2, 8).toUpperCase()}!9`; }
export const TEMPORARY_PASSWORD_VALID_HOURS = 72;
