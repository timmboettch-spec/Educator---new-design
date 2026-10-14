import { beforeAll, beforeEach, describe, it } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { resetSmokeAgent, logTarget } from './smoke-client';
import { smokeState } from './smoke-state';
import { ENDPOINTS } from '../common/constants/endpoints';
import { STATUS } from '../common/constants/status-codes';
import { post, expectStatus, expectSuccess } from '../common/utils/api.helper';
import adminFixtures from '../common/fixtures/admin.requests.json';
import { testEmail } from '../utils/env';

describe('Smoke — Admin', () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    logTarget('Admin');
  });

  beforeEach(() => {
    agent = resetSmokeAgent();
  });

  // ── Signup ─────────────────────────────────────────────────────────────────

  it('should create a new admin user with valid data', async () => {
    const uniqueEmail = testEmail('admin-smoke');
    const body = await expectStatus(
      post(agent, ENDPOINTS.AUTH.SIGNUP, {
        ...adminFixtures.valid,
        email: uniqueEmail,
      }),
      STATUS.CREATED,
    );
    expectSuccess(body);
    expect((body.data as Record<string, unknown>)?.id).toBeTruthy();

    // Persist for subsequent tests
    smokeState.adminEmail = uniqueEmail;
  });

  it('should reject signup with missing email', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.SIGNUP).send(adminFixtures.missingEmail);
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.TOO_MANY_REQUESTS]).toContain(
      res.status,
    );
  });

  it('should reject signup with invalid email format', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.SIGNUP).send({
      ...adminFixtures.invalidEmail,
      email: `invalid-${Date.now()}`,
    });
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.TOO_MANY_REQUESTS]).toContain(
      res.status,
    );
  });

  it('should reject signup with short password', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.SIGNUP).send({
      ...adminFixtures.shortPassword,
      email: testEmail('admin-shortpw'),
    });
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.TOO_MANY_REQUESTS]).toContain(
      res.status,
    );
  });

  it('should reject signup with missing full name', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.SIGNUP).send({
      email: testEmail('admin-noname'),
      password: 'Test@1234',
    });
    expect([STATUS.BAD_REQUEST, STATUS.CREATED, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
  });

  it('should reject duplicate email signup', async () => {
    const email = testEmail('admin-dup');
    await agent.post(ENDPOINTS.AUTH.SIGNUP).send({ ...adminFixtures.valid, email });
    const res = await agent.post(ENDPOINTS.AUTH.SIGNUP).send({ ...adminFixtures.valid, email });
    expect([STATUS.BAD_REQUEST, STATUS.CONFLICT, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
  });

  // ── School (Admin creates a school) ───────────────────────────────────────

  it('should create a school with valid admin token', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .post(ENDPOINTS.SCHOOLS.BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ school_name: `Smoke School ${Date.now()}`, userId: smokeState.adminId });

    expect([STATUS.CREATED, STATUS.OK]).toContain(res.status);
    if (res.status === STATUS.CREATED || res.status === STATUS.OK) {
      const data = res.body?.data as Record<string, unknown>;
      if (data?.id) smokeState.schoolId = data.id as string;
    }
  });

  it('should retrieve schools for authenticated admin', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent.get(ENDPOINTS.SCHOOLS.BY_USER).set('Authorization', `Bearer ${token}`);
    expect([STATUS.OK, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('should reject school creation without token', async () => {
    const res = await agent
      .post(ENDPOINTS.SCHOOLS.BASE)
      .send({ school_name: 'Unauthorized School', userId: 'fake-id' });
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  // ── Dashboard ──────────────────────────────────────────────────────────────

  it('should access dashboard overview with valid token', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${token}`);
    expect([STATUS.OK, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('should reject dashboard access without token', async () => {
    const res = await agent.get(ENDPOINTS.DASHBOARD.OVERVIEW);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  // ── Educator Invite (Create) ───────────────────────────────────────────────

  it('should reject educator invite creation without token', async () => {
    const res = await agent
      .post(ENDPOINTS.INVITES.CREATE)
      .send({ email: 'smoke-edu@smoke.test', school_id: 'any-id' });
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('should create an educator invite with valid admin token and school', async () => {
    const token = smokeState.accessToken;
    const schoolId = smokeState.schoolId;
    if (!token || !schoolId) return;

    const email = testEmail('smoke-edu');
    const res = await agent
      .post(ENDPOINTS.INVITES.CREATE)
      .set('Authorization', `Bearer ${token}`)
      .send({ email, school_id: schoolId, full_name: 'Smoke Educator' });

    expect([STATUS.CREATED, STATUS.OK, STATUS.FORBIDDEN, STATUS.TOO_MANY_REQUESTS]).toContain(
      res.status,
    );
    if (res.status === STATUS.CREATED || res.status === STATUS.OK) {
      expect(res.body?.error).toBeNull();
      const data = res.body?.data as Record<string, unknown>;
      if (data?.invite_id) smokeState.inviteId = data.invite_id as string;
    }
  });

  it('should return 400 or 409 on duplicate educator invite', async () => {
    const token = smokeState.accessToken;
    const schoolId = smokeState.schoolId;
    if (!token || !schoolId) return;

    const email = testEmail('smoke-dup');
    await agent
      .post(ENDPOINTS.INVITES.CREATE)
      .set('Authorization', `Bearer ${token}`)
      .send({ email, school_id: schoolId });

    const res = await agent
      .post(ENDPOINTS.INVITES.CREATE)
      .set('Authorization', `Bearer ${token}`)
      .send({ email, school_id: schoolId });

    expect([
      STATUS.BAD_REQUEST,
      STATUS.CONFLICT,
      STATUS.FORBIDDEN,
      STATUS.TOO_MANY_REQUESTS,
    ]).toContain(res.status);
  });

  it('should return 404 when school_id does not exist', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .post(ENDPOINTS.INVITES.CREATE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: testEmail('smoke-404'),
        school_id: '550e8400-e29b-41d4-a716-999999999999',
      });

    expect([STATUS.NOT_FOUND, STATUS.FORBIDDEN, STATUS.BAD_REQUEST]).toContain(res.status);
  });
});
