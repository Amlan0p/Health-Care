// HTTP client for the HealthCare backend. Contains NO secrets: the Groq key lives only on the server.
const TOKEN_KEY = 'hc_token';
const cfg = window.HC_CONFIG || {};

/** Resolves the API base URL once.
 *  - config.apiBaseUrl set  → use it (frontend hosted on a different origin than the API; set FRONTEND_ORIGIN on the backend)
 *  - empty (default)        → same origin (/api): the backend serves this page, locally and on Render
 *  - opened from file://    → http://localhost:3001/api (local backend default) */
function resolveBase() {
  if (cfg.apiBaseUrl) return cfg.apiBaseUrl.replace(/\/+$/, '') + '/api';
  if (window.location.protocol === 'file:') return 'http://localhost:3001/api';
  return '/api';
}
export const API_BASE = resolveBase();

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

export const tokenStore = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SESSION_CODES = new Set(['invalid_token', 'revoked_token', 'missing_token', 'user_gone']);

/**
 * request(path, { method, body, auth=true, timeoutMs, retries })
 *  - Throws ApiError for every failure (network, timeout, HTTP error, bad JSON). Never returns fake empty results.
 *  - GET requests are retried (network errors / 502 / 503 / 504) with short backoff.
 *  - A 401 on an authenticated call clears the token and fires "hc:session-expired".
 */
export async function request(path, { method = 'GET', body, auth = true, timeoutMs = 20000, retries } = {}) {
  const maxRetries = retries ?? (method === 'GET' ? 2 : 0);
  const token = auth ? tokenStore.get() : null;
  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(API_BASE + path, {
        method,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      let data = null;
      try { data = await res.json(); } catch { /* empty or non-JSON body */ }

      if (res.ok) {
        if (data === null && res.status !== 204) throw new ApiError(res.status, 'bad_response', 'The server sent an unreadable response.');
        return data;
      }
      if (res.status === 401 && token && SESSION_CODES.has(data?.code)) {
        tokenStore.clear();
        window.dispatchEvent(new CustomEvent('hc:session-expired'));
      }
      if ([502, 503, 504].includes(res.status) && attempt < maxRetries) { attempt += 1; await sleep(400 * attempt); continue; }
      throw new ApiError(res.status, data?.code || 'http_error', data?.error || `Request failed (${res.status}).`,
        { details: data?.details, retryAfterSeconds: data?.retryAfterSeconds });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      const aborted = err?.name === 'AbortError';
      if (attempt < maxRetries) { attempt += 1; await sleep(400 * attempt); continue; }
      throw new ApiError(0, aborted ? 'timeout' : 'network',
        aborted ? 'The server took too long to respond. Please try again.' : 'Cannot reach the server. Check your connection and try again.');
    } finally {
      clearTimeout(timer);
    }
  }
}
