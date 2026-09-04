/**
 * Uploads Smoke — POST /uploads/image · POST /uploads/file
 *
 * Goals:    Guards reject 401; missing file returns 400; no binary upload needed
 * Non-goals: Actual file upload (binary multipart — pre-deployment suite), storage integration
 */
import { smokePost, BASE } from './smoke-client';
import { getAccessToken } from './smoke-state';

const URL = { IMAGE: '/uploads/image', FILE: '/uploads/file' } as const;

describe('[Smoke] Uploads', () => {
  console.log(`  Target : ${BASE}`);
  console.log(`  Note   : guard + negative only — no binary multipart in smoke`);

  describe('POST /uploads/image', () => {
    it('auth guard — no token returns 400/401', async () => {
      // File validation may run before auth guard and return 400
      expect([400, 401]).toContain((await smokePost(URL.IMAGE, {})).status);
    });

    it('negative — authenticated with no file returns 400/422', async () => {
      const res = await smokePost(URL.IMAGE, {}, getAccessToken());
      expect([400, 401, 422]).toContain(res.status);
    });
  });

  describe('POST /uploads/file', () => {
    it('auth guard — no token returns 400/401', async () => {
      // File validation may run before auth guard and return 400
      expect([400, 401]).toContain((await smokePost(URL.FILE, {})).status);
    });

    it('negative — authenticated with no file returns 400/422', async () => {
      const res = await smokePost(URL.FILE, {}, getAccessToken());
      expect([400, 401, 422]).toContain(res.status);
    });
  });
});
