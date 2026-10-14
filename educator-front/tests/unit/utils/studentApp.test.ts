import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const FALLBACK_URL = 'https://tutorpatient.realityworksai.com/';

const loadStudentAppUrl = async () => {
  vi.resetModules();
  const { STUDENT_APP_URL } =
    await import('../../../src/utils/constants/studentApp');
  return STUDENT_APP_URL;
};

describe('STUDENT_APP_URL', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('falls back to the default when the variable is empty', async () => {
    vi.stubEnv('VITE_STUDENT_APP_URL', '');
    expect(await loadStudentAppUrl()).toBe(FALLBACK_URL);
  });

  test('falls back to the default when the variable is whitespace', async () => {
    vi.stubEnv('VITE_STUDENT_APP_URL', '   ');
    expect(await loadStudentAppUrl()).toBe(FALLBACK_URL);
  });

  test('uses the configured value, trimmed', async () => {
    vi.stubEnv('VITE_STUDENT_APP_URL', '  https://students.example.com/  ');
    expect(await loadStudentAppUrl()).toBe('https://students.example.com/');
  });
});
