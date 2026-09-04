import { SuperTest, Test } from 'supertest';
import { createAgent, getBaseUrl } from '../common/setup/supertest.setup';

/**
 * smoke-client.ts
 * Factory that produces a fresh supertest agent for each test.
 * Import `getSmokeAgent` in your smoke spec files.
 */

let _agent: SuperTest<Test> | null = null;

/**
 * Returns a (possibly cached) supertest agent.
 * Call `resetSmokeAgent()` in beforeEach if you want a fresh instance per test.
 */
export function getSmokeAgent(): SuperTest<Test> {
  if (!_agent) {
    _agent = createAgent();
  }
  return _agent;
}

/**
 * Creates a brand-new supertest agent (use in beforeEach for test isolation).
 */
export function resetSmokeAgent(): SuperTest<Test> {
  _agent = createAgent();
  return _agent;
}

/**
 * Returns the resolved base URL for logging purposes.
 */
export function logTarget(label: string): void {
  console.log(`[Smoke/${label}] Target: ${getBaseUrl()}`);
}
