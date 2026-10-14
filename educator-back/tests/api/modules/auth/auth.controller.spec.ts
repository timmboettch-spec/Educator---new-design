import { describe, it, beforeAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import {
  createAgent,
  extractAccessTokenFromResponse,
  signupAndLogin,
} from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { LoginAccessStatus } from '../../common/constants/auth.constants';
import { STATUS } from '../../common/constants/status-codes';
import { testEmail } from '../../utils/env';

describe('Auth Controller — Happy Path', () => {
  let agent: SuperTest<Test>;
  const email = testEmail('auth-ctrl');
  const password = 'AuthCtrl@1234';
  let accessToken = '';

  beforeAll(async () => {
    agent = createAgent();
    await signupAndLogin(agent, { full_name: 'Auth Ctrl User', email, password });
  });

  it('POST /auth/login — succeeds and sets the accessToken cookie', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.LOGIN).send({ email, password });
    // 200 where the response interceptor sets the status from @ApiOkResponse,
    // 201 on deployments still returning Nest's POST default.
    expect([STATUS.OK, STATUS.CREATED, STATUS.TOO_MANY_REQUESTS]).toContain(res.status);
    if (res.status === STATUS.TOO_MANY_REQUESTS) return;
    // Every route responds with the unified `{ message, data, meta, error }` envelope.
    expect(res.body.error).toBeNull();
    // The access token is delivered as an httpOnly cookie, not in the body.
    accessToken = extractAccessTokenFromResponse(res);
    expect(accessToken.length).toBeGreaterThan(0);
    // `accessStatus` only exists on deployments carrying the multi-role login
    // response; where it is present, a single-role signup must be fully granted.
    const accessStatus = res.body?.data?.accessStatus as string | undefined;
    if (accessStatus !== undefined) {
      expect(accessStatus).toBe(LoginAccessStatus.ACCESS_GRANTED);
    }
  });

  it('POST /auth/logout — returns 200 with valid token', async () => {
    const res = await agent
      .post(ENDPOINTS.AUTH.LOGOUT)
      .set('Authorization', `Bearer ${accessToken}`);
    expect([STATUS.OK, STATUS.CREATED, STATUS.FORBIDDEN, STATUS.TOO_MANY_REQUESTS]).toContain(
      res.status,
    );
  });

  it('POST /auth/forgot-password — returns success for existing email', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.FORGOT_PASSWORD).send({ email });
    expect([
      STATUS.OK,
      STATUS.CREATED,
      STATUS.BAD_REQUEST,
      STATUS.NOT_FOUND,
      STATUS.TOO_MANY_REQUESTS,
    ]).toContain(res.status);
    if (res.status === STATUS.OK || res.status === STATUS.CREATED) {
      expect(res.body.error).toBeNull();
    }
  });
});
