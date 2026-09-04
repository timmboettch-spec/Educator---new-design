import {
  TEST_REPORT_ID,
  TEST_USER_ID,
  TEST_SCENARIO_ID,
  TEST_TRANSCRIPT_ID,
} from '../constants/test.constants';

export function buildReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TEST_REPORT_ID,
    userId: TEST_USER_ID,
    scenarioId: TEST_SCENARIO_ID,
    transcriptId: TEST_TRANSCRIPT_ID,
    score: 80,
    summary: 'Test report summary',
    strengths: ['Good communication'],
    improvements: ['Check vitals more thoroughly'],
    feedback: 'Well done overall.',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}
