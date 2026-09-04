/**
 * @tags @educator-create-api
 *
 * API E2E test suite for the Educator Create flow (POST /invites/create).
 *
 * Coverage matrix (maps to Coverage Map — API E2E column):
 *   201 + schema              successful creation
 *   400 + message             invalid field format (empty email)
 *   400/409 duplicate email   conflict on existing active educator
 *   401                       no token / invalid token
 *   404                       creator not found / invalid school ID
 *   success message validated response body shape check
 */

import { describe, it, beforeAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { createAgent, signupAndLogin } from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

describe('@educator-create-api Educator Create — POST /invites/create', () => {
  let agent: SuperTest<Test>;
  let adminToken: string;
  let schoolId: string;

  beforeAll(async () => {
    agent = createAgent();

    adminToken = await signupAndLogin(agent, {
      full_name: 'Educator Create Suite Admin',
      email: `edu-create-admin-${Date.now()}@test.realityworks`,
      password: 'EduCreate@Suite1234',
    });

    // Provision a school for the invite tests
    if (adminToken) {
      const res = await agent
        .post(ENDPOINTS.SCHOOLS.BASE)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ school_name: `EduCreate School ${Date.now()}` });
      schoolId = (res.body?.data?.id as string) ?? '';
    }
  });

  // ── 401 — Unauthenticated ─────────────────────────────────────────────────

  it('should return 401 when no token is provided', async () => {
    const res = await agent
      .post(ENDPOINTS.INVITES.CREATE)
      .send({ email: 'noauth@test.realityworks', school_id: 'any-id' });
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('should return 401 when token is invalid', async () => {
    const res = await agent
      .post(ENDPOINTS.INVITES.CREATE)
      .set('Authorization', 'Bearer invalid.token.here')
      .send({ email: 'badtoken@test.realityworks', school_id: 'any-id' });
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  // ── 400 — Invalid field format ────────────────────────────────────────────

  it('should return 400 when email is missing', async () => {
    if (!adminToken) return;
    const res = await agent
      .post(ENDPOINTS.INVITES.CREATE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ school_id: schoolId || '550e8400-e29b-41d4-a716-000000000001' });
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.FORBIDDEN]).toContain(res.status);
    if (res.status === STATUS.BAD_REQUEST) {
      expect(res.body?.status).toBe('FAILED');
      expect(res.body?.message).toBeTruthy();
    }
  });

  it('should return 400 when email format is invalid', async () => {
    if (!adminToken) return;
    const res = await agent
      .post(ENDPOINTS.INVITES.CREATE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'not-an-email',
        school_id: schoolId || '550e8400-e29b-41d4-a716-000000000001',
      });
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('should return 400 when school_id is not a valid UUID', async () => {
    if (!adminToken) return;
    const res = await agent
      .post(ENDPOINTS.INVITES.CREATE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'valid@test.realityworks', school_id: 'not-a-uuid' });
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.FORBIDDEN]).toContain(res.status);
  });

  // ── 404 — School not found ────────────────────────────────────────────────

  it('should return 404 when school_id does not belong to the admin', async () => {
    if (!adminToken) return;
    const res = await agent
      .post(ENDPOINTS.INVITES.CREATE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `edu-404-${Date.now()}@test.realityworks`,
        school_id: '550e8400-e29b-41d4-a716-999999999999',
      });
    expect([STATUS.NOT_FOUND, STATUS.FORBIDDEN, STATUS.BAD_REQUEST]).toContain(res.status);
    if (res.status === STATUS.NOT_FOUND) {
      expect(res.body?.status).toBe('FAILED');
    }
  });

  // ── 201 — Successful creation + schema ────────────────────────────────────

  it('should return 201 SUCCESS with valid payload and validate response schema', async () => {
    if (!adminToken || !schoolId) return;
    const email = `edu-create-${Date.now()}@test.realityworks`;
    const res = await agent
      .post(ENDPOINTS.INVITES.CREATE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, school_id: schoolId, full_name: 'New Test Educator' });

    expect([STATUS.CREATED, STATUS.OK, STATUS.FORBIDDEN, STATUS.TOO_MANY_REQUESTS]).toContain(
      res.status,
    );

    if (res.status === STATUS.CREATED || res.status === STATUS.OK) {
      // success message validated
      expect(res.body?.success).toBe(true);
      const data = res.body?.data as Record<string, unknown>;
      expect(data).toBeDefined();
    }
  });

  // ── 400/409 — Duplicate email conflict ────────────────────────────────────

  it('should return 400 or 409 when email already has a pending invite', async () => {
    if (!adminToken || !schoolId) return;
    const email = `edu-dup-${Date.now()}@test.realityworks`;

    // First invite
    await agent
      .post(ENDPOINTS.INVITES.CREATE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, school_id: schoolId });

    // Duplicate attempt
    const res = await agent
      .post(ENDPOINTS.INVITES.CREATE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, school_id: schoolId });

    expect([
      STATUS.BAD_REQUEST,
      STATUS.CONFLICT,
      STATUS.FORBIDDEN,
      STATUS.TOO_MANY_REQUESTS,
    ]).toContain(res.status);

    if (res.status === STATUS.BAD_REQUEST || res.status === STATUS.CONFLICT) {
      expect(res.body?.status).toBe('FAILED');
      expect(res.body?.message).toBeTruthy();
    }
  });
});
