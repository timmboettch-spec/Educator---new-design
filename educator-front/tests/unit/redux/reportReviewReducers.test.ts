import { beforeEach, describe, expect, it } from 'vitest';
import getClassReducer, {
  markReportUnviewed,
  markReportViewed,
} from '../../../src/redux/class/GetClassRedux';
import educatorReportsReducer, {
  clearReportIsNew,
  setReportIsNew,
} from '../../../src/redux/reports/EducatorReportsRedux';
import simulationReportsReducer, {
  clearLocalReportIsNew,
  setLocalReportIsNew,
} from '../../../src/redux/class/SimsCompletedreportsRedux';

const init = <S>(reducer: (s: S | undefined, a: { type: string }) => S) =>
  reducer(undefined, { type: '@@init' });

describe('markReportUnviewed', () => {
  beforeEach(() => localStorage.clear());

  it('forgets the viewed ids, persists them and raises the unread count', () => {
    let state: ReturnType<typeof getClassReducer> = {
      ...init(getClassReducer),
      unreadCountById: { c1: 0 },
      needsAttentionById: { c1: false },
    };
    state = getClassReducer(
      state,
      markReportViewed({ reportId: ['r1', 'r2'], classId: 'c1' })
    );
    expect(state.viewedReportIds).toEqual(['r1', 'r2']);

    state = getClassReducer(
      state,
      markReportUnviewed({ reportId: ['r1', 'r2'], classId: 'c1' })
    );

    expect(state.viewedReportIds).toEqual([]);
    expect(
      JSON.parse(localStorage.getItem('rwai_viewed_report_ids') ?? '')
    ).toEqual([]);
    expect(state.unreadCountById.c1).toBe(2);
    expect(state.needsAttentionById.c1).toBe(true);
  });

  it('flags the class for attention even before its unread count is known', () => {
    const state = getClassReducer(
      init(getClassReducer),
      markReportUnviewed({ reportId: 'r9', classId: 'c2' })
    );
    expect(state.needsAttentionById.c2).toBe(true);
  });
});

describe('setReportIsNew', () => {
  it('reverses clearReportIsNew', () => {
    let state = {
      ...init(educatorReportsReducer),
      reports: [
        { id: 'r1', isNew: true },
        { id: 'r2', isNew: true },
      ],
    } as ReturnType<typeof educatorReportsReducer>;
    state = educatorReportsReducer(state, clearReportIsNew(['r1', 'r2']));
    state = educatorReportsReducer(state, setReportIsNew(['r1']));
    expect(state.reports.map((r) => r.isNew)).toEqual([true, false]);
  });
});

describe('setLocalReportIsNew', () => {
  it('reverses clearLocalReportIsNew in student and class reports', () => {
    let state = {
      ...init(simulationReportsReducer),
      studentReports: [{ id: 'r1', isNew: true }],
      classReports: [{ id: 'r1', isNew: true }],
    } as ReturnType<typeof simulationReportsReducer>;
    state = simulationReportsReducer(state, clearLocalReportIsNew('r1'));
    expect(state.classReports[0]?.isNew).toBe(false);

    state = simulationReportsReducer(state, setLocalReportIsNew('r1'));
    expect(state.studentReports[0]?.isNew).toBe(true);
    expect(state.classReports[0]?.isNew).toBe(true);
  });
});
