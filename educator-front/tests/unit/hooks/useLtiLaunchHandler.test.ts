import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useLtiLaunchHandler,
  LTI_SESSION_EXCHANGE_TIMEOUT_MS,
  resetLtiLaunchHandlerStateForTests,
} from '../../../src/hooks/useLtiLaunchHandler';

const {
  mockNavigate,
  mockDispatch,
  mockSetAuthData,
  mockGetToken,
  mockGetCsrfToken,
  mockGetParsedUser,
  mockClearAuthData,
  mockClearSecondaryAuthData,
  mockBeginLmsLaunchSession,
  mockRunLtiLaunchSyncIfNeeded,
  mockBeginLtiSessionHandoff,
  mockEndLtiSessionHandoff,
  mockToastError,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockDispatch: vi.fn(),
  mockSetAuthData: vi.fn(),
  mockGetToken: vi.fn(() => null as string | null),
  mockGetCsrfToken: vi.fn(() => null as string | null),
  mockGetParsedUser: vi.fn(() => null as Record<string, unknown> | null),
  mockClearAuthData: vi.fn(),
  mockClearSecondaryAuthData: vi.fn(),
  mockBeginLmsLaunchSession: vi.fn(),
  mockRunLtiLaunchSyncIfNeeded: vi.fn().mockResolvedValue(true),
  mockBeginLtiSessionHandoff: vi.fn(),
  mockEndLtiSessionHandoff: vi.fn(),
  mockToastError: vi.fn(),
}));

let mockSearch = '';

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ search: mockSearch, pathname: '/' }),
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
}));

vi.mock('../../../src/utils/storage', () => ({
  setAuthData: mockSetAuthData,
  getToken: mockGetToken,
  getCsrfToken: mockGetCsrfToken,
  getParsedUser: mockGetParsedUser,
  clearAuthData: mockClearAuthData,
  clearSecondaryAuthData: mockClearSecondaryAuthData,
}));

vi.mock('../../../src/utils/sessionState', () => ({
  beginLtiSessionHandoff: mockBeginLtiSessionHandoff,
  endLtiSessionHandoff: mockEndLtiSessionHandoff,
  isLtiSessionHandoff: () => false,
}));

vi.mock('../../../src/utils/lmsLaunchSync', () => ({
  beginLmsLaunchSession: mockBeginLmsLaunchSession,
  runLtiLaunchSyncIfNeeded: mockRunLtiLaunchSyncIfNeeded,
}));

vi.mock('../../../src/redux/auth/LoginRedux', () => ({
  logout: vi.fn(() => ({ type: 'LOGIN_LOGOUT' })),
  restoreSession: vi.fn((payload: unknown) => ({
    type: 'RESTORE_SESSION',
    payload,
  })),
  setRememberedEmail: vi.fn((email: string) => ({
    type: 'SET_REMEMBERED_EMAIL',
    payload: email,
  })),
}));

vi.mock('../../../src/redux/auth/SignUpRedux', () => ({
  logout: vi.fn(() => ({ type: 'SIGNUP_LOGOUT' })),
}));

vi.mock('../../../src/redux/notifications/NotificationsRedux', () => ({
  resetNotifications: vi.fn(() => ({ type: 'RESET_NOTIFICATIONS' })),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    error: mockToastError,
  },
}));

