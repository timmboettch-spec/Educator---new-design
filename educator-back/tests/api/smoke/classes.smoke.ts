import { beforeAll, beforeEach, describe, it } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { resetSmokeAgent, logTarget } from './smoke-client';
import { smokeState } from './smoke-state';
import { ENDPOINTS } from '../common/constants/endpoints';
import { STATUS } from '../common/constants/status-codes';

describe('Smoke — Classes', () => {
  let agent: SuperTest<Test>;

  // Fixed dates sufficiently far in the future for pre-deploy tests
  const classPayload = {
    class_name: `Smoke Class ${Date.now()}`,
    start_date: '2026-09-01',
    end_date: '2027-06-30',
    total_no_of_students: 20,
  };

  beforeAll(() => {
    logTarget('Classes');
  });

  beforeEach(() => {
    agent = resetSmokeAgent();
  });

  // ── Create ─────────────────────────────────────────────────────────────────

  it('should create a class with valid educator token', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .post(ENDPOINTS.CLASSES.BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(classPayload);

    expect([STATUS.CREATED, STATUS.OK]).toContain(res.status);
    if (res.status === STATUS.CREATED || res.status === STATUS.OK) {
      const data = res.body?.data as Record<string, unknown>;
      if (data?.id) smokeState.classId = data.id as string;
    }
  });

  it('should reject class creation without token', async () => {
    const res = await agent.post(ENDPOINTS.CLASSES.BASE).send(classPayload);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('should reject class creation with invalid token', async () => {
    const res = await agent
      .post(ENDPOINTS.CLASSES.BASE)
      .set('Authorization', 'Bearer invalid-token-xyz')
      .send(classPayload);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('should reject class creation with empty class name', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .post(ENDPOINTS.CLASSES.BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...classPayload, class_name: '' });

    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE]).toContain(res.status);
  });

  it('should reject class creation with missing required fields', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .post(ENDPOINTS.CLASSES.BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ start_date: '2026-09-01', end_date: '2027-06-30' });

    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE]).toContain(res.status);
  });

  // ── Read ───────────────────────────────────────────────────────────────────

  it('should list classes with valid token', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent.get(ENDPOINTS.CLASSES.BASE).set('Authorization', `Bearer ${token}`);
    expect([STATUS.OK, STATUS.NOT_FOUND]).toContain(res.status);
    if (res.status === STATUS.OK) expect(res.body?.error).toBeNull();
  });

  it('should reject class list without token', async () => {
    const res = await agent.get(ENDPOINTS.CLASSES.BASE);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('should retrieve a class by valid ID', async () => {
    const token = smokeState.accessToken;
    if (!token || !smokeState.classId) return;

    const res = await agent
      .get(ENDPOINTS.CLASSES.BY_ID(smokeState.classId))
      .set('Authorization', `Bearer ${token}`);
    expect([STATUS.OK]).toContain(res.status);
  });

  it('should return 400 or 404 for invalid class ID format', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .get(ENDPOINTS.CLASSES.BY_ID('not-a-valid-uuid'))
      .set('Authorization', `Bearer ${token}`);
    expect([STATUS.BAD_REQUEST, STATUS.NOT_FOUND]).toContain(res.status);
  });

  // ── Update ─────────────────────────────────────────────────────────────────

  it('should update class status with valid token', async () => {
    const token = smokeState.accessToken;
    if (!token || !smokeState.classId) return;

    const res = await agent
      .patch(ENDPOINTS.CLASSES.BY_ID(smokeState.classId))
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'INACTIVE' });
    expect([STATUS.OK, STATUS.CREATED]).toContain(res.status);
  });

  it('should reject update without token', async () => {
    if (!smokeState.classId) return;

    const res = await agent
      .patch(ENDPOINTS.CLASSES.BY_ID(smokeState.classId))
      .send({ status: 'INACTIVE' });
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });
});
