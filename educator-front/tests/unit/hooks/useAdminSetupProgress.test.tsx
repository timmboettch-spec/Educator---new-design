import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';

const mocks = vi.hoisted(() => ({
  useSessionIdentity: vi.fn(),
  useGetGuidedPathQuery: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../../src/features/auth/model/useSessionIdentity', () => ({
  useSessionIdentity: mocks.useSessionIdentity,
}));
vi.mock(
  '../../../src/redux/api/guidedPath/guidedPathApi',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../src/redux/api/guidedPath/guidedPathApi')
    >()),
    useGetGuidedPathQuery: mocks.useGetGuidedPathQuery,
    useUpdateGuidedPathMutation: () => [mocks.update],
  })
);

import { store } from '../../../src/store';
import { useAdminSetupProgress } from '../../../src/hooks/useAdminSetupProgress';
import { ROLE } from '../../../src/features/auth/model/roles';
import { ROUTE_PATHS } from '../../../src/routes/routePath';
import { writeCompletedCache } from '../../../src/redux/api/guidedPath/guidedPathService';

const identity = (o: Record<string, unknown> = {}) => ({
  role: ROLE.DISTRICT_ADMIN,
  isLicenseActive: true,
  skippedRedeem: false,
  isAuthenticated: true,
  isResolved: true,
  googleClassroomEnabled: true,
  accessToken: 't',
  userId: 'u1',
  ...o,
});

const row = (over: Record<string, unknown> = {}) => ({
  guidedPathId: 'g1',
  userId: 'u1',
  roleType: 'district_admin',
  state: {},
  completed: false,
  ...over,
});

const setup = (path: string) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </Provider>
  );
  return renderHook(
    () => ({ progress: useAdminSetupProgress(), navigate: useNavigate() }),
    { wrapper }
  );
};

const resolvedUpdate = () => ({
  unwrap: () => Promise.resolve({}),
});

const deferred = () => {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { unwrap: () => promise, resolve };
};

