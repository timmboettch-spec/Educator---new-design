import { TEST_USER_ID } from '../constants/test.constants';

export function buildUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TEST_USER_ID,
    username: 'testuser',
    email: 'test@example.com',
    role: 'student',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}
