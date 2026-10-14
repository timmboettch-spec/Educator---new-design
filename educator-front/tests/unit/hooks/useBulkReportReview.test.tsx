import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
    patch: vi.fn(),
    get: vi.fn(),
  },
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../../src/components/common/Toast', () => ({ toast }));

import '../../../src/i18n';
import { store } from '../../../src/store';
import { useBulkReportReview } from '../../../src/hooks/useBulkReportReview';
import { SimulationReportSelectorType } from '../../../src/redux/api/reports/reports.types';
import {
  resetClassState,
  setClassNeedsAttention,
} from '../../../src/redux/class/GetClassRedux';
import { GetEducatorSimulationReports } from '../../../src/redux/reports/EducatorReportsRedux';

const wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

const reply = (updatedIds: string[], notAccessibleIds: string[] = []) =>
  apiRequest.mockResolvedValueOnce({
    data: {
      message: 'Bulk review completed',
      data: { updatedIds, notAccessibleIds },
    },
  });

// Tracks the class's unread count, as happens once its reports have loaded.
const seedUnreadCount = (classId: string, unreadCount: number) =>
  store.dispatch(
    setClassNeedsAttention({
      classId,
      needsAttention: unreadCount > 0,
      unreadCount,
    })
  );

const unreadFor = (classId: string) =>
  store.getState().GetClass.unreadCountById[classId];

const renderReview = () => renderHook(() => useBulkReportReview(), { wrapper });

type ReviewArgs = Parameters<
  ReturnType<typeof useBulkReportReview>['review']
>[0];

const run = async (
  result: { current: ReturnType<typeof useBulkReportReview> },
  args: ReviewArgs
) => {
  let ok = false;
  await act(async () => {
    ok = await result.current.review(args);
  });
  return ok;
};

describe('useBulkReportReview', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    Object.values(toast).forEach((fn) => fn.mockClear());
    localStorage.clear();
    store.dispatch(resetClassState());
  });

  it.each([
    [SimulationReportSelectorType.REPORT, ['r1', 'r2']],
    [SimulationReportSelectorType.STUDENT, ['stu-1']],
    [SimulationReportSelectorType.SIMULATION, ['sim-1']],
    [SimulationReportSelectorType.CLASS, ['class-1']],
  ])('sends one PATCH for a %s selection', async (type, ids) => {
    reply(['r1']);
    const { result } = renderReview();

    const ok = await run(result, {
      type,
      ids,
      reviewed: true,
      classId: 'class-1',
    });

    expect(ok).toBe(true);
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/simulation-reports/bulk-review',
        method: 'PATCH',
        data: { type, ids, reviewed: true },
      })
    );
  });

  it('marks exactly the updated reports viewed and persists them', async () => {
    reply(['r1', 'r2']);
    const { result } = renderReview();

    await run(result, {
      type: SimulationReportSelectorType.CLASS,
      ids: ['class-1'],
      reviewed: true,
      classId: 'class-1',
    });

    expect(store.getState().GetClass.viewedReportIds).toEqual(['r1', 'r2']);
    expect(
      JSON.parse(localStorage.getItem('rwai_viewed_report_ids') ?? '[]')
    ).toEqual(['r1', 'r2']);
    expect(toast.success).toHaveBeenCalledWith('2 reports marked reviewed');
  });

  it('marking unreviewed twice never inflates the unread count', async () => {
    seedUnreadCount('class-1', 1);
    const { result } = renderReview();

    // r1 is read here; r2 stays unread.
    reply(['r1']);
    await run(result, {
      type: SimulationReportSelectorType.REPORT,
      ids: ['r1'],
      reviewed: true,
      classId: 'class-1',
    });
    expect(unreadFor('class-1')).toBe(0);

    reply(['r1', 'r2']);
    await run(result, {
      type: SimulationReportSelectorType.CLASS,
      ids: ['class-1'],
      reviewed: false,
      classId: 'class-1',
    });
    // Only r1 (the read one) is unread again.
    expect(unreadFor('class-1')).toBe(1);

    reply(['r1', 'r2']);
    await run(result, {
      type: SimulationReportSelectorType.CLASS,
      ids: ['class-1'],
      reviewed: false,
      classId: 'class-1',
    });
    // The repeat adds nothing.
    expect(unreadFor('class-1')).toBe(1);
    expect(store.getState().GetClass.viewedReportIds).toEqual([]);
    expect(store.getState().GetClass.needsAttentionById['class-1']).toBe(true);
  });

  it('combines a partial result into one warning toast', async () => {
    reply(['r1'], ['r9', 'r8']);
    const { result } = renderReview();

    await run(result, {
      type: SimulationReportSelectorType.REPORT,
      ids: ['r1', 'r8', 'r9'],
      reviewed: true,
      classId: 'class-1',
    });

    expect(toast.warning).toHaveBeenCalledWith(
      "1 report marked reviewed. 2 reports couldn't be updated."
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows an error toast for a fully refused selection', async () => {
    reply([], ['r9']);
    const { result } = renderReview();

    await run(result, {
      type: SimulationReportSelectorType.REPORT,
      ids: ['r9'],
      reviewed: true,
      classId: 'class-1',
    });

    expect(toast.error).toHaveBeenCalledWith("1 report couldn't be updated");
  });

  it('uses the BE message, or a friendly fallback, when the request fails', async () => {
    const { result } = renderReview();

    apiRequest.mockRejectedValueOnce({
      response: { status: 403, data: { message: 'Insufficient role' } },
    });
    const ok = await run(result, {
      type: SimulationReportSelectorType.REPORT,
      ids: ['r1'],
      reviewed: true,
      classId: 'class-1',
    });
    expect(ok).toBe(false);
    expect(toast.error).toHaveBeenLastCalledWith('Insufficient role');

    apiRequest.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    await run(result, {
      type: SimulationReportSelectorType.REPORT,
      ids: ['r1'],
      reviewed: true,
      classId: 'class-1',
    });
    expect(toast.error).toHaveBeenLastCalledWith(
      "We couldn't update these reports. Please try again."
    );
    expect(store.getState().GetClass.viewedReportIds).toEqual([]);
  });

  it('sends nothing for an empty or blank selection', async () => {
    const { result } = renderReview();

    const ok = await run(result, {
      type: SimulationReportSelectorType.REPORT,
      ids: ['', '  '],
      reviewed: true,
      classId: 'class-1',
    });

    expect(ok).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('marking reviewed only counts down reports that were unread', async () => {
    // r1 is already reviewed on the BE; r2 is the class's only unread report.
    store.dispatch({
      type: GetEducatorSimulationReports.fulfilled.type,
      payload: [
        { id: 'r1', isNew: false },
        { id: 'r2', isNew: true },
      ],
    });
    seedUnreadCount('class-1', 1);
    const { result } = renderReview();

    reply(['r1', 'r2']);
    await run(result, {
      type: SimulationReportSelectorType.REPORT,
      ids: ['r1', 'r2'],
      reviewed: true,
      classId: 'class-1',
    });

    expect(unreadFor('class-1')).toBe(0);
    expect(store.getState().GetClass.viewedReportIds).toEqual(['r2']);
  });
});
