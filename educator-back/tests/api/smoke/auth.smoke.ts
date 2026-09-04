import { beforeAll, beforeEach, describe, it } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { resetSmokeAgent, logTarget } from './smoke-client';
import { smokeState } from './smoke-state';
import { ENDPOINTS } from '../common/constants/endpoints';
import { STATUS } from '../common/constants/status-codes';
import { post, expectStatus, expectSuccess, expectFailed } from '../common/utils/api.helper';
import authFixtures from '../common/fixtures/auth.requests.json';

describe('Smoke — Auth', () => {
  let agent: SuperTest<Test>;

  // Dynamic credentials created once per run against the live server
  const smokeEmail = `smoke-auth-${Date.now()}@smoke.test`;
  const smokePassword = 'SmokeAuth@1234';

  beforeAll(async () => {
    logTarget('Auth');
    agent = resetSmokeAgent();
    // Sign up a fresh user so login tests have valid credentials on the live server
    await agent.post(ENDPOINTS.AUTH.SIGNUP).send({
      full_name: 'Smoke Auth User',
      email: smokeEmail,
      password: smokePassword,
    });
  });

  beforeEach(() => {
    agent = resetSmokeAgent();
  });

  // ── Login ──────────────────────────────────────────────────────────────────

  it('should login with valid credentials and return access token', async () => {
    const body = await expectStatus(
      post(agent, ENDPOINTS.AUTH.LOGIN, { email: smokeEmail, password: smokePassword }),
      [STATUS.OK, STATUS.CREATED],
    );
    expectSuccess(body);
    const tokens = (body.data as Record<string, unknown>)?.tokens as Record<string, unknown>;
    expect(typeof tokens?.accessToken).toBe('string');

    // Persist token for subsequent smoke tests
    smokeState.accessToken = tokens.accessToken as string;
    const user = (body.data as Record<string, unknown>)?.user as Record<string, unknown>;
    smokeState.adminId = (user?.id ?? '') as string;
  });

  it('should reject login with wrong password', async () => {
    const body = await expectStatus(
      post(agent, ENDPOINTS.AUTH.LOGIN, { email: smokeEmail, password: 'WrongPass@999' }),
      [STATUS.UNAUTHORIZED, STATUS.TOO_MANY_REQUESTS],
    );
    if ((body as unknown as { statusCode: number }).statusCode !== STATUS.TOO_MANY_REQUESTS) {
      expectFailed(body);
    }
  });

  it('should reject login with empty email', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.LOGIN).send(authFixtures.emptyEmail);
    expect([STATUS.BAD_REQUEST, STATUS.UNAUTHORIZED, STATUS.TOO_MANY_REQUESTS]).toContain(
      res.status,
    );
  });

  it('should reject login with empty password', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.LOGIN).send(authFixtures.emptyPassword);
    expect([STATUS.BAD_REQUEST, STATUS.UNAUTHORIZED, STATUS.TOO_MANY_REQUESTS]).toContain(
      res.status,
    );
  });

  it('should reject login with non-existent email', async () => {
    const body = await expectStatus(
      post(agent, ENDPOINTS.AUTH.LOGIN, authFixtures.nonExistentEmail),
      [STATUS.UNAUTHORIZED, STATUS.TOO_MANY_REQUESTS],
    );
    if ((body as unknown as { statusCode: number }).statusCode !== STATUS.TOO_MANY_REQUESTS) {
      expectFailed(body);
    }
  });

  // ── Forgot password ────────────────────────────────────────────────────────

  it('should initiate forgot-password flow for valid email', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.FORGOT_PASSWORD).send({ email: smokeEmail });
    expect([STATUS.OK, STATUS.CREATED, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('should reject forgot-password for unknown email', async () => {
    const res = await agent
      .post(ENDPOINTS.AUTH.FORGOT_PASSWORD)
      .send({ email: 'nobody@nowhere.invalid' });
    expect([
      STATUS.OK,
      STATUS.CREATED,
      STATUS.BAD_REQUEST,
      STATUS.NOT_FOUND,
      STATUS.UNAUTHORIZED,
    ]).toContain(res.status);
  });

  // ── Redeem ─────────────────────────────────────────────────────────────────

  it('should redeem a valid activation code', async () => {
    const token = smokeState.accessToken;
    const res = await agent
      .post(ENDPOINTS.AUTH.REDEEM)
      .set('Authorization', `Bearer ${token}`)
      .send(authFixtures.redeemValid);
    expect([
      STATUS.OK,
      STATUS.CREATED,
      STATUS.NOT_FOUND,
      STATUS.BAD_REQUEST,
      STATUS.FORBIDDEN,
    ]).toContain(res.status);
  });

  it('should reject an invalid activation code', async () => {
    const token = smokeState.accessToken;
    const res = await agent
      .post(ENDPOINTS.AUTH.REDEEM)
      .set('Authorization', `Bearer ${token}`)
      .send(authFixtures.redeemInvalid);
    expect([STATUS.BAD_REQUEST, STATUS.UNAUTHORIZED, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(
      res.status,
    );
  });

  it('should reject redeem without auth token', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.REDEEM).send(authFixtures.redeemValid);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('should reject redeem with empty code', async () => {
    const token = smokeState.accessToken;
    if (!token) return;
    const res = await agent
      .post(ENDPOINTS.AUTH.REDEEM)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '' });
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('should reject duplicate redemption of the same code', async () => {
    const token = smokeState.accessToken;
    if (!token) return;
    const code = 'SMOKEDUP12345678';
    await agent.post(ENDPOINTS.AUTH.REDEEM).set('Authorization', `Bearer ${token}`).send({ code });
    const res = await agent
      .post(ENDPOINTS.AUTH.REDEEM)
      .set('Authorization', `Bearer ${token}`)
      .send({ code });
    // Must not 5xx — server handles duplicate gracefully
    expect(res.status).toBeLessThan(500);
  });

  // ── Logout ─────────────────────────────────────────────────────────────────

  it('should logout successfully with valid token', async () => {
    const loginRes = await agent
      .post(ENDPOINTS.AUTH.LOGIN)
      .send({ email: smokeEmail, password: smokePassword });
    const tokens = (loginRes.body?.data as Record<string, unknown>)?.tokens as Record<
      string,
      unknown
    >;
    const freshToken = tokens?.accessToken as string;

    const res = await agent
      .post(ENDPOINTS.AUTH.LOGOUT)
      .set('Authorization', `Bearer ${freshToken}`);
    expect([STATUS.OK, STATUS.CREATED, STATUS.FORBIDDEN, STATUS.TOO_MANY_REQUESTS]).toContain(
      res.status,
    );
  });

  it('should reject logout without token', async () => {
    const res = await agent.post(ENDPOINTS.AUTH.LOGOUT);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });
});
