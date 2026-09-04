import { TEST_SCENARIO_ID, TEST_UNIT_ID } from '../constants/test.constants';

export function buildScenario(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TEST_SCENARIO_ID,
    title: 'Test Scenario',
    description: 'A test scenario',
    unitId: TEST_UNIT_ID,
    expectedActions: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}
