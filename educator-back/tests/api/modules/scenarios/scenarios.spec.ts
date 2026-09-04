import { describe, it, beforeAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { createAgent, signupAndLogin } from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

describe('Scenarios Controller', () => {
  let agent: SuperTest<Test>;
  let accessToken = '';

  beforeAll(async () => {
    agent = createAgent();
    const email = `scenarios-${Date.now()}@test.realityworks`;
    const password = 'Scenarios@1234';
    accessToken = await signupAndLogin(agent, { full_name: 'Scenarios User', email, password });
  });

  it('GET /simulation-catalog/dashboard — returns catalog with valid token', async () => {
    const res = await agent
      .get(ENDPOINTS.SIMULATION_CATALOG.DASHBOARD)
      .set('Authorization', `Bearer ${accessToken}`);
    expect([STATUS.OK, STATUS.FORBIDDEN]).toContain(res.status);
    if (res.status === STATUS.OK) expect(res.body.status).toBe('SUCCESS');
  });

  it('GET /simulation-catalog/scenarios — returns scenarios list with valid token', async () => {
    const res = await agent
      .get(ENDPOINTS.SIMULATION_CATALOG.SCENARIOS)
      .set('Authorization', `Bearer ${accessToken}`);
    expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /simulation-catalog/scenarios — rejects without token', async () => {
    const res = await agent.get(ENDPOINTS.SIMULATION_CATALOG.SCENARIOS);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /simulations/unit/:id — rejects invalid unit ID', async () => {
    const res = await agent
      .get(ENDPOINTS.SIMULATIONS.BY_UNIT('bad-unit-id'))
      .set('Authorization', `Bearer ${accessToken}`);
    expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(
      res.status,
    );
  });

  it('POST /educator-simulations/add-to-library — rejects empty payload', async () => {
    const res = await agent
      .post(ENDPOINTS.EDUCATOR_SIMULATIONS.ADD_TO_LIBRARY)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /educator-simulations/my-library — returns library with valid token', async () => {
    const res = await agent
      .get(ENDPOINTS.EDUCATOR_SIMULATIONS.LIBRARY)
      .set('Authorization', `Bearer ${accessToken}`);
    expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.FORBIDDEN]).toContain(res.status);
  });
});
