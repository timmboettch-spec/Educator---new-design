import { describe, it, beforeAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { createAgent } from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';
import { testEmail } from '../../utils/env';

describe('Auth Controller — Negative Cases', () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    agent = createAgent();
  });

  it('POST /auth/login — rejects missing email', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.LOGIN).send({ password: 'Test@1234' });
    expect([STATUS.BAD_REQUEST, STATUS.UNAUTHORIZED, STATUS.TOO_MANY_REQUESTS]).toContain(
      res.status,
    );
  });

  it('POST /auth/login — rejects empty password', async () => {
    const res = await agent
      .post(ENDPOINTS.AUTH.LOGIN)
      .send({ email: 'test+negative@curionn.com', password: '' });
    expect([STATUS.BAD_REQUEST, STATUS.UNAUTHORIZED, STATUS.TOO_MANY_REQUESTS]).toContain(
      res.status,
    );
  });

  it('POST /auth/login — rejects non-existent user', async () => {
    const res = await agent
      .post(ENDPOINTS.AUTH.LOGIN)
      .send({ email: 'ghost@nowhere.invalid', password: 'Pass@1234' });
    expect([STATUS.UNAUTHORIZED, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
    if (res.status !== STATUS.TOO_MANY_REQUESTS) {
      expect(typeof res.body.message).toBe('string');
      expect(res.body.data).toBeNull();
    }
  });

  it('POST /auth/login — rejects invalid email format', async () => {
    const res = await agent
      .post(ENDPOINTS.AUTH.LOGIN)
      .send({ email: 'not-an-email', password: 'Pass@1234' });
    expect([STATUS.BAD_REQUEST, STATUS.UNAUTHORIZED, STATUS.TOO_MANY_REQUESTS]).toContain(
      res.status,
    );
  });

  it('POST /auth/signup — rejects duplicate email', async () => {
    const email = testEmail('dup');
    await agent
      .post(ENDPOINTS.AUTH.SIGNUP)
      .send({ full_name: 'Dup User', email, password: 'Pass@1234' });
    const res = await agent
      .post(ENDPOINTS.AUTH.SIGNUP)
      .send({ full_name: 'Dup User', email, password: 'Pass@1234' });
    expect([STATUS.BAD_REQUEST, STATUS.CONFLICT, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
  });

  it('POST /auth/signup — rejects invalid email format', async () => {
    const res = await agent
      .post(ENDPOINTS.AUTH.SIGNUP)
      .send({ full_name: 'Bad Email', email: 'bad-email', password: 'Pass@1234' });
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.TOO_MANY_REQUESTS]).toContain(
      res.status,
    );
  });

  it('POST /auth/signup — rejects short password', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.SIGNUP).send({
      full_name: 'Short Pass',
      email: testEmail('short'),
      password: 'Ab@1',
    });
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.TOO_MANY_REQUESTS]).toContain(
      res.status,
    );
  });

  it('POST /auth/logout — rejects missing token', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.LOGOUT);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('POST /auth/logout — rejects invalid token', async () => {
    const res = await agent
      .post(ENDPOINTS.AUTH.LOGOUT)
      .set('Authorization', 'Bearer invalid.token.here');
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  describe('routes that require a token (no longer @Public)', () => {
    const studentId = '00000000-0000-4000-8000-000000000000';

    it('GET /simulations — rejects missing token', async () => {
      const res = await agent.get(ENDPOINTS.SIMULATIONS.LIST);
      expect(res.status).toBe(STATUS.UNAUTHORIZED);
    });

    it('GET /students/lookup/:studentCode — rejects missing token', async () => {
      const res = await agent.get(ENDPOINTS.STUDENTS.LOOKUP_BY_CODE('ABC123'));
      expect(res.status).toBe(STATUS.UNAUTHORIZED);
    });

    it('POST /students/:studentId/start-assessment — rejects missing token', async () => {
      const res = await agent.post(ENDPOINTS.STUDENTS.START_ASSESSMENT(studentId)).send({});
      expect(res.status).toBe(STATUS.UNAUTHORIZED);
    });
  });

  describe('routes that stay @Public', () => {
    it('GET /simulations/:scenarioId/public — is reachable without a token', async () => {
      const res = await agent.get(ENDPOINTS.SIMULATIONS.PUBLIC('non-existent-scenario'));
      expect(res.status).not.toBe(STATUS.UNAUTHORIZED);
    });

    it('GET /students/login — is reachable without a token', async () => {
      const res = await agent.get(ENDPOINTS.STUDENTS.LOGIN).query({ student_id: 'NOPE00' });
      expect(res.status).not.toBe(STATUS.UNAUTHORIZED);
    });
  });
});
