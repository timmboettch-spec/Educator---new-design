import { describe, it, beforeAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { createAgent } from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

describe('Auth Controller — Negative Cases', () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    agent = createAgent();
  });

  it('POST /auth/login — rejects missing email', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.LOGIN).send({ password: 'Test@1234' });
    expect([STATUS.BAD_REQUEST, STATUS.UNAUTHORIZED, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
  });

  it('POST /auth/login — rejects empty password', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.LOGIN).send({ email: 'a@b.com', password: '' });
    expect([STATUS.BAD_REQUEST, STATUS.UNAUTHORIZED, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
  });

  it('POST /auth/login — rejects non-existent user', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.LOGIN).send({ email: 'ghost@nowhere.invalid', password: 'Pass@1234' });
    expect([STATUS.UNAUTHORIZED, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
    if (res.status !== STATUS.TOO_MANY_REQUESTS) expect(res.body.status).toBe('FAILED');
  });

  it('POST /auth/login — rejects invalid email format', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.LOGIN).send({ email: 'not-an-email', password: 'Pass@1234' });
    expect([STATUS.BAD_REQUEST, STATUS.UNAUTHORIZED, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
  });

  it('POST /auth/signup — rejects duplicate email', async () => {
    const email = `dup-${Date.now()}@test.realityworks`;
    await agent.post(ENDPOINTS.AUTH.SIGNUP).send({ full_name: 'Dup User', email, password: 'Pass@1234' });
    const res = await agent.post(ENDPOINTS.AUTH.SIGNUP).send({ full_name: 'Dup User', email, password: 'Pass@1234' });
    expect([STATUS.BAD_REQUEST, STATUS.CONFLICT, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
  });

  it('POST /auth/signup — rejects invalid email format', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.SIGNUP).send({ full_name: 'Bad Email', email: 'bad-email', password: 'Pass@1234' });
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
  });

  it('POST /auth/signup — rejects short password', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.SIGNUP).send({ full_name: 'Short Pass', email: `short-${Date.now()}@test.realityworks`, password: 'Ab@1' });
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
  });

  it('POST /auth/logout — rejects missing token', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.LOGOUT);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('POST /auth/logout — rejects invalid token', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.LOGOUT).set('Authorization', 'Bearer invalid.token.here');
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });
});
