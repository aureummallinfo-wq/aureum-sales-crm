const API_BASE_URL = String(process.env.EXPO_PUBLIC_API_BASE_URL || 'https://crm.aureummall.info').replace(/\/+$/, '');

let accessToken = '';
let refreshAccessToken: (() => Promise<string | null>) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token || '';
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function setRefreshHandler(handler: (() => Promise<string | null>) | null) {
  refreshAccessToken = handler;
}

type ApiRequestInit = RequestInit & { skipRefresh?: boolean };

export async function apiFetch<T>(path: string, options: ApiRequestInit = {}, hasRetried = false): Promise<T> {
  const { skipRefresh = false, ...requestOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...requestOptions,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(requestOptions.headers || {})
    }
  });

  if (response.status === 401 && !skipRefresh && !hasRetried && refreshAccessToken && !path.includes('/auth/mobile/')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiFetch<T>(path, options, true);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'The CRM service is unavailable.');
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body as T;
}
