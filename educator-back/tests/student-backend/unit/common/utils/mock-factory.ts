/**
 * Factory helpers that create typed jest mock objects for common services.
 * Import these in unit tests instead of repeating mock definitions.
 */

export function createMockJsonDataService() {
  return {
    getTranscriptById: jest.fn(),
    getTranscriptByIdFresh: jest.fn(),
    getReportById: jest.fn(),
    getReportByIdFresh: jest.fn(),
    getReportByTranscriptId: jest.fn(),
    getReportByTranscriptIdFresh: jest.fn(),
    getReportsByUserId: jest.fn(),
    addReport: jest.fn(),
    addReportFresh: jest.fn(),
    getScenarioById: jest.fn(),
    getScenarioByIdFresh: jest.fn(),
    getUnitById: jest.fn(),
    generateId: jest.fn(),
  };
}

export function createMockConfigService() {
  return { get: jest.fn() };
}

export function createMockJwtService() {
  return {
    sign: jest.fn().mockReturnValue('mock.jwt.token'),
    verify: jest.fn(),
  };
}

export function createMockRedisService() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}
