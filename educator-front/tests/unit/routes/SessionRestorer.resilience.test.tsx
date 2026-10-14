import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Guards render a loader until `sessionChecked` flips, so any path where
 * SessionRestorer fails to dispatch hangs the entire app on a blank screen.
 * Storage access throws rather than returning null inside a Canvas third-party
 * iframe and in locked-down private windows, which is exactly where this app runs.
 */

const markSessionChecked = vi.fn(() => ({ type: 'auth/markSessionChecked' }));
const restoreSession = vi.fn((p: unknown) => ({
  type: 'auth/restoreSession',
  payload: p,
}));
const markSessionReady = vi.fn();
const clearAuthData = vi.fn();

let getTokenImpl: () => string | null = () => null;
let getParsedUserImpl: () => Record<string, unknown> | null = () => null;

vi.mock('../../../src/redux/auth/LoginRedux', () => ({
  markSessionChecked: () => markSessionChecked(),
  restoreSession: (p: unknown) => restoreSession(p),
}));

vi.mock('../../../src/utils/sessionState', () => ({
  markSessionReady: () => markSessionReady(),
}));

vi.mock('../../../src/utils/storage', () => ({
  getToken: () => getTokenImpl(),
  getParsedUser: () => getParsedUserImpl(),
  isRememberMe: () => false,
  isSessionActive: () => false,
  isSessionCookieActive: () => false,
  markTabSessionActive: vi.fn(),
  clearAuthData: () => clearAuthData(),
  updateStoredUser: vi.fn(),
}));

vi.mock('../../../src/redux/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../../src/redux/config', () => ({
  default: { GetEducatorAPI: '/api/educators' },
}));

const dispatch = vi.fn();
vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => dispatch,
}));

import SessionRestorer from '../../../src/routes/SessionRestorer';

describe('SessionRestorer resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTokenImpl = () => null;
    getParsedUserImpl = () => null;
  });

  it('resolves the session when there are no credentials at all', async () => {
    render(<SessionRestorer />);
    await waitFor(() => expect(markSessionChecked).toHaveBeenCalled());
    expect(markSessionReady).toHaveBeenCalled();
  });

  it('still resolves when getToken throws (blocked storage)', async () => {
    getTokenImpl = () => {
      throw new DOMException('access denied', 'SecurityError');
    };

    render(<SessionRestorer />);

    await waitFor(() => expect(markSessionChecked).toHaveBeenCalled());
    expect(markSessionReady).toHaveBeenCalled();
    expect(clearAuthData).toHaveBeenCalled();
  });

  it('still resolves when clearAuthData also throws on the blocked storage', async () => {
    getTokenImpl = () => {
      throw new DOMException('access denied', 'SecurityError');
    };
    clearAuthData.mockImplementationOnce(() => {
      throw new DOMException('access denied', 'SecurityError');
    });

    render(<SessionRestorer />);

    await waitFor(() => expect(markSessionChecked).toHaveBeenCalled());
    expect(markSessionReady).toHaveBeenCalled();
  });

  it('still resolves when getParsedUser throws (malformed cookie)', async () => {
    getTokenImpl = () => 'a-token';
    getParsedUserImpl = () => {
      throw new URIError('URI malformed');
    };

    render(<SessionRestorer />);

    await waitFor(() => expect(markSessionChecked).toHaveBeenCalled());
    expect(markSessionReady).toHaveBeenCalled();
  });
});
