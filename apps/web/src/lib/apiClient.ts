/**
 * Cloud Mail API client.
 *
 * Owns access-token lifecycle: keeps the token in memory (never localStorage),
 * refreshes silently via the httpOnly `cm_rt` cookie, and retries the
 * intercepted request exactly once on a 401.
 */

/**
 * Base URL for API calls.
 *
 *  - In production the bundle is served from https://mail.digiskills.live/
 *    and nginx reverse-proxies /v1/* to the API. Using relative URLs (empty
 *    base) means the browser never crosses origins and — importantly — never
 *    tries to reach loopback from a public HTTPS page (which triggers Chrome's
 *    "Local Network Access" permission prompt).
 *
 *  - In local dev, set VITE_API_URL=http://localhost:4000 in apps/web/.env.local
 *    to point at your locally-running API.
 *
 * Never fall back to a hard-coded localhost URL in production.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface ApiErrorBody {
  error?: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken: string | null = null;
let currentTenantSlug: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function setCurrentTenant(slug: string | null): void {
  currentTenantSlug = slug;
}

export interface ApiRequestOptions extends RequestInit {
  /** Skip the automatic 401→refresh→retry cycle (used by /auth/refresh itself). */
  skipAuthRefresh?: boolean;
  /** Attach an Idempotency-Key header. Generate with crypto.randomUUID(). */
  idempotencyKey?: string;
}

export async function api<T = unknown>(path: string, opts: ApiRequestOptions = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = new Headers(opts.headers);
  headers.set('accept', 'application/json');
  if (opts.body && !headers.has('content-type') && !(opts.body instanceof FormData)) {
    headers.set('content-type', 'application/json');
  }
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  if (currentTenantSlug) headers.set('x-cloudmail-tenant', currentTenantSlug);
  if (opts.idempotencyKey) headers.set('idempotency-key', opts.idempotencyKey);

  const res = await fetch(url, {
    ...opts,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !opts.skipAuthRefresh) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('authorization', `Bearer ${newToken}`);
      const retry = await fetch(url, { ...opts, headers, credentials: 'include' });
      return parseResponse<T>(retry);
    }
  }
  return parseResponse<T>(res);
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const errBody = body as ApiErrorBody | null;
    const err = errBody?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'http_error',
      err?.message ?? `Request failed (${res.status})`,
      err?.details,
    );
  }
  return body as T;
}

/**
 * Fetch a binary payload (e.g. an attachment download) and return it as a
 * Blob. Runs through the same auth flow as api() — access token attached,
 * silent-refresh + retry on 401 — but does not try to parse as JSON.
 */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = new Headers();
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  if (currentTenantSlug) headers.set('x-cloudmail-tenant', currentTenantSlug);

  let res = await fetch(url, { headers, credentials: 'include' });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('authorization', `Bearer ${newToken}`);
      res = await fetch(url, { headers, credentials: 'include' });
    }
  }
  if (!res.ok) {
    // Best-effort JSON error body extraction; fall back to a generic error.
    let code = 'http_error';
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (body.error?.code) code = body.error.code;
      if (body.error?.message) message = body.error.message;
    } catch {
      /* not JSON — leave defaults */
    }
    throw new ApiError(res.status, code, message);
  }
  return res.blob();
}

async function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { accessToken: string };
      accessToken = body.accessToken;
      return body.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}
