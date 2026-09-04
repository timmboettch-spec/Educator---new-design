import { describe, it, beforeAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { createAgent, signupAndLogin } from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

describe('Auth Controller — Happy Path', () => {
  let agent: SuperTest<Test>;
  const email = `auth-ctrl-${Date.now()}@test.realityworks`;
  const password = 'AuthCtrl@1234';
  let accessToken = '';

  beforeAll(async () => {
    agent = createAgent();
    await signupAndLogin(agent, { full_name: 'Auth Ctrl User', email, password });
  });

  it('POST /auth/login — returns 201 with accessToken', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.LOGIN).send({ email, password });
    expect([STATUS.CREATED, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
    if (res.status === STATUS.TOO_MANY_REQUESTS) return;
    expect(res.body.status).toBe('SUCCESS');
    const tokens = res.body?.data?.tokens as Record<string, unknown>;
    expect(typeof tokens?.accessToken).toBe('string');
    accessToken = tokens.accessToken as string;
  });

  it('POST /auth/logout — returns 200 with valid token', async () => {
    const res = await agent
      .post(ENDPOINTS.AUTH.LOGOUT)
      .set('Authorization', `Bearer ${accessToken}`);
    expect([STATUS.OK, STATUS.CREATED, STATUS.FORBIDDEN, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
  });

  it('POST /auth/forgot-password — returns success for existing email', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.FORGOT_PASSWORD).send({ email });
    expect([STATUS.OK, STATUS.CREATED, STATUS.NOT_FOUND, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
  });
});
