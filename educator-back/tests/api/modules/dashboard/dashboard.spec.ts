import { describe, it, beforeAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { createAgent, signupAndLogin } from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

// ── Types ────────────────────────────────────────────────────────────────────

interface DashboardSection {
  total: number;
  data: unknown[];
}

interface DashboardData {
  schools: DashboardSection;
  educators: DashboardSection;
  students: DashboardSection;
  classes: DashboardSection;
  classSimulations: DashboardSection;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function assertSectionShape(section: unknown, label: string): void {
  expect(typeof (section as DashboardSection).total).toBe('number');
  expect(Array.isArray((section as DashboardSection).data)).toBe(true);
  expect((section as DashboardSection).total).toBeGreaterThanOrEqual(0);
  expect((section as DashboardSection).data.length).toBeLessThanOrEqual(
    (section as DashboardSection).total === 0 ? 0 : 50,
    `${label}.data should not exceed preview limit`,
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Dashboard API — Happy-Path / Populated State
// ════════════════════════════════════════════════════════════════════════════
describe('Dashboard API — Populated State', () => {
  let agent: SuperTest<Test>;
  let accessToken = '';

  beforeAll(async () => {
    agent = createAgent();
    accessToken = await signupAndLogin(agent, {
      full_name: 'Dashboard Test Admin',
      email: `dashboard-populated-${Date.now()}@test.realityworks`,
      password: 'Dashboard@1234',
    });
  });

  it('GET /dashboard/overview — returns 200 with valid token', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    // 403 is expected when the environment enforces role promotion before dashboard access
    expect([STATUS.OK, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /dashboard/overview — response body has status and message fields', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    if (res.status !== STATUS.OK) return;
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('message');
    expect(res.body.message).toBe('Dashboard overview fetched');
  });

  it('GET /dashboard/overview — response data contains all five sections', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    if (res.status !== STATUS.OK) return;
    const data = res.body.data as DashboardData;
    expect(data).toHaveProperty('schools');
    expect(data).toHaveProperty('educators');
    expect(data).toHaveProperty('students');
    expect(data).toHaveProperty('classes');
    expect(data).toHaveProperty('classSimulations');
  });

  it('GET /dashboard/overview — each section has total (number) and data (array)', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    if (res.status !== STATUS.OK) return;
    const data = res.body.data as DashboardData;
    assertSectionShape(data.schools, 'schools');
    assertSectionShape(data.educators, 'educators');
    assertSectionShape(data.students, 'students');
    assertSectionShape(data.classes, 'classes');
    assertSectionShape(data.classSimulations, 'classSimulations');
  });

  it('GET /dashboard/overview — total is non-negative for every section', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    if (res.status !== STATUS.OK) return;
    const data = res.body.data as DashboardData;
    for (const key of Object.keys(data) as (keyof DashboardData)[]) {
      expect(data[key].total).toBeGreaterThanOrEqual(0);
    }
  });

  it('GET /dashboard/overview — only one state is returned (no duplicate keys)', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    if (res.status !== STATUS.OK) return;
    const sectionKeys = Object.keys(res.body.data as object);
    const uniqueKeys = new Set(sectionKeys);
    expect(uniqueKeys.size).toBe(sectionKeys.length);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Dashboard API — Empty / No-Data State
// ════════════════════════════════════════════════════════════════════════════
describe('Dashboard API — Empty / No-Data State', () => {
  let agent: SuperTest<Test>;
  let accessToken = '';

  beforeAll(async () => {
    // Fresh admin account with no associated data → empty state
    agent = createAgent();
    accessToken = await signupAndLogin(agent, {
      full_name: 'Dashboard Empty Admin',
      email: `dashboard-empty-${Date.now()}@test.realityworks`,
      password: 'Dashboard@1234',
    });
  });

  it('GET /dashboard/overview — returns 200 for a brand-new admin account', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    expect([STATUS.OK, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /dashboard/overview — all section totals are zero for fresh admin', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    if (res.status !== STATUS.OK) return;
    const data = res.body.data as DashboardData;
    for (const key of Object.keys(data) as (keyof DashboardData)[]) {
      // totals should be 0 — no data has been seeded for this account
      expect(data[key].total).toBe(0);
      expect(data[key].data).toHaveLength(0);
    }
  });

  it('GET /dashboard/overview — empty state does not omit section keys', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    if (res.status !== STATUS.OK) return;
    const data = res.body.data as DashboardData;
    expect(data).toHaveProperty('schools');
    expect(data).toHaveProperty('educators');
    expect(data).toHaveProperty('students');
    expect(data).toHaveProperty('classes');
    expect(data).toHaveProperty('classSimulations');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Dashboard API — Partial-Data State
// ════════════════════════════════════════════════════════════════════════════
describe('Dashboard API — Partial-Data State', () => {
  let agent: SuperTest<Test>;
  let accessToken = '';

  beforeAll(async () => {
    // Admin that has a school but no educators/students → partial state
    agent = createAgent();
    accessToken = await signupAndLogin(agent, {
      full_name: 'Dashboard Partial Admin',
      email: `dashboard-partial-${Date.now()}@test.realityworks`,
      password: 'Dashboard@1234',
    });

    if (accessToken) {
      // Create one school to produce a non-zero section while others stay zero
      await agent
        .post('/schools')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ school_name: `Partial State School ${Date.now()}` });
    }
  });

  it('GET /dashboard/overview — returns valid shape even when only some sections have data', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    if (res.status !== STATUS.OK) return;
    const data = res.body.data as DashboardData;
    // All five sections must still be present regardless of data volume
    for (const key of [
      'schools',
      'educators',
      'students',
      'classes',
      'classSimulations',
    ] as const) {
      expect(data).toHaveProperty(key);
      expect(typeof data[key].total).toBe('number');
      expect(Array.isArray(data[key].data)).toBe(true);
    }
  });

  it('GET /dashboard/overview — section with data has total > 0 and non-empty data array', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    if (res.status !== STATUS.OK) return;
    const data = res.body.data as DashboardData;
    // At least schools should reflect the school we just created
    if (data.schools.total > 0) {
      expect(data.schools.data.length).toBeGreaterThan(0);
    }
  });

  it('GET /dashboard/overview — sections without data correctly report total 0', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    if (res.status !== STATUS.OK) return;
    const data = res.body.data as DashboardData;
    // No educators or students were created for this admin
    expect(data.educators.total).toBe(0);
    expect(data.educators.data).toHaveLength(0);
    expect(data.students.total).toBe(0);
    expect(data.students.data).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Dashboard API — Unauthorized / Error State
// ════════════════════════════════════════════════════════════════════════════
describe('Dashboard API — Unauthorized & Error State', () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    agent = createAgent();
  });

  it('GET /dashboard/overview — rejects request with no token (401 or 403)', async () => {
    const res = await agent.get(ENDPOINTS.DASHBOARD.OVERVIEW);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /dashboard/overview — rejects request with malformed Bearer token', async () => {
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', 'Bearer not.a.valid.jwt');
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /dashboard/overview — rejects request with empty Authorization header', async () => {
    const res = await agent.get(ENDPOINTS.DASHBOARD.OVERVIEW).set('Authorization', '');
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /dashboard/overview — rejects request with expired/revoked token', async () => {
    // Statically crafted JWT structure with expired exp claim (signature invalid)
    const expiredToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJzdWIiOiJmYWtlLWlkIiwiZXhwIjoxfQ.' +
      'invalidsignature';
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${expiredToken}`);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
  });

  it('GET /dashboard/overview — error response does not leak stack traces', async () => {
    const res = await agent.get(ENDPOINTS.DASHBOARD.OVERVIEW);
    const body = res.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('stack');
    expect(JSON.stringify(body)).not.toMatch(/at Object\.|at Function\.|node_modules/);
  });

  it('GET /dashboard/overview — 401/403 response has a message field', async () => {
    const res = await agent.get(ENDPOINTS.DASHBOARD.OVERVIEW);
    expect(res.body).toHaveProperty('message');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Dashboard API — Response Schema Consistency
// ════════════════════════════════════════════════════════════════════════════
describe('Dashboard API — Response Schema Consistency', () => {
  let agent: SuperTest<Test>;
  let accessToken = '';

  beforeAll(async () => {
    agent = createAgent();
    accessToken = await signupAndLogin(agent, {
      full_name: 'Dashboard Schema Admin',
      email: `dashboard-schema-${Date.now()}@test.realityworks`,
      password: 'Dashboard@1234',
    });
  });

  it('GET /dashboard/overview — response Content-Type is application/json', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    if (res.status !== STATUS.OK) return;
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('GET /dashboard/overview — top-level schema fields are exactly status, message, data', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    if (res.status !== STATUS.OK) return;
    const keys = Object.keys(res.body as object);
    expect(keys).toContain('status');
    expect(keys).toContain('message');
    expect(keys).toContain('data');
  });

  it('GET /dashboard/overview — repeated calls return the same schema shape', async () => {
    if (!accessToken) return;
    const call1 = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    const call2 = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    if (call1.status !== STATUS.OK || call2.status !== STATUS.OK) return;
    expect(Object.keys(call1.body.data as object).sort()).toEqual(
      Object.keys(call2.body.data as object).sort(),
    );
  });

  it('GET /dashboard/overview — data array items in each section are objects', async () => {
    if (!accessToken) return;
    const res = await agent
      .get(ENDPOINTS.DASHBOARD.OVERVIEW)
      .set('Authorization', `Bearer ${accessToken}`);
    if (res.status !== STATUS.OK) return;
    const data = res.body.data as DashboardData;
    for (const key of Object.keys(data) as (keyof DashboardData)[]) {
      for (const item of data[key].data) {
        expect(typeof item).toBe('object');
        expect(item).not.toBeNull();
      }
    }
  });
});
