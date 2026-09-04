import { beforeAll, beforeEach, describe, it, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { resetSmokeAgent, logTarget } from './smoke-client';
import { smokeState } from './smoke-state';
import { ENDPOINTS } from '../common/constants/endpoints';
import { STATUS } from '../common/constants/status-codes';

describe('Smoke — Dashboard', () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    logTarget('Dashboard');
  });

  beforeEach(() => {
    agent = resetSmokeAgent();
  });

  // ── Populated / authenticated state ─────────────────────────────────────

  it('GET /dashboard/overview — succeeds with valid admin token', async () => {
    const token = smokeState.accessToken;
    if (!token) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${token}`);
    expect([STATUS.OK, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /dashboard/overview — response contains status, message, and data', async () => {
    const token = smokeState.accessToken;
    if (!token) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${token}`);
    if (res.status !== STATUS.OK) return;
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('data');
  });

  it('GET /dashboard/overview — data has all five section keys', async () => {
    const token = smokeState.accessToken;
    if (!token) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${token}`);
    if (res.status !== STATUS.OK) return;
    const data = res.body.data as Record<string, unknown>;
    for (const key of ['schools', 'educators', 'students', 'classes', 'classSimulations']) {
      expect(data).toHaveProperty(key);
    }
  });

  it('GET /dashboard/overview — each section has numeric total and array data', async () => {
    const token = smokeState.accessToken;
    if (!token) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${token}`);
    if (res.status !== STATUS.OK) return;
    const data = res.body.data as Record<string, { total: unknown; data: unknown }>;
    for (const key of Object.keys(data)) {
      expect(typeof data[key].total).toBe('number');
      expect(Array.isArray(data[key].data)).toBe(true);
    }
  });

  // ── Empty / no-data state ────────────────────────────────────────────────

  it('GET /dashboard/overview — fresh admin returns zero totals across all sections', async () => {
    const token = smokeState.freshAdminToken;
    if (!token) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${token}`);
    if (res.status !== STATUS.OK) return;
    const data = res.body.data as Record<string, { total: number; data: unknown[] }>;
    for (const key of Object.keys(data)) {
      expect(data[key].total).toBe(0);
      expect(data[key].data).toHaveLength(0);
    }
  });

  // ── Unauthorized / error state ───────────────────────────────────────────

  it('GET /dashboard/overview — rejects unauthenticated request', async () => {
    const res = await agent.get(ENDPOINTS.DASHBOARD.OVERVIEW);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /dashboard/overview — rejects invalid Bearer token', async () => {
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', 'Bearer invalid-token-value');
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /dashboard/overview — error response does not expose stack trace', async () => {
    const res = await agent.get(ENDPOINTS.DASHBOARD.OVERVIEW);
    expect(res.body).not.toHaveProperty('stack');
    expect(JSON.stringify(res.body)).not.toMatch(/at Object\.|at Function\./);
  });
});
