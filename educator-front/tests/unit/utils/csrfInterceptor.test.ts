import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/utils/storage', () => ({
  getCsrfToken: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock('../../../src/utils/forceLogout', () => ({
  forceLogout: vi.fn(),
  LOGOUT_MESSAGES: {
    SESSION_EXPIRED: 'Session expired',
    SCHOOL_INACTIVE: 'School inactive',
  },
}));

vi.mock('../../../src/utils/sessionState', () => ({
  isSessionReady: vi.fn(() => false),
}));

import { getCsrfToken, getToken } from '../../../src/utils/storage';
import api from '../../../src/redux/api';

type Headers = Record<string, string | undefined>;

const capturingAdapter = (out: { headers: Headers }) =>
  vi.fn().mockImplementation((config: { headers: Headers }) => {
    out.headers = config.headers ?? {};
    return Promise.resolve({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  });

describe('CSRF Token – axios request interceptor (src/redux/api.tsx)', () => {
  let originalAdapter: typeof api.defaults.adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    originalAdapter = api.defaults.adapter;
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
  });

  test('sets X-CSRF-Token header on POST when a CSRF token is present', async () => {
    vi.mocked(getCsrfToken).mockReturnValue('csrf-token-abc123');
    vi.mocked(getToken).mockReturnValue(null);

    const captured: { headers: Headers } = { headers: {} };
    api.defaults.adapter = capturingAdapter(captured);

    await api.post('/some-endpoint', {});

    expect(captured.headers['X-CSRF-Token']).toBe('csrf-token-abc123');
  });

  test('sets X-CSRF-Token header on GET requests when CSRF token is present', async () => {
    vi.mocked(getCsrfToken).mockReturnValue('csrf-token-abc123');
    vi.mocked(getToken).mockReturnValue(null);

    const captured: { headers: Headers } = { headers: {} };
    api.defaults.adapter = capturingAdapter(captured);

    await api.get('/health');

    expect(captured.headers['X-CSRF-Token']).toBe('csrf-token-abc123');
  });

  test('sets X-CSRF-Token on PUT, PATCH, and DELETE (state-changing methods)', async () => {
    vi.mocked(getCsrfToken).mockReturnValue('csrf-token-abc123');
    vi.mocked(getToken).mockReturnValue(null);

    for (const call of [
      () => api.put('/x', {}),
      () => api.patch('/x', {}),
      () => api.delete('/x'),
    ]) {
      const captured: { headers: Headers } = { headers: {} };
      api.defaults.adapter = capturingAdapter(captured);
      await call();
      expect(captured.headers['X-CSRF-Token']).toBe('csrf-token-abc123');
    }
  });

  test('does NOT set X-CSRF-Token header when CSRF token is null (POST)', async () => {
    vi.mocked(getCsrfToken).mockReturnValue(null);
    vi.mocked(getToken).mockReturnValue(null);

    const captured: { headers: Headers } = { headers: {} };
    api.defaults.adapter = capturingAdapter(captured);

    await api.post('/some-endpoint', {});

    expect(captured.headers['X-CSRF-Token']).toBeUndefined();
  });

  test('sets Authorization header when JWT token is present', async () => {
    vi.mocked(getToken).mockReturnValue('jwt-bearer-xyz');
    vi.mocked(getCsrfToken).mockReturnValue(null);

    const captured: { headers: Headers } = { headers: {} };
    api.defaults.adapter = capturingAdapter(captured);

    await api.get('/health');

    expect(captured.headers['Authorization']).toBe('Bearer jwt-bearer-xyz');
  });

  test('sets both Authorization and X-CSRF-Token when both tokens are present on POST', async () => {
    vi.mocked(getToken).mockReturnValue('jwt-bearer-xyz');
    vi.mocked(getCsrfToken).mockReturnValue('csrf-token-abc123');

    const captured: { headers: Headers } = { headers: {} };
    api.defaults.adapter = capturingAdapter(captured);

    await api.post('/some-endpoint', {});

    expect(captured.headers['Authorization']).toBe('Bearer jwt-bearer-xyz');
    expect(captured.headers['X-CSRF-Token']).toBe('csrf-token-abc123');
  });

  test('omits both headers when neither token is present', async () => {
    vi.mocked(getToken).mockReturnValue(null);
    vi.mocked(getCsrfToken).mockReturnValue(null);

    const captured: { headers: Headers } = { headers: {} };
    api.defaults.adapter = capturingAdapter(captured);

    await api.get('/health');

    expect(captured.headers['Authorization']).toBeUndefined();
    expect(captured.headers['X-CSRF-Token']).toBeUndefined();
  });
});
