import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../src/i18n';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  updateClass: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  runLtiLaunchSyncIfNeeded: vi.fn(),
  resyncLmsRostersIfConfigured: vi.fn(),
  resyncGoogleClassroomRostersIfConfigured: vi.fn(),
  finishLmsLaunchSession: vi.fn(),
  state: {
    GetClass: { classes: [] as unknown[], status: 'idle' },
  },
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mocks.dispatch,
  useAppSelector: (selector: (state: typeof mocks.state) => unknown) =>
    selector(mocks.state),
}));
vi.mock('../../../src/redux/class/GetClassRedux', () => ({
  FetchClassesRequest: () => ({ type: 'class/fetch' }),
  selectClasses: (s: typeof mocks.state) => s.GetClass.classes,
  selectClassStatus: (s: typeof mocks.state) => s.GetClass.status,
}));
vi.mock('../../../src/redux/reports/EducatorReportsRedux', () => ({
  GetEducatorSimulationReports: (arg: unknown) => ({
    type: 'educatorReports/fetch',
    payload: arg,
  }),
}));
vi.mock('../../../src/redux/api/classes/classesApi', () => ({
  useUpdateClassMutation: () => [mocks.updateClass],
}));
vi.mock('../../../src/utils/lmsLaunchSync', () => ({
  runLtiLaunchSyncIfNeeded: mocks.runLtiLaunchSyncIfNeeded,
  resyncLmsRostersIfConfigured: mocks.resyncLmsRostersIfConfigured,
  finishLmsLaunchSession: mocks.finishLmsLaunchSession,
}));
vi.mock('../../../src/utils/googleClassroomRosterSync', () => ({
  resyncGoogleClassroomRostersIfConfigured:
    mocks.resyncGoogleClassroomRostersIfConfigured,
}));
vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));
vi.mock('../../../src/utils/translateApiError', () => ({
  translateApiError: (message: string) => message,
}));

import {
  useClassSync,
  type UseClassSyncParams,
} from '../../../src/hooks/useClassSync';
import { buildUpdateClassBody } from '../../../src/redux/api/classes/classesService';
import { setLoading } from '../../../src/redux/loader/loaderSlice';
import type { ClassWithStudents } from '../../../src/types/Class_types';

const educator = { role: 'Educator', educator_id: 'edu-1' };

/** A mutation trigger whose `.unwrap()` settles as given. */
const settles = (outcome: 'resolve' | 'reject', value?: unknown) => ({
  unwrap: () =>
    outcome === 'resolve' ? Promise.resolve(value) : Promise.reject(value),
});

const dispatchedTypes = () =>
  mocks.dispatch.mock.calls.map(
    ([action]) => (action as { type: string }).type
  );

const renderSync = (params: Partial<UseClassSyncParams> = {}) =>
  renderHook((props: Partial<UseClassSyncParams>) =>
    useClassSync({
      user: educator,
      allClasses: [],
      language: 'en',
      ...params,
      ...props,
    })
  );

