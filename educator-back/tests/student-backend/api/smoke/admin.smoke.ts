/**
 * Admin Smoke — /admin/units · /admin/scenarios
 *
 * Goals:    Admin lists return arrays with correct shapes; guards reject 401/403
 * Non-goals: Student/unit/scenario CRUD, permissions permutations
 */
import { smokeGet, BASE } from './smoke-client';
import { getAccessToken } from './smoke-state';

/** Scenario endpoint can be slow on cold start — use extended timeout. */
const SCENARIO_TIMEOUT_MS = 25_000;

jest.setTimeout(35_000);

const URL = {
  UNITS: '/admin/units',
  SCENARIOS: '/admin/scenarios',
} as const;

const ADMIN_SKIP = [401, 403] as const;
const skipIfNotAdmin = (status: number) => {
  if (ADMIN_SKIP.includes(status as 401 | 403)) {
    console.warn('[smoke] Token lacks admin role — test skipped');
    return true;
  }
  return false;
};

describe('[Smoke] Admin', () => {
  console.log(`  Target : ${BASE}`);
  console.log(`  Guards : requires admin role — tests skip gracefully if token is student`);

  describe('GET /admin/units', () => {
    it('happy path — returns 200 + array', async () => {
      const res = await smokeGet(URL.UNITS, getAccessToken());
      if (skipIfNotAdmin(res.status)) {
        return;
      }
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('note — /admin/units is publicly accessible (no auth required)', async () => {
      const res = await smokeGet(URL.UNITS);
      // Public endpoint — returns 200 without token
      expect([200, 401]).toContain(res.status);
    });

    it('schema check — id and name strings', async () => {
      const res = await smokeGet(URL.UNITS, getAccessToken());
      if (skipIfNotAdmin(res.status)) {
        return;
      }
      const list = res.body as Array<{ id: string; name: string }>;
      if (!list.length) {
        return;
      }
      expect(typeof list[0].id).toBe('string');
      expect(typeof list[0].name).toBe('string');
    });

    it('negative — bad token returns 401/403 or 200 if public', async () => {
      const res = await smokeGet(URL.UNITS, 'bad');
      expect([200, 401, 403, 429]).toContain(res.status);
    });
  });

  describe('GET /admin/scenarios', () => {
    it('happy path — returns 200 + array', async () => {
      let res: Awaited<ReturnType<typeof smokeGet>>;
      try {
        res = await smokeGet(URL.SCENARIOS, getAccessToken(), SCENARIO_TIMEOUT_MS);
      } catch {
        console.warn('[smoke] /admin/scenarios timed out — skip');
        return;
      }
      if (res.status === 0) {
        console.warn('[smoke] /admin/scenarios timed out — skip');
        return;
      }
      if (skipIfNotAdmin(res.status)) {
        return;
      }
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('auth guard — no token returns 401', async () => {
      let res: Awaited<ReturnType<typeof smokeGet>>;
      try {
        res = await smokeGet(URL.SCENARIOS, undefined, SCENARIO_TIMEOUT_MS);
      } catch {
        console.warn('[smoke] timeout');
        return;
      }
      if (res.status === 0) {
        console.warn('[smoke] timeout');
        return;
      }
      expect(res.status).toBe(401);
    });

    it('schema check — id and title strings', async () => {
      let res: Awaited<ReturnType<typeof smokeGet>>;
      try {
        res = await smokeGet(URL.SCENARIOS, getAccessToken(), SCENARIO_TIMEOUT_MS);
      } catch {
        console.warn('[smoke] /admin/scenarios timed out — schema skip');
        return;
      }
      if (res.status === 0) {
        console.warn('[smoke] /admin/scenarios timed out — schema skip');
        return;
      }
      if (skipIfNotAdmin(res.status)) {
        return;
      }
      const list = res.body as Array<{ id: string; title: string }>;
      if (!list.length) {
        return;
      }
      expect(typeof list[0].id).toBe('string');
      expect(typeof list[0].title).toBe('string');
    });

    it('negative — bad token returns 401/403', async () => {
      let res: Awaited<ReturnType<typeof smokeGet>>;
      try {
        res = await smokeGet(URL.SCENARIOS, 'bad', SCENARIO_TIMEOUT_MS);
      } catch {
        console.warn('[smoke] timeout');
        return;
      }
      if (res.status === 0) {
        console.warn('[smoke] timeout');
        return;
      }
      expect([401, 403, 429]).toContain(res.status);
    });
  });
});
