export const createScenarioMock = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'mock-scenario-id',
  title: 'Mock Scenario',
  description: 'A mock scenario for testing',
  unitId: 'mock-unit-id',
  expectedActions: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

export const createScenarioServiceMock = () => ({
  findAll: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(createScenarioMock()),
  create: jest.fn().mockResolvedValue(createScenarioMock()),
  update: jest.fn().mockResolvedValue(createScenarioMock()),
  remove: jest.fn().mockResolvedValue(undefined),
});
