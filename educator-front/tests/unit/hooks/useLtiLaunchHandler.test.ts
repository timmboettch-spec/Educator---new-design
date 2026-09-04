import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLtiLaunchHandler } from '../../../src/hooks/useLtiLaunchHandler';

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();
const mockSetAuthData = vi.fn();
const mockBeginLmsLaunchSession = vi.fn();
const mockRunLtiLaunchSyncIfNeeded = vi.fn().mockResolvedValue(true);
const mockToastError = vi.fn();

let mockSearch = '';

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ search: mockSearch }),
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
}));

vi.mock('../../../src/utils/storage', () => ({
  setAuthData: (...args: unknown[]) => mockSetAuthData(...args),
}));

vi.mock('../../../src/utils/lmsLaunchSync', () => ({
  beginLmsLaunchSession: () => mockBeginLmsLaunchSession(),
  runLtiLaunchSyncIfNeeded: (...args: unknown[]) => mockRunLtiLaunchSyncIfNeeded(...args),
}));

vi.mock('../../../src/redux/auth/LoginRedux', () => ({
  setRememberedEmail: vi.fn((email: string) => ({
    type: 'SET_REMEMBERED_EMAIL',
    payload: email,
  })),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

describe('useLtiLaunchHandler', () => {
  const replaceStateSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch = '';
    localStorage.clear();
    sessionStorage.clear();

    Object.defineProperty(window, 'history', {
      value: {
        ...window.history,
        replaceState: replaceStateSpy,
        state: {},
      },
      writable: true,
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
      }),
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
          body: JSON.stringify({ code: 'session-code-123', audience: 'educator' }),
        }),
      );
    });

    expect(replaceStateSpy).toHaveBeenCalled();
    expect(localStorage.getItem('lti_course_id')).toBe('42');
    expect(localStorage.getItem('lti_course_name')).toBe('Test Course');
    expect(localStorage.getItem('nrpsUrl')).toBe('https://moodle.test.edu/nrps');
    expect(localStorage.getItem('accessToken')).toBe('educator-token');
    expect(mockBeginLmsLaunchSession).toHaveBeenCalled();
    expect(mockRunLtiLaunchSyncIfNeeded).toHaveBeenCalledWith(mockDispatch);
    expect(mockSetAuthData).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/educator-dashboard', { replace: true });
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
      }),
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

  it('stores access token from legacy moodleAccessToken response field', async () => {
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
            moodleAccessToken: 'legacy-nrps-token',
          }),
      }),
    );

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(localStorage.getItem('lmsAccessToken')).toBe('legacy-nrps-token');
    });
    expect(localStorage.getItem('moodleAccessToken')).toBe('legacy-nrps-token');
  });

  it('shows error when success redirect is missing session code', async () => {
    mockSearch = '?lti_launch=success';

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('LTI login failed — missing session code');
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalled();
  });

  it('shows mapped error message when launch fails', async () => {
    mockSearch = '?lti_launch=error&reason=educator_role_required';

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Access denied: This tool is for instructors only. Students should use the Student App.',
      );
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalled();
  });

  it('shows school mismatch message when educator belongs to another school', async () => {
    mockSearch = '?lti_launch=error&reason=school_mismatch';

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Access denied: Your educator account is not assigned to this school. Contact your administrator to add you to the correct school before launching from this LMS.',
      );
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalled();
  });

  it('shows session expired message when exchange fails', async () => {
    mockSearch = '?lti_launch=success&code=expired-code';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      }),
    );

    renderHook(() => useLtiLaunchHandler());

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('LTI login failed — session expired');
    });
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
