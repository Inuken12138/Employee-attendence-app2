/**
 * Centralizes how the frontend talks to the Django API.
 *
 * This file turns relative API paths into absolute URLs, attaches the saved
 * auth token when one exists, and normalizes JSON error handling so page and
 * feature components can focus on business logic instead of repetitive fetch
 * setup.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api';

/** Builds an absolute API URL from a frontend-relative endpoint path. */
export function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Reads the saved auth token from browser storage and converts it into fetch headers. */
export function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }

  const token = window.localStorage.getItem('token');
  return token ? { Authorization: `Token ${token}` } : {};
}

/**
 * Sends a request to the backend with the project's default auth and JSON header behavior.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const authHeaders = getAuthHeaders();

  Object.entries(authHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  if (!(init.body instanceof FormData) && !headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(buildApiUrl(path), {
    ...init,
    headers,
  });
}

/**
 * Wraps {@link apiFetch} and returns parsed JSON while turning non-2xx responses
 * into thrown JavaScript errors with a human-readable message.
 */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const data = (await response.json()) as Record<string, unknown>;
      const detail = data.detail;
      if (typeof detail === 'string') {
        message = detail;
      }
    } catch {
      // fall back to the default message
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