describe('useAdminSetupProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.useSessionIdentity.mockReturnValue(identity());
    mocks.useGetGuidedPathQuery.mockReturnValue({ data: row() });
    mocks.update.mockReturnValue(resolvedUpdate());
  });

  describe('eligibility', () => {
    it.each([
      ROUTE_PATHS.dashboard.admin,
      ROUTE_PATHS.accountLms.lmsIntegration,
      ROUTE_PATHS.schoolsEducators.schools,
      ROUTE_PATHS.schoolsEducators.educators,
      ROUTE_PATHS.accountLms.account,
    ])('shows for a licensed district admin on %s', (path) => {
      const { result } = setup(path);

      expect(mocks.useGetGuidedPathQuery).toHaveBeenCalledWith(
        ROLE.DISTRICT_ADMIN
      );
      expect(result.current.progress.visible).toBe(true);
    });

    it.each([
      ['an educator', { role: ROLE.EDUCATOR }, ROUTE_PATHS.accountLms.account],
      [
        'a trial admin',
        { isLicenseActive: false, skippedRedeem: true },
        ROUTE_PATHS.accountLms.account,
      ],
      [
        'unresolved session',
        { isResolved: false },
        ROUTE_PATHS.dashboard.admin,
      ],
      [
        'unauthenticated',
        { isAuthenticated: false },
        ROUTE_PATHS.dashboard.admin,
      ],
      ['a non-guide route', {}, ROUTE_PATHS.simulation.catalog],
    ])('skips the query and hides for %s', (_label, over, path) => {
      mocks.useSessionIdentity.mockReturnValue(identity(over));

      const { result } = setup(path);

      expect(mocks.useGetGuidedPathQuery).toHaveBeenCalledWith(skipToken);
      expect(result.current.progress.visible).toBe(false);
      expect(mocks.update).not.toHaveBeenCalled();
    });
  });

  it('orders the four admin steps with their routes', () => {
    const { result } = setup(ROUTE_PATHS.dashboard.admin);

    expect(
      result.current.progress.steps.map(({ key, index, route }) => ({
        key,
        index,
        route,
      }))
    ).toEqual([
      { key: 'lms', index: 1, route: ROUTE_PATHS.accountLms.lmsIntegration },
      { key: 'schools', index: 2, route: ROUTE_PATHS.schoolsEducators.schools },
      {
        key: 'educators',
        index: 3,
        route: ROUTE_PATHS.schoolsEducators.educators,
      },
      { key: 'account', index: 4, route: ROUTE_PATHS.accountLms.account },
    ]);
    expect(result.current.progress.totalSteps).toBe(4);
  });

  it('visiting the dashboard shows the guide but completes no step', () => {
    setup(ROUTE_PATHS.dashboard.admin);

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('visiting a step page saves that step', () => {
    setup(ROUTE_PATHS.schoolsEducators.schools);

    expect(mocks.update).toHaveBeenCalledWith({
      role: ROLE.DISTRICT_ADMIN,
      state: { visited: { schools: true } },
    });
  });

  it('ignores educator keys in the same blob', () => {
    mocks.useGetGuidedPathQuery.mockReturnValue({
      data: row({ state: { visited: { dashboard: true, account: true } } }),
    });

    const { result } = setup(ROUTE_PATHS.dashboard.admin);

    expect(result.current.progress.steps.map((s) => s.done)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it('is all done once every step is visited', () => {
    mocks.useGetGuidedPathQuery.mockReturnValue({
      data: row({
        state: {
          visited: { lms: true, schools: true, educators: true, account: true },
        },
      }),
    });

    const { result } = setup(ROUTE_PATHS.dashboard.admin);

    expect(result.current.progress.allGatesDone).toBe(true);
    expect(result.current.progress.completedCount).toBe(4);
  });

  describe('skipLms', () => {
    it('saves the LMS step without navigating', () => {
      const { result } = setup(ROUTE_PATHS.dashboard.admin);

      act(() => result.current.progress.skipLms());

      expect(mocks.update).toHaveBeenCalledTimes(1);
      expect(mocks.update).toHaveBeenCalledWith({
        role: ROLE.DISTRICT_ADMIN,
        state: { visited: { lms: true } },
      });
    });

    it('waits for a save in flight and goes out with the latest state', async () => {
      const first = deferred();
      mocks.update.mockReturnValueOnce(first).mockReturnValue(resolvedUpdate());

      const { result, rerender } = setup(ROUTE_PATHS.schoolsEducators.schools);
      expect(mocks.update).toHaveBeenCalledTimes(1);

      act(() => result.current.progress.skipLms());
      expect(mocks.update).toHaveBeenCalledTimes(1);

      mocks.useGetGuidedPathQuery.mockReturnValue({
        data: row({ state: { visited: { schools: true } } }),
      });
      await act(async () => {
        first.resolve();
      });
      rerender();

      expect(mocks.update).toHaveBeenCalledTimes(2);
      expect(mocks.update).toHaveBeenLastCalledWith({
        role: ROLE.DISTRICT_ADMIN,
        state: { visited: { schools: true, lms: true } },
      });
    });

    it('does nothing once LMS is already done', () => {
      mocks.useGetGuidedPathQuery.mockReturnValue({
        data: row({ state: { visited: { lms: true } } }),
      });
      const { result } = setup(ROUTE_PATHS.dashboard.admin);

      act(() => result.current.progress.skipLms());

      expect(mocks.update).not.toHaveBeenCalled();
    });
  });

  describe('a save still pending when leaving the guide pages', () => {
    // Like real RTK: a skipped query has no data.
    const serve = (data: ReturnType<typeof row>) =>
      mocks.useGetGuidedPathQuery.mockImplementation((arg: unknown) =>
        arg === skipToken ? { data: undefined } : { data }
      );

    it('still sends an LMS skip queued behind an in-flight save', async () => {
      serve(row());
      const first = deferred();
      mocks.update.mockReturnValueOnce(first).mockReturnValue(resolvedUpdate());

      const { result, rerender } = setup(ROUTE_PATHS.schoolsEducators.schools);
      expect(mocks.update).toHaveBeenCalledTimes(1);

      act(() => result.current.progress.skipLms());
      act(() => result.current.navigate(ROUTE_PATHS.simulation.catalog));
      expect(result.current.progress.visible).toBe(false);

      // The first PUT lands while the user is off the guide pages.
      serve(row({ state: { visited: { schools: true } } }));
      await act(async () => {
        first.resolve();
      });
      rerender();

      expect(mocks.update).toHaveBeenCalledTimes(2);
      expect(mocks.update).toHaveBeenLastCalledWith({
        role: ROLE.DISTRICT_ADMIN,
        state: { visited: { schools: true, lms: true } },
      });
    });

    it('lets go of the row once nothing is left to save', async () => {
      serve(row());
      const first = deferred();
      mocks.update.mockReturnValueOnce(first);

      const { result } = setup(ROUTE_PATHS.schoolsEducators.schools);
      act(() => result.current.navigate(ROUTE_PATHS.simulation.catalog));
      // Still subscribed while the visit save is in flight.
      expect(mocks.useGetGuidedPathQuery).toHaveBeenLastCalledWith(
        ROLE.DISTRICT_ADMIN
      );

      serve(row({ state: { visited: { schools: true } } }));
      await act(async () => {
        first.resolve();
      });

      expect(mocks.useGetGuidedPathQuery).toHaveBeenLastCalledWith(skipToken);
      expect(mocks.update).toHaveBeenCalledTimes(1);
    });

    it('drops the queued skip if the user signs out meanwhile', async () => {
      serve(row());
      const first = deferred();
      mocks.update.mockReturnValueOnce(first).mockReturnValue(resolvedUpdate());

      const { result, rerender } = setup(ROUTE_PATHS.schoolsEducators.schools);
      act(() => result.current.progress.skipLms());

      mocks.useSessionIdentity.mockReturnValue(
        identity({ isAuthenticated: false, role: null, userId: null })
      );
      rerender();
      await act(async () => {
        first.resolve();
      });
      rerender();

      expect(mocks.update).toHaveBeenCalledTimes(1);
      expect(mocks.useGetGuidedPathQuery).toHaveBeenLastCalledWith(skipToken);
    });
  });

  it('dismiss PUTs completed: true for the admin role', () => {
    const { result } = setup(ROUTE_PATHS.dashboard.admin);

    act(() => result.current.progress.dismiss());

    expect(mocks.update).toHaveBeenCalledWith({
      role: ROLE.DISTRICT_ADMIN,
      completed: true,
    });
  });

  it('skips the GET when the admin completion is cached', () => {
    writeCompletedCache('u1', ROLE.DISTRICT_ADMIN);

    const { result } = setup(ROUTE_PATHS.dashboard.admin);

    expect(mocks.useGetGuidedPathQuery).toHaveBeenCalledWith(skipToken);
    expect(result.current.progress.status).toBe('hidden');
  });

  it("is not hidden by the educator role's cached completion", () => {
    writeCompletedCache('u1', ROLE.EDUCATOR);

    const { result } = setup(ROUTE_PATHS.dashboard.admin);

    expect(result.current.progress.visible).toBe(true);
  });

  it('is error when the fetch failed, and retry refetches', () => {
    const refetch = vi.fn();
    mocks.useGetGuidedPathQuery.mockReturnValue({
      data: undefined,
      isError: true,
      refetch,
    });
    const { result } = setup(ROUTE_PATHS.dashboard.admin);

    expect(result.current.progress.status).toBe('error');
    act(() => result.current.progress.retry());
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
