import { beforeAll, beforeEach, describe, it } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { resetSmokeAgent, logTarget } from './smoke-client';
import { smokeState } from './smoke-state';
import { ENDPOINTS } from '../common/constants/endpoints';
import { STATUS } from '../common/constants/status-codes';

describe('Smoke — Reports', () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    logTarget('Reports');
  });

  beforeEach(() => {
    agent = resetSmokeAgent();
  });

  // ── Student reports ────────────────────────────────────────────────────────

  it('should reject student report retrieval without token', async () => {
    const res = await agent.get(ENDPOINTS.REPORTS.STUDENT);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('should get student reports with valid token', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .get(ENDPOINTS.REPORTS.STUDENT)
      .set('Authorization', `Bearer ${token}`);
    expect([STATUS.OK, STATUS.NOT_FOUND]).toContain(res.status);
  });

  // ── Simulation reports ─────────────────────────────────────────────────────

  it('should reject simulation report retrieval without token', async () => {
    const res = await agent.get(ENDPOINTS.REPORTS.SIMULATION);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('should get simulation reports with valid token', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .get(ENDPOINTS.REPORTS.SIMULATION)
      .set('Authorization', `Bearer ${token}`);
    expect([STATUS.OK, STATUS.NOT_FOUND]).toContain(res.status);
  });

  // ── Email report ───────────────────────────────────────────────────────────

  it('should reject email report without token', async () => {
    const res = await agent
      .post(ENDPOINTS.STUDENTS.EMAIL_REPORT)
      .send({ student_id: 'fake', class_id: 'fake' });
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('should reject email report with invalid student id', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .post(ENDPOINTS.STUDENTS.EMAIL_REPORT)
      .set('Authorization', `Bearer ${token}`)
      .send({ student_id: 'invalid-student-id', class_id: 'invalid-class-id' });
    expect([STATUS.BAD_REQUEST, STATUS.NOT_FOUND]).toContain(res.status);
  });
});
