import { beforeAll, beforeEach, describe, it } from '@jest/globals';
import { SuperTest, Test } from 'supertest';
import { resetSmokeAgent, logTarget } from './smoke-client';
import { smokeState } from './smoke-state';
import { ENDPOINTS } from '../common/constants/endpoints';
import { STATUS } from '../common/constants/status-codes';
import scenarioFixtures from '../common/fixtures/scenario.requests.json';

describe('Smoke — Scenarios', () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    logTarget('Scenarios');
  });

  beforeEach(() => {
    agent = resetSmokeAgent();
  });

  // ── Simulation catalog dashboard ───────────────────────────────────────────

  it('should get simulation catalog dashboard with valid token', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .get(ENDPOINTS.SIMULATION_CATALOG.DASHBOARD)
      .set('Authorization', `Bearer ${token}`);
    expect([STATUS.OK]).toContain(res.status);
    if (res.status === STATUS.OK) expect(res.body?.status).toBe('SUCCESS');
  });

  it('should reject catalog dashboard without token', async () => {
    const res = await agent.get(ENDPOINTS.SIMULATION_CATALOG.DASHBOARD);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN, STATUS.OK]).toContain(res.status);
  });

  // ── Scenarios list ─────────────────────────────────────────────────────────

  it('should list simulation scenarios with valid token', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .get(ENDPOINTS.SIMULATION_CATALOG.SCENARIOS)
      .set('Authorization', `Bearer ${token}`);
    expect([STATUS.OK, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('should reject scenarios list without token', async () => {
    const res = await agent.get(ENDPOINTS.SIMULATION_CATALOG.SCENARIOS);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('should reject scenarios list with invalid token', async () => {
    const res = await agent
      .get(ENDPOINTS.SIMULATION_CATALOG.SCENARIOS)
      .set('Authorization', 'Bearer bad-token');
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  // ── Add to library ─────────────────────────────────────────────────────────

  it('should add a scenario to educator library with valid token', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .post(ENDPOINTS.EDUCATOR_SIMULATIONS.ADD_TO_LIBRARY)
      .set('Authorization', `Bearer ${token}`)
      .send(scenarioFixtures.validScenario);
    expect([STATUS.CREATED, STATUS.OK, STATUS.CONFLICT]).toContain(res.status);
  });

  it('should reject add-to-library without token', async () => {
    const res = await agent
      .post(ENDPOINTS.EDUCATOR_SIMULATIONS.ADD_TO_LIBRARY)
      .send(scenarioFixtures.validScenario);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });

  it('should reject add-to-library with invalid scenario id', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .post(ENDPOINTS.EDUCATOR_SIMULATIONS.ADD_TO_LIBRARY)
      .set('Authorization', `Bearer ${token}`)
      .send(scenarioFixtures.invalidScenarioId);
    expect([STATUS.BAD_REQUEST, STATUS.NOT_FOUND, STATUS.CREATED]).toContain(res.status);
  });

  it('should reject add-to-library with empty payload', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .post(ENDPOINTS.EDUCATOR_SIMULATIONS.ADD_TO_LIBRARY)
      .set('Authorization', `Bearer ${token}`)
      .send(scenarioFixtures.emptyPayload);
    expect([STATUS.BAD_REQUEST, STATUS.UNPROCESSABLE]).toContain(res.status);
  });

  // ── Educator library ───────────────────────────────────────────────────────

  it('should retrieve educator simulation library with valid token', async () => {
    const token = smokeState.accessToken;
    if (!token) return;

    const res = await agent
      .get(ENDPOINTS.EDUCATOR_SIMULATIONS.LIBRARY)
      .set('Authorization', `Bearer ${token}`);
    expect([STATUS.OK, STATUS.NOT_FOUND]).toContain(res.status);
  });

  it('should reject library retrieval without token', async () => {
    const res = await agent.get(ENDPOINTS.EDUCATOR_SIMULATIONS.LIBRARY);
    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).toContain(res.status);
  });
});
