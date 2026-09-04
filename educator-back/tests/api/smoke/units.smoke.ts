import { beforeAll, beforeEach, describe, it } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { resetSmokeAgent, logTarget } from './smoke-client';
import { smokeState } from './smoke-state';
import { ENDPOINTS } from '../common/constants/endpoints';
import { STATUS } from '../common/constants/status-codes';

describe('Smoke — Units', () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    logTarget('Units');
  });

  beforeEach(() => {
    agent = resetSmokeAgent();
  });

  it('should get simulation unit details by valid unit ID', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .get(ENDPOINTS.SIMULATIONS.BY_UNIT(smokeState.scenarioId))
      .set('Authorization', `Bearer ${token}`);
    expect([STATUS.OK, STATUS.NOT_FOUND]).toContain(res.status);
    if (res.status === STATUS.OK) expect(res.body?.status).toBe('SUCCESS');
  });

  it('should reject unit details without token', async () => {
    const res = await agent.get(ENDPOINTS.SIMULATIONS.BY_UNIT(smokeState.scenarioId));
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('should return 400 or 404 for non-existent unit ID', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .get(ENDPOINTS.SIMULATIONS.BY_UNIT('non-existent-unit-999'))
      .set('Authorization', `Bearer ${token}`);
    expect([STATUS.NOT_FOUND, STATUS.BAD_REQUEST]).toContain(res.status);
  });

  it('should accept optional ls query param without breaking', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .get(`${ENDPOINTS.SIMULATIONS.BY_UNIT(smokeState.scenarioId)}?ls=true`)
      .set('Authorization', `Bearer ${token}`);
    expect([STATUS.OK, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('should reject unit details with invalid token', async () => {
    const res = await agent
      .get(ENDPOINTS.SIMULATIONS.BY_UNIT(smokeState.scenarioId))
      .set('Authorization', 'Bearer invalid-token');
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });
});
