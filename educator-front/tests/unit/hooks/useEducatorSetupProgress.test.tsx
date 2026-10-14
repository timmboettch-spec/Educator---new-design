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
import { useEducatorSetupProgress } from '../../../src/hooks/useEducatorSetupProgress';
import { ROLE } from '../../../src/features/auth/model/roles';
import { ROUTE_PATHS } from '../../../src/routes/routePath';

const identity = (o: Record<string, unknown> = {}) => ({
  role: ROLE.EDUCATOR,
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
  roleType: 'educator',
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
    () => ({ progress: useEducatorSetupProgress(), navigate: useNavigate() }),
    { wrapper }
  );
};

const resolvedUpdate = () => ({
  unwrap: () => Promise.resolve({}),
});

describe('useEducatorSetupProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.useSessionIdentity.mockReturnValue(identity());
    mocks.useGetGuidedPathQuery.mockReturnValue({ data: row() });
    mocks.update.mockReturnValue(resolvedUpdate());
  });

  describe('eligibility', () => {
    it.each([
      [
        'unresolved session',
        { isResolved: false },
        ROUTE_PATHS.accountLms.account,
      ],
      [
        'unauthenticated',
        { isAuthenticated: false },
        ROUTE_PATHS.accountLms.account,
      ],
      [
        'district admin',
        { role: ROLE.DISTRICT_ADMIN },
        ROUTE_PATHS.accountLms.account,
      ],
      ['no role', { role: null }, ROUTE_PATHS.accountLms.account],
      ['a non-guide route', {}, '/reports'],
    ])('skips the query and hides for %s', (_label, over, path) => {
      mocks.useSessionIdentity.mockReturnValue(identity(over));

      const { result } = setup(path);

      expect(mocks.useGetGuidedPathQuery).toHaveBeenCalledWith(skipToken);
      expect(result.current.progress.eligible).toBe(false);
      expect(result.current.progress.visible).toBe(false);
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('queries by role for an educator on a guide route', () => {
      setup(ROUTE_PATHS.dashboard.educator);
      expect(mocks.useGetGuidedPathQuery).toHaveBeenCalledWith(ROLE.EDUCATOR);
    });
  });

  describe('status', () => {
    it('is loading while the first fetch has no data', () => {
      mocks.useGetGuidedPathQuery.mockReturnValue({ data: undefined });
      const { result } = setup(ROUTE_PATHS.dashboard.educator);
      expect(result.current.progress.status).toBe('loading');
    });

    it('is error when the fetch failed with nothing to show, and retry refetches', () => {
      const refetch = vi.fn();
      mocks.useGetGuidedPathQuery.mockReturnValue({
        data: undefined,
        isError: true,
        refetch,
      });
      const { result } = setup(ROUTE_PATHS.dashboard.educator);

      expect(result.current.progress.status).toBe('error');
      act(() => result.current.progress.retry());
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('keeps showing data when a later refetch fails', () => {
      mocks.useGetGuidedPathQuery.mockReturnValue({
        data: row(),
        isError: true,
      });
      const { result } = setup(ROUTE_PATHS.dashboard.educator);
      expect(result.current.progress.status).toBe('ready');
    });

    it('is ready with data, and hidden when ineligible or dismissed', () => {
      expect(
        setup(ROUTE_PATHS.dashboard.educator).result.current.progress.status
      ).toBe('ready');

      expect(setup('/reports').result.current.progress.status).toBe('hidden');

      mocks.useGetGuidedPathQuery.mockReturnValue({
        data: row({ completed: true }),
      });
      expect(
        setup(ROUTE_PATHS.dashboard.educator).result.current.progress.status
      ).toBe('hidden');
    });

    it('does not show loading when the cached completed flag skips the fetch', () => {
      window.localStorage.setItem('rw_edu_guide_completed_u1_educator', '1');
      mocks.useGetGuidedPathQuery.mockReturnValue({ data: undefined });
      const { result } = setup(ROUTE_PATHS.dashboard.educator);
      expect(result.current.progress.status).toBe('hidden');
    });
  });

  it('is hidden while loading or on error (no data)', () => {
    mocks.useGetGuidedPathQuery.mockReturnValue({ data: undefined });

    const { result } = setup(ROUTE_PATHS.dashboard.educator);

    expect(result.current.progress.eligible).toBe(true);
    expect(result.current.progress.visible).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('derives step state from the server visited flags', () => {
    mocks.useGetGuidedPathQuery.mockReturnValue({
      data: row({ state: { visited: { dashboard: true, library: true } } }),
    });

    const { result } = setup(ROUTE_PATHS.simulation.library);

    expect(result.current.progress.visible).toBe(true);
    expect(result.current.progress.steps.map((s) => s.done)).toEqual([
      true,
      false,
      false,
      true,
      false,
    ]);
    expect(result.current.progress.completedCount).toBe(2);
    expect(result.current.progress.currentIndex).toBe(2);
    expect(result.current.progress.allGatesDone).toBe(false);
  });

  it('marks an unvisited step by PUTting the full merged state', () => {
    mocks.useGetGuidedPathQuery.mockReturnValue({
      data: row({ state: { visited: { dashboard: true }, extra: 1 } }),
    });

    setup(ROUTE_PATHS.accountLms.account);

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({
      role: ROLE.EDUCATOR,
      state: { extra: 1, visited: { dashboard: true, account: true } },
    });
  });

  it('does not PUT for an already-visited step', () => {
    mocks.useGetGuidedPathQuery.mockReturnValue({
      data: row({ state: { visited: { account: true } } }),
    });

    setup(ROUTE_PATHS.accountLms.account);

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not retry a failed step while staying on the page', async () => {
    mocks.update.mockReturnValue({
      unwrap: () => Promise.reject(new Error('x')),
    });

    const { rerender } = setup(ROUTE_PATHS.accountLms.account);
    await act(async () => {});
    rerender();

    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('retries a failed step when the page is visited again', async () => {
    mocks.update.mockReturnValue({
      unwrap: () => Promise.reject(new Error('x')),
    });

    const { result } = setup(ROUTE_PATHS.accountLms.account);
    await act(async () => {});
    expect(mocks.update).toHaveBeenCalledTimes(1);

    act(() => result.current.navigate(ROUTE_PATHS.simulation.library));
    await act(async () => {});
    act(() => result.current.navigate(ROUTE_PATHS.accountLms.account));
    await act(async () => {});

    const accountPuts = mocks.update.mock.calls.filter(([arg]) =>
      JSON.stringify(arg).includes('"account":true')
    );
    expect(accountPuts).toHaveLength(2);
  });

  it("does not inherit a previous user's attempts", () => {
    const { rerender } = setup(ROUTE_PATHS.accountLms.account);
    expect(mocks.update).toHaveBeenCalledTimes(1);

    mocks.useGetGuidedPathQuery.mockReturnValue({
      data: row({ userId: 'u2' }),
    });
    rerender();

    expect(mocks.update).toHaveBeenCalledTimes(2);
  });

  it('shows the guide while `completed` is false', () => {
    const { result } = setup(ROUTE_PATHS.dashboard.educator);

    expect(result.current.progress.visible).toBe(true);
  });

  it('hides and stops writing once `completed` is true', () => {
    mocks.useGetGuidedPathQuery.mockReturnValue({
      data: row({ completed: true }),
    });

    const { result } = setup(ROUTE_PATHS.accountLms.account);

    expect(result.current.progress.visible).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('dismiss PUTs completed: true only', () => {
    mocks.useGetGuidedPathQuery.mockReturnValue({
      data: row({ state: { visited: { library: true } } }),
    });
    const { result } = setup(ROUTE_PATHS.simulation.library);
    mocks.update.mockClear();

    act(() => result.current.progress.dismiss());

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({
      role: ROLE.EDUCATOR,
      completed: true,
    });
  });

  it('ignores the old localStorage dismissed key', () => {
    window.localStorage.setItem('rw_edu_setup_dismissed_u1', '1');

    const { result } = setup(ROUTE_PATHS.dashboard.educator);

    expect(result.current.progress.visible).toBe(true);
  });

  it('removes every old rw_edu_setup_ key, for any user, and nothing else', () => {
    [
      'rw_edu_setup_products_u1',
      'rw_edu_setup_dismissed_u1',
      'rw_edu_setup_classes_959c27b3',
      'rw_edu_setup_products_7300d58e',
    ].forEach((key) => window.localStorage.setItem(key, '1'));
    window.localStorage.setItem('rw_edu_guide_completed_u1_educator', '1');
    window.localStorage.setItem('app_language', 'es');

    setup(ROUTE_PATHS.dashboard.educator);

    [
      'rw_edu_setup_products_u1',
      'rw_edu_setup_dismissed_u1',
      'rw_edu_setup_classes_959c27b3',
      'rw_edu_setup_products_7300d58e',
    ].forEach((key) => expect(window.localStorage.getItem(key)).toBeNull());
    expect(
      window.localStorage.getItem('rw_edu_guide_completed_u1_educator')
    ).toBe('1');
    expect(window.localStorage.getItem('app_language')).toBe('es');
  });

  describe('cached completed flag', () => {
    const KEY = 'rw_edu_guide_completed_u1_educator';

    it('skips the GET and hides when the key is set', () => {
      window.localStorage.setItem(KEY, '1');

      const { result } = setup(ROUTE_PATHS.accountLms.account);

      expect(mocks.useGetGuidedPathQuery).toHaveBeenCalledWith(skipToken);
      expect(result.current.progress.eligible).toBe(true);
      expect(result.current.progress.visible).toBe(false);
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it("another user's or role's key does not hide the guide", () => {
      window.localStorage.setItem('rw_edu_guide_completed_u2_educator', '1');
      window.localStorage.setItem(
        'rw_edu_guide_completed_u1_district_admin',
        '1'
      );

      const { result } = setup(ROUTE_PATHS.dashboard.educator);

      expect(mocks.useGetGuidedPathQuery).toHaveBeenCalledWith(ROLE.EDUCATOR);
      expect(result.current.progress.visible).toBe(true);
    });

    it('still cleans the old keys when the GET is skipped', () => {
      window.localStorage.setItem(KEY, '1');
      window.localStorage.setItem('rw_edu_setup_dismissed_u1', '1');
      mocks.useGetGuidedPathQuery.mockReturnValue({ data: undefined });

      setup(ROUTE_PATHS.dashboard.educator);

      expect(
        window.localStorage.getItem('rw_edu_setup_dismissed_u1')
      ).toBeNull();
      expect(window.localStorage.getItem(KEY)).toBe('1');
    });
  });

  it('marks Steps 2 and 3 only from a visit, not from existing data', () => {
    // The real store may hold classes / library items; they must not count.
    mocks.useGetGuidedPathQuery.mockReturnValue({
      data: row({ state: { visited: { dashboard: true } } }),
    });

    const { result } = setup(ROUTE_PATHS.dashboard.educator);

    const byKey = Object.fromEntries(
      result.current.progress.steps.map((step) => [step.key, step.done])
    );
    expect(byKey).toEqual({
      dashboard: true,
      catalog: false,
      classes: false,
      library: false,
      account: false,
    });
  });

  describe('one step save at a time', () => {
    const deferred = () => {
      let resolve: () => void = () => {};
      let reject: (e: unknown) => void = () => {};
      const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { unwrap: () => promise, resolve, reject };
    };

    it('queues a page visited mid-save and sends it with the latest state', async () => {
      const first = deferred();
      mocks.update.mockReturnValueOnce(first).mockReturnValue(resolvedUpdate());

      const { result, rerender } = setup(ROUTE_PATHS.dashboard.educator);
      expect(mocks.update).toHaveBeenCalledTimes(1);

      act(() => result.current.navigate(ROUTE_PATHS.simulation.catalog));
      expect(mocks.update).toHaveBeenCalledTimes(1);

      // The first PUT lands: the cache now holds the dashboard step.
      mocks.useGetGuidedPathQuery.mockReturnValue({
        data: row({ state: { visited: { dashboard: true } } }),
      });
      await act(async () => {
        first.resolve();
      });
      rerender();

      expect(mocks.update).toHaveBeenCalledTimes(2);
      expect(mocks.update).toHaveBeenLastCalledWith({
        role: ROLE.EDUCATOR,
        state: { visited: { dashboard: true, catalog: true } },
      });
    });

    it('still sends the queued step when the save before it fails', async () => {
      const first = deferred();
      mocks.update.mockReturnValueOnce(first).mockReturnValue(resolvedUpdate());

      const { result } = setup(ROUTE_PATHS.dashboard.educator);
      act(() => result.current.navigate(ROUTE_PATHS.simulation.catalog));

      await act(async () => {
        first.reject(new Error('x'));
      });

      expect(mocks.update).toHaveBeenCalledTimes(2);
      expect(mocks.update).toHaveBeenLastCalledWith({
        role: ROLE.EDUCATOR,
        state: { visited: { catalog: true } },
      });
    });
  });
});
