/*
 * Minimal client for the educator API, used by the real-system seeding scripts.
 *
 * Handles the two things that bite every naive caller:
 *   - CSRF: every non-login call needs the login response's csrfToken echoed as an
 *     `x-csrf-token` header, plus the login cookies.
 *   - Cookies: kept per-session so each actor (admin / each educator) is independent.
 */
const BASE = process.env.EDU_API_BASE || 'http://127.0.0.1:6002/api';

class ApiError extends Error {
  constructor(status, body, path) {
    super(`${path} -> ${status}: ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`);
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

class Session {
  constructor() { this.token = null; this.csrf = null; this.cookie = ''; }

  async request(method, path, body, attempt = 0) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.csrf) headers['x-csrf-token'] = this.csrf;
    if (this.cookie) headers.Cookie = this.cookie;

    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    // The API rate-limits aggressively (5/sec per authenticated user, stricter on
    // /auth/login). Honour Retry-After and back off rather than dropping the record.
    if (res.status === 429 && attempt < 40) {
      let wait = Number(res.headers.get('retry-after')) * 1000;
      if (!Number.isFinite(wait) || wait <= 0) {
        try { wait = Number(JSON.parse(await res.clone().text())?.retryAfter) * 1000; } catch { wait = 0; }
      }
      if (!Number.isFinite(wait) || wait <= 0) wait = 1000;
      // jitter so parallel workers don't retry in lockstep
      await new Promise((r) => setTimeout(r, wait + Math.floor(Math.random() * 400) + 150 * attempt));
      return this.request(method, path, body, attempt + 1);
    }

    // Carry cookies forward (login sets the CSRF cookie the guard compares against).
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (setCookie.length) {
      const jar = new Map(this.cookie ? this.cookie.split('; ').map((c) => [c.split('=')[0], c]) : []);
      for (const c of setCookie) { const kv = c.split(';')[0]; jar.set(kv.split('=')[0], kv); }
      this.cookie = [...jar.values()].join('; ');
    }

    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    if (!res.ok) throw new ApiError(res.status, parsed, path);
    return parsed;
  }

  get(p) { return this.request('GET', p); }
  post(p, b) { return this.request('POST', p, b); }
  put(p, b) { return this.request('PUT', p, b); }

  async login(email, password) {
    const r = await this.request('POST', '/auth/login', { email, password });
    const t = r?.data?.tokens;
    if (!t?.accessToken) throw new Error(`login failed for ${email}: ${JSON.stringify(r).slice(0, 200)}`);
    this.token = t.accessToken;
    this.csrf = t.csrfToken || null;
    return r.data;
  }
}

/** Run tasks with bounded concurrency; returns results in input order. */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }));
  return out;
}

module.exports = { Session, ApiError, pool, BASE };
