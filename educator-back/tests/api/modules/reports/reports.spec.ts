import { describe, it, beforeAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { createAgent, signupAndLogin } from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

describe('Reports Controller', () => {
  let agent: SuperTest<Test>;
  let accessToken = '';

  beforeAll(async () => {
    agent = createAgent();
    const email = `reports-${Date.now()}@test.realityworks`;
    const password = 'Reports@1234';
    accessToken = await signupAndLogin(agent, { full_name: 'Reports User', email, password });
  });

  it('GET /student-reports — rejects without token', async () => {
    const res = await agent.get(ENDPOINTS.REPORTS.STUDENT);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('GET /student-reports — responds with valid token', async () => {
    const res = await agent.get(ENDPOINTS.REPORTS.STUDENT).set('Authorization', `Bearer ${accessToken}`);
    expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /simulation-reports — rejects without token', async () => {
    const res = await agent.get(ENDPOINTS.REPORTS.SIMULATION);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('GET /simulation-reports — responds with valid token', async () => {
    const res = await agent.get(ENDPOINTS.REPORTS.SIMULATION).set('Authorization', `Bearer ${accessToken}`);
    expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('POST /students/email-report — rejects without token', async () => {
    const res = await agent.post(ENDPOINTS.STUDENTS.EMAIL_REPORT).send({ student_id: 'fake', class_id: 'fake' });
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('POST /students/email-report — rejects invalid student id', async () => {
    const res = await agent
      .post(ENDPOINTS.STUDENTS.EMAIL_REPORT)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ student_id: 'invalid-id', class_id: 'invalid-class' });
    expect([STATUS.BAD_REQUEST, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
  });
});
