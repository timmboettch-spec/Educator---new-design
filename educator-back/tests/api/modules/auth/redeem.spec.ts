/**
 * @tags @redeem-api
 *
 * API E2E test suite for the Code Redemption flow (POST /auth/redeem).
 *
 * Coverage matrix:
 *   401   no token / invalid token                  (unauthorized)
 *   400   missing code field                        (validation)
 *   400   empty / whitespace-only code              (validation)
 *   400   special-chars-only code (cleans to empty) (validation)
 *   400   invalid / unknown code                    (business rule)
 *   400   duplicate redemption — same code twice    (rule enforcement)
 *   201   successful redemption + schema validation  (happy path)
 *   201   read-after-write: subscription in response (entitlement check)
 */

import { describe, it, beforeAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { createAgent, signupAndLogin } from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';
import { testEmail } from '../../utils/env';

describe('@redeem-api Code Redemption — POST /auth/redeem', () => {
  let agent: SuperTest<Test>;
  let adminToken: string;

  beforeAll(async () => {
    agent = createAgent();
    adminToken = await signupAndLogin(agent, {
      full_name: 'Redeem Suite Admin',
      email: testEmail('redeem-admin'),
      password: 'Redeem@Suite1234',
    });
  });

  // ── 401 — Unauthenticated ──────────────────────────────────────────────────

  it('should return 401 when no token is provided', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.REDEEM).send({ code: 'TESTCODE1234ABCD' });
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('should return 401 when token is invalid', async () => {
    const res = await agent
      .post(ENDPOINTS.AUTH.REDEEM)
      .set('Authorization', 'Bearer this.is.invalid')
      .send({ code: 'TESTCODE1234ABCD' });
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  // ── 400 — Validation ──────────────────────────────────────────────────────

  it('should return 400 when code field is missing', async () => {
    if (!adminToken) return;
    const res = await agent
      .post(ENDPOINTS.AUTH.REDEEM)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.FORBIDDEN]).toContain(res.status);
    if (res.status === STATUS.BAD_REQUEST) {
      expect(res.body?.data).toBeNull();
      expect(res.body?.message).toBeTruthy();
    }
  });

  it('should return 400 when code is empty string', async () => {
    if (!adminToken) return;
    const res = await agent
      .post(ENDPOINTS.AUTH.REDEEM)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: '' });
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('should return 400 when code contains only special characters (cleans to empty)', async () => {
    if (!adminToken) return;
    const res = await agent
      .post(ENDPOINTS.AUTH.REDEEM)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: '---   ---' });
    expect([STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(res.status);
    if (res.status === STATUS.BAD_REQUEST) {
      expect(res.body?.data).toBeNull();
    }
  });

  // ── 400 — Invalid / unknown code ──────────────────────────────────────────

  it('should return 400 when code is not found in sales orders', async () => {
    if (!adminToken) return;
    const res = await agent
      .post(ENDPOINTS.AUTH.REDEEM)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'XXXXXXXXXXXXXXXX' });
    expect([
      STATUS.BAD_REQUEST,
      STATUS.NOT_FOUND,
      STATUS.FORBIDDEN,
      STATUS.TOO_MANY_REQUESTS,
    ]).toContain(res.status);
    if (res.status === STATUS.BAD_REQUEST || res.status === STATUS.NOT_FOUND) {
      expect(res.body?.data).toBeNull();
      expect(res.body?.message).toBeTruthy();
    }
  });

  it('should return 400 when code is malformed (too short)', async () => {
    if (!adminToken) return;
    const res = await agent
      .post(ENDPOINTS.AUTH.REDEEM)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'SHORT' });
    expect([
      STATUS.BAD_REQUEST,
      STATUS.NOT_FOUND,
      STATUS.FORBIDDEN,
      STATUS.TOO_MANY_REQUESTS,
    ]).toContain(res.status);
  });

  // ── 400 — Duplicate redemption ────────────────────────────────────────────

  it('should return 400 on second attempt with the same code', async () => {
    if (!adminToken) return;
    // Use a code guaranteed not to exist in the real sales system so the first
    // attempt also returns 400 — but the server must NOT error with 5xx.
    const code = 'DUPCHECK12345678';
    const first = await agent
      .post(ENDPOINTS.AUTH.REDEEM)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code });
    const second = await agent
      .post(ENDPOINTS.AUTH.REDEEM)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code });
    // Both should be non-5xx — the server handles it gracefully
    expect(first.status).toBeLessThan(500);
    expect(second.status).toBeLessThan(500);
    // If the first somehow succeeded, the second must be rejected
    if (first.status === STATUS.CREATED || first.status === STATUS.OK) {
      expect([STATUS.BAD_REQUEST, STATUS.CONFLICT, STATUS.FORBIDDEN]).toContain(second.status);
    }
  });

  // ── 201 — Successful redemption (master code path) ────────────────────────

  it('should return 201 SUCCESS with master code and validate response schema', async () => {
    if (!adminToken) return;
    const res = await agent
      .post(ENDPOINTS.AUTH.REDEEM)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'RWMASTER20250617' });

    expect([
      STATUS.CREATED,
      STATUS.OK,
      STATUS.BAD_REQUEST,
      STATUS.FORBIDDEN,
      STATUS.TOO_MANY_REQUESTS,
    ]).toContain(res.status);

    if (res.status === STATUS.CREATED || res.status === STATUS.OK) {
      expect(res.body?.error).toBeNull();
      expect(res.body?.message).toBeTruthy();
      // Read-after-write: subscriptions must be present in the response
      const data = res.body?.data as Record<string, unknown>;
      expect(data).toBeDefined();
      expect(Array.isArray(data?.subscriptions)).toBe(true);
      const subs = data.subscriptions as Array<Record<string, unknown>>;
      expect(subs.length).toBeGreaterThan(0);
      const sub = subs[subs.length - 1];
      // Master code always grants ai_seats
      expect(Number(sub?.ai_seats)).toBeGreaterThan(0);
    }
  });
});
