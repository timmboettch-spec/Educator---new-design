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
  isLtiSessionHandoff: vi.fn(() => false),
}));

import { getCsrfToken, getToken } from '../../../src/utils/storage';
import { forceLogout } from '../../../src/utils/forceLogout';
import { isSessionReady } from '../../../src/utils/sessionState';
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

  test('does not forceLogout on Google Classroom feature-disabled 403', async () => {
    vi.mocked(getToken).mockReturnValue('jwt-valid');
    vi.mocked(getCsrfToken).mockReturnValue(null);
    vi.mocked(isSessionReady).mockReturnValue(true);

    api.defaults.adapter = vi.fn().mockRejectedValue({
      response: {
        status: 403,
        data: { message: 'Google Classroom is not enabled for this school' },
      },
      config: {
        url: '/api/google/schools/school-1/connection',
        headers: { Authorization: 'Bearer jwt-valid' },
      },
    });

    await expect(
      api.get('/api/google/schools/school-1/connection')
    ).rejects.toMatchObject({
      response: { status: 403 },
    });
    expect(forceLogout).not.toHaveBeenCalled();
  });

  test('forceLogout still runs on generic 403 outside Google Classroom APIs', async () => {
    vi.mocked(getToken).mockReturnValue('jwt-valid');
    vi.mocked(getCsrfToken).mockReturnValue(null);
    vi.mocked(isSessionReady).mockReturnValue(true);

    api.defaults.adapter = vi.fn().mockRejectedValue({
      response: {
        status: 403,
        data: { message: 'Forbidden' },
      },
      config: {
        url: '/api/classes',
        headers: { Authorization: 'Bearer jwt-valid' },
      },
    });

    await expect(api.get('/api/classes')).rejects.toEqual({
      message: 'Session expired',
    });
    expect(forceLogout).toHaveBeenCalled();
  });

  test('select-role 401 reaches the caller instead of forcing logout', async () => {
    vi.mocked(getToken).mockReturnValue('jwt-valid');
    vi.mocked(getCsrfToken).mockReturnValue(null);
    vi.mocked(isSessionReady).mockReturnValue(true);

    const rejection = {
      response: {
        status: 401,
        data: {
          message: 'The selected role is no longer available for this account.',
        },
      },
      config: {
        url: 'http://api.test/api/auth/select-role',
        headers: { Authorization: 'Bearer jwt-valid' },
      },
    };
    api.defaults.adapter = vi.fn().mockRejectedValue(rejection);

    await expect(
      api.post('http://api.test/api/auth/select-role', {})
    ).rejects.toBe(rejection);
    expect(forceLogout).not.toHaveBeenCalled();
  });

  test('change-password 401 reaches the caller instead of forcing logout', async () => {
    // A wrong current password is a business-logic failure, not proof of an
    // expired session — it must not hard-navigate the user to /login before
    // the "old password incorrect" message can render.
    vi.mocked(getToken).mockReturnValue('jwt-valid');
    vi.mocked(getCsrfToken).mockReturnValue(null);
    vi.mocked(isSessionReady).mockReturnValue(true);

    const rejection = {
      response: {
        status: 401,
        data: { message: 'Old password is incorrect.' },
      },
      config: {
        url: 'http://api.test/api/auth/change-password',
        headers: { Authorization: 'Bearer jwt-valid' },
      },
    };
    api.defaults.adapter = vi.fn().mockRejectedValue(rejection);

    await expect(
      api.post('http://api.test/api/auth/change-password', {})
    ).rejects.toBe(rejection);
    expect(forceLogout).not.toHaveBeenCalled();
  });

  test('redeem 401 (bad/expired code) reaches the caller instead of forcing logout', async () => {
    // A bad/expired/already-used redeem code is a business-logic failure, not
    // proof of an expired session — RedeemCode's own catch block shows the
    // message and lets the user retry; it must not be hard-logged-out.
    vi.mocked(getToken).mockReturnValue('jwt-valid');
    vi.mocked(getCsrfToken).mockReturnValue(null);
    vi.mocked(isSessionReady).mockReturnValue(true);

    const rejection = {
      response: {
        status: 401,
        data: { message: 'Redemption code has expired' },
      },
      config: {
        url: 'http://api.test/api/auth/redeem',
        headers: { Authorization: 'Bearer jwt-valid' },
      },
    };
    api.defaults.adapter = vi.fn().mockRejectedValue(rejection);

    await expect(api.post('http://api.test/api/auth/redeem', {})).rejects.toBe(
      rejection
    );
    expect(forceLogout).not.toHaveBeenCalled();
  });

  test('forceLogout still runs on a genuine /auth/me 401 (session actually expired)', async () => {
    // Guards against the redeem exemption above ever being broadened to
    // /auth/me, which is relied on elsewhere as a real session-validity check.
    vi.mocked(getToken).mockReturnValue('jwt-valid');
    vi.mocked(getCsrfToken).mockReturnValue(null);
    vi.mocked(isSessionReady).mockReturnValue(true);

    api.defaults.adapter = vi.fn().mockRejectedValue({
      response: { status: 401, data: { message: 'Unauthorized' } },
      config: {
        url: 'http://api.test/api/auth/me',
        headers: { Authorization: 'Bearer jwt-valid' },
      },
    });

    await expect(api.get('http://api.test/api/auth/me')).rejects.toEqual({
      message: 'Session expired',
    });
    expect(forceLogout).toHaveBeenCalled();
  });
});