describe('useClassSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.GetClass = { classes: [], status: 'idle' };
    mocks.dispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
    mocks.updateClass.mockReturnValue(settles('resolve'));
    mocks.runLtiLaunchSyncIfNeeded.mockResolvedValue(false);
    mocks.resyncLmsRostersIfConfigured.mockResolvedValue(undefined);
    mocks.resyncGoogleClassroomRostersIfConfigured.mockResolvedValue(undefined);
  });

  describe('initial load', () => {
    it('does nothing for a user who is not an educator', async () => {
      renderSync({ user: { role: 'Admin' } });
      await act(async () => {});
      expect(mocks.dispatch).not.toHaveBeenCalled();
      expect(mocks.runLtiLaunchSyncIfNeeded).not.toHaveBeenCalled();
    });

    it('syncs rosters, then loads classes and reports behind the page loader', async () => {
      renderSync();

      await waitFor(() =>
        expect(mocks.dispatch).toHaveBeenCalledWith(setLoading(false))
      );
      expect(mocks.resyncLmsRostersIfConfigured).toHaveBeenCalled();
      expect(mocks.resyncGoogleClassroomRostersIfConfigured).toHaveBeenCalled();
      expect(dispatchedTypes()).toEqual([
        setLoading(true).type,
        'class/fetch',
        'educatorReports/fetch',
        setLoading(false).type,
      ]);
      expect(mocks.dispatch).toHaveBeenCalledWith({
        type: 'educatorReports/fetch',
        payload: { educatorId: 'edu-1' },
      });
      expect(mocks.finishLmsLaunchSession).not.toHaveBeenCalled();
    });

    it('finishes the LMS launch session after a successful launch sync', async () => {
      mocks.runLtiLaunchSyncIfNeeded.mockResolvedValue(true);
      renderSync();

      await waitFor(() =>
        expect(mocks.finishLmsLaunchSession).toHaveBeenCalledTimes(1)
      );
    });

    it('still loads the class list when a roster sync fails', async () => {
      mocks.resyncLmsRostersIfConfigured.mockRejectedValue(new Error('lms'));
      renderSync();

      await waitFor(() =>
        expect(mocks.dispatch).toHaveBeenCalledWith(setLoading(false))
      );
      expect(dispatchedTypes()).toContain('class/fetch');
    });

    it('refreshes cached classes in the background, without the page loader', async () => {
      mocks.state.GetClass = { classes: [{ id: 'c-1' }], status: 'succeeded' };
      renderSync();

      await waitFor(() =>
        expect(dispatchedTypes()).toEqual([
          'class/fetch',
          'educatorReports/fetch',
        ])
      );
    });
  });

  describe('stale status correction', () => {
    const cls = (
      id: string,
      status: ClassWithStudents['status'],
      start_date: string,
      end_date: string
    ): ClassWithStudents => ({
      id,
      class_name: `Class ${id}`,
      status,
      start_date,
      end_date,
    });

    it('corrects an active class whose end date has passed, once', async () => {
      const ended = cls('ended', 'ACTIVE', '2020-01-01', '2020-02-01');
      const current = cls('current', 'ACTIVE', '2020-01-01', '2099-01-01');
      const draft = cls('draft', 'DRAFT', '2020-01-01', '2020-02-01');
      const { rerender } = renderSync({ allClasses: [ended, current, draft] });
      await act(async () => {});

      expect(mocks.updateClass).toHaveBeenCalledTimes(1);
      expect(mocks.updateClass).toHaveBeenCalledWith({
        id: 'ended',
        body: buildUpdateClassBody({
          class_name: 'Class ended',
          status: 'INACTIVE',
          start_date: '2020-01-01',
          end_date: '2020-02-01',
        }),
      });

      rerender({ allClasses: [{ ...ended }, current, draft] });
      expect(mocks.updateClass).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleStatusChange', () => {
    const row: ClassWithStudents = {
      id: 'c-1',
      class_name: 'Biology',
      start_date: '2026-01-10',
      end_date: '2026-06-30',
    };

    it('updates the status, confirms, and refetches the list', async () => {
      const { result } = renderSync();
      await act(async () => {});
      mocks.dispatch.mockClear();

      await act(() => result.current.handleStatusChange(row, 'ARCHIEVED'));

      expect(mocks.updateClass).toHaveBeenCalledWith({
        id: 'c-1',
        body: buildUpdateClassBody({
          class_name: 'Biology',
          status: 'ARCHIEVED',
          start_date: '2026-01-10',
          end_date: '2026-06-30',
        }),
      });
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        'Class updated successfully'
      );
      await waitFor(() => expect(dispatchedTypes()).toContain('class/fetch'));
    });

    it.each([
      [
        'the BE message',
        { status: 400, data: { message: 'Not allowed' } },
        'Not allowed',
      ],
      ['a generic message', new Error('boom'), 'Failed to update class'],
    ])('shows %s when the update fails', async (_case, error, message) => {
      mocks.updateClass.mockReturnValue(settles('reject', error));
      const { result } = renderSync();
      await act(async () => {});

      await act(() => result.current.handleStatusChange(row, 'ARCHIEVED'));

      expect(mocks.toastError).toHaveBeenCalledWith(message);
      expect(mocks.toastSuccess).not.toHaveBeenCalled();
    });
  });
});
