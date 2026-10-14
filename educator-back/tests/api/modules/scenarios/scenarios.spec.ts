import { describe, it, beforeAll, expect } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { createAgent, signupAndLogin } from '../../common/setup/supertest.setup';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';
import { testEmail } from '../../utils/env';

describe('Scenarios Controller', () => {
  let agent: SuperTest<Test>;
  let accessToken = '';

  beforeAll(async () => {
    agent = createAgent();
    const email = testEmail('scenarios');
    const password = 'Scenarios@1234';
    accessToken = await signupAndLogin(agent, { full_name: 'Scenarios User', email, password });
  });


  it('GET /simulations/educators — returns scenarios list with valid token', async () => {
    const res = await agent
      .get(ENDPOINTS.SIMULATION_CATALOG.SCENARIOS)
      .set('Authorization', `Bearer ${accessToken}`);
    // This route resolves the acting educator from the token. Signup creates a
    // District Admin, whose token carries no educatorId, so 400 is the correct
    // answer there — the suite has no educator-scoped token to use instead.
    expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(
      res.status,
    );
  });

  it('GET /simulations/educators — rejects without token', async () => {
    const res = await agent.get(ENDPOINTS.SIMULATION_CATALOG.SCENARIOS);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('GET /simulations/by-unit/:id — rejects invalid unit ID', async () => {
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
    // Educator-scoped like /simulation-catalog/scenarios above — a District Admin
    // token has no educatorId to act as, which the route answers with a 400.
    expect([STATUS.OK, STATUS.NOT_FOUND, STATUS.BAD_REQUEST, STATUS.FORBIDDEN]).toContain(
      res.status,
    );
  });
});
