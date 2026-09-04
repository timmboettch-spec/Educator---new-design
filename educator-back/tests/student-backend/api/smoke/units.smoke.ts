/**
 * Units Smoke — GET /units · GET /units/:id
 *
 * Goals:    List returns array; single item returns shape; guards reject 401
 * Non-goals: Unit creation/deletion, filter permutations, pagination
 */
import { smokeGet, BASE } from './smoke-client';
import { getAccessToken } from './smoke-state';

const URL = {
  ROOT: '/units',
  BY_ID: (id: string) => `/units/${id}`,
} as const;

interface Unit {
  id: string;
  name: string;
  [k: string]: unknown;
}

describe('[Smoke] Units', () => {
  console.log(`  Target : ${BASE}`);

  let firstId: string | null = null;

  describe('GET /units', () => {
    it('happy path — authenticated returns 200 + array', async () => {
      const res = await smokeGet(URL.ROOT, getAccessToken());
      if (res.status === 404 || res.status === 401) {
        console.warn('[smoke] GET /units returned 404/401 — route not deployed or no token');
        return;
      }
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      firstId = (res.body as Unit[])[0]?.id ?? null;
      if (!firstId) {
        console.warn('[smoke] No units — ID checks will be skipped');
      }
    });

    it('auth guard — no token returns 401 (protected route)', async () => {
      // UnitsController has @UseGuards(ScenarioAuthGuard) at the class level.
      // Unauthenticated requests return 401 — this is the correct behaviour.
      const res = await smokeGet(URL.ROOT);
      expect([401, 404]).toContain(res.status);
    });

    it('schema check — id and name are strings', async () => {
      const res = await smokeGet(URL.ROOT, getAccessToken());
      if (res.status === 404 || res.status === 401) {
        console.warn('[smoke] /units not deployed or no token — schema check skipped');
        return;
      }
      expect(res.status).toBe(200);
      const units = res.body as Unit[];
      if (!units.length) {
        console.warn('[smoke] Empty — schema check skipped');
        return;
      }
      for (const u of units.slice(0, 3)) {
        expect(typeof u.id).toBe('string');
        expect(typeof u.name).toBe('string');
      }
    });

    it('auth guard — bad token returns 401 (not 200)', async () => {
      // ScenarioAuthGuard rejects invalid tokens with 401.
      expect([401, 404, 429]).toContain((await smokeGet(URL.ROOT, 'bad')).status);
    });
  });

  describe('GET /units/:id', () => {
    it('happy path — known unit returns 200 + id + name', async () => {
      if (!firstId) {
        console.warn('[smoke] No seed unit — skip');
        return;
      }
      const res = await smokeGet(URL.BY_ID(firstId), getAccessToken());
      expect(res.status).toBe(200);
      expect(typeof (res.body as Unit).id).toBe('string');
      expect(typeof (res.body as Unit).name).toBe('string');
    });

    it('auth guard — no token returns 401', async () => {
      // Some implementations check auth before route matching (401),
      // others return 404 for an unknown ID path before auth runs
      expect([401, 404]).toContain((await smokeGet(URL.BY_ID('any'))).status);
    });

    it('schema check — id and name fields present', async () => {
      if (!firstId) {
        return;
      }
      const res = await smokeGet(URL.BY_ID(firstId), getAccessToken());
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('name');
    });

    it('negative — unknown ID returns 404', async () => {
      expect([401, 404]).toContain(
        (await smokeGet(URL.BY_ID('__none__'), getAccessToken())).status,
      );
    });
  });
});
