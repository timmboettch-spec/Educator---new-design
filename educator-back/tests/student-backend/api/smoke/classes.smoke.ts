/**
 * Classes Smoke — GET /classes · GET /classes/:id
 *
 * NOTE: The /classes route is not yet exposed as a REST endpoint in this
 * backend (no ClassesController is registered). All requests therefore
 * return 404. These tests document the current API surface and will be
 * updated once the endpoint is implemented.
 *
 * Goals:    Verify the route responds predictably (404 until implemented)
 * Non-goals: Class creation/deletion, member permutations
 */
import { smokeGet, BASE } from './smoke-client';
import { getAccessToken } from './smoke-state';

const URL = {
  ROOT: '/classes',
  BY_ID: (id: string) => `/classes/${id}`,
} as const;

interface ClassRecord {
  id: string;
  [k: string]: unknown;
}

describe('[Smoke] Classes', () => {
  console.log(`  Target : ${BASE}`);

  let firstId: string | null = null;

  describe('GET /classes', () => {
    it('route exists check — returns 200 or 404 (not 5xx)', async () => {
      // /classes has no controller yet → 404 is the expected current response.
      // Accept 200 so the test auto-passes once the route is implemented.
      const res = await smokeGet(URL.ROOT, getAccessToken());
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body)).toBe(true);
        firstId = (res.body as ClassRecord[])[0]?.id ?? null;
      } else {
        console.warn('[smoke] /classes returned 404 — route not yet implemented');
      }
    });

    it('unauthenticated — returns 200, 401, or 404 (not 5xx)', async () => {
      // No controller → 404. Will be 200 (public) or 401 (protected) once implemented.
      const res = await smokeGet(URL.ROOT);
      expect([200, 401, 404]).toContain(res.status);
    });

    it('schema check — id is a string (skipped until route implemented)', async () => {
      const res = await smokeGet(URL.ROOT, getAccessToken());
      if (res.status !== 200) {
        console.warn('[smoke] /classes not yet implemented — schema check skipped');
        return;
      }
      const list = res.body as ClassRecord[];
      if (!list.length) {
        return;
      }
      for (const c of list.slice(0, 3)) {
        expect(typeof c.id).toBe('string');
      }
    });

    it('bad token — returns 200, 401, or 404 (not 5xx)', async () => {
      expect([200, 401, 404]).toContain((await smokeGet(URL.ROOT, 'bad')).status);
    });
  });

  describe('GET /classes/:id', () => {
    it('known class — returns 200 or 404 (skipped until route implemented)', async () => {
      if (!firstId) {
        console.warn('[smoke] No seed class — skip');
        return;
      }
      const res = await smokeGet(URL.BY_ID(firstId), getAccessToken());
      expect([200, 404]).toContain(res.status);
    });

    it('any ID — returns 200, 401, or 404 (not 5xx)', async () => {
      const res = await smokeGet(URL.BY_ID('any'));
      expect([200, 401, 404]).toContain(res.status);
    });

    it('schema check — id field present (skipped until route implemented)', async () => {
      if (!firstId) {
        return;
      }
      const res = await smokeGet(URL.BY_ID(firstId), getAccessToken());
      if (res.status !== 200) {
        return;
      }
      expect(res.body).toHaveProperty('id');
    });

    it('unknown ID — returns 404 or 401 (not 5xx)', async () => {
      expect([401, 404]).toContain(
        (await smokeGet(URL.BY_ID('__none__'), getAccessToken())).status,
      );
    });
  });
});
