export interface AccountProfile { id: string; fullName: string; email: string; phone: string; avatarUrl?: string; roleLabel: string; teamName: string; status: string; }
export interface AccountPreferences { notifications: Record<string, boolean>; appearance: { theme: string; compact_mode: boolean; sidebar_collapsed: boolean }; display: { language: string; timezone: string; date_format: string; time_format: string }; }
export interface LoginActivity { id: string; type: string; description: string; ipAddress: string; createdAt: string; }
