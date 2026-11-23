const API_BASE_URL = String(process.env.EXPO_PUBLIC_API_BASE_URL || 'https://crm.aureummall.info').replace(/\/+$/, '');

let accessToken = '';
let refreshAccessToken: (() => Promise<string | null>) | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token || '';
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function setRefreshHandler(handler: (() => Promise<string | null>) | null) {
  refreshAccessToken = handler;
  if (!handler) refreshPromise = null;
}

function refreshOnce() {
  if (!refreshAccessToken) return Promise.resolve(null);
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

type ApiRequestInit = RequestInit & { skipRefresh?: boolean };

function createRequestSignal(externalSignal?: AbortSignal | null) {
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  const timeout = setTimeout(() => controller.abort(), 20_000);
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    }
  };
}

function networkError(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') return new Error('The CRM service took too long to respond. Check your connection and try again.');
  const friendly = new Error('Unable to connect to the CRM service. Check your internet connection and try again.');
  if (error instanceof Error) friendly.cause = error;
  return friendly;
}

function apiPath(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!normalized.startsWith('/api/')) throw new Error('The mobile CRM client only accepts API routes.');
  return normalized;
}

export async function apiFetch<T>(path: string, options: ApiRequestInit = {}, hasRetried = false): Promise<T> {
  const { skipRefresh = false, ...requestOptions } = options;
  const externalSignal = requestOptions.signal;
  const requestPath = apiPath(path);
  const requestSignal = createRequestSignal(externalSignal);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${requestPath}`, {
      ...requestOptions,
      signal: requestSignal.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(requestOptions.headers || {})
      }
    });
  } catch (error) {
    // TanStack Query uses this signal when a screen/filter changes. Preserve
    // the abort so a stale request is cancelled instead of becoming an error.
    if (externalSignal?.aborted) throw error;
    throw networkError(error);
  }

  if (response.status === 401 && !skipRefresh && !hasRetried && refreshAccessToken && !requestPath.includes('/auth/mobile/')) {
    requestSignal.cleanup();
    const refreshed = await refreshOnce();
    if (refreshed) return apiFetch<T>(requestPath, options, true);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (externalSignal?.aborted) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw networkError(error);
    body = {};
  } finally {
    requestSignal.cleanup();
  }
  if (!response.ok) {
    const error = new Error((body as { error?: string }).error || 'The CRM service is unavailable.');
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body as T;
}

export async function apiFetchText(path: string, options: ApiRequestInit = {}, hasRetried = false): Promise<string> {
  const { skipRefresh = false, ...requestOptions } = options;
  const externalSignal = requestOptions.signal;
  const requestPath = apiPath(path);
  const requestSignal = createRequestSignal(externalSignal);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${requestPath}`, {
      ...requestOptions,
      signal: requestSignal.signal,
      headers: {
        Accept: 'text/csv, text/plain, application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(requestOptions.headers || {})
      }
    });
  } catch (error) {
    if (externalSignal?.aborted) throw error;
    throw networkError(error);
  }

  if (response.status === 401 && !skipRefresh && !hasRetried && refreshAccessToken && !requestPath.includes('/auth/mobile/')) {
    requestSignal.cleanup();
    const refreshed = await refreshOnce();
    if (refreshed) return apiFetchText(requestPath, options, true);
  }

  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    if (externalSignal?.aborted) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw networkError(error);
    body = '';
  } finally {
    requestSignal.cleanup();
  }
  if (!response.ok) {
    let message = 'The CRM service is unavailable.';
    try { message = (JSON.parse(body) as { error?: string }).error || message; } catch { /* keep the generic message for non-JSON errors */ }
    const error = new Error(message);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body;
}
