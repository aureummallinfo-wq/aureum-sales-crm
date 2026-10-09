export async function fetchSettings(apiFetch: (path: string) => Promise<unknown>) { return apiFetch('/api/settings'); }
export async function saveSettings(apiFetch: (path: string, options: RequestInit) => Promise<unknown>, endpoint: string, payload: unknown) { return apiFetch(endpoint, { method: 'PATCH', body: JSON.stringify(payload) }); }
