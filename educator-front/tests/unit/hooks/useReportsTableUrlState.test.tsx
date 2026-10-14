import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useReportsTableUrlState } from '../../../src/hooks/useReportsTableUrlState';
import { ReportReviewStatus } from '../../../src/redux/api/reports/reports.types';

const SORT_KEYS = ['studentCode', 'score', 'completedAt'];

const renderAt = (url: string, classId = 'c1') => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({
      state: useReportsTableUrlState(classId, SORT_KEYS),
      search: useLocation().search,
    }),
    { wrapper }
  );
};

const params = (search: string) =>
  Object.fromEntries(new URLSearchParams(search));

describe('useReportsTableUrlState', () => {
  it('defaults to all reports, newest first', () => {
    const { result } = renderAt('/classes');
    expect(result.current.state).toMatchObject({
      reviewStatus: undefined,
      sortField: 'completedAt',
      sortDirection: 'desc',
    });
  });

  it('reads valid params for this class', () => {
    const { result } = renderAt(
      '/classes?reportsClass=c1&reportStatus=unread&reportSort=score&reportDir=asc'
    );
    expect(result.current.state).toMatchObject({
      reviewStatus: ReportReviewStatus.UNREAD,
      sortField: 'score',
      sortDirection: 'asc',
    });
  });

  it('ignores params for another class and invalid values', () => {
    const other = renderAt('/classes?reportsClass=c2&reportStatus=read');
    expect(other.result.current.state).toMatchObject({
      reviewStatus: undefined,
    });

    const bad = renderAt(
      '/classes?reportsClass=c1&reportStatus=x&reportSort=nope&reportDir=up'
    );
    expect(bad.result.current.state).toMatchObject({
      reviewStatus: undefined,
      sortField: 'completedAt',
      sortDirection: 'desc',
    });
  });

  it('has no page: the table loads more as it scrolls', () => {
    const { result } = renderAt('/classes?reportsClass=c1');
    expect(result.current.state).not.toHaveProperty('page');
    expect(result.current.state).not.toHaveProperty('setPage');
  });

  it('writes the class with every filter or sort change', () => {
    const { result } = renderAt('/classes?measure=unreadReports');

    act(() => result.current.state.setReviewStatus(ReportReviewStatus.READ));
    expect(params(result.current.search)).toEqual({
      measure: 'unreadReports',
      reportsClass: 'c1',
      reportStatus: 'read',
    });

    act(() => result.current.state.setSort('score', 'asc'));
    expect(params(result.current.search)).toEqual({
      measure: 'unreadReports',
      reportsClass: 'c1',
      reportStatus: 'read',
      reportSort: 'score',
      reportDir: 'asc',
    });

    act(() => result.current.state.setReviewStatus(undefined));
    expect(params(result.current.search)).not.toHaveProperty('reportStatus');
  });
});