describe('useLtiLaunchHandler', () => {
  const replaceStateSpy = vi.fn();

  function createMemoryStorage(): Storage {
    const store = new Map<string, string>();
    return {
      get length() {
        return store.size;
      },
      clear: () => {
        store.clear();
      },
      getItem: (key: string) =>
        store.has(key) ? (store.get(key) as string) : null,
      key: (index: number) => [...store.keys()][index] ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch = '';
    resetLtiLaunchHandlerStateForTests();
    mockGetToken.mockReturnValue(null);
    mockGetCsrfToken.mockReturnValue(null);
    mockGetParsedUser.mockReturnValue(null);
    mockRunLtiLaunchSyncIfNeeded.mockResolvedValue(true);

    Object.defineProperty(window, 'localStorage', {
      value: createMemoryStorage(),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'sessionStorage', {
      value: createMemoryStorage(),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, 'history', {
      value: {
        ...window.history,
        replaceState: replaceStateSpy,
        state: {},
      },
      writable: true,
      configurable: true,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            accessToken: 'educator-token',
            csrfToken: 'csrf-token',
            user: { id: 'educator-1', email: 'teacher@test.com' },
            nrpsUrl: 'https://moodle.test.edu/nrps',
            lmsCourseId: '42',
            lmsCourseName: 'Test Course',
            provisioningStatus: 'pending',
            courseSource: 'lti',
          }),
      })
    );
  });

  it('exchanges session code and navigates to educator dashboard on success', async () => {
    mockSearch = '?lti_launch=success&code=session-code-123';

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        'http://mock-api/api/lti/session/exchange',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({
            code: 'session-code-123',
            audience: 'educator',
          }),
        })
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    expect(mockBeginLtiSessionHandoff).toHaveBeenCalled();
    expect(mockClearAuthData).toHaveBeenCalled();
    expect(mockClearSecondaryAuthData).toHaveBeenCalled();
    expect(localStorage.getItem('lti_course_id')).toBe('42');
    expect(localStorage.getItem('lti_course_name')).toBe('Test Course');
    expect(localStorage.getItem('nrpsUrl')).toBe(
      'https://moodle.test.edu/nrps'
    );
    expect(localStorage.getItem('accessToken')).toBe('educator-token');
    expect(mockBeginLmsLaunchSession).toHaveBeenCalled();
    expect(mockRunLtiLaunchSyncIfNeeded).toHaveBeenCalledWith(mockDispatch);
    expect(mockSetAuthData).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/educator-dashboard', {
      replace: true,
    });
    expect(mockEndLtiSessionHandoff).toHaveBeenCalled();
  });

  it('uses full-page navigation for redirectPath from session exchange', async () => {
    const assignMock = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      origin: 'http://localhost:5173',
      assign: assignMock,
    });

    // Sync must not block leaving /login for SpeedGrader deep links.
    mockRunLtiLaunchSyncIfNeeded.mockReturnValue(new Promise(() => undefined));

    mockSearch = '?lti_launch=success&code=session-code-123';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            accessToken: 'educator-token',
            csrfToken: 'csrf-token',
            user: { id: 'educator-1', email: 'teacher@test.com' },
            schoolId: 'school-a',
            nrpsUrl: 'https://moodle.test.edu/nrps',
            lmsCourseId: '42',
            lmsCourseName: 'Test Course',
            provisioningStatus: 'pending',
            courseSource: 'google_classroom',
            redirectPath: '/report-detail?reportId=r1&classId=c1',
          }),
      })
    );

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith(
        'http://localhost:5173/report-detail?reportId=r1&classId=c1'
      );
    });
    expect(mockNavigate).not.toHaveBeenCalledWith(
      '/report-detail?reportId=r1&classId=c1',
      expect.anything()
    );
    // Handoff stays raised until document unload so GuestOnly cannot race.
    expect(mockEndLtiSessionHandoff).not.toHaveBeenCalled();
  });

  it('uses redirect query param when exchange omits redirectPath', async () => {
    const assignMock = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      origin: 'http://localhost:5173',
      assign: assignMock,
    });

    mockSearch =
      '?lti_launch=success&code=session-code-123&redirect=%2Freport-detail%3FreportId%3Dr2%26classId%3Dc2';

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith(
        'http://localhost:5173/report-detail?reportId=r2&classId=c2'
      );
    });
  });

  it('restores prior session and opens redirect when exchange code is already spent', async () => {
    const assignMock = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      origin: 'http://localhost:5173',
      assign: assignMock,
    });

    mockGetToken.mockReturnValue('prior-educator-jwt');
    mockGetCsrfToken.mockReturnValue('prior-csrf');
    mockGetParsedUser.mockReturnValue({
      id: 'educator-1',
      email: 'teacher@test.com',
      role: 'Educator',
    });
    mockSearch =
      '?lti_launch=success&code=spent-code&redirect=%2Freport-detail%3FreportId%3Dr3';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({ error: 'Invalid or expired session code' }),
      })
    );

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith(
        'http://localhost:5173/report-detail?reportId=r3'
      );
    });
    expect(mockSetAuthData).toHaveBeenCalledWith(
      { accessToken: 'prior-educator-jwt', csrfToken: 'prior-csrf' },
      expect.objectContaining({ id: 'educator-1' }),
      false
    );
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('stores schoolId from session exchange when present', async () => {
    mockSearch = '?lti_launch=success&code=session-code-123';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            accessToken: 'educator-token',
            csrfToken: 'csrf-token',
            user: { id: 'educator-1', email: 'teacher@test.com' },
            schoolId: 'school-b',
            nrpsUrl: 'https://moodle.test.edu/nrps',
            lmsCourseId: '42',
            lmsCourseName: 'Test Course',
            provisioningStatus: 'pending',
            courseSource: 'lti',
          }),
      })
    );

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(localStorage.getItem('lti_school_id')).toBe('school-b');
    });
  });

  it('clears stale lti_school_id when session exchange omits schoolId', async () => {
    mockSearch = '?lti_launch=success&code=session-code-123';
    localStorage.setItem('lti_school_id', 'stale-school');

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(localStorage.getItem('lti_school_id')).toBeNull();
    });
  });

  it('never persists LMS access tokens even if the exchange response carries one', async () => {
    mockSearch = '?lti_launch=success&code=session-code-123';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            accessToken: 'educator-token',
            csrfToken: 'csrf-token',
            user: { id: 'educator-1', email: 'teacher@test.com' },
            nrpsUrl: 'https://moodle.test.edu/nrps',
            lmsCourseId: '42',
            lmsCourseName: 'Test Course',
            provisioningStatus: 'pending',
            courseSource: 'lti',
            lmsAccessToken: 'nrps-token',
            moodleAccessToken: 'legacy-nrps-token',
          }),
      })
    );

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(localStorage.getItem('nrpsUrl')).toBe(
        'https://moodle.test.edu/nrps'
      );
    });
    expect(localStorage.getItem('lmsAccessToken')).toBeNull();
    expect(localStorage.getItem('moodleAccessToken')).toBeNull();
  });

  it('shows error when success redirect is missing session code', async () => {
    mockSearch = '?lti_launch=success';

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'LTI login failed — missing session code'
      );
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('shows mapped error message when launch fails', async () => {
    mockSearch = '?lti_launch=error&reason=educator_role_required';

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Access denied: This tool is for instructors only. Students should use the Student App.'
      );
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('shows school mismatch message when educator belongs to another school', async () => {
    mockSearch = '?lti_launch=error&reason=school_mismatch';

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Access denied: Your educator account is not assigned to this school. Contact your administrator to add you to the correct school before launching from this LMS.'
      );
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('shows session expired message when exchange fails', async () => {
    mockSearch = '?lti_launch=success&code=expired-code';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      })
    );

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'LTI login failed — session expired'
      );
    });
  });

  it('sends prior portal JWT on session exchange Authorization header', async () => {
    mockSearch = '?lti_launch=success&code=session-code-123';
    mockGetToken.mockReturnValue('prior-admin-jwt');

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        'http://mock-api/api/lti/session/exchange',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer prior-admin-jwt',
          }),
        })
      );
    });
  });

  it('starts portal handoff only once when launch search stays in React Router', async () => {
    mockSearch = '?lti_launch=success&code=session-code-once';
    const { rerender } = renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(mockBeginLtiSessionHandoff).toHaveBeenCalledTimes(1);
    });

    // replaceState strips the browser URL but RR search is unchanged — rerender
    // must not clear auth / restart handoff for the same code.
    rerender();

    expect(mockBeginLtiSessionHandoff).toHaveBeenCalledTimes(1);
    expect(mockClearAuthData).toHaveBeenCalledTimes(1);
  });

  it('exchanges session code only once across StrictMode remount', async () => {
    mockSearch = '?lti_launch=success&code=strict-mode-code';
    const { unmount } = renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    unmount();
    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('aborts prior in-flight exchange when a second launch uses a different code', async () => {
    let firstAbortSignal: AbortSignal | undefined;
    mockSearch = '?lti_launch=success&code=first-code';
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.body?.toString().includes('first-code')) {
          firstAbortSignal = init.signal ?? undefined;
          return new Promise(() => {
            /* hang until aborted */
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              accessToken: 'educator-token-2',
              csrfToken: 'csrf-token-2',
              user: { id: 'educator-2', email: 'teacher2@test.com' },
              nrpsUrl: 'https://moodle.test.edu/nrps',
              lmsCourseId: '99',
              lmsCourseName: 'Second Course',
              provisioningStatus: 'pending',
              courseSource: 'lti',
            }),
        });
      })
    );

    const { rerender } = renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    mockSearch = '?lti_launch=success&code=second-code';
    rerender();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    expect(firstAbortSignal?.aborted).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith('/educator-dashboard', {
      replace: true,
    });
  });

  it('clears handoff when session exchange times out', async () => {
    vi.useFakeTimers();
    try {
      mockSearch = '?lti_launch=success&code=hanging-code';
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
              const onAbort = () => {
                reject(new DOMException('Aborted', 'AbortError'));
              };
              if (init?.signal?.aborted) {
                onAbort();
                return;
              }
              init?.signal?.addEventListener('abort', onAbort);
            })
        )
      );

      renderHook(() => useLtiLaunchHandler());

      await vi.advanceTimersByTimeAsync(LTI_SESSION_EXCHANGE_TIMEOUT_MS);
      // Flush the aborted fetch rejection → catch → endHandoff.
      await Promise.resolve();
      await Promise.resolve();

      expect(mockEndLtiSessionHandoff).toHaveBeenCalled();
      expect(mockToastError).toHaveBeenCalledWith(
        'LTI login failed — session expired'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing when lti_launch param is absent', async () => {
    mockSearch = '';

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(fetch).not.toHaveBeenCalled();
    });

    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
